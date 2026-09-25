import { Redis } from "ioredis";
import type { QueueItem, QueueOptions, QueueLengths } from "./types.js";

export const DEFAULT_QUEUE_KEY = "apitrace:test:jobs";
export const DEFAULT_PROCESSING_KEY = "apitrace:test:jobs:processing";
export const DEFAULT_DLQ_KEY = "apitrace:test:jobs:dlq";

export function createRedisClient(url?: string): Redis {
  const redisUrl = url ?? process.env.REDIS_URL ?? "redis://localhost:6380";
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: false
  });
}

export class RedisQueue<T = unknown> {
  private readonly client: Redis;
  private readonly isOwnedClient: boolean;
  readonly queueKey: string;
  readonly processingKey: string;
  readonly deadLetterKey: string;

  constructor(clientOrUrl?: Redis | string, options: QueueOptions = {}) {
    if (clientOrUrl instanceof Redis) {
      this.client = clientOrUrl;
      this.isOwnedClient = false;
    } else if (typeof clientOrUrl === "string") {
      this.client = createRedisClient(clientOrUrl);
      this.isOwnedClient = true;
    } else {
      this.client = createRedisClient();
      this.isOwnedClient = true;
    }

    this.queueKey = options.queueKey ?? DEFAULT_QUEUE_KEY;
    this.processingKey = options.processingKey ?? DEFAULT_PROCESSING_KEY;
    this.deadLetterKey = options.deadLetterKey ?? DEFAULT_DLQ_KEY;
  }

  getClient(): Redis {
    return this.client;
  }

  async pushBatch(jobs: T[]): Promise<number> {
    if (jobs.length === 0) {
      return 0;
    }

    const serializedItems = jobs.map((job) => JSON.stringify(job));
    return await this.client.lpush(this.queueKey, ...serializedItems);
  }

  async push(job: T): Promise<number> {
    return await this.pushBatch([job]);
  }

  async pop(timeoutSeconds = 2): Promise<QueueItem<T> | null> {
    const rawItem = await this.client.brpoplpush(this.queueKey, this.processingKey, timeoutSeconds);
    if (!rawItem) {
      return null;
    }

    try {
      const data = JSON.parse(rawItem) as T;
      return { raw: rawItem, data };
    } catch (err) {
      await this.moveToDlq(
        rawItem,
        `JSON parse error: ${err instanceof Error ? err.message : String(err)}`
      );
      throw new Error(`Failed to parse queue job: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async popNow(): Promise<QueueItem<T> | null> {
    const rawItem = await this.client.rpoplpush(this.queueKey, this.processingKey);
    if (!rawItem) {
      return null;
    }

    try {
      const data = JSON.parse(rawItem) as T;
      return { raw: rawItem, data };
    } catch (err) {
      await this.moveToDlq(
        rawItem,
        `JSON parse error: ${err instanceof Error ? err.message : String(err)}`
      );
      throw new Error(`Failed to parse queue job: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async ack(rawItem: string): Promise<number> {
    return await this.client.lrem(this.processingKey, 1, rawItem);
  }

  async moveToDlq(rawItem: string, errorReason: string): Promise<void> {
    let dlqPayload: unknown;
    try {
      const parsed = JSON.parse(rawItem);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        dlqPayload = {
          ...parsed,
          _error: errorReason,
          _failedAt: new Date().toISOString()
        };
      } else {
        dlqPayload = {
          _payload: parsed,
          _error: errorReason,
          _failedAt: new Date().toISOString()
        };
      }
    } catch {
      dlqPayload = {
        _raw: rawItem,
        _error: errorReason,
        _failedAt: new Date().toISOString()
      };
    }

    const multi = this.client.multi();
    multi.lrem(this.processingKey, 1, rawItem);
    multi.lpush(this.deadLetterKey, JSON.stringify(dlqPayload));
    await multi.exec();
  }

  async recoverStaleJobs(): Promise<number> {
    const staleItems = await this.client.lrange(this.processingKey, 0, -1);
    if (staleItems.length === 0) {
      return 0;
    }

    const multi = this.client.multi();
    multi.rpush(this.queueKey, ...staleItems);
    multi.del(this.processingKey);
    await multi.exec();

    return staleItems.length;
  }

  async getQueueLengths(): Promise<QueueLengths> {
    const pipeline = this.client.pipeline();
    pipeline.llen(this.queueKey);
    pipeline.llen(this.processingKey);
    pipeline.llen(this.deadLetterKey);
    const results = await pipeline.exec();

    return {
      waiting: (results?.[0]?.[1] as number) ?? 0,
      processing: (results?.[1]?.[1] as number) ?? 0,
      deadLetter: (results?.[2]?.[1] as number) ?? 0
    };
  }

  async clear(): Promise<void> {
    await this.client.del(this.queueKey, this.processingKey, this.deadLetterKey);
  }

  async close(): Promise<void> {
    if (this.isOwnedClient) {
      await this.client.quit();
    }
  }
}
