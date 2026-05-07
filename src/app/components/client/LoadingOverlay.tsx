"use client";

import { useEffect, useState } from "react";

import { useLoading } from "@/app/hooks/useLoading";

import styles from "@/app/styles/LoadingOverlay.module.css";

/**
 * Full-screen loading overlay shown until the app is ready to use.
 *
 * Behavior:
 *    - Block the UI until both the service worker is registered and the ONNX model is warmed up.
 *    - Fade out once both are ready, then unmount after the transition.
 *    - If the model fails to load, show an error and keep the UI blocked.
 */
const LoadingOverlay = () => {
  const { isSwReady, isModelReady, isModelError } = useLoading();
  const [visible, setVisible] = useState(true);
  const isReady = isSwReady && isModelReady;

  useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background ${styles.overlay} ${isReady ? styles.hidden : ""}`}
    >
      <h1 className="text-3xl font-bold tracking-tight">docsnap</h1>
      {isModelError ? (
        <p className="text-center text-sm text-red-500 mt-4">
          Failed to load
          <br />
          Please refresh the page or try again later
        </p>
      ) : (
        <p className="text-sm text-gray-400 mt-4">
          <span className="inline-flex items-center">
            {/* Fixed width keeps "Preparing" centered as dots animate. */}
            <span className="w-20 text-right">Preparing</span>
            <span className={styles.dots} />
          </span>
        </p>
      )}
    </div>
  );
};

export default LoadingOverlay;
