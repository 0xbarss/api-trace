import { eq, desc, sql } from "drizzle-orm";
import { discoverApi } from "@apitrace/discovery";
import { targets, endpoints, type Database, type NewEndpoint } from "@apitrace/core";
import { HttpError } from "../plugins/error-handler.js";
import type {
  CreateTargetBody,
  CreateTargetResponse,
  TargetSummaryResponse,
  TargetDetailResponse,
} from "../types.js";

function formatSpecError(err: unknown, specSource: string): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Check for DNS / host resolution failure
  if (/getaddrinfo ENOTFOUND/i.test(raw)) {
    const match = raw.match(/getaddrinfo ENOTFOUND\s+([^\s:]+)/i);
    const host = match ? match[1] : "host";
    return `Could not reach specification URL: host "${host}" could not be resolved. Please verify the domain and network connection.`;
  }

  // Check for connection refused
  if (/ECONNREFUSED/i.test(raw)) {
    return "Could not connect to specification host: connection refused. Ensure the service is running and accessible.";
  }

  // Check for connection timeout
  if (/ETIMEDOUT/i.test(raw) || /ESOCKETTIMEDOUT/i.test(raw)) {
    return "Connection timed out while fetching specification. Please verify the URL and network availability.";
  }

  // Check for general downloading error
  if (/Error downloading\s+(https?:\/\/[^\s:]+)/i.test(raw)) {
    const match = raw.match(/Error downloading\s+(https?:\/\/[^\s:]+)/i);
    const targetUrl = match ? match[1] : specSource;
    return `Could not download specification from ${targetUrl}. Please ensure the URL is reachable.`;
  }

  // Check for JSON or YAML syntax errors
  if (/JSON or YAML/i.test(raw)) {
    return "Failed to parse OpenAPI specification: invalid JSON or YAML format.";
  }

  // Default parsing failure
  const cleaned = raw.replace(/^Error:\s*/, "");
  return `Failed to parse OpenAPI specification: ${cleaned}`;
}

export class TargetService {
  constructor(private readonly db: Database) {}

  async createTarget(body: CreateTargetBody): Promise<CreateTargetResponse> {
    const trimmedName = body.name.trim();
    if (!trimmedName) {
      throw new HttpError(400, "Target name cannot be empty");
    }

    const trimmedBaseUrl = body.baseUrl.trim();
    if (!trimmedBaseUrl.startsWith("http://") && !trimmedBaseUrl.startsWith("https://")) {
      throw new HttpError(400, "Base URL must be an absolute HTTP or HTTPS URL");
    }

    let discovered;
    try {
      discovered = await discoverApi(body.specSource);
    } catch (err) {
      const message = formatSpecError(err, body.specSource);
      throw new HttpError(400, message);
    }

    const normalizedBaseUrl = trimmedBaseUrl.replace(/\/+$/, "");

    const [target] = await this.db
      .insert(targets)
      .values({
        name: trimmedName,
        baseUrl: normalizedBaseUrl,
        specSource: body.specSource,
      })
      .returning();

    if (discovered.endpoints.length > 0) {
      const endpointRows: NewEndpoint[] = discovered.endpoints.map((ep) => ({
        targetId: target.id,
        method: ep.method,
        path: ep.path,
        operationId: ep.operationId ?? null,
        authType: ep.authType,
        parameters: ep.parameters,
        requestSchema: ep.requestSchema ?? null,
        responseSchema: ep.responseSchema ?? null,
        riskScore: 0,
      }));

      await this.db.insert(endpoints).values(endpointRows);
    }

    return {
      targetId: target.id,
      discoveredEndpointsCount: discovered.endpoints.length,
    };
  }

  async listTargets(): Promise<TargetSummaryResponse[]> {
    const allTargets = await this.db.select().from(targets).orderBy(desc(targets.createdAt));

    const counts = await this.db
      .select({
        targetId: endpoints.targetId,
        count: sql<number>`cast(count(${endpoints.id}) as int)`,
      })
      .from(endpoints)
      .groupBy(endpoints.targetId);

    const countMap = new Map<string, number>();
    for (const c of counts) {
      countMap.set(c.targetId, c.count);
    }

    return allTargets.map((t) => ({
      id: t.id,
      name: t.name,
      baseUrl: t.baseUrl,
      specSource: t.specSource,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      endpointsCount: countMap.get(t.id) ?? 0,
    }));
  }

  async getTargetById(id: string): Promise<TargetDetailResponse> {
    const [target] = await this.db.select().from(targets).where(eq(targets.id, id));
    if (!target) {
      throw new HttpError(404, `Target with id '${id}' not found`);
    }

    const targetEndpoints = await this.db
      .select()
      .from(endpoints)
      .where(eq(endpoints.targetId, id))
      .orderBy(endpoints.method, endpoints.path);

    return {
      id: target.id,
      name: target.name,
      baseUrl: target.baseUrl,
      specSource: target.specSource,
      createdAt: target.createdAt.toISOString(),
      updatedAt: target.updatedAt.toISOString(),
      endpoints: targetEndpoints,
    };
  }

  async deleteTarget(id: string): Promise<boolean> {
    const [target] = await this.db.select().from(targets).where(eq(targets.id, id));
    if (!target) {
      throw new HttpError(404, `Target with id '${id}' not found`);
    }

    await this.db.delete(targets).where(eq(targets.id, id));
    return true;
  }
}
