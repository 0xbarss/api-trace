import SwaggerParser from "@apidevtools/swagger-parser";
import YAML from "yaml";
import type { OpenAPI } from "openapi-types";
import type { ParseOptions } from "./types.js";

async function parseSpecInput(input: string | Record<string, unknown>): Promise<OpenAPI.Document> {
  if (typeof input !== "string") {
    return structuredClone(input) as OpenAPI.Document;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Specification input cannot be empty");
  }

  let textToParse = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const response = await fetch(trimmed, {
        headers: {
          Accept: "application/json, application/yaml, text/yaml, text/plain, */*",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download specification from ${trimmed}: HTTP ${response.status} ${response.statusText}`
        );
      }

      textToParse = await response.text();
    } catch (fetchErr) {
      if (fetchErr instanceof Error && fetchErr.message.startsWith("Failed to download")) {
        throw fetchErr;
      }
      const rawMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      throw new Error(`Failed to reach specification URL "${trimmed}": ${rawMsg}`);
    }
  }

  try {
    return JSON.parse(textToParse) as OpenAPI.Document;
  } catch {
    try {
      return YAML.parse(textToParse) as OpenAPI.Document;
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
  const prepared = await parseSpecInput(input);
  const circularOption = options?.circular;
  const maxDepth = options?.maxDepth ?? 20;

  const parser = new SwaggerParser();
  const dereferenced = (await parser.dereference(prepared, {
    dereference: {
      circular: circularOption === false ? false : circularOption === "ignore" ? "ignore" : true,
    },
    resolve: {
      http: {
        safeUrlResolver: false,
      } as unknown as SwaggerParser.HTTPResolverOptions,
    },
  })) as OpenAPI.Document;

  if (circularOption === false) {
    return dereferenced;
  }

  return sanitizeCycles(dereferenced, new Set(), 0, maxDepth);
}
