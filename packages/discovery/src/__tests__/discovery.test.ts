import { describe, it, expect } from "vitest";
import { discoverApi, parseAndDereferenceSpec, normalizeOpenAPISpec } from "../index.js";

describe("OpenAPI Discovery Engine", () => {
  it("should parse and normalize a standard OpenAPI 3.0 JSON specification", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: {
        title: "Store API",
        version: "1.2.0",
        description: "Store management service",
      },
      paths: {
        "/products": {
          get: {
            operationId: "listProducts",
            parameters: [
              {
                name: "limit",
                in: "query",
                required: false,
                schema: { type: "integer", default: 10 },
              },
            ],
            responses: {
              "200": {
                description: "List of products",
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Product" },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createProduct",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductInput" },
                },
              },
            },
            responses: {
              "201": {
                description: "Created product",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Product" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ProductInput: {
            type: "object",
            required: ["title", "price"],
            properties: {
              title: { type: "string" },
              price: { type: "number" },
            },
          },
          Product: {
            type: "object",
            required: ["id", "title", "price"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              price: { type: "number" },
            },
          },
        },
      },
    });

    const result = await discoverApi(spec);

    expect(result.title).toBe("Store API");
    expect(result.version).toBe("1.2.0");
    expect(result.description).toBe("Store management service");
    expect(result.endpoints).toHaveLength(2);

    const getEndpoint = result.endpoints.find(
      (e) => e.method === "GET" && e.path === "/products"
    );
    expect(getEndpoint).toBeDefined();
    expect(getEndpoint?.operationId).toBe("listProducts");
    expect(getEndpoint?.authType).toBe("none");
    expect(getEndpoint?.parameters).toHaveLength(1);
    expect(getEndpoint?.parameters[0].name).toBe("limit");
    expect(getEndpoint?.parameters[0].in).toBe("query");
    expect(getEndpoint?.parameters[0].required).toBe(false);

    // Response schema should be dereferenced
    expect(getEndpoint?.responseSchema).toBeDefined();
    expect(getEndpoint?.responseSchema?.type).toBe("array");
    const items = getEndpoint?.responseSchema?.items as Record<string, unknown>;
    expect(items.properties).toBeDefined();

    const postEndpoint = result.endpoints.find(
      (e) => e.method === "POST" && e.path === "/products"
    );
    expect(postEndpoint).toBeDefined();
    expect(postEndpoint?.operationId).toBe("createProduct");
    expect(postEndpoint?.requestSchema).toBeDefined();
    expect(postEndpoint?.requestSchema?.required).toEqual(["title", "price"]);
  });

  it("should parse and normalize a YAML specification", async () => {
    const yamlSpec = `
openapi: 3.0.0
info:
  title: YAML Petstore
  version: 2.0.0
paths:
  /pets/{petId}:
    parameters:
      - name: petId
        in: path
        required: true
        schema:
          type: integer
    get:
      summary: Get pet by ID
      responses:
        '200':
          description: A single pet
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: integer
                  name:
                    type: string
`;

    const result = await discoverApi(yamlSpec);

    expect(result.title).toBe("YAML Petstore");
    expect(result.version).toBe("2.0.0");
    expect(result.endpoints).toHaveLength(1);

    const endpoint = result.endpoints[0];
    expect(endpoint.method).toBe("GET");
    expect(endpoint.path).toBe("/pets/{petId}");
    expect(endpoint.parameters).toHaveLength(1);
    expect(endpoint.parameters[0].name).toBe("petId");
    expect(endpoint.parameters[0].in).toBe("path");
    expect(endpoint.parameters[0].required).toBe(true);
  });

  it("should handle circular references without crashing or blowing up", async () => {
    const circularSpec = {
      openapi: "3.0.0",
      info: { title: "Org Graph API", version: "1.0.0" },
      paths: {
        "/employees/{id}": {
          get: {
            responses: {
              "200": {
                description: "Employee with hierarchy",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Employee" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Employee: {
            type: "object",
            properties: {
              id: { type: "string" },
              manager: { $ref: "#/components/schemas/Employee" },
              reports: {
                type: "array",
                items: { $ref: "#/components/schemas/Employee" },
              },
            },
          },
        },
      },
    };

    const result = await discoverApi(circularSpec);

    expect(result.endpoints).toHaveLength(1);
    const endpoint = result.endpoints[0];
    expect(endpoint.responseSchema).toBeDefined();

    // Must be safely serializable to JSON without circular structure error
    const serialized = JSON.stringify(endpoint);
    expect(serialized).toContain("manager");
  });

  it("should correctly resolve global and operation-level auth types", async () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Auth Test API", version: "1.0.0" },
      security: [{ BearerJWT: [] }],
      components: {
        securitySchemes: {
          BearerJWT: {
            type: "http",
            scheme: "bearer",
          },
          ApiKeyHeader: {
            type: "apiKey",
            in: "header",
            name: "X-API-KEY",
          },
          BasicAuth: {
            type: "http",
            scheme: "basic",
          },
          OAuthFlow: {
            type: "oauth2",
            flows: {},
          },
        },
      },
      paths: {
        "/default-protected": {
          get: {
            responses: { "200": { description: "ok" } },
          },
        },
        "/public-unprotected": {
          get: {
            security: [],
            responses: { "200": { description: "ok" } },
          },
        },
        "/custom-api-key": {
          post: {
            security: [{ ApiKeyHeader: [] }],
            responses: { "200": { description: "ok" } },
          },
        },
        "/basic-login": {
          get: {
            security: [{ BasicAuth: [] }],
            responses: { "200": { description: "ok" } },
          },
        },
        "/oauth-access": {
          get: {
            security: [{ OAuthFlow: [] }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };

    const result = await discoverApi(spec);

    const defaultEp = result.endpoints.find((e) => e.path === "/default-protected");
    expect(defaultEp?.authType).toBe("bearer");

    const publicEp = result.endpoints.find((e) => e.path === "/public-unprotected");
    expect(publicEp?.authType).toBe("none");

    const apiKeyEp = result.endpoints.find((e) => e.path === "/custom-api-key");
    expect(apiKeyEp?.authType).toBe("apiKey");

    const basicEp = result.endpoints.find((e) => e.path === "/basic-login");
    expect(basicEp?.authType).toBe("basic");

    const oauthEp = result.endpoints.find((e) => e.path === "/oauth-access");
    expect(oauthEp?.authType).toBe("oauth2");
  });

  it("should infer path parameters from path template when missing in parameter list", async () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Inference API", version: "1.0.0" },
      paths: {
        "/organizations/{orgId}/departments/{deptId}": {
          parameters: [
            {
              name: "orgId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          get: {
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };

    const result = await discoverApi(spec);
    const endpoint = result.endpoints[0];

    expect(endpoint.parameters).toHaveLength(2);
    const orgParam = endpoint.parameters.find((p) => p.name === "orgId");
    expect(orgParam?.in).toBe("path");
    expect(orgParam?.required).toBe(true);

    const deptParam = endpoint.parameters.find((p) => p.name === "deptId");
    expect(deptParam).toBeDefined();
    expect(deptParam?.in).toBe("path");
    expect(deptParam?.required).toBe(true);
    expect(deptParam?.schema).toEqual({ type: "string" });
  });

  it("should merge and allow operation-level parameters to override path-level parameters", async () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Override API", version: "1.0.0" },
      paths: {
        "/items": {
          parameters: [
            {
              name: "sort",
              in: "query",
              required: false,
              schema: { type: "string", default: "asc" },
            },
          ],
          get: {
            parameters: [
              {
                name: "sort",
                in: "query",
                required: true,
                schema: { type: "string", enum: ["asc", "desc"] },
              },
              {
                name: "page",
                in: "query",
                required: false,
                schema: { type: "integer" },
              },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };

    const result = await discoverApi(spec);
    const endpoint = result.endpoints[0];

    expect(endpoint.parameters).toHaveLength(2);
    const sortParam = endpoint.parameters.find((p) => p.name === "sort");
    expect(sortParam?.required).toBe(true);
    expect(sortParam?.schema).toEqual({ type: "string", enum: ["asc", "desc"] });
  });

  it("should throw a descriptive error on empty or invalid specification", async () => {
    await expect(discoverApi("")).rejects.toThrow("Specification input cannot be empty");
    await expect(discoverApi("  \n  ")).rejects.toThrow("Specification input cannot be empty");
    await expect(discoverApi("not a valid : spec : [")).rejects.toThrow(
      "Failed to parse specification string"
    );
  });

  it("should fetch and discover specification from an HTTP URL", async () => {
    const http = await import("node:http");
    const sampleSpec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Remote Test API", version: "1.0.0" },
      paths: {
        "/ping": {
          get: {
            operationId: "ping",
            responses: { "200": { description: "pong" } },
          },
        },
      },
    });

    const server = http.createServer((req, res) => {
      if (req.url === "/spec.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(sampleSpec);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const result = await discoverApi(`http://127.0.0.1:${port}/spec.json`);
      expect(result.title).toBe("Remote Test API");
      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0].path).toBe("/ping");

      await expect(
        discoverApi(`http://127.0.0.1:${port}/missing.json`)
      ).rejects.toThrow("Failed to download specification");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

