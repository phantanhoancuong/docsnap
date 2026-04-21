import { useCallback, useRef, useState } from "react";

/**
 * An item waiting in or being processed by the queue.
 *
 * Store the entry to process and a list of subscribers so multiple callers that enqueue the same key all have their promises resolve.
 */
type QueueItem<T, R> = {
  entry: T;
  subscribers: Array<{
    resolve: (result: R) => void;
    reject: (error: unknown) => void;
  }>;
};

/**
 * Track the item being processed by the worker loop.
 *
 * Hold the original entry and an optional stale replacement.
 * If stale replacement is set, the worker will re-queue it automatically once the in-flight run finishes.
 */
type InFlight<T> = {
  entry: T;
  staleReplacement: T | null;
};

/**
 * Options for configuring the processing queue.
 */
type UseProcessingQueueOptions<T, R> = {
  /** Async function that processes an entry and returns a result. */
  processor: (entry: T) => Promise<R>;
};

/**
 * Return value of `useProcessingQueue`.
 */
type UseProcessingQueueResult<T, R> = {
  enqueue: (entry: T) => Promise<R>;
  cancel: (key: string) => void;
  isProcessing: boolean;
};

/**
 * Processing queue hook with `imageKey` and `scanMode` field. Process items one at a time in insertion order.
 *
 * Deduplication rules:
 *    1. If the key is already waiting in the queue with the same `scanMode`, the new caller is added as a subscriber to the existing item.
 * Both callers receive the same result when the item completes.
 *    2. If the key is already waiting in the queue with a different `scanMode`, the entry is replaced in place (to preserve queue position)
 * and a new promise is returned. The original caller's promise is rejected since their version will not be processed.
 *    3. If the key is current in-flight with the same `scanMode`, the new caller is added as a subscriber to the in-flight item.
 *    4. If the key is currently in-flight with a different `scanMode`, the in-flight run is marked stale.
 * It is allowed to finish but its result is discarded and the replacement entry is automatically re-queued.
 * The new caller receives a promise that resolves when the replacement run completes.
 * @param options
 * @returns
 */
export const useProcessingQueue = <
  T extends { imageKey: string; scanMode: string },
  R,
