import type { FastifyPluginAsync } from "fastify";
import { RunService } from "../services/run-service.js";
import { getRunSchema, getRunResultsSchema } from "../schemas/routes.js";
import { handleRunWebSocket } from "./websocket.js";
import type { RunParams } from "../types.js";

export const runsRoutes: FastifyPluginAsync = async (fastify) => {
  const runService = new RunService(fastify.db, fastify.queue);

  fastify.get<{ Params: RunParams }>(
    "/:id",
    { schema: getRunSchema },
    async (request, reply) => {
      const run = await runService.getRunById(request.params.id);
      return reply.status(200).send(run);
    }
  );

  fastify.get<{ Params: RunParams }>(
    "/:id/results",
    { schema: getRunResultsSchema },
    async (request, reply) => {
      const results = await runService.getRunResults(request.params.id);
      return reply.status(200).send(results);
    }
  );

  fastify.get<{ Params: RunParams }>(
    "/:id/stream",
    { websocket: true },
    (socket, request) => {
      void handleRunWebSocket(socket, request);
    }
  );
};

