import { ScanMode } from "@/app/types";

import {
  LOW_RES_THRESHOLD,
  ADAPTIVE_TILE_DIVISOR_LOW_RES,
  ADAPTIVE_TILE_DIVISOR_HIGH_RES,
  ADAPTIVE_TILE_MIN_PIXELS,
  ADAPTIVE_TILE_MAX_PIXELS,
  ADAPTIVE_THRESHOLD_C_MIN,
  ADAPTIVE_THRESHOLD_C_MAX,
  HISTOGRAM_LOW_PERCENTILE,
  HISTOGRAM_HIGH_PERCENTILE,
  MAX_UPSCALE_FACTOR,
  SHARPEN_AMOUNT_COLOR,
  SHARPEN_BLUR_RADIUS,
  PDF_TARGET_WIDTH,
  PDF_TARGET_HEIGHT,
} from "@/app/lib/pipeline/constants";

/**
 * Compute the adaptive threshold neighborhood size and constant C for an image resolution.
 *
 * Neighborhood size scales with the shorter image dimension.
 * A larger divisor is used for low-res images so the neighborhood stays proportionally small relative to the image.
 * This is to prevent it to span too much of the image and over-smooth thin text strokes.
 *
 * C scales linearly with neighborhood size so images with low resolution gets a gentler threshold that preserves thin strokes,
 * while ones with higher resolutions get stronger foreground and background separation.
 *
 * @param imageWidth - Width of the image in pixels.
 * @param imageHeight - Height of the image in pixels.
 * @returns `{ neighborSize, thresholdC }` tuned to the image resolution.
 */
const computeThresholdParams = (
  imageWidth: number,
  imageHeight: number,
): { neighborhoodSize: number; thresholdC: number } => {
  const shortSide = Math.min(imageWidth, imageHeight);
  const divisor =
    shortSide < LOW_RES_THRESHOLD
      ? ADAPTIVE_TILE_DIVISOR_LOW_RES
      : ADAPTIVE_TILE_DIVISOR_HIGH_RES;

  const neighborhoodSize = Math.min(
    ADAPTIVE_TILE_MAX_PIXELS,
    Math.max(ADAPTIVE_TILE_MIN_PIXELS, (shortSide / divisor + 0.5) | 0),
  );

  const t =
    (neighborhoodSize - ADAPTIVE_TILE_MIN_PIXELS) /
    (ADAPTIVE_TILE_MAX_PIXELS - ADAPTIVE_TILE_MIN_PIXELS);
  const thresholdC =
    (ADAPTIVE_THRESHOLD_C_MIN +
      t * (ADAPTIVE_THRESHOLD_C_MAX - ADAPTIVE_THRESHOLD_C_MIN) +
      0.5) |
    0;

  return { neighborhoodSize, thresholdC };
};

/**
 * Build an integral image (summed-area table) from a grayscale pixel array.
 * Enable O(1) rectangular area sum queries used by adaptive thresholding.
 *
 * @param grayscalePixels - Flattened grayscale pixel array.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 * @returns Float64Array integral image of size `(width + 1) * (height + 1)`.
 */
const buildIntegralTable = (
  grayscalePixels: Uint8Array,
  imageWidth: number,
  imageHeight: number,
): Float64Array => {
  const integralTableWidth = imageWidth + 1;
  const integralTable = new Float64Array(
    integralTableWidth * (imageHeight + 1),
  );

  for (let rowIndex = 0; rowIndex < imageHeight; ++rowIndex) {
    const pixelRowOffset = rowIndex * imageWidth;
    const integralRowOffset = (rowIndex + 1) * integralTableWidth;
    const integralPrevRowOffset = rowIndex * integralTableWidth;

    for (let colIndex = 0; colIndex < imageWidth; ++colIndex) {
      integralTable[integralRowOffset + colIndex + 1] =
        grayscalePixels[pixelRowOffset + colIndex] +
        integralTable[integralPrevRowOffset + colIndex + 1] +
        integralTable[integralRowOffset + colIndex] -
        integralTable[integralPrevRowOffset + colIndex];
    }
  }

  return integralTable;
};

