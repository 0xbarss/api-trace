import type { OpenAPI } from "openapi-types";
import type { EndpointParameter } from "@apitrace/core";
import type { AuthType, DiscoveredApi, DiscoveredEndpoint, HttpMethod } from "./types.js";

const SUPPORTED_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

function resolveAuthType(
  doc: Record<string, any>,
  effectiveSecurity?: Record<string, string[]>[]
): AuthType {
  if (!effectiveSecurity || effectiveSecurity.length === 0) {
    return "none";
  }

  const firstRequirement = effectiveSecurity[0];
  const schemeNames = Object.keys(firstRequirement);
  if (schemeNames.length === 0) {
    return "none";
  }

  const schemeName = schemeNames[0];
  const securitySchemes =
    doc.components?.securitySchemes ?? doc.securityDefinitions ?? {};
  const schemeDef = securitySchemes[schemeName];

  if (schemeDef) {
    const type = (schemeDef.type || "").toLowerCase();
    if (type === "http") {
      const scheme = (schemeDef.scheme || "").toLowerCase();
      if (scheme === "bearer") return "bearer";
      if (scheme === "basic") return "basic";
      return scheme || "bearer";
    }
    if (type === "apikey") return "apiKey";
    if (type === "oauth2" || type === "openidconnect") return "oauth2";
    if (type === "basic") return "basic";
  }

  const lowerName = schemeName.toLowerCase();
  if (lowerName.includes("bearer") || lowerName.includes("jwt") || lowerName.includes("token")) {
    return "bearer";
  }
  if (lowerName.includes("basic")) {
    return "basic";
  }
  if (lowerName.includes("api_key") || lowerName.includes("apikey") || lowerName.includes("key")) {
    return "apiKey";
  }
  if (lowerName.includes("oauth")) {
    return "oauth2";
  }

  return schemeName || "bearer";
}

function extractRequestSchema(
  operation: Record<string, any>,
  opLevelParams: any[]
): Record<string, unknown> | null {
  const requestBody = operation.requestBody;
  if (requestBody && typeof requestBody === "object") {
    const content = requestBody.content;
    if (content && typeof content === "object") {
      if (content["application/json"]?.schema) {
        return content["application/json"].schema as Record<string, unknown>;
      }
      for (const [mediaType, mediaObj] of Object.entries<any>(content)) {
        if (mediaType.includes("json") && mediaObj?.schema) {
          return mediaObj.schema as Record<string, unknown>;
        }
      }
      for (const mediaObj of Object.values<any>(content)) {
        if (mediaObj?.schema) {
          return mediaObj.schema as Record<string, unknown>;
        }
      }
    }
  }

  const bodyParam = opLevelParams.find((p) => p && typeof p === "object" && p.in === "body");
  if (bodyParam?.schema && typeof bodyParam.schema === "object") {
    return bodyParam.schema as Record<string, unknown>;
  }

  return null;
}

function extractResponseSchema(operation: Record<string, any>): Record<string, unknown> | null {
  const responses = operation.responses;
  if (!responses || typeof responses !== "object") {
    return null;
  }

  const statusCodes = Object.keys(responses);
  const successKeys = statusCodes
    .filter((code) => code.startsWith("2"))
    .sort((a, b) => a.localeCompare(b));

  const targetKey = successKeys[0] || (responses["default"] ? "default" : statusCodes[0]);
  if (!targetKey) {
    return null;
  }

  const responseObj = responses[targetKey];
  if (!responseObj || typeof responseObj !== "object") {
    return null;
  }

  if (responseObj.content && typeof responseObj.content === "object") {
    if (responseObj.content["application/json"]?.schema) {
      return responseObj.content["application/json"].schema as Record<string, unknown>;
    }
    for (const [mediaType, mediaObj] of Object.entries<any>(responseObj.content)) {
      if (mediaType.includes("json") && mediaObj?.schema) {
        return mediaObj.schema as Record<string, unknown>;
      }
    }
    for (const mediaObj of Object.values<any>(responseObj.content)) {
      if (mediaObj?.schema) {
        return mediaObj.schema as Record<string, unknown>;
      }
    }
  }

  if (responseObj.schema && typeof responseObj.schema === "object") {
    return responseObj.schema as Record<string, unknown>;
  }

  return null;
}

function extractPathVariables(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1).trim());
}

export function normalizeOpenAPISpec(rawDoc: OpenAPI.Document | Record<string, any>): DiscoveredApi {
  const doc = rawDoc as Record<string, any>;
  const info = doc.info || {};
  const title = typeof info.title === "string" ? info.title : "Discovered API";
  const version = typeof info.version === "string" ? info.version : "1.0.0";
  const description = typeof info.description === "string" ? info.description : undefined;

  const globalSecurity = Array.isArray(doc.security) ? doc.security : undefined;
  const paths = doc.paths && typeof doc.paths === "object" ? doc.paths : {};
  const endpoints: DiscoveredEndpoint[] = [];

  for (const [pathPattern, pathItem] of Object.entries<any>(paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    const pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    for (const methodKey of Object.keys(pathItem)) {
      const upperMethod = methodKey.toUpperCase() as HttpMethod;
      if (!SUPPORTED_METHODS.includes(upperMethod)) {
        continue;
      }

      const operation = pathItem[methodKey];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const effectiveSecurity = Array.isArray(operation.security)
        ? operation.security
        : globalSecurity;
      const authType = resolveAuthType(doc, effectiveSecurity);

      const opLevelParams = Array.isArray(operation.parameters) ? operation.parameters : [];

      const paramMap = new Map<string, EndpointParameter>();

      for (const p of pathLevelParams) {
        if (!p || typeof p !== "object" || !p.name || !p.in) continue;
        const paramIn = p.in as "path" | "query" | "header" | "cookie";
        if (!["path", "query", "header", "cookie"].includes(paramIn)) continue;

        paramMap.set(`${p.name}:${paramIn}`, {
          name: String(p.name),
          in: paramIn,
          required: paramIn === "path" ? true : Boolean(p.required),
          schema: p.schema && typeof p.schema === "object" ? p.schema : p.type ? { type: p.type } : {},
        });
      }

      for (const p of opLevelParams) {
        if (!p || typeof p !== "object" || !p.name || !p.in) continue;
        const paramIn = p.in as "path" | "query" | "header" | "cookie";
        if (!["path", "query", "header", "cookie"].includes(paramIn)) continue;

        paramMap.set(`${p.name}:${paramIn}`, {
          name: String(p.name),
          in: paramIn,
          required: paramIn === "path" ? true : Boolean(p.required),
          schema: p.schema && typeof p.schema === "object" ? p.schema : p.type ? { type: p.type } : {},
        });
      }

      const pathVariables = extractPathVariables(pathPattern);
      for (const variable of pathVariables) {
        const key = `${variable}:path`;
        if (!paramMap.has(key)) {
          paramMap.set(key, {
            name: variable,
            in: "path",
            required: true,
            schema: { type: "string" },
          });
        }
      }

      const parameters = Array.from(paramMap.values());
      const requestSchema = extractRequestSchema(operation, opLevelParams);
      const responseSchema = extractResponseSchema(operation);
      const operationId =
        typeof operation.operationId === "string" ? operation.operationId : undefined;

      endpoints.push({
        method: upperMethod,
        path: pathPattern,
        operationId,
        authType,
        parameters,
        requestSchema,
        responseSchema,
      });
    }
  }

  return {
    title,
    version,
    description,
    endpoints,
  };
}
