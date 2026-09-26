export const createTargetSchema = {
  body: {
    type: "object",
    required: ["name", "baseUrl", "specSource"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      baseUrl: { type: "string", minLength: 1, maxLength: 1024 },
      specSource: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: "object",
      required: ["targetId", "discoveredEndpointsCount"],
      properties: {
        targetId: { type: "string" },
        discoveredEndpointsCount: { type: "integer" },
      },
    },
  },
};

export const targetParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
};

export const listTargetsSchema = {
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "baseUrl", "specSource", "createdAt", "updatedAt", "endpointsCount"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          baseUrl: { type: "string" },
          specSource: { type: "string" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
          endpointsCount: { type: "integer" },
        },
      },
    },
  },
};

export const getTargetSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      required: ["id", "name", "baseUrl", "specSource", "createdAt", "updatedAt", "endpoints"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        baseUrl: { type: "string" },
        specSource: { type: "string" },
        createdAt: { type: "string" },
        updatedAt: { type: "string" },
        endpoints: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "targetId", "method", "path", "authType", "riskScore", "createdAt"],
            properties: {
              id: { type: "string" },
              targetId: { type: "string" },
              method: { type: "string" },
              path: { type: "string" },
              operationId: { type: ["string", "null"] },
              authType: { type: "string" },
              parameters: { type: "array" },
              requestSchema: { type: ["object", "null"], additionalProperties: true },
              responseSchema: { type: ["object", "null"], additionalProperties: true },
              riskScore: { type: "integer" },
              createdAt: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const deleteTargetSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      required: ["success", "id"],
      properties: {
        success: { type: "boolean" },
        id: { type: "string" },
      },
    },
  },
};

export const createRunSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  body: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: { type: "string", enum: ["security", "performance", "contract"] },
      },
      enabledTests: { type: "array", items: { type: "string" } },
      disabledTests: { type: "array", items: { type: "string" } },
      config: { type: "object", additionalProperties: true },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: "object",
      required: ["runId", "totalTests", "status"],
      properties: {
        runId: { type: "string" },
        totalTests: { type: "integer" },
        status: { type: "string" },
      },
    },
  },
};

export const runParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
};

export const getRunSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      required: [
        "id",
        "targetId",
        "status",
        "totalTests",
        "completedTests",
        "passedTests",
        "failedTests",
        "warningTests",
        "createdAt",
      ],
      properties: {
        id: { type: "string" },
        targetId: { type: "string" },
        status: { type: "string" },
        totalTests: { type: "integer" },
        completedTests: { type: "integer" },
        passedTests: { type: "integer" },
        failedTests: { type: "integer" },
        warningTests: { type: "integer" },
        startedAt: { type: ["string", "null"] },
        finishedAt: { type: ["string", "null"] },
        createdAt: { type: "string" },
      },
    },
  },
};

export const getRunResultsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", format: "uuid" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "runId",
          "endpointId",
          "category",
          "testName",
          "status",
          "severity",
          "detail",
          "createdAt",
        ],
        properties: {
          id: { type: "string" },
          runId: { type: "string" },
          endpointId: { type: "string" },
          category: { type: "string" },
          testName: { type: "string" },
          status: { type: "string" },
          severity: { type: "string" },
          latencyMs: { type: ["integer", "null"] },
          detail: { type: "object", additionalProperties: true },
          createdAt: { type: "string" },
        },
      },
    },
  },
};
