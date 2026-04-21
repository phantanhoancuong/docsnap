import * as ort from "onnxruntime-web";

import {
  SESSION_CREATION_TIMEOUT_MS,
  SEGMENTATION_MODEL_PATH,
} from "@/app/lib/onnx";
import { INPUT_SIZE } from "@/app/lib/pipeline";
import { withTimeout } from "@/app/lib/utils";

/**
 * Check if a functional WebGPU adapter is available.
 *
 * Fall back if the API is missing or the adapter request fails.
 */
const getExecutionProviders = async (): Promise<string[]> => {
  const providers: string[] = [];

  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) providers.push("webgpu");
    } catch {}
  }

  providers.push("wasm");
  return providers;
};

/**
 * Create an ONNX InferenceSession from the segmentation model and run a dummy inference to warmup the runtime.
 */
const createAndWarmUpSession = async (): Promise<ort.InferenceSession> => {
  ort.env.logLevel = "error";

  const executionProviders = await getExecutionProviders();

  let sess: ort.InferenceSession;
  try {
    sess = await withTimeout(
      ort.InferenceSession.create(SEGMENTATION_MODEL_PATH, {
        executionProviders,
      }),
      SESSION_CREATION_TIMEOUT_MS,
      "ONNX session creation",
    );
  } catch (error) {
    throw new Error(
      `Failed to load segmentation model from ${SEGMENTATION_MODEL_PATH}: ${error}`,
    );
  }

  try {
    const dummyData = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE);
    const dummyTensor = new ort.Tensor("float32", dummyData, [
      1,
      3,
      INPUT_SIZE,
      INPUT_SIZE,
    ]);
    await sess.run({ input: dummyTensor });
  } catch (error) {
    throw new Error(`Model loaded but warm-up inference failed: ${error}`);
  }

  return sess;
};

/**
 * Singleton session promise.
 *
 * Lazily initialized on first call to getSesson so that the session creation only happens in the browser.
 * Reset to null on failure so the next call retries.
 */
let sessionPromise: Promise<ort.InferenceSession> | null = null;

/**
 * Return singleton ONNX InferenceSession, creating and warming it up on the first call.
 *
 * Subsequent calls return the same promise. If creation failes, the promise is reset so the next call retries.
 *
 * Reject if:
 *    - If called from outside the browser.
 *    - iF the model file cannot be loaded.
 *    - If warm-up inference fails.
 *    - If session creation exceeds `SESSION_CREATION_TIMEOUT_MS`.
 */
export const getSession = async (): Promise<ort.InferenceSession> => {
  if (typeof window === "undefined") {
    throw new Error("ONNX session is only available in the browser");
  }

  if (!sessionPromise) {
    sessionPromise = createAndWarmUpSession().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }

  return sessionPromise;
};
