import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { pool } from "@apitrace/core";
import { buildServer } from "../server.js";

const SAMPLE_YAML_SPEC = `
openapi: 3.0.0
info:
  title: Test Ingestion API
  version: 1.0.0
paths:
  /api/v1/users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                    email:
                      type: string
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email:
                  type: string
      responses:
        '201':
          description: Created
  /api/v1/users/{id}:
    get:
      summary: Get user
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Found
`;

describe("Target Management & Ingestion API (/api/targets)", () => {
  let app: FastifyInstance;
  const createdTargetIds: string[] = [];

  beforeAll(async () => {
    app = await buildServer({ logger: false });
  });

  afterAll(async () => {
    for (const id of createdTargetIds) {
      await app.inject({
        method: "DELETE",
        url: `/api/targets/${id}`,
      });
    }
    await app.close();
    await pool.end();
  });

  it("should reject creation when required payload fields are missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Missing fields",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toContain("must have required property");
  });

  it("should reject creation when baseUrl is invalid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Invalid URL Target",
        baseUrl: "ftp://not-an-http-url",
        specSource: SAMPLE_YAML_SPEC,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain("Base URL must be an absolute HTTP or HTTPS URL");
  });

  it("should reject creation when OpenAPI specification is malformed", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Malformed Spec Target",
        baseUrl: "https://api.example.com",
        specSource: "not: a: valid: [openapi spec",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain("Failed to parse OpenAPI specification");
  });

  it("should ingest valid OpenAPI specification and return 201 with targetId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Users Microservice",
        baseUrl: "https://api.example.com/v1/",
        specSource: SAMPLE_YAML_SPEC,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.targetId).toBeDefined();
    expect(body.discoveredEndpointsCount).toBe(3);

    createdTargetIds.push(body.targetId);
  });

  it("should list all targets including discovered endpoint counts", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/targets",
    });

    expect(response.statusCode).toBe(200);
    const list = response.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);

    const targetId = createdTargetIds[0];
    const createdTarget = list.find((t: { id: string }) => t.id === targetId);
    expect(createdTarget).toBeDefined();
    expect(createdTarget.name).toBe("Users Microservice");
    expect(createdTarget.baseUrl).toBe("https://api.example.com/v1");
    expect(createdTarget.endpointsCount).toBe(3);
  });

  it("should return target details and list of discovered endpoints on GET /api/targets/:id", async () => {
    const targetId = createdTargetIds[0];
    const response = await app.inject({
      method: "GET",
      url: `/api/targets/${targetId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(targetId);
    expect(body.name).toBe("Users Microservice");
    expect(body.baseUrl).toBe("https://api.example.com/v1");
    expect(Array.isArray(body.endpoints)).toBe(true);
    expect(body.endpoints).toHaveLength(3);

    const postEndpoint = body.endpoints.find(
      (e: { method: string; path: string }) => e.method === "POST" && e.path === "/api/v1/users"
    );
    expect(postEndpoint).toBeDefined();
    expect(postEndpoint.requestSchema).toBeDefined();

    const getByIdEndpoint = body.endpoints.find(
      (e: { method: string; path: string }) => e.method === "GET" && e.path === "/api/v1/users/{id}"
    );
    expect(getByIdEndpoint).toBeDefined();
    expect(getByIdEndpoint.parameters).toHaveLength(1);
    expect(getByIdEndpoint.parameters[0].name).toBe("id");
  });

  it("should return 400 when requested target ID is not a valid UUID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/targets/not-a-valid-uuid",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain('params/id must match format "uuid"');
  });

  it("should return 404 when target is not found", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/targets/00000000-0000-0000-0000-000000000000",
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.statusCode).toBe(404);
    expect(body.message).toContain("Target with id '00000000-0000-0000-0000-000000000000' not found");
  });

  it("should delete target and cascade delete associated endpoints", async () => {
    // Create a temporary target to delete
    const createRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Temporary Target for Deletion",
        baseUrl: "https://temp.example.com",
        specSource: SAMPLE_YAML_SPEC,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const { targetId } = createRes.json();

    // Verify it exists
    const getRes = await app.inject({
      method: "GET",
      url: `/api/targets/${targetId}`,
    });
    expect(getRes.statusCode).toBe(200);

    // Delete it
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/targets/${targetId}`,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ success: true, id: targetId });

    // Verify subsequent GET returns 404
    const getAfterDeleteRes = await app.inject({
      method: "GET",
      url: `/api/targets/${targetId}`,
    });
    expect(getAfterDeleteRes.statusCode).toBe(404);
  });
  describe("Auth profiles (/api/targets/:id/auth-profiles)", () => {
    const createTarget = async (): Promise<string> => {
      const res = await app.inject({
        method: "POST",
        url: "/api/targets",
        payload: {
          name: "Auth Profile Target",
          baseUrl: "https://api.example.com",
          specSource: SAMPLE_YAML_SPEC,
        },
      });
      const { targetId } = res.json();
      createdTargetIds.push(targetId);
      return targetId;
    };

    it("should store Tenant A and Tenant B profiles and never echo tokens back", async () => {
      const targetId = await createTarget();

      const putRes = await app.inject({
        method: "PUT",
        url: `/api/targets/${targetId}/auth-profiles`,
        payload: {
          primary: { name: " Tenant A ", token: "secret-token-a" },
          secondary: { name: "Tenant B", token: "secret-token-b" },
        },
      });

      expect(putRes.statusCode).toBe(200);
      expect(putRes.json()).toEqual({
        primary: { name: "Tenant A", hasToken: true },
        secondary: { name: "Tenant B", hasToken: true },
      });
      expect(putRes.body).not.toContain("secret-token");

      const getRes = await app.inject({ method: "GET", url: `/api/targets/${targetId}` });
      expect(getRes.json().authProfiles.primary).toEqual({ name: "Tenant A", hasToken: true });
      expect(getRes.body).not.toContain("secret-token");

      const listRes = await app.inject({ method: "GET", url: "/api/targets" });
      const listed = listRes.json().find((t: { id: string }) => t.id === targetId);
      expect(listed.hasAuthProfiles).toBe(true);
    });

    it("should accept auth profiles at creation time", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/targets",
        payload: {
          name: "Preconfigured Target",
          baseUrl: "https://api.example.com",
          specSource: SAMPLE_YAML_SPEC,
          authProfiles: { primary: { name: "Tenant A", token: "tok-a" } },
        },
      });
      expect(res.statusCode).toBe(201);
      const { targetId } = res.json();
      createdTargetIds.push(targetId);

      const getRes = await app.inject({ method: "GET", url: `/api/targets/${targetId}` });
      expect(getRes.json().authProfiles.primary).toEqual({ name: "Tenant A", hasToken: true });
    });

    it("should report no auth profiles for targets that never configured any", async () => {
      const targetId = await createTarget();
      const getRes = await app.inject({ method: "GET", url: `/api/targets/${targetId}` });
      expect(getRes.json().authProfiles).toEqual({});
    });

    it("should reject profiles with a blank token", async () => {
      const targetId = await createTarget();
      const res = await app.inject({
        method: "PUT",
        url: `/api/targets/${targetId}/auth-profiles`,
        payload: { primary: { name: "Tenant A", token: "   " } },
      });
      expect(res.statusCode).toBe(400);
    });

    it("should ignore unknown profile slots instead of persisting them", async () => {
      const targetId = await createTarget();
      const res = await app.inject({
        method: "PUT",
        url: `/api/targets/${targetId}/auth-profiles`,
        payload: { tertiary: { name: "X", token: "y" } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({});
    });

    it("should return 404 for an unknown target", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/targets/00000000-0000-0000-0000-000000000000/auth-profiles",
        payload: { primary: { name: "Tenant A", token: "tok" } },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