/**
 * Perform adaptive thresholding using a precomputed integral image.
 *
 * Each pixel is compared against the mean of its local neighborhood minus `thresholdConstant`.
 * This produces a binary RGBA image (pixels darker than the local mean are black, others are white).
 *
 * @param grayscalePixels - Flattened grayscale pixel array.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 * @param neighborhoodSize - Size of the local window used for thresholding.
 * @param thresholdConstant - Constant subtracted from local mean before comparing.
 * @returns Uint8ClampedArray RGBA binary output.
 */
const adaptiveThreshold = (
  grayscalePixels: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  neighborhoodSize: number,
  thresholdConstant: number,
): Uint8ClampedArray => {
  const integralTable = buildIntegralTable(
    grayscalePixels,
    imageWidth,
    imageHeight,
  );
  const outputPixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);
  const halfneighborhood = (neighborhoodSize / 2) | 0;
  const integralTableWidth = imageWidth + 1;

  for (let rowIndex = 0; rowIndex < imageHeight; rowIndex++) {
    const tileTop = Math.max(0, rowIndex - halfneighborhood);
    const tileBottom = Math.min(imageHeight - 1, rowIndex + halfneighborhood);
    const pixelRowOffset = rowIndex * imageWidth;

    for (let colIndex = 0; colIndex < imageWidth; colIndex++) {
      const tileLeft = Math.max(0, colIndex - halfneighborhood);
      const tileRight = Math.min(imageWidth - 1, colIndex + halfneighborhood);
      const tileArea = (tileRight - tileLeft) * (tileBottom - tileTop);

      const tileSum =
        integralTable[(tileBottom + 1) * integralTableWidth + (tileRight + 1)] -
        integralTable[tileTop * integralTableWidth + (tileRight + 1)] -
        integralTable[(tileBottom + 1) * integralTableWidth + tileLeft] +
        integralTable[tileTop * integralTableWidth + tileLeft];

      const localMean = tileSum / tileArea;
      const pixelValue = grayscalePixels[pixelRowOffset + colIndex];
      const thresholdedValue =
        pixelValue < localMean - thresholdConstant ? 0 : 255;

      const outputByteOffset = (pixelRowOffset + colIndex) * 4;
      outputPixels[outputByteOffset] = thresholdedValue;
      outputPixels[outputByteOffset + 1] = thresholdedValue;
      outputPixels[outputByteOffset + 2] = thresholdedValue;
      outputPixels[outputByteOffset + 3] = 255;
    }
  }

  return outputPixels;
};

/**
 * Convert an RGBA pixel buffer to grayscale using luminance weights.
 * Operates directly on the raw pixel data without allocating a new canvas.
 *
 * @param rgbaData - RGBA pixel buffer from `getImageData()`.
 * @param pixelCount - Total number of pixels.
 * @returns Uint8Array of grayscale values.
 */
const rgbaToGrayscale = (
  rgbaData: Uint8ClampedArray,
  pixelCount: number,
): Uint8Array => {
  const grayscale = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; ++i) {
    const offset = i * 4;
    grayscale[i] =
      (0.299 * rgbaData[offset] +
        0.587 * rgbaData[offset + 1] +
        0.114 * rgbaData[offset + 2] +
        0.5) |
      0;
  }
  return grayscale;
};

/**
 * Apply unsharp masking to sharpen edges by subtracting a blurred version of the image.
 *
 * @param canvasContext - Canvas 2D context containing the image.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 * @param sharpenAmount - Strength of the sharpening effect.
 * @param blurRadius - Gaussian blur radius used to compute the unsharp mask.
 */
const applyUnsharpMask = (
  canvasContext: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  sharpenAmount: number,
  blurRadius: number,
): void => {
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = imageWidth;
  blurCanvas.height = imageHeight;

  const blurContext = blurCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  blurContext.filter = `blur(${blurRadius}px)`;
  blurContext.drawImage(canvasContext.canvas, 0, 0);
  blurContext.filter = "none";

  const blurredPixels = blurContext.getImageData(
    0,
    0,
    imageWidth,
    imageHeight,
  ).data;
  const sharpenedImage = canvasContext.getImageData(
    0,
    0,
    imageWidth,
    imageHeight,
  );
  const sharpenedPixels = sharpenedImage.data;
  const totalPixels = imageWidth * imageHeight;

  for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
    const byteOffset = pixelIndex * 4;
    for (let channelIndex = 0; channelIndex < 3; channelIndex++) {
      const originalValue = sharpenedPixels[byteOffset + channelIndex];
      const blurredValue = blurredPixels[byteOffset + channelIndex];
      const sharpenedValue =
        (originalValue + sharpenAmount * (originalValue - blurredValue) + 0.5) |
        0;
      sharpenedPixels[byteOffset + channelIndex] =
        sharpenedValue < 0 ? 0 : sharpenedValue > 255 ? 255 : sharpenedValue;
    }
  }

  canvasContext.putImageData(sharpenedImage, 0, 0);
};

