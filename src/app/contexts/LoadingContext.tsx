"use client";

import { createContext, useState } from "react";

/**
 * Shape of the loading context value.
 *
 * @property isSwReady - `true` once the service worker is registered.
 * @property isModelReady - `true` once the ONNX model is warmed up.
 * @property setSwReady - Function to mark the service worker as ready.
 * @property setModelReady - Function to mark the model as ready.
 *
 */
type LoadingContextValue = {
  isSwReady: boolean;
  isModelReady: boolean;
  setSwReady: () => void;
  setModelReady: () => void;
};

export const LoadingContext = createContext<LoadingContextValue | null>(null);

/**
 * Provide loading state, tracking whether the service worker and ONNX model are ready.
 *
 * `LoadingOverlay` component consumes this context to block the UI until both are ready.
 *
 * @param param0
 * @returns
 */
export const LoadingContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isSwReady, setIsSwReady] = useState<boolean>(false);
  const [isModelReady, setIsModelReady] = useState<boolean>(false);

  return (
    <LoadingContext.Provider
      value={{
        isSwReady,
        isModelReady,
        setSwReady: () => setIsSwReady(true),
        setModelReady: () => setIsModelReady(true),
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
};
