import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function getHttpStatusName(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable Entity";
    case 429:
      return "Too Many Requests";
    default:
      return "Error";
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | HttpError | Error, request: FastifyRequest, reply: FastifyReply) => {
    if ("validation" in error && error.validation) {
      reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: error.message,
        details: error.validation,
      });
      return;
    }

    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: getHttpStatusName(error.statusCode),
        message: error.message,
        details: error.details,
      });
      return;
    }

    if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: getHttpStatusName(error.statusCode),
        message: error.message,
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An internal server error occurred",
    });
  });
}
