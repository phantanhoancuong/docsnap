import { CVMat, CVMatVector, OpenCV, Point } from "@/app/types";

import {
  INPUT_SIZE,
  MASK_THRESHOLD,
  MINIMUM_AREA,
  PIXEL_NUMBER,
} from "@/app/lib/pipeline/constants";

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
const hullPointsToQuad = (
  hullPoints: Point[],
): [Point, Point, Point, Point] | null => {
  if (hullPoints.length < 4) return null;

  const corners = [
    { x: 0, y: 0 },
    { x: INPUT_SIZE, y: 0 },
    { x: INPUT_SIZE, y: INPUT_SIZE },
    { x: 0, y: INPUT_SIZE },
  ];

  return corners.map((c) =>
    hullPoints.reduce((best, p) =>
      (p.x - c.x) ** 2 + (p.y - c.y) ** 2 <
      (best.x - c.x) ** 2 + (best.y - c.y) ** 2
        ? p
        : best,
    ),
  ) as [Point, Point, Point, Point];
};

/**
 * Scale a quad from `INPUT_SIZE` coordinate space back to the original image dimensions.
 *
 * @param quad - Four corner points in `INPUT_SIZE` space.
 * @param imageWidth - Original image width in pixels.
 * @param imageHeight - Original image height in pixels.
 * @returns The same four corners remapped to image-space coordinates.
 */
const scaleQuad = (
  quad: [Point, Point, Point, Point],
  imageWidth: number,
  imageHeight: number,
): [Point, Point, Point, Point] => {
  const sx = imageWidth / INPUT_SIZE;
  const sy = imageHeight / INPUT_SIZE;

  return quad.map(({ x, y }) => ({
    x: x * sx,
    y: y * sy,
  })) as [Point, Point, Point, Point];
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
 * @returns Four corner points in TL, TR, BR, BL order in image-space pixel coordinates, or null if no document region could be detected.
 */
export const maskToQuad = async (
  cv: OpenCV,
  mask: Float32Array,
  imageWidth: number,
  imageHeight: number,
): Promise<[Point, Point, Point, Point] | null> => {
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
