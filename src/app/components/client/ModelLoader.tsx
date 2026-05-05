"use client";

import { useEffect } from "react";

import { useLoading } from "@/app/hooks/useLoading";

import { getSession } from "@/app/lib";

/**
 * Eagerly initialize and warm up the ONNX inference session on mount.
 *
 * Mark the model as ready in the loading context once the session resolves.
 * If initialization fails, mark the model as errored so `LoadingOverlay` can block the UI and display an error.
 */
const ModelLoader = () => {
  const { setModelReady, setModelError } = useLoading();

  useEffect(() => {
    getSession()
      .then(() => setModelReady())
      .catch(() => setModelError());
  }, []);

  return null;
};

export default ModelLoader;
