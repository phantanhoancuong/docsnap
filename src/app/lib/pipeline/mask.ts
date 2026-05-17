import { CVMat, CVMatVector, OpenCV, Point, QuadCorners } from "@/app/types";

import {
  INPUT_SIZE,
  MASK_THRESHOLD,
  MINIMUM_AREA,
  PIXEL_NUMBER,
} from "@/app/lib/pipeline/constants";

/**
 * Sort 4 points into TL/TR/BR/BL order by angle from the centroid.
 *
 * Called for rendering and on confirm, but NOT during drag. Sorting mid-drag would reassign array indices and cause the corners to jump.
 *
 * @param points - Four corner points in any order.
 * @returns Corners sorted as `QuadCorners`.
 */
export const sortQuad = (points: [Point, Point, Point, Point]): QuadCorners => {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / 4;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / 4;

  const sortedPoints = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);

    return angleA - angleB;
  });

  const topLeftIndex = sortedPoints.reduce(
    (bestIndex, point, index) =>
      point.x + point.y < sortedPoints[bestIndex].x + sortedPoints[bestIndex].y
        ? index
        : bestIndex,
    0,
  );

  const orderedPoints = [
    ...sortedPoints.slice(topLeftIndex),
    ...sortedPoints.slice(0, topLeftIndex),
  ];

  return {
    topLeft: orderedPoints[0],
    topRight: orderedPoints[1],
    bottomRight: orderedPoints[2],
    bottomLeft: orderedPoints[3],
  };
};

/**
 * Return a `QuadCorners` covering the full image bounds.
 *
 * Used as a fallback when no document region is detected, or when no prior corners exist for the crop UI to initialize from.
 *
 * @param width - Natural image width in pixels.
 * @param height - Natural image height in pixels.
 * @returns `QuadCorners` in image space coordinates.
 */
export const defaultQuad = (width: number, height: number): QuadCorners => ({
  topLeft: { x: 0, y: 0 },
  topRight: { x: width, y: 0 },
  bottomRight: { x: width, y: height },
  bottomLeft: { x: 0, y: height },
});

/**
 * Convert a raw float mask to an 8-bit binary Mat by thresholding.
 * Values above threshold becomes 255 (foreground); all others become 0.
 *
 * @param cv - OpenCV instance.
 * @param mask - Flat Float32Array of length `PIXEL_NUMBER` (`INPUT_SIZE` squared).
 * @param threshold - Confidence cutoff in the range 0 to 1; defaults to MASK_THRESHOLD.
 * @returns CV_8UC1 Mat of length `PIXEL_NUMBER` -- caller must call .delete() on it.
 */
const maskToBinary = (
  cv: OpenCV,
  mask: Float32Array,
  threshold: number = MASK_THRESHOLD,
): CVMat => {
  const binary = new cv.Mat(INPUT_SIZE, INPUT_SIZE, cv.CV_8UC1);

  for (let i = 0; i < PIXEL_NUMBER; ++i)
    binary.data[i] = mask[i] > threshold ? 255 : 0;

  return binary;
};

/**
 * Fill small holes and bridge gaps in a binary mask through morphological closing (dilation then erosion).
 *
 * @param cv - OpenCV instance.
 * @param binary - CV_8UC1 binary Mat.
 * @returns Closed Mat of the same size and type -- caller must call .delete() on it.
 */
const closeMask = (cv: OpenCV, binary: CVMat) => {
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));

  const closed = new cv.Mat();
  cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);

  kernel.delete();
  return closed;
};

/**
 * Find external contours in a binary Mat using CHAIN_APPROX_SIMPLE encoding.
 *
 * @param cv - OpenCV instance.
 * @param mat - Single-channel binary Mat.
 * @returns contours and hierarchy Mats -- caller must call .delete() on both.
 */
const findContours = (
  cv: OpenCV,
  mat: CVMat,
): { contours: CVMatVector; hierarchy: CVMat } => {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(
    mat,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );

  return { contours, hierarchy };
};

/**
 * Select the contour with the largest area, provided it meets a certain minimum area threshold.
 *
 * @param cv - OpenCV instance.
 * @param contours - MatVector of contours.
 * @returns The largest contour Mat, or null if none exceed the threshold.
 * The returned Mat is a view into `contours` -- do not call .delete() on it.
 */
const getLargestContour = (
  cv: OpenCV,
  contours: CVMatVector,
  minimumAreaThreshold: number = MINIMUM_AREA,
): CVMat | null => {
  let largestIndex = -1;
  let largestArea = 0;

  for (let i = 0; i < contours.size(); ++i) {
    const area = cv.contourArea(contours.get(i));
    if (area > largestArea) {
      largestIndex = i;
      largestArea = area;
    }
  }

  if (largestIndex === -1 || largestArea < minimumAreaThreshold) return null;

  return contours.get(largestIndex);
};

