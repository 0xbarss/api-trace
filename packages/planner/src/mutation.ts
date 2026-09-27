import type { SchemaMutationCase } from "./types.js";

interface JsonSchemaProperty {
  type?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export function buildValidBaselineBody(
  schema?: Record<string, unknown> | null
): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || schema["type"] !== "object") {
    return {};
  }

  const properties = (schema["properties"] as Record<string, JsonSchemaProperty>) ?? {};
  const body: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== "object") {
      body[key] = "test";
      continue;
    }

    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      body[key] = prop.enum[0];
      continue;
    }

    const type = prop.type ?? "string";

    switch (type) {
      case "string":
        if (prop.format === "email") {
          body[key] = "tester@example.com";
        } else if (prop.format === "uuid") {
          body[key] = "00000000-0000-0000-0000-000000000001";
        } else if (prop.format === "date" || prop.format === "date-time") {
          body[key] = "2026-09-28T00:00:00.000Z";
        } else {
          body[key] = "sample_value";
        }
        break;
      case "integer":
      case "number":
        body[key] = typeof prop.minimum === "number" ? prop.minimum : 10;
        break;
      case "boolean":
        body[key] = true;
        break;
      case "array":
        body[key] = [];
        break;
      case "object":
        body[key] = {};
        break;
      default:
        body[key] = "sample_value";
        break;
    }
  }

  return body;
}

export function generateSchemaMutations(
  schema?: Record<string, unknown> | null
): SchemaMutationCase[] {
  if (!schema || typeof schema !== "object" || schema["type"] !== "object") {
    return [];
  }

  const properties = (schema["properties"] as Record<string, JsonSchemaProperty>) ?? {};
  const required = Array.isArray(schema["required"]) ? (schema["required"] as string[]) : [];
  const propertyKeys = Object.keys(properties);

  if (propertyKeys.length === 0) {
    return [];
  }

  const baseline = buildValidBaselineBody(schema);
  const mutations: SchemaMutationCase[] = [];

  // 1. Required Property Stripping
  for (const reqKey of required) {
    if (reqKey in baseline) {
      const strippedBody = { ...baseline };
      delete strippedBody[reqKey];
      mutations.push({
        name: `missing_required_${reqKey}`,
        description: `Omit required property "${reqKey}" from request payload`,
        mutationType: "required_stripping",
        targetField: reqKey,
        body: strippedBody,
      });
    }
  }

  // 2. Type Inversion
  for (const key of propertyKeys) {
    const prop = properties[key];
    const type = prop?.type ?? "string";
    let invertedValue: unknown;

    if (type === "integer" || type === "number") {
      invertedValue = "invalid_string_not_a_number";
    } else if (type === "string") {
      invertedValue = 99999999;
    } else if (type === "boolean") {
      invertedValue = "not_a_boolean";
    } else if (type === "array") {
      invertedValue = "not_an_array_string";
    } else if (type === "object") {
      invertedValue = "not_an_object_string";
    } else {
      invertedValue = { invalid: true };
    }

    mutations.push({
      name: `type_inversion_${key}`,
      description: `Send invalid type for property "${key}" (expected ${type}, sent ${typeof invertedValue})`,
      mutationType: "type_inversion",
      targetField: key,
      body: {
        ...baseline,
        [key]: invertedValue,
      },
    });
  }

  // 3. String Boundary Tests
  for (const key of propertyKeys) {
    const prop = properties[key];
    if (prop?.type === "string" || !prop?.type) {
      // Empty string violation
      if (required.includes(key) || (typeof prop?.minLength === "number" && prop.minLength > 0)) {
        mutations.push({
          name: `empty_string_${key}`,
          description: `Send empty string violating non-empty constraint for "${key}"`,
          mutationType: "string_boundary",
          targetField: key,
          body: {
            ...baseline,
            [key]: "",
          },
        });
      }

      // Oversized string boundary violation
      mutations.push({
        name: `oversized_string_${key}`,
        description: `Send 5,000-character string exceeding normal length bounds for "${key}"`,
        mutationType: "string_boundary",
        targetField: key,
        body: {
          ...baseline,
          [key]: "A".repeat(5000),
        },
      });

      // Regex pattern violation
      if (prop?.pattern) {
        mutations.push({
          name: `pattern_violation_${key}`,
          description: `Send pattern-violating string for property "${key}"`,
          mutationType: "string_boundary",
          targetField: key,
          body: {
            ...baseline,
            [key]: "___INVALID_REGEX_PATTERN_TEST_STRING___",
          },
        });
      }
    }
  }

  // 4. Number Boundary Tests
  for (const key of propertyKeys) {
    const prop = properties[key];
    if (prop?.type === "integer" || prop?.type === "number") {
      // Value below minimum
      const minVal = typeof prop.minimum === "number" ? prop.minimum - 100 : -999999;
      mutations.push({
        name: `number_below_min_${key}`,
        description: `Send numeric value below boundary for "${key}" (${minVal})`,
        mutationType: "number_boundary",
        targetField: key,
        body: {
          ...baseline,
          [key]: minVal,
        },
      });

      // Value above maximum
      const maxVal = typeof prop.maximum === "number" ? prop.maximum + 1000 : 9007199254740991;
      mutations.push({
        name: `number_above_max_${key}`,
        description: `Send numeric value above boundary for "${key}" (${maxVal})`,
        mutationType: "number_boundary",
        targetField: key,
        body: {
          ...baseline,
          [key]: maxVal,
        },
      });
    }
  }

  // 5. Unexpected / Additional Property Injection
  mutations.push({
    name: "unexpected_property_injection",
    description: "Inject unknown property '__unrecognized_probe_field__' into request body",
    mutationType: "unexpected_property",
    targetField: "__unrecognized_probe_field__",
    body: {
      ...baseline,
      __unrecognized_probe_field__: "unauthorized_extra_value",
    },
  });

  return mutations;
}