/**
 * Flood-fill black pixels connected to the image border and paint them white.
 *
 * Remove background artifacts that touch the edge after adaptive thresholding.
 * Use iterative BFS with pre-allocated buffers to avoid call stack limits.
 *
 * @param pixelData - RGBA pixel buffer.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 */
const floodFillEdgesWhite = (
  pixelData: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
): void => {
  const totalPixels = imageWidth * imageHeight;
  const visitedFlags = new Uint8Array(totalPixels);
  const bfsQueue = new Int32Array(totalPixels);
  let queueHead = 0,
    queueTail = 0;

  const enqueueIfBlack = (colIndex: number, rowIndex: number) => {
    if (
      colIndex < 0 ||
      colIndex >= imageWidth ||
      rowIndex < 0 ||
      rowIndex >= imageHeight
    )
      return;
    const pixelIndex = rowIndex * imageWidth + colIndex;
    if (visitedFlags[pixelIndex] || pixelData[pixelIndex * 4] !== 0) return;
    visitedFlags[pixelIndex] = 1;
    bfsQueue[queueTail++] = pixelIndex;
  };

  for (let colIndex = 0; colIndex < imageWidth; ++colIndex) {
    enqueueIfBlack(colIndex, 0);
    enqueueIfBlack(colIndex, imageHeight - 1);
  }
  for (let rowIndex = 1; rowIndex < imageHeight - 1; ++rowIndex) {
    enqueueIfBlack(0, rowIndex);
    enqueueIfBlack(imageWidth - 1, rowIndex);
  }

  while (queueHead < queueTail) {
    const pixelIndex = bfsQueue[queueHead++];
    const byteOffset = pixelIndex * 4;
    pixelData[byteOffset] = 255;
    pixelData[byteOffset + 1] = 255;
    pixelData[byteOffset + 2] = 255;

    const colIndex = pixelIndex % imageWidth;
    const rowIndex = (pixelIndex / imageWidth) | 0;
    enqueueIfBlack(colIndex + 1, rowIndex);
    enqueueIfBlack(colIndex - 1, rowIndex);
    enqueueIfBlack(colIndex, rowIndex + 1);
    enqueueIfBlack(colIndex, rowIndex - 1);
  }
};

/**
 * Enhance color images through per-channel histogram stretching and unsharp masking.
 *
 * For each channel, clip the darkest `HISTOGRAM_LOW_PERCENTILE` and brightest `HISTOGRAM_HIGH_PERCENTILE` of pixels,
 * then stretch the remaining range to [0, 255] to maximize contrast. Unsharp masking is then applied to sharpen edges.
 *
 * @param canvasContext - Canvas 2D context containing the image.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 */
