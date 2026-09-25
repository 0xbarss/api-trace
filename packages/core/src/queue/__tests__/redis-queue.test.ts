import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { RedisQueue } from "../redis-queue.js";

interface SampleJob {
  id: string;
  task: string;
  retries?: number;
}

describe("RedisQueue", () => {
  const runId = Math.random().toString(36).slice(2, 9);
  const queueKey = `apitrace:test:jobs:test-queue-${runId}`;
  const processingKey = `apitrace:test:jobs:test-processing-${runId}`;
  const deadLetterKey = `apitrace:test:jobs:test-dlq-${runId}`;

  const queue = new RedisQueue<SampleJob>("redis://localhost:6380", {
    queueKey,
    processingKey,
    deadLetterKey,
  });

  beforeEach(async () => {
    await queue.clear();
  });

  afterAll(async () => {
    await queue.clear();
    await queue.close();
  });

  it("should push and immediately pop a job", async () => {
    const job: SampleJob = { id: "job-1", task: "run-security-probe" };
    await queue.push(job);

    const lengthsBefore = await queue.getQueueLengths();
    expect(lengthsBefore.waiting).toBe(1);
    expect(lengthsBefore.processing).toBe(0);

    const popped = await queue.popNow();
    expect(popped).not.toBeNull();
    expect(popped?.data).toEqual(job);

    const lengthsDuring = await queue.getQueueLengths();
    expect(lengthsDuring.waiting).toBe(0);
    expect(lengthsDuring.processing).toBe(1);

    if (popped) {
      const removed = await queue.ack(popped.raw);
      expect(removed).toBe(1);
    }

    const lengthsAfter = await queue.getQueueLengths();
    expect(lengthsAfter.processing).toBe(0);
  });

  it("should push multiple jobs in a single batch", async () => {
    const jobs: SampleJob[] = [
      { id: "batch-1", task: "probe-a" },
      { id: "batch-2", task: "probe-b" },
      { id: "batch-3", task: "probe-c" },
    ];

    const count = await queue.pushBatch(jobs);
    expect(count).toBe(3);

    const lengths = await queue.getQueueLengths();
    expect(lengths.waiting).toBe(3);

    const item1 = await queue.popNow();
    const item2 = await queue.popNow();
    const item3 = await queue.popNow();

    expect(item1?.data.id).toBe("batch-1");
    expect(item2?.data.id).toBe("batch-2");
    expect(item3?.data.id).toBe("batch-3");
  });

  it("should block and pop when jobs arrive, or return null on timeout", async () => {
    const emptyPop = await queue.pop(1);
    expect(emptyPop).toBeNull();

    await queue.push({ id: "blocking-1", task: "probe-blocking" });
    const popped = await queue.pop(1);
    expect(popped).not.toBeNull();
    expect(popped?.data.id).toBe("blocking-1");

    if (popped) {
      await queue.ack(popped.raw);
    }
  });

  it("should move failed jobs to dead letter queue with metadata", async () => {
    const job: SampleJob = { id: "fail-1", task: "broken-task" };
    await queue.push(job);

    const popped = await queue.popNow();
    expect(popped).not.toBeNull();

    if (popped) {
      await queue.moveToDlq(popped.raw, "Target host unreachable");
    }

    const lengths = await queue.getQueueLengths();
    expect(lengths.processing).toBe(0);
    expect(lengths.deadLetter).toBe(1);

    const dlqItems = await queue.getClient().lrange(deadLetterKey, 0, -1);
    expect(dlqItems).toHaveLength(1);

    const parsedDlq = JSON.parse(dlqItems[0]);
    expect(parsedDlq.id).toBe("fail-1");
    expect(parsedDlq._error).toBe("Target host unreachable");
    expect(parsedDlq._failedAt).toBeDefined();
  });

  it("should move malformed JSON jobs to dead letter queue on pop", async () => {
    await queue.getClient().lpush(queueKey, "{ invalid json structure");

    await expect(queue.popNow()).rejects.toThrow("Failed to parse queue job");

    const lengths = await queue.getQueueLengths();
    expect(lengths.deadLetter).toBe(1);
    expect(lengths.processing).toBe(0);
  });

  it("should recover stale unacknowledged jobs from processing back to waiting", async () => {
    await queue.push({ id: "stale-1", task: "unacked-probe" });
    const popped = await queue.popNow();
    expect(popped).not.toBeNull();

    const lengthsBefore = await queue.getQueueLengths();
    expect(lengthsBefore.processing).toBe(1);
    expect(lengthsBefore.waiting).toBe(0);

    const recoveredCount = await queue.recoverStaleJobs();
    expect(recoveredCount).toBe(1);

    const lengthsAfter = await queue.getQueueLengths();
    expect(lengthsAfter.processing).toBe(0);
    expect(lengthsAfter.waiting).toBe(1);

    const recoveredPop = await queue.popNow();
    expect(recoveredPop?.data.id).toBe("stale-1");
    if (recoveredPop) {
      await queue.ack(recoveredPop.raw);
    }
  });
});
