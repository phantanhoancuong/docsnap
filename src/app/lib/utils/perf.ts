const isPerfEnabled = process.env.NEXT_PUBLIC_PERF === "true";

/**
 * Measure the wall-clock duration of an async of sync operation.
 *
 * @param label - Name shown in the console.
 * @param fn - Operation to time.
 * @returns The operation's return value.
 */
export const time = async <T>(
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> => {
  if (!isPerfEnabled) return fn();
  const start = performance.now();
  const result = await fn();
  console.log(
    `[pipeline] ${label}: ${(performance.now() - start).toFixed(1)}ms`,
  );
  return result;
};
