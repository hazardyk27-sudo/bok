import { describe, expect, it } from "vitest";
import { createBlackjackActionQueue } from "./actionQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("blackjack serialized action queue", () => {
  it("executes concurrently submitted actions strictly FIFO", async () => {
    const queue = createBlackjackActionQueue();
    const firstGate = deferred<void>();
    const started: number[] = [];
    const finished: number[] = [];

    const first = queue.enqueue(async ({ queueSequence }) => {
      started.push(queueSequence);
      await firstGate.promise;
      finished.push(queueSequence);
      return "first";
    });

    const second = queue.enqueue(async ({ queueSequence }) => {
      started.push(queueSequence);
      finished.push(queueSequence);
      return "second";
    });

    const third = queue.enqueue(async ({ queueSequence }) => {
      started.push(queueSequence);
      finished.push(queueSequence);
      return "third";
    });

    await Promise.resolve();

    expect(started).toEqual([1]);
    expect(queue.activeCount()).toBe(1);
    expect(queue.pendingCount()).toBe(2);

    firstGate.resolve();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await expect(third).resolves.toBe("third");

    expect(started).toEqual([1, 2, 3]);
    expect(finished).toEqual([1, 2, 3]);
    expect(queue.activeCount()).toBe(0);
    expect(queue.pendingCount()).toBe(0);
    expect(queue.nextSequence()).toBe(4);
  });

  it("never runs more than one action at a time", async () => {
    const queue = createBlackjackActionQueue();
    let concurrent = 0;
    let maximumConcurrent = 0;

    const tasks = Array.from({ length: 50 }, () =>
      queue.enqueue(async () => {
        concurrent += 1;
        maximumConcurrent = Math.max(maximumConcurrent, concurrent);
        await Promise.resolve();
        concurrent -= 1;
      }),
    );

    await Promise.all(tasks);

    expect(maximumConcurrent).toBe(1);
  });

  it("does not let a rejected action poison later queued actions", async () => {
    const queue = createBlackjackActionQueue();
    const execution: number[] = [];

    const first = queue.enqueue(({ queueSequence }) => {
      execution.push(queueSequence);
      throw new Error("intentional failure");
    });
    const second = queue.enqueue(({ queueSequence }) => {
      execution.push(queueSequence);
      return "recovered";
    });

    await expect(first).rejects.toThrow(/intentional failure/);
    await expect(second).resolves.toBe("recovered");
    expect(execution).toEqual([1, 2]);
  });

  it("assigns sequence at enqueue time, not completion time", async () => {
    const queue = createBlackjackActionQueue();
    const gate = deferred<void>();

    const first = queue.enqueue(async ({ queueSequence }) => {
      await gate.promise;
      return queueSequence;
    });
    const second = queue.enqueue(({ queueSequence }) => queueSequence);

    expect(queue.nextSequence()).toBe(3);

    gate.resolve();

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
  });

  it("handles synchronous and asynchronous tasks with the same ordering guarantee", async () => {
    const queue = createBlackjackActionQueue();
    const order: string[] = [];

    const first = queue.enqueue(() => {
      order.push("sync-1");
      return 1;
    });
    const second = queue.enqueue(async () => {
      await Promise.resolve();
      order.push("async-2");
      return 2;
    });
    const third = queue.enqueue(() => {
      order.push("sync-3");
      return 3;
    });

    await expect(Promise.all([first, second, third])).resolves.toEqual([1, 2, 3]);
    expect(order).toEqual(["sync-1", "async-2", "sync-3"]);
  });
});
