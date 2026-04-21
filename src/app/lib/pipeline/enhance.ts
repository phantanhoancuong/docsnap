import { ScanMode } from "@/app/types";

import {
  ADAPTIVE_TILE_DIVISOR,
  ADAPTIVE_TILE_MIN_PIXELS,
  ADAPTIVE_THRESHOLD_C,
  HISTOGRAM_LOW_PERCENTILE,
  HISTOGRAM_HIGH_PERCENTILE,
  PRETHRESHOLD_BLUR_RADIUS,
  SHARPEN_AMOUNT_BW,
  SHARPEN_AMOUNT_COLOR,
  SHARPEN_BLUR_RADIUS,
  UPSCALE_FACTOR,
} from "@/app/lib/pipeline/constants";

/**
 * Build an integral image (summed-area table) from a grayscale image.
 * Allow O(1) area sum queries for adaptive thresholding.
 *
 * @param grayscalePixels - Flattened grayscale pixel array.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 * @returns Float64Array representing the integral image of size `(width + 1) * (height + 1)`.
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
 * Perform adaptive thresholding using an integral image.
 * Produce a binary RGBA image.
 *
 * @param grayscalePixels - Flattened grayscale pixel array.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 * @param neighbourhoodSize - Size of the local window used for thresholding.
 * @param thresholdConstant - Constant subtracted from local mean.
 * @returns Uint8ClampedArray RGBA output.
 */
const adaptiveThreshold = (
  grayscalePixels: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  neighbourhoodSize: number,
  thresholdConstant: number,
): Uint8ClampedArray => {
  const integralTable = buildIntegralTable(
    grayscalePixels,
    imageWidth,
    imageHeight,
  );
  const outputPixels = new Uint8ClampedArray(imageWidth * imageHeight * 4);
  const halfNeighbourhood = (neighbourhoodSize / 2) | 0;
  const integralTableWidth = imageWidth + 1;

  for (let rowIndex = 0; rowIndex < imageHeight; rowIndex++) {
    const tileTop =
      rowIndex - halfNeighbourhood < 0 ? 0 : rowIndex - halfNeighbourhood;
    const tileBottom =
      rowIndex + halfNeighbourhood >= imageHeight
        ? imageHeight - 1
        : rowIndex + halfNeighbourhood;
    const pixelRowOffset = rowIndex * imageWidth;

    for (let colIndex = 0; colIndex < imageWidth; colIndex++) {
      const tileLeft =
        colIndex - halfNeighbourhood < 0 ? 0 : colIndex - halfNeighbourhood;
      const tileRight =
        colIndex + halfNeighbourhood >= imageWidth
          ? imageWidth - 1
          : colIndex + halfNeighbourhood;
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
 * Apply unsharp masking to enhance edges by subtracting a blurred version.
 *
 * @param canvasContext - Canvas 2D context containing the image.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 * @param sharpenAmount - Strength of sharpening effect.
 * @param blurRadius - Radius used for Gaussian blur.
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
 * Flood-fill black regions connected to borders and them white.
 * This is used to remove background artifacts after thresholding.
 *
 * @param pixelData - RGBA pixel buffer (modified in-place).
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
  for (let rowIndex = 0; rowIndex < imageHeight; rowIndex++) {
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
 * Enchance color images through:
 * - Per-channel histogram stretching.
 * - Unsharp masking.
 *
 * @param canvasContext - Canvas 2D context containing the image.
 * @param imageWidth - Width of the image.
 * @param imageHeight - Height of the image.
 */
function enhanceColor(
  canvasContext: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
): void {
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
}

/**
 * Enhance black-and-white images through:
 * - Pre-blur to reduce noise.
 * - Grayscale conversion.
 * - Adaptive thresholding (local binarization).
 * - Unsharp masking.
 * - Edge flood-fill cleanup.
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

  const preBlurCanvas = document.createElement("canvas");
  preBlurCanvas.width = imageWidth;
  preBlurCanvas.height = imageHeight;

  const preBlurContext = preBlurCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  preBlurContext.filter = `blur(${PRETHRESHOLD_BLUR_RADIUS}px)`;
  preBlurContext.drawImage(canvasContext.canvas, 0, 0);
  preBlurContext.filter = "none";

  const blurredPixelData = preBlurContext.getImageData(
    0,
    0,
    imageWidth,
    imageHeight,
  ).data;
  const grayscalePixels = new Uint8Array(pixelNumber);
  for (let pixelIndex = 0; pixelIndex < pixelNumber; ++pixelIndex) {
    const byteOffset = pixelIndex * 4;
    grayscalePixels[pixelIndex] =
      (0.299 * blurredPixelData[byteOffset] +
        0.587 * blurredPixelData[byteOffset + 1] +
        0.114 * blurredPixelData[byteOffset + 2] +
        0.5) |
      0;
  }

  const neighborhoodSize = Math.max(
    ADAPTIVE_TILE_MIN_PIXELS,
    (Math.min(imageWidth, imageHeight) / ADAPTIVE_TILE_DIVISOR + 0.5) | 0,
  );
  const thresholdedPixels = adaptiveThreshold(
    grayscalePixels,
    imageWidth,
    imageHeight,
    neighborhoodSize,
    ADAPTIVE_THRESHOLD_C,
  );

  const binaryImageData = canvasContext.createImageData(
    imageWidth,
    imageHeight,
  );
  binaryImageData.data.set(thresholdedPixels);
  canvasContext.putImageData(binaryImageData, 0, 0);

  applyUnsharpMask(
    canvasContext,
    imageWidth,
    imageHeight,
    SHARPEN_AMOUNT_BW,
    SHARPEN_BLUR_RADIUS,
  );

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
 * Image enhancement pipeline.
 *
 * Upscale input, apply either BW or color enhancement, then downsample back to original size.
 *
 * @param canvas - Source canvas element.
 * @param mode - Scan mode ("bw" or "color" mode).
 * @returns HTMLCanvasElement containing enhanced image.
 */
export const enhanceContrast = (canvas: HTMLCanvasElement, mode: ScanMode) => {
  const upscaledWidth = (canvas.width * UPSCALE_FACTOR + 0.5) | 0;
  const upscaledHeight = (canvas.height * UPSCALE_FACTOR + 0.5) | 0;

  const upscaledCanvas = document.createElement("canvas");
  upscaledCanvas.width = upscaledWidth;
  upscaledCanvas.height = upscaledHeight;

  const upscaledContext = upscaledCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  upscaledContext.imageSmoothingEnabled = true;
  upscaledContext.imageSmoothingQuality = "high";
  upscaledContext.drawImage(canvas, 0, 0, upscaledWidth, upscaledHeight);

  if (mode === "bw") enhanceBW(upscaledContext, upscaledWidth, upscaledHeight);
  else enhanceColor(upscaledContext, upscaledWidth, upscaledHeight);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputContext = outputCanvas.getContext("2d")!;
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(upscaledCanvas, 0, 0, canvas.width, canvas.height);

  return outputCanvas;
};
