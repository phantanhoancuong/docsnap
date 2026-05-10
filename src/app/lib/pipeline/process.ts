import * as ort from "onnxruntime-web";

import { ImageFile, Point, ScanMode } from "@/app/types";

import { getSession } from "@/app/lib/onnx";
import { loadOpenCV } from "@/app/lib/opencv";
import {
  INPUT_SIZE,
  MEAN,
  PIXEL_NUMBER,
  STD,
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
 * Document processing pipeline:
 * 1. Load OpenCV and ONNX session.
 * 2. Run segmentation model to obtain mask.
 * 3. Extract document quad from mask.
 * 4. Apply perspective warp.
 * 5. Enhance output (color or black/white).
 *
 * @param imageFile - Input image file and URL.
 * @param mode - Output mode ("color" or "bw").
 * @returns Processed image file and detected corner points.
 */
export const processImage = async (
  imageFile: ImageFile,
  image: HTMLImageElement,
  mode: ScanMode = "color",
): Promise<{
  processedImage: ImageFile;
  corners: [Point, Point, Point, Point];
}> => {
  const cv = await loadOpenCV();

  const sess = await getSession();

  const mask = await runInference(sess, image);

  const quad: [Point, Point, Point, Point] = (await maskToQuad(
    cv,
    mask,
    image.width,
    image.height,
  )) ?? [
    { x: 0, y: 0 },
    { x: image.width, y: 0 },
    { x: image.width, y: image.height },
    { x: 0, y: image.height },
  ];

  const warpedCanvas = warpPerspective(image, quad);

  const enhancedCanvas = enhanceContrast(warpedCanvas, mode);
  const mimeType = imageFile.file.type || "image/jpeg";
  const quality = mimeType === "image/jpeg" ? 0.92 : undefined;
  const blob = await new Promise<Blob>((resolve, reject) =>
    enhancedCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mimeType,
      quality,
    ),
  );

  const processedFileName = imageFile.file.name.replace(
    /(\.[^.]+)?$/,
    "_scanned$1",
  );
  const processedFile = new File([blob], processedFileName, { type: mimeType });
  const processedUrl = URL.createObjectURL(blob);

  return {
    processedImage: { file: processedFile, url: processedUrl },
    corners: quad,
  };
};
