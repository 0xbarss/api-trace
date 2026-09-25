import SwaggerParser from "@apidevtools/swagger-parser";
import YAML from "yaml";
import type { OpenAPI } from "openapi-types";
import type { ParseOptions } from "./types.js";

function parseSpecInput(input: string | Record<string, unknown>): string | OpenAPI.Document {
  if (typeof input !== "string") {
    return structuredClone(input) as OpenAPI.Document;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Specification input cannot be empty");
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed) as OpenAPI.Document;
  } catch {
    try {
      return YAML.parse(trimmed) as OpenAPI.Document;
    } catch (yamlErr) {
      throw new Error(
        `Failed to parse specification string as JSON or YAML: ${(yamlErr as Error).message}`
      );
    }
  }
}

function sanitizeCycles<T>(
  obj: T,
  ancestors = new Set<unknown>(),
  depth = 0,
  maxDepth = 20
): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (ancestors.has(obj)) {
    return { type: "object", description: "circular_reference" } as T;
  }

  if (depth >= maxDepth) {
    return { type: "object", description: "depth_limit_exceeded" } as T;
  }

  ancestors.add(obj);

  let result: unknown;
  if (Array.isArray(obj)) {
    result = obj.map((item) => sanitizeCycles(item, ancestors, depth + 1, maxDepth));
  } else {
    result = {};
    for (const [key, value] of Object.entries(obj)) {
      (result as Record<string, unknown>)[key] = sanitizeCycles(
        value,
        ancestors,
        depth + 1,
        maxDepth
      );
    }
  }

  ancestors.delete(obj);
  return result as T;
}

export async function parseAndDereferenceSpec(
  input: string | Record<string, unknown>,
  options?: ParseOptions
): Promise<OpenAPI.Document> {
  const prepared = parseSpecInput(input);
  const circularOption = options?.circular;
  const maxDepth = options?.maxDepth ?? 20;

  const parser = new SwaggerParser();
  const dereferenced = await parser.dereference(prepared, {
    dereference: {
      circular: circularOption === false ? false : circularOption === "ignore" ? "ignore" : true,
    },
  });

  if (circularOption === false) {
    return dereferenced;
  }

  return sanitizeCycles(dereferenced, new Set(), 0, maxDepth);
}
