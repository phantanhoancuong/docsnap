import * as ort from "onnxruntime-web";

import { ScanMode, QuadCorners } from "@/app/types";

import { getSession } from "@/app/lib/onnx";
import { loadOpenCV } from "@/app/lib/opencv";
import {
  INPUT_SIZE,
  MEAN,
  PIXEL_NUMBER,
  STD,
  defaultQuad,
  enhanceContrast,
  maskToQuad,
  warpPerspective,
} from "@/app/lib/pipeline";

/**
 * Preprocess an image into a normalized tensor for model input.
 * Optionally apply horizontal flip (for TTA).
 *
 * @param image - Source HTML image.
 * @param flipped - Whether to horizontally flip the image.
 * @returns ONNX tensor of shape [1, 3, `INPUT_SIZE`, `INPUT_SIZE`].
 */
const preprocessImage = (
  image: HTMLImageElement,
  flipped: boolean = false,
): ort.Tensor => {
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const ctx = canvas.getContext("2d")!;
  if (flipped) {
    ctx.translate(INPUT_SIZE, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const f = new Float32Array(3 * PIXEL_NUMBER);
  const s = PIXEL_NUMBER;
  for (let i = 0; i < s; ++i) {
    f[i] = (data[i * 4] / 255 - MEAN[0]) / STD[0];
    f[i + s] = (data[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    f[i + 2 * s] = (data[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }

  return new ort.Tensor("float32", f, [1, 3, INPUT_SIZE, INPUT_SIZE]);
};

/**
 * Run model inference with test-time augmentation (original + flipped), then average the predictions into a single mask.
 *
 * @param sess - ONNX inference session.
 * @param image - Input image.
 * @returns Float32Array mask of size `INPUT_SIZE` * `INPUT_SIZE`.
 */
const runInference = async (
  sess: ort.InferenceSession,
  image: HTMLImageElement,
): Promise<Float32Array> => {
  const originalResult = await sess.run({
    input: preprocessImage(image, false),
  });
  const flippedResult = await sess.run({ input: preprocessImage(image, true) });

  const originalMaskData = Object.values(originalResult)[0]
    .data as Float32Array;
  const flippedMaskData = Object.values(flippedResult)[0].data as Float32Array;

  const averagedMask = new Float32Array(originalMaskData.length);
  for (let y = 0; y < INPUT_SIZE; ++y) {
    const rowOffset = y * INPUT_SIZE;
    for (let x = 0; x < INPUT_SIZE; ++x) {
      averagedMask[rowOffset + x] =
        (originalMaskData[rowOffset + x] +
          flippedMaskData[rowOffset + (INPUT_SIZE - 1 - x)]) *
        0.5;
    }
  }
  return averagedMask;
};

/**
 * Document processing pipeline.
 *
 * If `corners` are provided, skip ML inference and warp directly to those corners.
 * Otherwise run the full pipeline:
 * 1. Load OpenCV and ONNX session.
 * 2. Run segmentation model to obtain mask.
 * 3. Extract document corners from mask, falling back to full image bounds.
 * 4. Apply perspective warp.
 * 5. Enhance output (color or black/white).
 *
 * @param image - Source image element.
 * @param mode - Output scan mode ("color" or "bw").
 * @param mimeType - Output MIME type (e.g. "image/jpeg").
 * @param fileName - Output file name.
 * @param corners - Optional pre-determined corners. If provided, ML inference is skipped.
 * @returns Processed file and the corners used.
 */
export const processImage = async (
  image: HTMLImageElement,
  mode: ScanMode,
  mimeType: string,
  fileName: string,
  corners?: QuadCorners,
): Promise<{ processedFile: File; quadCorners: QuadCorners }> => {
  let quadCorners: QuadCorners;

  if (corners) {
    quadCorners = corners;
  } else {
    const cv = await loadOpenCV();
    const sess = await getSession();
    const mask = await runInference(sess, image);
    quadCorners =
      (await maskToQuad(cv, mask, image.width, image.height)) ??
      defaultQuad(image.width, image.height);
  }

  const processedFile = await warpAndEncode(
    image,
    quadCorners,
    mode,
    mimeType,
    fileName,
  );
  return { processedFile, quadCorners };
};

/**
 * Warp, enhance, and encode an image region into a `File`.
 *
 * @param image - Source image element.
 * @param quadCorners - Document corners in image space coordinates.
 * @param mode - Scan mode for contrast enhancement.
 * @param mimeType - Output MIME type (e.g. "image/jpeg").
 * @param fileName - Output file name.
 * @returns Processed `File`.
 */
const warpAndEncode = async (
  image: HTMLImageElement,
  quadCorners: QuadCorners,
  mode: ScanMode,
  mimeType: string,
  fileName: string,
): Promise<File> => {
  const warpedCanvas = warpPerspective(image, [
    quadCorners.topLeft,
    quadCorners.topRight,
    quadCorners.bottomRight,
    quadCorners.bottomLeft,
  ]);
  const enhancedCanvas = enhanceContrast(warpedCanvas, mode);
  const quality = mimeType === "image/jpeg" ? 1.0 : undefined;

  const blob = await new Promise<Blob>((resolve, reject) =>
    enhancedCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mimeType,
      quality,
    ),
  );

  return new File([blob], fileName, { type: mimeType });
};
