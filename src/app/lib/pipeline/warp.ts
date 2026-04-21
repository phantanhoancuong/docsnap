import { Point } from "@/app/types";

/**
 * Solve 3x3 homography matrix mapping src quad to dst quad
 *
 * @param srcCorners - Four source points [TL, TR, BR, BL].
 * @param dstCorners - Four destination points [TL, TR, BR, BL].
 * @returns 9-element Float64Array [h0 thorugh h8] where h8 is always 1.
 */
const solveHomography = (
  srcCorners: [Point, Point, Point, Point],
  dstCorners: [Point, Point, Point, Point],
): Float64Array => {
  const equations: number[][] = [];

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = srcCorners[i];
    const { x: dx, y: dy } = dstCorners[i];
    equations.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    equations.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
  }

  const rhs = dstCorners.flatMap(({ x, y }) => [x, y]);
  const n = 8;

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(equations[row][col]) > Math.abs(equations[pivotRow][col]))
        pivotRow = row;
    }
    [equations[col], equations[pivotRow]] = [
      equations[pivotRow],
      equations[col],
    ];
    [rhs[col], rhs[pivotRow]] = [rhs[pivotRow], rhs[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = equations[row][col] / equations[col][col];
      for (let k = col; k < n; k++)
        equations[row][k] -= factor * equations[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }

  const h = new Float64Array(9);
  for (let i = n - 1; i >= 0; i--) {
    h[i] = rhs[i];
    for (let j = i + 1; j < n; j++) h[i] -= equations[i][j] * h[j];
    h[i] /= equations[i][i];
  }
  h[8] = 1;
  return h;
};

/**
 * Compute the output canvas dimension for a perspective-corrected document.
 *
 * Output size equals the quad's natural pixel dimensions (average of opposite edge lengths),
 * capped at the source image size to prevent upscaling.
 *
 * @param quad - Four corner points of the document in the source image space [TL, TR, BR, BL].
 * @param sourceWidth - Source image width in pixels.
 * @param sourceHeight - Source image height in pixels.
 * @returns outputWidth and outputHeight of the warped canvas.
 */
const computeOutputSize = (
  quad: [Point, Point, Point, Point],
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } => {
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;

  const topEdge = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const bottomEdge = Math.hypot(
    bottomRight.x - bottomLeft.x,
    bottomRight.y - bottomLeft.y,
  );
  const leftEdge = Math.hypot(
    bottomLeft.x - topLeft.x,
    bottomLeft.y - topLeft.y,
  );
  const rightEdge = Math.hypot(
    bottomRight.x - topRight.x,
    bottomRight.y - topRight.y,
  );

  const naturalWidth = Math.round((topEdge + bottomEdge) / 2);
  const naturalHeight = Math.round((leftEdge + rightEdge) / 2);

  const scale = Math.min(
    1,
    sourceWidth / naturalWidth,
    sourceHeight / naturalHeight,
  );

  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
};

/**
 * Apply a perspective warp to straighten a quadrilaterl document region
 * into a rectangular canvas using inverse homography and bilinear interpolation.
 *
 * For each destination pixel, the inverse homography maps back to fractional source coordinates,
 * which are then sampled with bilinear interpolation.
 *
 * Pixels that map outside the source bounds are left as white.
 *
 * @param image - Source image element to warp.
 * @param quad - Four corner points of the document region [TL, TR, BR, BL].
 * @returns Canvas containing the perspective-corrected document at natural resolution.
 */
export const warpPerspective = (
  image: HTMLImageElement,
  quad: [Point, Point, Point, Point],
): HTMLCanvasElement => {
  const { width: outputWidth, height: outputHeight } = computeOutputSize(
    quad,
    image.width,
    image.height,
  );

  const outputCorners: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: outputWidth, y: 0 },
    { x: outputWidth, y: outputHeight },
    { x: 0, y: outputHeight },
  ];

  const H = solveHomography(outputCorners, quad);
  const [h00, h01, h02, h10, h11, h12, h20, h21, h22] = H;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceCtx = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  sourceCtx.drawImage(image, 0, 0);
  const sourcePixels = sourceCtx.getImageData(
    0,
    0,
    image.width,
    image.height,
  ).data;
  const sourceRowStride = image.width * 4;
  const sourceMaxX = image.width - 1;
  const sourceMaxY = image.height - 1;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, outputWidth, outputHeight);
  const outputImage = outputCtx.getImageData(0, 0, outputWidth, outputHeight);
  const outputPixels = outputImage.data;

  for (let destY = 0; destY < outputHeight; destY++) {
    const wRow = h21 * destY + h22;
    const srcXRow = h02 + h01 * destY;
    const srcYRow = h12 + h11 * destY;
    const destRowOffset = destY * outputWidth;

    for (let destX = 0; destX < outputWidth; destX++) {
      const w = h20 * destX + wRow;
      const srcX = (h00 * destX + srcXRow) / w;
      const srcY = (h10 * destX + srcYRow) / w;

      const srcX0 = srcX | 0;
      const srcY0 = srcY | 0;

      if (srcX0 < 0 || srcY0 < 0 || srcX0 >= sourceMaxX || srcY0 >= sourceMaxY)
        continue;

      const fracX = srcX - srcX0;
      const fracY = srcY - srcY0;
      const fracX1 = 1 - fracX;
      const fracY1 = 1 - fracY;

      const topLeft = srcY0 * sourceRowStride + srcX0 * 4;
      const topRight = topLeft + 4;
      const bottomLeft = topLeft + sourceRowStride;
      const bottomRight = bottomLeft + 4;

      const weightTopLeft = fracX1 * fracY1;
      const weightTopRight = fracX * fracY1;
      const weightBottomLeft = fracX1 * fracY;
      const weightBottomRight = fracX * fracY;

      const destOffset = (destRowOffset + destX) * 4;

      outputPixels[destOffset] =
        (sourcePixels[topLeft] * weightTopLeft +
          sourcePixels[topRight] * weightTopRight +
          sourcePixels[bottomLeft] * weightBottomLeft +
          sourcePixels[bottomRight] * weightBottomRight +
          0.5) |
        0;
      outputPixels[destOffset + 1] =
        (sourcePixels[topLeft + 1] * weightTopLeft +
          sourcePixels[topRight + 1] * weightTopRight +
          sourcePixels[bottomLeft + 1] * weightBottomLeft +
          sourcePixels[bottomRight + 1] * weightBottomRight +
          0.5) |
        0;
      outputPixels[destOffset + 2] =
        (sourcePixels[topLeft + 2] * weightTopLeft +
          sourcePixels[topRight + 2] * weightTopRight +
          sourcePixels[bottomLeft + 2] * weightBottomLeft +
          sourcePixels[bottomRight + 2] * weightBottomRight +
          0.5) |
        0;
      outputPixels[destOffset + 3] = 255;
    }
  }

  outputCtx.putImageData(outputImage, 0, 0);
  return outputCanvas;
};
