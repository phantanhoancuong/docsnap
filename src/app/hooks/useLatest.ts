import { useEffect, useRef } from "react";

/**
 * Return a ref that always holds the latest value of the given variable.
 */
export const useLatest = <T>(value: T): React.RefObject<T> => {
  const valueRef = useRef<T>(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  return valueRef;
};