const enhanceColor = (
  canvasContext: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
): void => {
  const totalPixels = imageWidth * imageHeight;
  const fullImageData = canvasContext.getImageData(
    0,
    0,
    imageWidth,
    imageHeight,
  );
  const pixelData = fullImageData.data;
  const lowCutoffCount = totalPixels * HISTOGRAM_LOW_PERCENTILE;
  const highCutoffCount = totalPixels * HISTOGRAM_HIGH_PERCENTILE;

  for (let channelIndex = 0; channelIndex < 3; ++channelIndex) {
    const channelHistogram = new Int32Array(256);
    for (let pixelIndex = 0; pixelIndex < totalPixels; ++pixelIndex) {
      channelHistogram[pixelData[pixelIndex * 4 + channelIndex]]++;
    }

    let lowClipValue = 0,
      highClipValue = 255,
      cumulativeCount = 0;
    for (let binValue = 0; binValue < 256; binValue++) {
      cumulativeCount += channelHistogram[binValue];
      if (lowClipValue === 0 && cumulativeCount >= lowCutoffCount)
        lowClipValue = binValue;
      if (highClipValue === 255 && cumulativeCount >= highCutoffCount)
        highClipValue = binValue;
    }
    if (highClipValue <= lowClipValue) {
      lowClipValue = 0;
      highClipValue = 255;
    }

    const stretchScale = 255 / (highClipValue - lowClipValue);
    for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
      const byteOffset = pixelIndex * 4 + channelIndex;
      const stretchedValue =
        (pixelData[byteOffset] - lowClipValue) * stretchScale + 0.5;
      pixelData[byteOffset] =
        stretchedValue < 0
          ? 0
          : stretchedValue > 255
            ? 255
            : stretchedValue | 0;
    }
  }

  canvasContext.putImageData(fullImageData, 0, 0);
  applyUnsharpMask(
    canvasContext,
    imageWidth,
    imageHeight,
    SHARPEN_AMOUNT_COLOR,
    SHARPEN_BLUR_RADIUS,
  );
};

/**
 * Enhance black-and-white images through:
 *    - Grayscale conversion using luminance weights.
 *    - Resolution-aware adaptive thresholding by scaling neighborhood size and constant C with image dimensions.
 *    - Edge flood-fill to remove background artifacts connected to the border.
 *
 * @param canvasContext - Canvas 2D context containing the image.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 */
const enhanceBW = (
  canvasContext: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
): void => {
  const pixelNumber = imageWidth * imageHeight;
  const rawPixelData = canvasContext.getImageData(
    0,
    0,
    imageWidth,
    imageHeight,
  ).data;
  const grayscalePixels = rgbaToGrayscale(rawPixelData, pixelNumber);

  const { neighborhoodSize, thresholdC } = computeThresholdParams(
    imageWidth,
    imageHeight,
  );

  const thresholdedPixels = adaptiveThreshold(
    grayscalePixels,
    imageWidth,
    imageHeight,
    neighborhoodSize,
    thresholdC,
  );

  const binaryImageData = canvasContext.createImageData(
    imageWidth,
    imageHeight,
  );
  binaryImageData.data.set(thresholdedPixels);
  canvasContext.putImageData(binaryImageData, 0, 0);

  const edgeFillImageData = canvasContext.getImageData(
    0,
    0,
    imageWidth,
    imageHeight,
  );
  floodFillEdgesWhite(edgeFillImageData.data, imageWidth, imageHeight);
  canvasContext.putImageData(edgeFillImageData, 0, 0);
};

/**
 * Image enhancement pipeline:
 *
 * Scale the input to fit within the PDF target resolution (A4 at 300 DPI) before enhancement so the adaptive threshold always has enough pixels to work with.
 * Images already larger than the target are processed at native resolution.
 * Scale factor is capped at `MAX_UPSCALE_FACTOR` to avoid excessive memory on very small inputs.
 *
 * @param canvas - Source canvas element.
 * @param mode - Scan mode ("bw" or "color").
 * @returns HTMLCanvasElement containing the enhanced image at the scaled resolution.
 */
export const enhanceContrast = (canvas: HTMLCanvasElement, mode: ScanMode) => {
  const scaleFactor = Math.min(
    MAX_UPSCALE_FACTOR,
    Math.max(
      1.0,
      Math.min(
        PDF_TARGET_WIDTH / canvas.width,
        PDF_TARGET_HEIGHT / canvas.height,
      ),
    ),
  );

  const scaledWidth = (canvas.width * scaleFactor + 0.5) | 0;
  const scaledHeight = (canvas.height * scaleFactor + 0.5) | 0;

  const scaledCanvas = document.createElement("canvas");
  scaledCanvas.width = scaledWidth;
  scaledCanvas.height = scaledHeight;

  const scaledContext = scaledCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  scaledContext.imageSmoothingEnabled = true;
  scaledContext.imageSmoothingQuality = "high";
  scaledContext.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);

  if (mode === "bw") enhanceBW(scaledContext, scaledWidth, scaledHeight);
  else enhanceColor(scaledContext, scaledWidth, scaledHeight);

  return scaledCanvas;
};
