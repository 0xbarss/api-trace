# api-trace

![Language](https://img.shields.io/badge/TypeScript-ES2022-3178c6)
![Runtime](https://img.shields.io/badge/Node.js-20%2B-339933)
![Package manager](https://img.shields.io/badge/pnpm-workspace-f69220)
![Database](https://img.shields.io/badge/PostgreSQL-16-336791)
![Queue](https://img.shields.io/badge/Redis-7-dc382d)
![License](https://img.shields.io/badge/License-Apache--2.0-blue)
![Author](https://img.shields.io/badge/Author-0xbarss-black)
![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)

api-trace reads an OpenAPI specification, plans a set of security, contract, performance and workflow probes for every endpoint, runs them against a live API through a Redis-backed job queue, and streams the findings to a web dashboard over WebSocket.

## Table of Contents

- [Why api-trace?](#why-api-trace)
- [Architecture & Design](#architecture--design)
  - [Topology](#topology)
  - [Run Lifecycle](#run-lifecycle)
  - [Job Queue](#job-queue)
  - [Security Model](#security-model)
- [Key Features](#key-features)
- [Repository Structure](#repository-structure)
- [Prerequisites & Installation](#prerequisites--installation)
- [Usage & Code Examples](#usage--code-examples)
  - [Add a Target](#add-a-target)
  - [Configure Auth Profiles](#configure-auth-profiles)
  - [Start a Run](#start-a-run)
  - [Read Results](#read-results)
  - [Stream Live Events](#stream-live-events)
- [API Reference](#api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Events](#websocket-events)
  - [Test Catalogue](#test-catalogue)
  - [Test Configuration Keys](#test-configuration-keys)
  - [Environment Variables](#environment-variables)
  - [Workspace Scripts](#workspace-scripts)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Author & Contributions](#author--contributions)
- [License & Disclaimer](#license--disclaimer)

---

## Why api-trace?

Checking an API against its own specification usually means stitching together separate tools: a schema validator for the contract, a load script for latency, and a scanner for security checks. Each one needs its own copy of the endpoint list, and none of them know which endpoints depend on each other.

Common gaps with that setup:

- **The specification is the only source of truth, but most scanners ignore it.** Generic scanners crawl or guess routes instead of reading the declared parameters, request schemas and auth requirements.
- **Authorization flaws need more than one identity.** Testing for broken object-level access means replaying a request with a second user's token. A single-token scanner cannot do that.
- **Stateful flows are skipped.** Create-read-update-delete chains need an ID from one response fed into the next request.
- **Long scans block the caller.** Running hundreds of probes inside one HTTP request ties up the client and loses progress on failure.

api-trace covers these with one pipeline:

1. The OpenAPI document is parsed, dereferenced and normalized into a list of endpoints with their parameters, schemas and auth type.
2. A rule matrix in the planner decides which probes apply to each endpoint, so a public `GET` does not get the same tests as an authenticated `POST` with a body.
3. Each probe becomes a job on a Redis queue. A worker executes jobs one at a time and writes every result to PostgreSQL.
4. Up to three named auth profiles (`primary`, `secondary`, `unprivileged`) let the object-level and function-level access probes replay requests as different identities.
5. Progress is published on a Redis channel per run and forwarded to browsers over WebSocket.

## Architecture & Design

### Topology

```text
┌──────────────────┐   REST + WebSocket   ┌──────────────────────────────┐
│  Web dashboard   │ ───────────────────► │  API server (Fastify, :3001) │
│  React + Vite    │ ◄─────────────────── │                              │
│  :3000           │   live run events    │  routes ─► services          │
└──────────────────┘                      │                              │
                                          │  ┌────────────────────────┐  │
                                          │  │ Execution worker       │  │
                                          │  │ (same process)         │  │
                                          │  └───────────┬────────────┘  │
                                          └──────┬───────┼───────────────┘
                                                 │       │
                          ┌──────────────────────┘       └────────────┐
                          ▼                                           ▼
                 ┌─────────────────┐                        ┌───────────────────┐
                 │ PostgreSQL 16   │                        │ Redis 7           │
                 │ targets         │                        │ job queue         │
                 │ endpoints       │                        │ processing list   │
                 │ test_runs       │                        │ dead-letter list  │
                 │ test_results    │                        │ run event channel │
                 └─────────────────┘                        └───────────────────┘
                                                                     │
                                       HTTP probes (undici)          │
                          ┌──────────────────────────────────────────┘
                          ▼
                 ┌─────────────────┐
                 │  Target API     │
                 └─────────────────┘
```

| Package | Responsibility |
| :--- | :--- |
| `@apitrace/core` | Drizzle schema and PostgreSQL client, Redis queue, shared types |
| `@apitrace/discovery` | Loads an OpenAPI 2/3 document from a URL or inline text (JSON or YAML), resolves references, and emits normalized endpoints |
| `@apitrace/planner` | Rule matrix, CRUD lifecycle detection, schema mutation cases, job payload types |
| `@apitrace/test-engine` | HTTP probe client and the security, contract, performance, protocol and scenario runners |
| `@apitrace/api` | Fastify server, REST routes, WebSocket route, execution worker |
| `@apitrace/web` | React dashboard built with Vite and Tailwind CSS |

### Run Lifecycle

```text
POST /api/targets/:id/runs
        │
        ▼
 insert test_runs (status = queued, total_tests = 0)
        │
        ▼
 planner.generateTestPlan(endpoints, options)
        │   for each endpoint: apply every matching rule in the matrix
        │   then: add one workflow job per detected CRUD group
        ▼
 push all jobs to Redis ─► update total_tests ─► respond 201 { runId, totalTests }
        │
        ▼
 worker loop:  pop job ─► set run status = running ─► execute probe
        │         ├─ insert test_results row
        │         ├─ increment completed / passed / warning / failed counters
        │         ├─ acknowledge the job
        │         └─ publish TEST_COMPLETED on the run's channel
        ▼
 completed_tests >= total_tests ─► status = completed, finished_at set
                                 ─► publish RUN_COMPLETED
```

Result statuses are `pass`, `warn`, `fail` and `error`. Severities are `critical`, `high`, `medium`, `low` and `info`. `error` results count toward `failedTests`.

### Job Queue

The queue lives in `packages/core/src/queue/redis-queue.ts` and uses three Redis lists:

| Key | Purpose |
| :--- | :--- |
| `apitrace:test:jobs` | Waiting jobs |
| `apitrace:test:jobs:processing` | Jobs a worker has taken but not yet acknowledged |
| `apitrace:test:jobs:dlq` | Jobs that failed to parse or threw during execution, with the error message and timestamp attached |

A job moves from the waiting list to the processing list in one atomic step, and is removed from the processing list only after its result has been stored. `RedisQueue.recoverStaleJobs()` moves everything left in the processing list back to the waiting list. The API process does not call it on startup, so run it manually after a crash (see [Troubleshooting](#troubleshooting--faq)).

### Security Model

api-trace is an active testing tool. It sends attack-style requests to the target and stores what it sent and received.

- **Trust boundary.** The API server has no authentication of its own. It allows any origin through CORS. Run it on a trusted network or behind your own access control.
- **Credential storage.** Auth profile tokens are stored as plain JSON in the `targets.auth_profiles` column. The API never returns them: responses contain only each profile's name and a `hasToken` flag.
- **Output redaction.** Probes that record request headers write `Bearer [redacted]` for the authorization header, and the protocol runner strips `authorization`, `cookie` and `set-cookie` from recorded response headers.
- **Outbound requests.** Probes run from the worker process using a 10-second timeout and one retry. Whatever network the worker can reach, the probes can reach.
- **Write side effects.** Workflow scenarios send real `POST`, `PUT`/`PATCH` and `DELETE` requests. See the [disclaimer](#license--disclaimer).

## Key Features

**Discovery**
- Accepts a spec URL or the spec text pasted directly, in JSON or YAML.
- Resolves `$ref` chains, including circular references, and records each endpoint's method, path, operation ID, auth type, parameters, request schema and response schema.
- Reports unreachable hosts, refused connections, timeouts and malformed documents with a plain error message.

**Security probing**
- Missing and malformed token checks on authenticated routes.
- Broken object-level access: replays a request with a second identity's token.
- Broken function-level access on `/admin`, `/audit` and `/system` routes.
- Mass assignment and client-controlled state injection on mutating routes.
- HTTP verb tampering, content-type confusion (XML entity payloads, missing content type), CRLF header injection.
- CORS wildcard check, burst-based rate-limit detection, stack-trace and database-error leakage.
- Polyglot fuzzing with NoSQL operator, command injection (including timing-based), path traversal and SSRF payloads.
- Scan of authenticated `GET` responses for unmasked card numbers and CVV values.

**Contract validation**
- Response body validation against the OpenAPI response schema (Ajv).
- Declared status code check.
- Negative schema mutation: type inversion, required-field stripping, string and number boundaries and unexpected properties, expecting HTTP 400 or 422.

**Performance**
- Latency sampling with p50, p95 and p99 reporting.

**Workflow scenarios**
- Detects `POST /things` with `/things/{id}` siblings and builds a create, read, update, delete, read-after-delete chain, extracting the new resource ID with a JSONPath expression.

**Delivery**
- Live progress over WebSocket.
- Dashboard views for the target catalog, per-endpoint scorecards, findings, latency distribution and a live event ticker.
- Findings export to JSON or CSV from the dashboard.

## Repository Structure

```text
api-trace/
├── apps/
│   ├── api/                       # Fastify server and execution worker
│   │   └── src/
│   │       ├── index.ts           # Entry point: server + worker + shutdown handling
│   │       ├── server.ts          # buildServer(): plugins and route registration
│   │       ├── routes/            # targets, runs, websocket
│   │       ├── services/          # target-service, run-service, worker-service
│   │       ├── schemas/           # Request and response JSON schemas
│   │       └── plugins/           # Error handler
│   └── web/                       # React dashboard
│       └── src/
│           ├── components/        # Target catalog, findings, scorecards, event ticker
│           ├── api/client.ts      # REST and WebSocket client
│           └── hooks/useExport.ts # JSON and CSV export
├── packages/
│   ├── core/                      # Database, queue, shared types
│   │   ├── src/db/                # Drizzle schema and client
│   │   ├── src/queue/             # RedisQueue
│   │   └── drizzle/               # SQL migrations
│   ├── discovery/                 # OpenAPI parsing and normalization
│   ├── planner/                   # Rule matrix, scenarios, schema mutations
│   └── test-engine/               # Probe runners
│       └── src/
│           ├── http/              # Probe client (undici)
│           ├── security/          # Auth, access control, headers, leakage
│           ├── protocol/          # Verb tampering, content-type confusion
│           ├── fuzzing/           # Payload sets
│           ├── contract/          # Schema conformance and mutation
│           ├── performance/       # Latency sampling
│           └── scenario/          # Workflow runner and JSONPath extraction
├── docker-compose.yml             # PostgreSQL 16 and Redis 7
├── .env.example
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── LICENSE
```

## Prerequisites & Installation

**Requirements**

- Node.js 20 or newer
- pnpm
- Docker with Compose (for PostgreSQL and Redis), or your own instances of both

**Steps**

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/0xbarss/api-trace.git
   cd api-trace
   pnpm install
   ```

2. Create the environment file:

   ```bash
   cp .env.example .env
   ```

   The defaults match `docker-compose.yml`. Change the database password before using this anywhere other than a local machine.

3. Start PostgreSQL and Redis:

   ```bash
   pnpm docker:up
   ```

   PostgreSQL listens on `5432`. Redis is published on host port `6380` so it does not collide with a local Redis on `6379`.

4. Build the workspace packages. The API imports them through their built output, so this is required before the first start:

   ```bash
   pnpm build
   ```

5. Apply the database migrations:

   ```bash
   pnpm db:migrate
   ```

6. Start the API and the dashboard in two terminals:

   ```bash
   pnpm dev:api    # http://localhost:3001
   pnpm dev:web    # http://localhost:3000
   ```

7. Check the API:

   ```bash
   curl http://localhost:3001/health
   # {"status":"ok"}
   ```

To stop the containers: `pnpm docker:down`. Data persists in the `postgres_data` and `redis_data` volumes.

## Usage & Code Examples

The dashboard covers the full flow. The examples below use `curl` against the API directly.

### Add a Target

`specSource` is either a URL or the specification text itself.

```bash
curl -X POST http://localhost:3001/api/targets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Petstore staging",
    "baseUrl": "https://staging.example.com",
    "specSource": "https://staging.example.com/openapi.json"
  }'
```

```json
{ "targetId": "3f1c1e0a-6a0e-4c52-9d5b-6f0e5a1b7c11", "discoveredEndpointsCount": 14 }
```

### Configure Auth Profiles

Each profile needs a `name` and a `token`. Extra `headers` are optional. Profiles can also be passed as `authProfiles` when creating the target.

```bash
curl -X PUT http://localhost:3001/api/targets/$TARGET_ID/auth-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "primary":      { "name": "alice",  "token": "'"$ALICE_TOKEN"'" },
    "secondary":    { "name": "bob",    "token": "'"$BOB_TOKEN"'" },
    "unprivileged": { "name": "viewer", "token": "'"$VIEWER_TOKEN"'" }
  }'
```

```json
{
  "primary":      { "name": "alice",  "hasToken": true },
  "secondary":    { "name": "bob",    "hasToken": true },
  "unprivileged": { "name": "viewer", "hasToken": true }
}
```

Every submitted profile is written, and any profile left out of the request body is cleared. Send all the profiles you want to keep on every update.

### Start a Run

An empty body runs every applicable test, including workflow scenarios.

```bash
curl -X POST http://localhost:3001/api/targets/$TARGET_ID/runs \
  -H "Content-Type: application/json" \
  -d '{}'
```

Limit the run by category or by test name:

```bash
curl -X POST http://localhost:3001/api/targets/$TARGET_ID/runs \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["security", "contract"],
    "disabledTests": ["rate_limit_burst_presence"],
    "config": { "sampleCount": 50 }
  }'
```

```json
{ "runId": "b7d9a4c2-1d70-4c9e-8a1e-2d6f3a9c0e55", "totalTests": 87, "status": "queued" }
```

The `categories` field accepts `security`, `performance` and `contract`. Workflow scenarios have no category value in the API; they run when `categories` is omitted and are skipped when it is set.

### Read Results

```bash
curl http://localhost:3001/api/runs/$RUN_ID            # counters and status
curl http://localhost:3001/api/runs/$RUN_ID/results    # every test result
```

A result looks like this:

```json
{
  "id": "…",
  "runId": "…",
  "endpointId": "…",
  "category": "security",
  "testName": "auth_missing_token",
  "status": "fail",
  "severity": "high",
  "latencyMs": 42,
  "detail": {
    "evidence": "…",
    "requestSent": { "method": "GET", "url": "https://staging.example.com/orders/1" },
    "responseReceived": { "status": 200 },
    "remediation": "…"
  },
  "createdAt": "2026-09-28T10:15:03.000Z"
}
```

### Stream Live Events

Any WebSocket client can subscribe. Both paths are equivalent.

```bash
npx wscat -c ws://localhost:3001/ws/runs/$RUN_ID
```

The first message is `CONNECTED` with the current counters. Each finished test produces a `TEST_COMPLETED` message, and the last one is followed by `RUN_COMPLETED`. Send `PING` (plain text or `{"type":"PING"}`) to receive a `PONG`.

## API Reference

### REST Endpoints

All IDs are UUIDs. Request bodies with unknown properties are rejected with HTTP 400.

| Method | Path | Body | Success | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | – | 200 | Liveness check: `{ "status": "ok" }` |
| `GET` | `/api/targets` | – | 200 | All targets, newest first, with `endpointsCount` and `hasAuthProfiles` |
| `POST` | `/api/targets` | `name`, `baseUrl`, `specSource`, `authProfiles?` | 201 | Parse the spec, store the target and its endpoints |
| `GET` | `/api/targets/:id` | – | 200 | Target with its endpoints and auth profile summary |
| `PUT` | `/api/targets/:id/auth-profiles` | `primary?`, `secondary?`, `unprivileged?` | 200 | Replace the stored profiles |
| `DELETE` | `/api/targets/:id` | – | 200 | Delete the target; its endpoints, runs and results are removed by cascade |
| `POST` | `/api/targets/:id/runs` | `categories?`, `enabledTests?`, `disabledTests?`, `config?` | 201 | Plan and queue a run |
| `GET` | `/api/runs` | query: `targetId?` | 200 | Latest 50 runs, newest first |
| `GET` | `/api/runs/:id` | – | 200 | Run status and counters |
| `GET` | `/api/runs/:id/results` | – | 200 | All results for the run, oldest first |
| `GET` | `/api/runs/:id/stream` | WebSocket upgrade | – | Live events for the run |
| `GET` | `/ws/runs/:id` | WebSocket upgrade | – | Same stream on the `/ws` prefix |

**Validation rules**

- `baseUrl` must start with `http://` or `https://`. Trailing slashes are removed.
- `name` is 1–255 characters. `baseUrl` is at most 1024 characters.
- An auth profile needs a non-empty `name` and `token`.

**Error format**

```json
{ "statusCode": 404, "error": "Not Found", "message": "Target with id '…' not found" }
```

Schema validation failures return 400 with a `details` array.

### WebSocket Events

| `type` | Sent when | Notable fields |
| :--- | :--- | :--- |
| `CONNECTED` | Right after the socket opens | `runId`, `status`, `totalTests`, `completedTests` |
| `TEST_COMPLETED` | A test result is stored | `endpointId`, `completedTests`, `totalTests`, `result` |
| `RUN_COMPLETED` | The last test finishes | `status`, `totalTests`, `completedTests` |
| `PONG` | In reply to `PING` | `timestamp` |
| `ERROR` | The run ID does not exist; the socket closes with code 1008 | `error`, `message` |

### Test Catalogue

The planner applies a test to an endpoint when its condition holds.

| Test | Category | Applies when |
| :--- | :--- | :--- |
| `auth_missing_token` | security | Endpoint requires auth |
| `auth_malformed_token` | security | Endpoint requires auth |
| `bola_unauthorized_object_access` | security | Auth required and an ID appears in the path |
| `bfla_privilege_escalation` | security | Path contains `/admin`, `/audit` or `/system` |
| `mass_assignment_probe` | security | `POST`, `PUT` or `PATCH` with a request schema |
| `business_logic_state_injection` | security | `POST`, `PUT` or `PATCH` with a request schema |
| `content_type_confusion` | security | `POST`, `PUT` or `PATCH` with a request schema |
| `http_verb_tampering` | security | Endpoint requires auth |
| `sensitive_data_exposure` | security | Authenticated `GET` with a response schema |
| `injection_signal_probe` | security | Has query parameters or a request schema |
| `polyglot_fuzz_injection_matrix` | security | Has query parameters or a request schema |
| `cors_wildcard_check` | security | Every endpoint |
| `rate_limit_burst_presence` | security | Every endpoint |
| `info_leakage_error_traces` | security | Every endpoint |
| `header_injection_crlf` | security | Every endpoint |
| `latency_baseline_distribution` | performance | Every endpoint |
| `status_code_declared_check` | contract | Every endpoint |
| `openapi_schema_conformance` | contract | Endpoint declares a response schema |
| `contract_negative_schema_mutation` | contract | `POST`, `PUT` or `PATCH` with a request schema |
| `crud_lifecycle_<path>` | workflow | A `POST` collection path has item-path siblings (`GET`, `PUT`/`PATCH` or `DELETE` on `/{id}`) |

### Test Configuration Keys

Pass these in the `config` object when starting a run.

| Key | Default | Used by |
| :--- | :--- | :--- |
| `sampleCount` | `20` | `latency_baseline_distribution` |
| `burstCount` | `30` | `rate_limit_burst_presence` |

Auth profiles saved on the target are added to the job configuration automatically for the tests that use them.

### Environment Variables

| Variable | Default | Used by |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgres://apitrace_user:apitrace_password@localhost:5432/apitrace_db` | API, migrations |
| `REDIS_URL` | `redis://localhost:6380` | API, worker, queue tests |
| `REDIS_PORT` | `6380` | `docker-compose.yml` host port |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `apitrace_user`, `apitrace_password`, `apitrace_db` | `docker-compose.yml` |
| `PORT` | `3001` | API |
| `HOST` | `0.0.0.0` | API |

### Workspace Scripts

| Command | Effect |
| :--- | :--- |
| `pnpm build` | Build every package and app |
| `pnpm test` | Run the test suite in every package |
| `pnpm dev:api` | API server and worker with file watching |
| `pnpm dev:web` | Dashboard dev server on port 3000 |
| `pnpm docker:up` / `pnpm docker:down` | Start or stop PostgreSQL and Redis |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push the schema directly, without a migration file |

## Testing & Quality Assurance

Tests use Vitest and sit in `__tests__` folders next to the code they cover.

```bash
pnpm docker:up
pnpm db:migrate
pnpm test
```

Some suites talk to real services, so PostgreSQL and Redis must be running with the defaults from `.env.example`:

- `packages/core`: queue tests use Redis on `localhost:6380`; the schema test writes to PostgreSQL and checks cascade deletion.
- `apps/api`: server, route and worker tests build the server with the default database and queue.

Run a single package:

```bash
pnpm --filter @apitrace/planner run test
pnpm --filter @apitrace/test-engine run test
```

What the suites cover:

| Package | Focus |
| :--- | :--- |
| `planner` | Rule matching, plan generation, schema mutations, CRUD scenario detection, protocol rules |
| `test-engine` | Probe runners, contract mutation, polyglot fuzzing, scenario execution, protocol probes |
| `discovery` | Parsing and normalization of specifications |
| `core` | Queue push/pop/acknowledge, dead-letter handling, database schema and cascades |
| `api` | Health check, target and run routes, error format, WebSocket stream, worker |
| `web` | Client calls for targets, runs, auth profiles and findings; render smoke test |

Type checking runs as part of `pnpm build`.

## Troubleshooting & FAQ

1. **`Cannot find module '@apitrace/core'` when starting the API.**
   The workspace packages resolve to their `dist` folders. Run `pnpm build` after installing and after changing a package.

2. **Migrations fail with a connection error.**
   PostgreSQL is not running or `DATABASE_URL` does not match it. Run `docker ps` and confirm `apitrace_postgres` is healthy, then check `.env` at the repository root (the migration config reads `../../.env` from `packages/core`).

3. **Port 5432 or 6380 is already in use.**
   Stop the other service, or change the host port in `docker-compose.yml` (`REDIS_PORT` for Redis) and update `DATABASE_URL` / `REDIS_URL` to match.

4. **Adding a target returns "Could not reach specification URL".**
   The API server could not resolve or connect to the spec host. The request is made from the server, not from your browser, so check DNS and firewall rules on the machine running the API. Pasting the spec text into `specSource` avoids the network call.

5. **Adding a target returns "invalid JSON or YAML format".**
   The URL returned something other than a specification, often an HTML page. Point to the raw JSON or YAML file.

6. **A run stays at `queued` and never starts.**
   The worker runs inside the API process. Confirm the API log shows "Test execution background worker started" and that `REDIS_URL` points to the same Redis the API uses.

7. **A run stops short of `completed`.**
   A job that throws while executing goes to the dead-letter list and is not counted, so `completedTests` never reaches `totalTests`. Inspect it with `redis-cli -p 6380 LRANGE apitrace:test:jobs:dlq 0 -1`; each entry carries `_error` and `_failedAt`.

8. **Jobs stay in the processing list after the API was killed.**
   The worker was stopped between taking a job and acknowledging it. Call `recoverStaleJobs()` on the queue (from a script or a REPL using `@apitrace/core`) to move them back to the waiting list, or clear the keys with `redis-cli -p 6380 DEL apitrace:test:jobs:processing`.

9. **`bola_unauthorized_object_access` or `bfla_privilege_escalation` gives no useful result.**
   These tests use the auth profiles saved on the target. Add at least `primary` and `secondary` profiles with valid tokens for the target.

10. **The dashboard shows the API as offline.**
    The dashboard calls `http://127.0.0.1:3001`. Start the API with `pnpm dev:api`, or change the base URL in the dashboard if the API runs elsewhere.

11. **Rate-limit or fuzzing tests trip a WAF or lock an account on the target.**
    Use `disabledTests` (for example `rate_limit_burst_presence`, `polyglot_fuzz_injection_matrix`) or limit `categories`, and run against a staging environment.

12. **Can I run more than one worker?**
    The worker starts inside the API process and processes one job at a time. Running several API instances against the same Redis and PostgreSQL will split the jobs between them, but this setup has not been tested here.

## Author & Contributions

Created and maintained by [0xbarss](https://github.com/0xbarss).

Bug reports and feature requests go to the repository issue tracker. Before opening a pull request, read `CONTRIBUTING.md` if the repository has one, keep the diff limited to the change you are making, and use single-line conventional commit messages.

## License & Disclaimer

Copyright 2026 0xbarss. Released under the [Apache License 2.0](LICENSE).

**Disclaimer.** api-trace sends injection payloads, server-side request forgery URLs, timing-based command payloads and bursts of concurrent requests. Its workflow scenarios create, modify and delete real records on the target. Only run it against systems you own or have written permission to test, and prefer a staging environment with disposable data. The authors accept no liability for damage, data loss, service disruption or legal consequences arising from its use. The software is provided "as is", without warranty of any kind.