/**
 * Compute the convex hull of a contour and return the coordinates of its vertices.
 *
 * @param cv - OpenCV instance.
 * @param contour - Single contour Mat.
 * @returns Array of x, y hull vertices.
 */
const contourToHullPoints = (cv: OpenCV, contour: CVMat): Point[] => {
  const hull = new cv.Mat();
  cv.convexHull(contour, hull);

  const points: Point[] = [];
  for (let i = 0; i < hull.rows; ++i)
    points.push({ x: hull.data32S[i * 2], y: hull.data32S[i * 2 + 1] });

  hull.delete();
  return points;
};

/**
 * Fit a convex hull's points to a quadrilateral by finding, for each of the four corners, the hull point closest to it.
 *
 * Corner assignment order: top-left, top-right, bottom-right, bottom-left.
 *
 * @param hullPoints - Convex hull vertices in `INPUT_SIZE` coordinate space.
 * @returns Four corners in TL, TR, BR, BL order, or null if fewer than four hull points exist.
 */
const hullPointsToQuad = (hullPoints: Point[]): QuadCorners | null => {
  if (hullPoints.length < 4) return null;
  const targets = [
    { x: 0, y: 0 },
    { x: INPUT_SIZE, y: 0 },
    { x: INPUT_SIZE, y: INPUT_SIZE },
    { x: 0, y: INPUT_SIZE },
  ];

  const [topLeft, topRight, bottomRight, bottomLeft] = targets.map((c) =>
    hullPoints.reduce((best, p) =>
      (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <
      (best.x - c.x) ** 2 + (best.y - c.y) ** 2
        ? p
        : best,
    ),
  );

  return { topLeft, topRight, bottomRight, bottomLeft };
};

/**
 * Scale a `QuadCorners` from `INPUT_SIZE` coordinate space back to the original image dimensions.
 *
 * @param quad - `QuadCorners` in `INPUT_SIZE` space.
 * @param imageWidth - Original image width in pixels.
 * @param imageHeight - Original image height in pixels.
 * @returns The same corners remapped to image-space coordinates.
 */
const scaleQuad = (
  quad: QuadCorners,
  imageWidth: number,
  imageHeight: number,
): QuadCorners => {
  const sx = imageWidth / INPUT_SIZE;
  const sy = imageHeight / INPUT_SIZE;
  return {
    topLeft: { x: quad.topLeft.x * sx, y: quad.topLeft.y * sy },
    topRight: { x: quad.topRight.x * sx, y: quad.topRight.y * sy },
    bottomRight: { x: quad.bottomRight.x * sx, y: quad.bottomRight.y * sy },
    bottomLeft: { x: quad.bottomLeft.x * sx, y: quad.bottomLeft.y * sy },
  };
};

/**
 * Convert a segmentation mask in `INPUT_SIZE` coordinates space to a perspective quad in original image coordinates.
 *
 * Steps:
 * 1. Threshold mask to binary Mat.
 * 2. Morphological close to fill gaps.
 * 3. Extract external contours.
 * 4. Select the largest contour, which must exceed `MINIMUM_AREA`.
 * 5. Compute convex hull and fit to quad in TL, TR, BR, BL order.
 * 6. Scale from `INPUT_SIZE` space to image-space coordinates.
 *
 * All intermediate OpenCV Mats are deleted internally regardless of outcome.
 *
 * @param cv - OpenCV instance.
 * @param mask - Float32Array of length `PIXEL_NUMBER` (`INPUT_SIZE` squared), values in range 0 to 1.
 * @param imageWidth - Width of the original image in pixels.
 * @param imageHeight - Height of the original image in pixels.
 * @returns `QuadCorners` in TL/TR/BR/BL order in image-space pixel coordinates, or `null` if no document region could be detected.
 */
export const maskToQuad = async (
  cv: OpenCV,
  mask: Float32Array,
  imageWidth: number,
  imageHeight: number,
): Promise<QuadCorners | null> => {
  let binary: CVMat | null = null;
  let closed: CVMat | null = null;
  let contours: CVMatVector | null = null;
  let hierarchy: CVMat | null = null;
  let largestContour: CVMat | null = null;

  try {
    binary = maskToBinary(cv, mask, MASK_THRESHOLD);
    closed = closeMask(cv, binary);

    const result = findContours(cv, closed);
    contours = result.contours;
    hierarchy = result.hierarchy;

    if (contours.size() === 0) return null;

    largestContour = getLargestContour(cv, contours, MINIMUM_AREA);
    if (largestContour === null) return null;

    const hullPoints = contourToHullPoints(cv, largestContour);
    const quad = hullPointsToQuad(hullPoints);
    if (quad === null) return null;

    return scaleQuad(quad, imageWidth, imageHeight);
  } finally {
    binary?.delete();
    closed?.delete();
    contours?.delete();
    hierarchy?.delete();
    largestContour?.delete();
  }
};
