import type { EndpointParameter } from "@apitrace/core";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type AuthType = "none" | "bearer" | "apiKey" | "basic" | "oauth2" | string;

export interface DiscoveredEndpoint {
  method: HttpMethod;
  path: string;
  operationId?: string;
  authType: AuthType;
  parameters: EndpointParameter[];
  requestSchema?: Record<string, unknown> | null;
  responseSchema?: Record<string, unknown> | null;
}

export interface DiscoveredApi {
  title: string;
  version: string;
  description?: string;
  endpoints: DiscoveredEndpoint[];
}

export interface ParseOptions {
  circular?: "ignore" | boolean;
  maxDepth?: number;
}
