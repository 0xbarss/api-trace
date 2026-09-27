import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TestJobPayload } from "@apitrace/planner";
import {
  HttpProbeClient,
  runNegativeContractMutationCheck,
  executeTestJob,
} from "../index.js";

describe("Negative Contract Schema Mutation Runner", () => {
  let server: Server;
  let baseUrl: string;
  let probeClient: HttpProbeClient;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      let bodyText = "";
      req.on("data", (chunk) => {
        bodyText += chunk;
      });

      req.on("end", () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = {};
        }

        // Endpoint 1: Strictly validating endpoint (rejects malformed payloads with 400)
        if (pathname === "/api/strict") {
          if (!parsed.username || typeof parsed.username !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "username is required and must be string" }));
            return;
          }
          if (typeof parsed.age !== "number" || parsed.age < 0) {
            res.writeHead(422, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "age must be positive number" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "success" }));
          return;
        }

        // Endpoint 2: Crashing endpoint (throws 500 on negative number or invalid type)
        if (pathname === "/api/crashing") {
          if (!parsed.username || typeof parsed.username !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "username required" }));
            return;
          }
          if (typeof parsed.age !== "number" || parsed.age < 0) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error: Unhandled type error" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        // Endpoint 3: Permissive endpoint (accepts missing required field with 200 OK)
        if (pathname === "/api/permissive") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "accepted", data: parsed }));
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        probeClient = new HttpProbeClient({ timeoutMs: 5000 });
        resolve();
      });
    });
  });

  afterAll(async () => {
    await probeClient.close();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  const requestSchema = {
    type: "object",
    required: ["username", "age"],
    properties: {
      username: { type: "string", minLength: 2 },
      age: { type: "integer", minimum: 0 },
    },
  };

  it("passes when target endpoint cleanly rejects schema mutations with HTTP 400/422", async () => {
    const job: TestJobPayload = {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "ep-strict",
      baseUrl,
      method: "POST",
      path: "/api/strict",
      authType: "none",
      parameters: [],
      requestSchema,
      category: "contract",
      testName: "contract_negative_schema_mutation",
    };

    const result = await runNegativeContractMutationCheck(job, probeClient);
    expect(result.status).toBe("pass");
    expect(result.severity).toBe("info");
    expect(result.detail.evidence).toContain("all malformed payloads were rejected with HTTP 4xx");
  });

  it("fails with high severity when target endpoint crashes with HTTP 500 on malformed input", async () => {
    const job: TestJobPayload = {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "ep-crashing",
      baseUrl,
      method: "POST",
      path: "/api/crashing",
      authType: "none",
      parameters: [],
      requestSchema,
      category: "contract",
      testName: "contract_negative_schema_mutation",
    };

    const result = await runNegativeContractMutationCheck(job, probeClient);
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("high");
    expect(result.detail.evidence).toContain("Server crashed with HTTP 500");
  });

  it("fails with medium severity when target endpoint accepts invalid input with HTTP 200", async () => {
    const job: TestJobPayload = {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "ep-permissive",
      baseUrl,
      method: "POST",
      path: "/api/permissive",
      authType: "none",
      parameters: [],
      requestSchema,
      category: "contract",
      testName: "contract_negative_schema_mutation",
    };

    const result = await runNegativeContractMutationCheck(job, probeClient);
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("medium");
    expect(result.detail.evidence).toContain("Endpoint accepted malformed input");
  });

  it("passes immediately with info when endpoint has no requestSchema", async () => {
    const job: TestJobPayload = {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "ep-noschema",
      baseUrl,
      method: "POST",
      path: "/api/strict",
      authType: "none",
      parameters: [],
      requestSchema: null,
      category: "contract",
      testName: "contract_negative_schema_mutation",
    };

    const result = await runNegativeContractMutationCheck(job, probeClient);
    expect(result.status).toBe("pass");
    expect(result.severity).toBe("info");
    expect(result.detail.evidence).toContain("No request JSON schema declared in spec");
  });

  it("dispatches contract_negative_schema_mutation via executeTestJob", async () => {
    const job: TestJobPayload = {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "ep-strict",
      baseUrl,
      method: "POST",
      path: "/api/strict",
      authType: "none",
      parameters: [],
      requestSchema,
      category: "contract",
      testName: "contract_negative_schema_mutation",
    };

    const result = await executeTestJob(job, undefined, probeClient);
    expect(result.status).toBe("pass");
  });
});
