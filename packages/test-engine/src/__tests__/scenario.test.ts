import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { ScenarioDefinition, TestJobPayload } from "@apitrace/planner";
import { HttpProbeClient, executeTestJob, resolveJsonPath, runScenarioProbe } from "../index.js";

describe("resolveJsonPath", () => {
  const doc = { token: "abc", data: { accounts: [{ id: "a1" }, { id: "a2" }] }, count: 0 };

  it("resolves top-level and nested fields", () => {
    expect(resolveJsonPath(doc, "$.token")).toBe("abc");
    expect(resolveJsonPath(doc, "$.data.accounts[1].id")).toBe("a2");
  });

  it("keeps falsy values", () => {
    expect(resolveJsonPath(doc, "$.count")).toBe(0);
  });

  it("returns the root for a bare $", () => {
    expect(resolveJsonPath(doc, "$")).toBe(doc);
  });

  it("returns undefined for missing paths, bad indexes, and null sources", () => {
    expect(resolveJsonPath(doc, "$.nope.deeper")).toBeUndefined();
    expect(resolveJsonPath(doc, "$.data.accounts[5].id")).toBeUndefined();
    expect(resolveJsonPath(doc, "$.token[0]")).toBeUndefined();
    expect(resolveJsonPath(null, "$.token")).toBeUndefined();
  });

  it("returns undefined for paths outside the supported syntax", () => {
    expect(resolveJsonPath(doc, "token")).toBeUndefined();
  });
});

describe("Scenario engine", () => {
  let server: Server;
  let baseUrl: string;
  let client: HttpProbeClient;
  let store: Map<string, { id: string; name: string }>;
  let seenAuth: Array<string | undefined>;
  let buggyDelete = false;
  let omitId = false;

  beforeAll(async () => {
    server = createServer((req, res) => {
      seenAuth.push(req.headers.authorization);
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => handle(req.method ?? "GET", req.url ?? "/", raw, req.headers, res));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    client = new HttpProbeClient({ timeoutMs: 3000 });

    function handle(
      method: string,
      url: string,
      raw: string,
      _headers: IncomingHttpHeaders,
      res: import("node:http").ServerResponse
    ) {
      const send = (status: number, body?: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      const body = raw ? (JSON.parse(raw) as { name?: string }) : {};

      if (method === "POST" && url === "/items") {
        const id = `item_${store.size + 1}`;
        store.set(id, { id, name: body.name ?? "" });
        return send(201, omitId ? { created: true } : { id, name: body.name });
      }
      const match = url.match(/^\/items\/([^/]+)$/);
      const item = match ? store.get(match[1]) : undefined;
      if (!match || !item) {
        return send(404, { error: "not found" });
      }
      if (method === "GET") return send(200, item);
      if (method === "PUT") {
        item.name = body.name ?? item.name;
        return send(200, item);
      }
      if (method === "DELETE") {
        if (!buggyDelete) store.delete(item.id);
        return send(204);
      }
      return send(405, { error: "method not allowed" });
    }
  });

  afterAll(async () => {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    store = new Map();
    seenAuth = [];
    buggyDelete = false;
    omitId = false;
  });

  const lifecycle: ScenarioDefinition = {
    name: "crud_lifecycle_items",
    description: "create, read, update, delete, read",
    steps: [
      {
        name: "create",
        method: "POST",
        path: "/items",
        body: { name: "first" },
        expectedStatus: [201],
        extract: { resourceId: "$.id" },
      },
      { name: "read_after_create", method: "GET", path: "/items/{resourceId}", expectedStatus: [200] },
      {
        name: "update",
        method: "PUT",
        path: "/items/{resourceId}",
        body: { name: "second" },
        expectedStatus: [200],
      },
      { name: "delete", method: "DELETE", path: "/items/{resourceId}", expectedStatus: [204] },
      { name: "read_after_delete", method: "GET", path: "/items/{resourceId}", expectedStatus: [404] },
    ],
  };

  function makeJob(scenario?: ScenarioDefinition, config?: Record<string, unknown>): TestJobPayload {
    return {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "endpoint-1",
      baseUrl,
      method: "POST",
      path: "/items",
      authType: "none",
      parameters: [],
      category: "workflow",
      testName: scenario?.name ?? "empty",
      config,
      scenario,
    };
  }

  it("passes when every step matches and the extracted id chains through", async () => {
    const result = await runScenarioProbe(makeJob(lifecycle), client);
    expect(result.status).toBe("pass");
    expect(result.detail.evidence).toContain("all 5 steps");
    expect(store.size).toBe(0);
  });

  it("fails at the first step with an unexpected status and stops there", async () => {
    buggyDelete = true;
    const result = await runScenarioProbe(makeJob(lifecycle), client);
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("high");
    expect(result.detail.evidence).toContain('"read_after_delete"');
    expect(result.detail.responseReceived?.status).toBe(200);
  });

  it("stops before later steps when an early step fails", async () => {
    const scenario: ScenarioDefinition = {
      ...lifecycle,
      steps: [{ ...lifecycle.steps[0], expectedStatus: [200] }, ...lifecycle.steps.slice(1)],
    };
    const result = await runScenarioProbe(makeJob(scenario), client);
    expect(result.status).toBe("fail");
    expect(result.detail.evidence).toContain('"create"');
    expect(result.detail.evidence).not.toContain("read_after_create:");
  });

  it("warns when a variable cannot be extracted from the response", async () => {
    omitId = true;
    const result = await runScenarioProbe(makeJob(lifecycle), client);
    expect(result.status).toBe("warn");
    expect(result.detail.evidence).toContain('"resourceId"');
  });

  it("interpolates extracted variables into string body values", async () => {
    const scenario: ScenarioDefinition = {
      name: "body_chain",
      description: "",
      steps: [
        { name: "create", method: "POST", path: "/items", body: { name: "x" }, expectedStatus: [201], extract: { resourceId: "$.id" } },
        { name: "rename", method: "PUT", path: "/items/{resourceId}", body: { name: "renamed-{resourceId}" }, expectedStatus: [200] },
      ],
    };
    const result = await runScenarioProbe(makeJob(scenario), client);
    expect(result.status).toBe("pass");
    expect(store.get("item_1")?.name).toBe("renamed-item_1");
  });

  it("sends the primary auth profile on every step without echoing the token", async () => {
    const config = { authProfiles: { primary: { name: "alice", token: "secret-token" } } };
    const result = await runScenarioProbe(makeJob(lifecycle, config), client);
    expect(seenAuth.length).toBe(5);
    expect(new Set(seenAuth)).toEqual(new Set(["Bearer secret-token"]));
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("reports an error when the job has no scenario steps", async () => {
    const result = await runScenarioProbe(makeJob(undefined), client);
    expect(result.status).toBe("error");
  });

  it("is dispatched for the workflow category by executeTestJob", async () => {
    const result = await executeTestJob(makeJob(lifecycle), undefined, client);
    expect(result.status).toBe("pass");
  });

  it("reports an error result when the server is unreachable", async () => {
    const job = { ...makeJob(lifecycle), baseUrl: "http://127.0.0.1:1" };
    const result = await executeTestJob(job, { timeoutMs: 500 });
    expect(result.status).toBe("error");
  });
});
