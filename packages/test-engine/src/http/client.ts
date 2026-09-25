import { Agent, request, type Dispatcher } from "undici";
import type {
  ProbeRequestOptions,
  ProbeResponse,
  ProbeEngineOptions,
} from "../types.js";

export class HttpProbeError extends Error {
  public readonly latencyMs: number;

  constructor(message: string, latencyMs: number) {
    super(message);
    this.name = "HttpProbeError";
    this.latencyMs = latencyMs;
  }
}

export class HttpProbeClient {
  private readonly dispatcher: Dispatcher;
  private readonly defaultTimeoutMs: number;
  private readonly customHeaders: Record<string, string>;

  constructor(options: ProbeEngineOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? 10000;
    this.customHeaders = options.customHeaders ?? {};

    this.dispatcher = new Agent({
      connections: options.connections ?? 25,
      pipelining: options.pipelining ?? 1,
      keepAliveTimeout: 10000,
      keepAliveMaxTimeout: 30000,
    });
  }

  public buildUrl(
    baseUrl: string,
    path = "",
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
    const url = new URL(`${cleanBase}${cleanPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  public async send(
    baseUrl: string,
    options: ProbeRequestOptions = {}
  ): Promise<ProbeResponse> {
    const targetUrl = options.url ?? this.buildUrl(baseUrl, options.path, options.query);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const method = (options.method ?? "GET").toUpperCase();

    const headers: Record<string, string> = {
      ...this.customHeaders,
      ...(options.headers ?? {}),
    };

    let requestBody: string | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === "string") {
        requestBody = options.body;
      } else {
        requestBody = JSON.stringify(options.body);
        if (!headers["content-type"] && !headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    const startTime = performance.now();

    try {
      const response = await request(targetUrl, {
        method: method as Dispatcher.HttpMethod,
        headers,
        body: requestBody,
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const bodyText = await response.body.text();
      const latencyMs = Math.round(performance.now() - startTime);

      let parsedJson: unknown | null = null;
      try {
        parsedJson = JSON.parse(bodyText);
      } catch {
        parsedJson = null;
      }

      const normalizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined) {
          normalizedHeaders[key.toLowerCase()] = Array.isArray(value)
            ? value.join(", ")
            : value;
        }
      }

      return {
        statusCode: response.statusCode,
        headers: normalizedHeaders,
        body: bodyText,
        json: parsedJson,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpProbeError(`Probe HTTP request failed: ${message}`, latencyMs);
    }
  }

  public async burst(
    baseUrl: string,
    options: ProbeRequestOptions = {},
    count = 30
  ): Promise<ProbeResponse[]> {
    const promises = Array.from({ length: count }, () =>
      this.send(baseUrl, options)
    );
    return Promise.all(promises);
  }

  public async close(): Promise<void> {
    await this.dispatcher.destroy();
  }
}
