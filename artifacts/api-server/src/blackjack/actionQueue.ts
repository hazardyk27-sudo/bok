export type BlackjackQueuedActionContext = Readonly<{
  queueSequence: number;
}>;

export type BlackjackActionQueue = Readonly<{
  enqueue: <T>(
    task: (context: BlackjackQueuedActionContext) => T | Promise<T>,
  ) => Promise<T>;
  pendingCount: () => number;
  activeCount: () => number;
  nextSequence: () => number;
}>;

export function createBlackjackActionQueue(): BlackjackActionQueue {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let active = 0;
  let sequence = 0;

  const enqueue = <T>(
    task: (context: BlackjackQueuedActionContext) => T | Promise<T>,
  ): Promise<T> => {
    if (typeof task !== "function") {
      return Promise.reject(
        new TypeError("Blackjack action queue requires a task function"),
      );
    }

    const queueSequence = sequence + 1;
    sequence = queueSequence;
    pending += 1;

    let resolveResult!: (value: T | PromiseLike<T>) => void;
    let rejectResult!: (reason?: unknown) => void;

    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const run = async () => {
      pending -= 1;
      active += 1;

      try {
        const value = await task(
          Object.freeze({
            queueSequence,
          }),
        );
        resolveResult(value);
      } catch (error) {
        rejectResult(error);
      } finally {
        active -= 1;
      }
    };

    tail = tail.then(run, run).then(
      () => undefined,
      () => undefined,
    );

    return result;
  };

  return Object.freeze({
    enqueue,
    pendingCount: () => pending,
    activeCount: () => active,
    nextSequence: () => sequence + 1,
  });
}
