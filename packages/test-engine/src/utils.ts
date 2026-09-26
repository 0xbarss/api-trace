import type { EndpointParameter } from "@apitrace/core";

export function interpolatePath(
  path: string,
  parameters?: EndpointParameter[],
  overrides?: Record<string, string | number>
): string {
  const paramMap = new Map<string, EndpointParameter>();
  if (parameters) {
    for (const p of parameters) {
      paramMap.set(p.name, p);
    }
  }

  return path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    if (overrides && overrides[key] !== undefined) {
      return encodeURIComponent(String(overrides[key]));
    }

    const p = paramMap.get(key);
    if (p?.schema) {
      const type = p.schema["type"];
      const format = p.schema["format"];
      if (format === "uuid") {
        return "00000000-0000-0000-0000-000000000001";
      }
      if (type === "integer" || type === "number") {
        return "1";
      }
    }

    return "1";
  });
}

export function buildSampleBody(
  schema?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!schema || schema["type"] !== "object") {
    return undefined;
  }

  const properties = (schema["properties"] as Record<string, Record<string, unknown>>) ?? {};
  const required = Array.isArray(schema["required"]) ? (schema["required"] as string[]) : [];
  const body: Record<string, unknown> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    if (!isRequired && Object.keys(properties).length > 3) {
      continue;
    }
    const propType = propSchema?.["type"];
    if (propType === "string") {
      body[key] = "test";
    } else if (propType === "integer" || propType === "number") {
      body[key] = 1;
    } else if (propType === "boolean") {
      body[key] = true;
    } else if (propType === "array") {
      body[key] = [];
    } else if (propType === "object") {
      body[key] = {};
    }
  }

  return Object.keys(body).length > 0 ? body : { test: "value" };
}

export function truncate(text: string, maxLength = 500): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}... [truncated]`;
}
