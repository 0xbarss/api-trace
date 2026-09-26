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
