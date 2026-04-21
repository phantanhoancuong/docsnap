/**
 * Wrap a promise with a timeout.
 *
 * Reject if the promise does not settle within the given time (in ms).
 *
 * @param promise - The promise to wrap.
 * @param timeoutMs - Maximum time in milliseconds to wait for the promise to settle.
 * @param label - Label used in the timeout error message.
 * @returns A promise that resolves with the same value as the input promise, or rejects with a timeout error if the deadline is exceeded.
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise
      .then((value: T) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
