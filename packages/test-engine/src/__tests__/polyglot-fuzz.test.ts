import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TestJobPayload } from "@apitrace/planner";
import {
  HttpProbeClient,
  runPolyglotFuzzProbe,
  executeTestJob,
} from "../index.js";

const COMMAND_PATTERNS = ["; id", "| id", "`id`", "$(id)"];
const TRAVERSAL_MARKER = "../../../../etc/passwd";
const SSRF_MARKER = "169.254.169.254";
const NOSQL_OPERATORS = ["$gt", "$ne", "$regex"];
const BLIND_SLEEP_MARKER = "sleep 3";

describe("Polyglot Fuzzing Probe", () => {
  let server: Server;
  let baseUrl: string;
  let probeClient: HttpProbeClient;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;
      const query = url.searchParams.get("q") ?? "";

      const respondPlain = () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      };

      if (pathname === "/fuzz/command-vulnerable") {
        if (COMMAND_PATTERNS.some((marker) => query.includes(marker))) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("uid=0(root) gid=0(root) groups=0(root)");
          return;
        }
        respondPlain();
        return;
      }

      if (pathname === "/fuzz/traversal-vulnerable") {
        if (query.includes(TRAVERSAL_MARKER)) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin");
          return;
        }
        respondPlain();
        return;
      }

      if (pathname === "/fuzz/ssrf-vulnerable") {
        if (query.includes(SSRF_MARKER)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ "ami-id": "ami-0abcd1234", "instance-id": "i-0abcd1234" }));
          return;
        }
        respondPlain();
        return;
      }

      if (pathname === "/fuzz/nosql-vulnerable") {
        if (NOSQL_OPERATORS.some((op) => query.includes(op))) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: [{ id: 1, username: "admin" }] }));
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results: [] }));
        return;
      }

      if (pathname === "/fuzz/blind-command-vulnerable") {
        if (query.includes(BLIND_SLEEP_MARKER)) {
          setTimeout(respondPlain, 2800);
          return;
        }
        respondPlain();
        return;
      }

      if (pathname === "/fuzz/clean") {
        respondPlain();
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        probeClient = new HttpProbeClient({ timeoutMs: 8000 });
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

  const baseJob: Omit<TestJobPayload, "path"> = {
    runId: "run-1",
    targetId: "target-1",
    endpointId: "ep-fuzz",
    baseUrl: "",
    method: "GET",
    authType: "none",
    parameters: [],
    category: "security",
    testName: "polyglot_fuzz_injection_matrix",
  };

  it("detects reflected command injection output", async () => {
    const result = await runPolyglotFuzzProbe(
      { ...baseJob, baseUrl, path: "/fuzz/command-vulnerable" },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("critical");
    expect(result.detail.evidence).toContain("Command injection confirmed");
  });

  it("detects reflected path traversal file content", async () => {
    const result = await runPolyglotFuzzProbe(
      { ...baseJob, baseUrl, path: "/fuzz/traversal-vulnerable" },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("critical");
    expect(result.detail.evidence).toContain("Path traversal confirmed");
  });

  it("detects reflected SSRF metadata leakage", async () => {
    const result = await runPolyglotFuzzProbe(
      { ...baseJob, baseUrl, path: "/fuzz/ssrf-vulnerable" },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("critical");
    expect(result.detail.evidence).toContain("SSRF confirmed");
  });

  it("warns on suspected NoSQL operator injection bypass", async () => {
    const result = await runPolyglotFuzzProbe(
      { ...baseJob, baseUrl, path: "/fuzz/nosql-vulnerable" },
      probeClient
    );
    expect(result.status).toBe("warn");
    expect(result.severity).toBe("high");
    expect(result.detail.evidence).toContain("NoSQL operator injection suspected");
  });

  it(
    "detects blind command injection via response time delay",
    async () => {
      const result = await runPolyglotFuzzProbe(
        { ...baseJob, baseUrl, path: "/fuzz/blind-command-vulnerable" },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
      expect(result.detail.evidence).toContain("Blind command injection suspected");
    },
    10000
  );

  it("passes when no fuzzing vector produces a signal", async () => {
    const result = await runPolyglotFuzzProbe(
      { ...baseJob, baseUrl, path: "/fuzz/clean" },
      probeClient
    );
    expect(result.status).toBe("pass");
    expect(result.severity).toBe("info");
    expect(result.detail.evidence).toContain("No NoSQL, command injection, path traversal, or SSRF signal detected");
  });

  it("dispatches polyglot_fuzz_injection_matrix via executeTestJob", async () => {
    const result = await executeTestJob(
      { ...baseJob, baseUrl, path: "/fuzz/command-vulnerable" },
      undefined,
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("critical");
  });
});
