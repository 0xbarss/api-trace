import { describe, it, expect } from "vitest";
import { generateEndpointJobs, type PlannerEndpointInput } from "../index.js";

const RUN_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_ID = "00000000-0000-0000-0000-000000000002";
const BASE_URL = "https://api.example.com";

function testNamesFor(endpoint: PlannerEndpointInput): string[] {
  return generateEndpointJobs(RUN_ID, TARGET_ID, BASE_URL, endpoint).map((j) => j.testName);
}

describe("Protocol tampering matrix rules", () => {
  it("plans verb tampering only for routes that require auth", () => {
    expect(testNamesFor({ id: "1", method: "GET", path: "/accounts", authType: "bearer" })).toContain(
      "http_verb_tampering"
    );
    expect(testNamesFor({ id: "2", method: "GET", path: "/health", authType: "none" })).not.toContain(
      "http_verb_tampering"
    );
  });

  it("plans content type confusion only for mutating routes with a request schema", () => {
    const withBody: PlannerEndpointInput = {
      id: "3",
      method: "POST",
      path: "/accounts",
      requestSchema: { type: "object", properties: { name: { type: "string" } } },
    };
    expect(testNamesFor(withBody)).toContain("content_type_confusion");
    expect(testNamesFor({ id: "4", method: "GET", path: "/accounts" })).not.toContain(
      "content_type_confusion"
    );
    expect(testNamesFor({ id: "5", method: "POST", path: "/ping" })).not.toContain(
      "content_type_confusion"
    );
  });

  it("plans CRLF header injection for every endpoint", () => {
    expect(testNamesFor({ id: "6", method: "GET", path: "/health" })).toContain("header_injection_crlf");
    expect(testNamesFor({ id: "7", method: "DELETE", path: "/x/{id}", authType: "bearer" })).toContain(
      "header_injection_crlf"
    );
  });

  it("files all three under the security category", () => {
    const jobs = generateEndpointJobs(RUN_ID, TARGET_ID, BASE_URL, {
      id: "8",
      method: "POST",
      path: "/accounts",
      authType: "bearer",
      requestSchema: { type: "object", properties: { name: { type: "string" } } },
    });
    const protocolJobs = jobs.filter((j) =>
      ["http_verb_tampering", "content_type_confusion", "header_injection_crlf"].includes(j.testName)
    );
    expect(protocolJobs).toHaveLength(3);
    expect(protocolJobs.every((j) => j.category === "security")).toBe(true);
  });

  it("honors disabledTests for the new rules", () => {
    const jobs = generateEndpointJobs(
      RUN_ID,
      TARGET_ID,
      BASE_URL,
      { id: "9", method: "GET", path: "/accounts", authType: "bearer" },
      { disabledTests: ["http_verb_tampering", "header_injection_crlf"] }
    );
    const names = jobs.map((j) => j.testName);
    expect(names).not.toContain("http_verb_tampering");
    expect(names).not.toContain("header_injection_crlf");
  });
});
