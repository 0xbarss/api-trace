import type { FastifyPluginAsync } from "fastify";
import { TargetService } from "../services/target-service.js";
import {
  createTargetSchema,
  getTargetSchema,
  listTargetsSchema,
  deleteTargetSchema,
} from "../schemas/routes.js";
import type {
  CreateTargetBody,
  TargetParams,
} from "../types.js";

export const targetsRoutes: FastifyPluginAsync = async (fastify) => {
  const targetService = new TargetService(fastify.db);

  fastify.get(
    "/",
    { schema: listTargetsSchema },
    async (_request, reply) => {
      const targetsList = await targetService.listTargets();
      return reply.status(200).send(targetsList);
    }
  );

  fastify.get<{ Params: TargetParams }>(
    "/:id",
    { schema: getTargetSchema },
    async (request, reply) => {
      const target = await targetService.getTargetById(request.params.id);
      return reply.status(200).send(target);
    }
  );

  fastify.post<{ Body: CreateTargetBody }>(
    "/",
    { schema: createTargetSchema },
    async (request, reply) => {
      const result = await targetService.createTarget(request.body);
      return reply.status(201).send(result);
    }
  );

  fastify.delete<{ Params: TargetParams }>(
    "/:id",
    { schema: deleteTargetSchema },
    async (request, reply) => {
      await targetService.deleteTarget(request.params.id);
      return reply.status(200).send({ success: true, id: request.params.id });
    }
  );
};
