import {
  createProgram,
  createQuadBuffer,
  uploadTexture,
} from "@/app/lib/pipeline/webgl";

import { Point } from "@/app/types";

const VERT_SRC = `
  attribute vec2 a_pos;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

/**
 * gl_FragCoord is pixel-center based (first pixel =0.5) and `y=0` is BOTTOM in WebGL.
 *
 * Subtract 0.5 on both axes to get integer pixel indices matching the CPU path.
 *
 * Flip Y with `(outH - y)` to convert to top-origin. Combined: `dy = outH - y - 0.5`
 *
 * UV: gl.texImage2D uploads `y=0` at top, so use `sy/srcH` directly, don't use `(1.0 - sy/srcH)`.
 */
const FRAG_SRC = `
  precision highp float;
  uniform sampler2D u_src;
  uniform vec2 u_outSize;
  uniform vec2 u_srcSize;
  uniform mat3 u_H;
  void main() {
    float dx = gl_FragCoord.x - 0.5;
    float dy = u_outSize.y - gl_FragCoord.y - 0.5;
    vec3 p = u_H * vec3(dx, dy, 1.0);
    float sx = p.x / p.z;
    float sy = p.y / p.z;
    if (sx < 0.0 || sy < 0.0 || sx >= u_srcSize.x || sy >= u_srcSize.y) {
      gl_FragColor = vec4(1.0);
      return;
    }
    vec2 uv = vec2(sx / u_srcSize.x, sy / u_srcSize.y);
    gl_FragColor = texture2D(u_src, uv);
  }
`;
/**
 * Solve a 3x3 homography matrix mapping src quad to dst quad using Gaussian elimination.
 *
 * @param srcCorners - Four source points [TL, TR, BR, BL].
 * @param dstCorners - Four destination points [TL, TR, BR, BL].
 * @returns 9-element Float64Array [h0 through h8] where h8 is always 1.
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
 * Compute the output canvas dimensions for a perspective-corrected document.
 *
 * Output size equals the quad's natural pixel dimensions (average of opposite edge lengths), capped at the source image dimensions to prevent upscaling.
 *
 * @param quad - Four corner points of the document in source image space [TL, TR, BR, BL].
 * @param sourceWidth - Source image width in pixels.
 * @param sourceHeight - Source image height in pixels.
 * @returns Object with `width` and `height` of the warped output canvas in pixels.
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
 * Straighten a quadrilateral document region into a flat rectangular canvas by remapping each output pixel back to its position in the source image.
 *
 * Pixels that fall outside the source bounds are filled white.
 *
 * Used as the fallback when WebGL is unavailable or the source image exceeds the device's maximum texture size.
 *
 * @param image - Source image element to warp.
 * @param quad - Four corner points of the document region in source image space [TL, TR, BR, BL].
 * @returns HTMLCanvasElement containing the perspective-corrected document at natural resolution.
 */
export const warpPerspectiveCPU = (
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

/**
 * Straighten a quadrilateral document region into a flat rectangular canvas by remapping each output pixel back to its position in the source image.
 * Pixels that fall outside the source bounds are filled white.
 *
 * Fall back to `warpPerspectiveCPU()` if:
 * - WebGL is unavailable on the device.
 * - The source image exceeds the device's maximum texture size.
 * - The GPU program fails to initialize.
 *
 * @param image - Source image element to warp.
 * @param quad - Four corner points of the document region in source image space [TL, TR, BR, BL].
 * @returns HTMLCanvasElement containing the perspective-corrected document at natural resolution.
 */
export const warpPerspective = (
  image: HTMLImageElement,
  quad: [Point, Point, Point, Point],
): HTMLCanvasElement => {
  const { width: outW, height: outH } = computeOutputSize(
    quad,
    image.width,
    image.height,
  );
  const srcW = image.width;
  const srcH = image.height;

  const H = solveHomography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    quad,
  );

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const gl = canvas.getContext("webgl");
  if (!gl) return warpPerspectiveCPU(image, quad);

  const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (srcW > maxTexSize || srcH > maxTexSize)
    return warpPerspectiveCPU(image, quad);

  const prog = createProgram(gl, VERT_SRC, FRAG_SRC);
  if (!prog) return warpPerspectiveCPU(image, quad);

  gl.useProgram(prog);

  const vbo = createQuadBuffer(gl);
  const posLoc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const tex = uploadTexture(gl, image);

  /**
   * H is row-major; GSLS mat3 is column-major, so transpose manually.
   *
   * `transpose=true` in `uniformMatrix3fv()` is WebGL2 only and it silently produces white in WebGL1.
   */
  const Hcm = new Float32Array([
    H[0],
    H[3],
    H[6],
    H[1],
    H[4],
    H[7],
    H[2],
    H[5],
    H[8],
  ]);
  gl.uniform1i(gl.getUniformLocation(prog, "u_src"), 0);
  gl.uniform2f(gl.getUniformLocation(prog, "u_outSize"), outW, outH);
  gl.uniform2f(gl.getUniformLocation(prog, "u_srcSize"), srcW, srcH);
  gl.uniformMatrix3fv(gl.getUniformLocation(prog, "u_H"), false, Hcm);

  gl.viewport(0, 0, outW, outH);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.finish();

  gl.deleteTexture(tex);
  gl.deleteBuffer(vbo);
  gl.deleteProgram(prog);

  return canvas;
};
