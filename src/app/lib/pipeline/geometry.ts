import { QuadCorners, QuadPoints, Point } from "@/app/types";

/**
 * Rotate a point clockwise by `degrees` around the center of a `width x height` image.
 *
 * Used to convert corners between original image space and rotated display space.
 *
 * @param point - Point in original image pixel coordinates.
 * @param degrees - Clockwise rotatation in degrees (0, 90, 180, 270, etc.).
 * @param width - Original image width.
 * @param height - Original image height.
 * @returns Rotate point.
 */
export const rotatePoint = (
  point: Point,
  degrees: number,
  width: number,
  height: number,
): Point => {
  switch (((degrees % 360) + 360) % 360) {
    case 90:
      return { x: height - point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: point.y, y: width - point.y };
    default:
      return point;
  }
};

/**
 * Rotate a point counter-clockwise by `degrees`.
 *
 * Convert from rotated display space back to original image space.
 *
 * @param point - Point in rotated image coordinates.
 * @param degrees - Clockwise rotation in degrees (0, 90, 180, 270, etc.).
 * @param width - Original image width.
 * @param height - Original image height.
 * @returns Point in original image space.
 */
export const unrotatePoint = (
  point: Point,
  degrees: number,
  width: number,
  height: number,
): Point => {
  switch (((degrees % 360) + 360) % 360) {
    case 90:
      return { x: point.y, y: height - point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: width - point.y, y: point.x };
    default:
      return point;
  }
};

const cornersToPoints = (corners: QuadCorners): QuadPoints => [
  corners.topLeft,
  corners.topRight,
  corners.bottomRight,
  corners.bottomLeft,
];
