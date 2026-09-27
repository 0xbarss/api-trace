import { describe, it, expect } from "vitest";
import {
  buildValidBaselineBody,
  generateSchemaMutations,
} from "../index.js";

describe("Schema Mutation Engine", () => {
  const sampleSchema = {
    type: "object",
    required: ["sourceAccountId", "amount"],
    properties: {
      sourceAccountId: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
      destinationAccountId: {
        type: "string",
      },
      amount: {
        type: "number",
        minimum: 1,
        maximum: 100000,
      },
      currency: {
        type: "string",
        pattern: "^[A-Z]{3}$",
        enum: ["USD", "EUR", "GBP"],
      },
      memo: {
        type: "string",
      },
      urgent: {
        type: "boolean",
      },
    },
  };

  it("builds valid baseline body adhering to schema types and enums", () => {
    const baseline = buildValidBaselineBody(sampleSchema);

    expect(baseline).toBeDefined();
    expect(typeof baseline["sourceAccountId"]).toBe("string");
    expect(typeof baseline["amount"]).toBe("number");
    expect(baseline["amount"]).toBeGreaterThanOrEqual(1);
    expect(baseline["currency"]).toBe("USD");
    expect(typeof baseline["urgent"]).toBe("boolean");
  });

  it("returns empty array when schema is empty, null, or not an object", () => {
    expect(generateSchemaMutations(null)).toEqual([]);
    expect(generateSchemaMutations(undefined)).toEqual([]);
    expect(generateSchemaMutations({ type: "array" })).toEqual([]);
    expect(generateSchemaMutations({ type: "object", properties: {} })).toEqual([]);
  });

  it("generates comprehensive mutation cases across all 5 categories", () => {
    const mutations = generateSchemaMutations(sampleSchema);

    expect(mutations.length).toBeGreaterThanOrEqual(10);

    const mutationTypes = new Set(mutations.map((m) => m.mutationType));
    expect(mutationTypes).toContain("required_stripping");
    expect(mutationTypes).toContain("type_inversion");
    expect(mutationTypes).toContain("string_boundary");
    expect(mutationTypes).toContain("number_boundary");
    expect(mutationTypes).toContain("unexpected_property");

    // 1. Required stripping
    const strippedSource = mutations.find((m) => m.name === "missing_required_sourceAccountId");
    expect(strippedSource).toBeDefined();
    expect(strippedSource?.body).not.toHaveProperty("sourceAccountId");
    expect(strippedSource?.body).toHaveProperty("amount");

    const strippedAmount = mutations.find((m) => m.name === "missing_required_amount");
    expect(strippedAmount).toBeDefined();
    expect(strippedAmount?.body).not.toHaveProperty("amount");

    // 2. Type inversion
    const invertedAmount = mutations.find((m) => m.name === "type_inversion_amount");
    expect(invertedAmount).toBeDefined();
    expect(typeof (invertedAmount?.body as Record<string, unknown>)["amount"]).toBe("string");

    const invertedString = mutations.find((m) => m.name === "type_inversion_sourceAccountId");
    expect(invertedString).toBeDefined();
    expect(typeof (invertedString?.body as Record<string, unknown>)["sourceAccountId"]).toBe("number");

    // 3. String boundary
    const emptyString = mutations.find((m) => m.name === "empty_string_sourceAccountId");
    expect(emptyString).toBeDefined();
    expect((emptyString?.body as Record<string, unknown>)["sourceAccountId"]).toBe("");

    const oversizedString = mutations.find((m) => m.name === "oversized_string_memo");
    expect(oversizedString).toBeDefined();
    expect(
      ((oversizedString?.body as Record<string, unknown>)["memo"] as string).length
    ).toBeGreaterThanOrEqual(5000);

    const patternViolation = mutations.find((m) => m.name === "pattern_violation_currency");
    expect(patternViolation).toBeDefined();
    expect((patternViolation?.body as Record<string, unknown>)["currency"]).toContain("INVALID");

    // 4. Number boundary
    const numberBelow = mutations.find((m) => m.name === "number_below_min_amount");
    expect(numberBelow).toBeDefined();
    expect((numberBelow?.body as Record<string, unknown>)["amount"]).toBeLessThan(1);

    const numberAbove = mutations.find((m) => m.name === "number_above_max_amount");
    expect(numberAbove).toBeDefined();
    expect((numberAbove?.body as Record<string, unknown>)["amount"]).toBeGreaterThan(100000);

    // 5. Unexpected property injection
    const unexpected = mutations.find((m) => m.name === "unexpected_property_injection");
    expect(unexpected).toBeDefined();
    expect(unexpected?.body).toHaveProperty("__unrecognized_probe_field__");
  });
});