>(
  options: UseProcessingQueueOptions<T, R>,
): UseProcessingQueueResult<T, R> => {
  const { processor } = options;

  // Ordered map of `imageKey` to queued item to preserve insertion order.
  // This is so the processing order matches the order images were added.
  const queueRef = useRef<Map<string, QueueItem<T, R>>>(new Map());

  // The item currently being processed; `null` when the worker is idle.
  const inFlightRef = useRef<InFlight<T> | null>(null);

  // Ref mirror of isProcessing so the async worker loop can read the current
  // value without stale closure issues.
  const isProcessingRef = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);

  const cancelledKeysRef = useRef<Set<string>>(new Set());

  /**
   * Notify all subscribers of a completed item, then remove the item from the queue.
   * @param key - The `imageKey` of the item to settle.
   * @param result - The result to resolve subscribers with, or `null` if rejecting.
   * @param error - The error to reject subscribers with, or `null` if resolving.
   */
  const settleItem = useCallback(
    (key: string, result: R | null, error: unknown | null): void => {
      const item = queueRef.current.get(key);
      if (!item) return;

      item.subscribers.forEach(({ resolve, reject }) => {
        if (error !== null) {
          reject(error);
        } else {
          resolve(result as R);
        }
      });

      queueRef.current.delete(key);
    },
    [],
  );

  /**
   * Cancel a queued or in-flight item by key.
   *
   * Behavior:
   *    - If the item is queued but not yet processing, it is skipped immediately when the worker reaches it.
   *    - If the item is in-flight, the result is discarded after the current processor call resolves.
   *    - Subscribers are rejected with a cancellation error in both cases.
   *
   * @param key - The imageKey of the item to cancel.
   */
  const cancel = (key: string): void => {
    cancelledKeysRef.current.add(key);
  };

  /**
   * Worker loop.
   *
   * Behavior:
   *    - Pull item from the front to the queue one at a time, process them, and settle their subscribers.
   *    - If an in-flight item is marked stale by the time it finishes, its result is discarded
   * and the replacement entry is pushed to the front of the queue for immediate processing.
   *    - Exit when the queue is empty and set `isProcessing` to `false`.
   *
   * @returns A promise that resolves when the queue is empty.
   */
  const drainQueue = useCallback(async (): Promise<void> => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      while (queueRef.current.size > 0) {
        const [key, item] = queueRef.current.entries().next().value as [
          string,
          QueueItem<T, R>,
        ];

        // Skip cancelled items.
        if (cancelledKeysRef.current.has(key)) {
          cancelledKeysRef.current.delete(key);
          settleItem(key, null, new Error("Cancelled"));
          continue;
        }

        inFlightRef.current = { entry: item.entry, staleReplacement: null };

        try {
          const result = await processor(item.entry);

          // Check if the item was cancelled while in-flight.
          if (cancelledKeysRef.current.has(key)) {
            cancelledKeysRef.current.delete(key);
            settleItem(key, null, new Error("Cancelled"));
            continue;
          }

          if (inFlightRef.current.staleReplacement !== null) {
            settleItem(key, null, new Error("Superseded by newer version"));
            const replacement = inFlightRef.current.staleReplacement;
            const updatedQueue = new Map([
              [replacement.imageKey, { entry: replacement, subscribers: [] }],
              ...queueRef.current,
            ]);
            queueRef.current = updatedQueue;
          } else {
            settleItem(key, result, null);
          }
        } catch (error) {
          settleItem(key, null, error);
        } finally {
          inFlightRef.current = null;
        }
      }
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [processor, settleItem]);

  /**
   * Add an entry to the queue and return a promise that resolves with the processed result.
   *
   * Apply deduplication logic based on `imageKey` and `scanMode` as described in the hook docstring.
   *
   * @param entry - The entry to enqueue.
   * @returns A promise resolving with the processed result.
   * @throws If the processor throws, or if the item is cancelled or superseded.
   */
  const enqueue = useCallback(
    (entry: T): Promise<R> => {
      const { imageKey, scanMode } = entry;

      // Case 1: in-flight.
      if (inFlightRef.current?.entry.imageKey === imageKey) {
        if (inFlightRef.current.entry.scanMode === scanMode) {
          // Same version so add as a subscriber to the in-flight item.
          return new Promise((resolve, reject) => {
            const item = queueRef.current.get(imageKey);
            if (item) {
              item.subscribers.push({ resolve, reject });
            } else {
              // Re-enqueue as item has been removed from the queue mid-flight.
              queueRef.current.set(imageKey, {
                entry,
                subscribers: [{ resolve, reject }],
              });
            }
          });
        } else {
          // Different version so mark the in-flight run as stale.
          // The worker re-queues the replacement once it finishes.
          return new Promise((resolve, reject) => {
            inFlightRef.current!.staleReplacement = entry;
            // The replacement item needs subscribers so they get notified when the re-queued run completes.
            // They're stored in a placeholder queue entry that the worker inherits.
            queueRef.current.set(imageKey, {
              entry,
              subscribers: [{ resolve, reject }],
            });
          });
        }
      }

      // Case 2: key is in queue.
      if (queueRef.current.has(imageKey)) {
        const existing = queueRef.current.get(imageKey)!;

        if (existing.entry.scanMode === scanMode) {
          // Same version so subscribe to the existing item.
          return new Promise((resolve, reject) => {
            existing.subscribers.push({ resolve, reject });
          });
        } else {
          // Different version so replace the entry in place and reject the old subscribers.
          existing.subscribers.forEach(({ reject }) =>
            reject(new Error("Superseded by newer version")),
          );
          return new Promise((resolve, reject) => {
            queueRef.current.set(imageKey, {
              entry,
              subscribers: [{ resolve, reject }],
            });
          });
        }
      }

      // Case 3: new key so just add to queue and kick off the worker is not running yet.
      return new Promise((resolve, reject) => {
        queueRef.current.set(imageKey, {
          entry,
          subscribers: [{ resolve, reject }],
        });
        drainQueue();
      });
    },
    [drainQueue],
  );

  return { enqueue, cancel, isProcessing };
};
