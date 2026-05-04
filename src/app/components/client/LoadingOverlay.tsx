"use client";

import styles from "@/app/styles/LoadingOverlay.module.css";
import { useLoading } from "@/app/hooks/useLoading";

/**
 * Full-screen loading overlay shown until the app is ready to use.
 *
 * Block the UI until both the service worker is registered and the ONNX model is warmed up.
 * Once both are ready, the overlay unmounts.
 */
const LoadingOverlay = () => {
  const { isSwReady, isModelReady } = useLoading();

  if (isSwReady && isModelReady) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <h1 className="text-3xl font-bold tracking-tight">docsnap</h1>
      <p className="text-sm text-gray-400 mt-4">
        <span className="inline-flex items-center">
          {/* Fixed width keeps "Preparing" centered as dots animate. */}
          <span className="w-20 text-right">Preparing</span>
          <span className={styles.dots} />
        </span>
      </p>
    </div>
  );
};

export default LoadingOverlay;
