import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TestJobPayload } from "@apitrace/planner";
import {
  HttpProbeClient,
  runHttpVerbTamperingCheck,
  runContentTypeConfusionCheck,
  runHeaderInjectionCrlfCheck,
  executeTestJob,
} from "../index.js";

describe("Protocol Tampering Probes", () => {
  let server: Server;
  let baseUrl: string;
  let probeClient: HttpProbeClient;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === "/verb/enforced") {
        if (req.method === "GET" && req.headers["authorization"]) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      if (pathname === "/verb/bypassed") {
        if (req.method === "GET" && !req.headers["authorization"]) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        if (req.method === "PUT" || req.method === "PATCH") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      if (pathname === "/verb/preflight") {
        if (req.method === "OPTIONS") {
          res.writeHead(204, { Allow: "GET, OPTIONS", "Access-Control-Allow-Methods": "GET" });
          res.end();
          return;
        }
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      if (pathname === "/protocol/xxe-echo") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(body);
        });
        return;
      }

      if (pathname === "/protocol/no-content-type-crash") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          if (!req.headers["content-type"]) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("TypeError: cannot read properties of undefined");
            return;
          }
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "bad request" }));
        });
        return;
      }

      if (pathname === "/protocol/crlf-location-reflect") {
        const value = url.searchParams.get("apitraceProbe") ?? "";
        res.writeHead(200, {
          "Content-Type": "application/json",
          "X-Reflected-Url": encodeURIComponent(value),
        });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (pathname === "/protocol/xxe-vulnerable") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          if (body.includes("ENTITY") && body.includes("SYSTEM")) {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("root:x:0:0:root:/root:/bin/bash");
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        });
        return;
      }

      if (pathname === "/protocol/xxe-clean") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        });
        return;
      }

      if (pathname === "/protocol/crlf-vulnerable") {
        const probeValue = url.searchParams.get("apitraceProbe") ?? "";
        const socket = res.socket;
        if (socket && probeValue.includes("Set-Cookie")) {
          const body = JSON.stringify({ status: "ok" });
          socket.end(
            `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nSet-Cookie: apitrace-injected=1\r\nConnection: close\r\nContent-Length: ${body.length}\r\n\r\n${body}`
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (pathname === "/protocol/crlf-clean") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
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
    endpointId: "ep-protocol",
    baseUrl: "",
    method: "GET",
    authType: "bearer",
    parameters: [],
    category: "security",
    testName: "http_verb_tampering",
  };

  it("passes when every alternate HTTP method is still rejected", async () => {
    const result = await runHttpVerbTamperingCheck(
      { ...baseJob, baseUrl, path: "/verb/enforced" },
      probeClient
    );
    expect(result.status).toBe("pass");
  });

  it("fails when an alternate HTTP method bypasses auth enforcement", async () => {
    const result = await runHttpVerbTamperingCheck(
      { ...baseJob, baseUrl, path: "/verb/bypassed" },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("high");
    expect(result.detail.evidence).toContain("without auth enforcement");
  });

  it("does not treat an OPTIONS preflight response as an auth bypass", async () => {
    const result = await runHttpVerbTamperingCheck(
      { ...baseJob, baseUrl, path: "/verb/preflight" },
      probeClient
    );
    expect(result.status).toBe("pass");
  });

  it("does not flag XXE when the server only echoes the request body", async () => {
    const result = await runContentTypeConfusionCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/xxe-echo",
        method: "POST",
        testName: "content_type_confusion",
      },
      probeClient
    );
    expect(result.status).toBe("pass");
  });

  it("flags a server error when the content-type header is missing", async () => {
    const result = await runContentTypeConfusionCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/no-content-type-crash",
        method: "POST",
        testName: "content_type_confusion",
      },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("medium");
  });

  it("does not flag CRLF when the probe value is only reflected in a normal header", async () => {
    const result = await runHeaderInjectionCrlfCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/crlf-location-reflect",
        testName: "header_injection_crlf",
      },
      probeClient
    );
    expect(result.status).toBe("pass");
  });

  it("never stores cookie headers in failure evidence", async () => {
    const result = await runHeaderInjectionCrlfCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/crlf-vulnerable",
        testName: "header_injection_crlf",
      },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.detail.responseReceived?.headers).not.toHaveProperty("set-cookie");
  });

  it("flags a content-type confusion XXE leak", async () => {
    const result = await runContentTypeConfusionCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/xxe-vulnerable",
        method: "POST",
        testName: "content_type_confusion",
      },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("critical");
  });

  it("passes content-type confusion check on a clean parser", async () => {
    const result = await runContentTypeConfusionCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/xxe-clean",
        method: "POST",
        testName: "content_type_confusion",
      },
      probeClient
    );
    expect(result.status).toBe("pass");
  });

  it("flags CRLF header injection when a header is reflected unescaped", async () => {
    const result = await runHeaderInjectionCrlfCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/crlf-vulnerable",
        testName: "header_injection_crlf",
      },
      probeClient
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("high");
  });

  it("passes CRLF header injection check when headers are not reflected", async () => {
    const result = await runHeaderInjectionCrlfCheck(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/crlf-clean",
        testName: "header_injection_crlf",
      },
      probeClient
    );
    expect(result.status).toBe("pass");
  });

  it("dispatches protocol test names through executeTestJob", async () => {
    const result = await executeTestJob(
      {
        ...baseJob,
        baseUrl,
        path: "/protocol/crlf-clean",
        testName: "header_injection_crlf",
      },
      undefined,
      probeClient
    );
    expect(result.status).toBe("pass");
  });
});
