"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";

import { defaultQuad, rotatePoint, sortQuad, unrotatePoint } from "@/app/lib";
import { CloseIcon } from "@/app/assets/icons";
import { Icon } from "@/app/components/server";
import { Point, QuadCorners, QuadPoints } from "@/app/types";

const QUAD_COLOR = "var(--highlight)";
const QUAD_FILL_COLOR = "color-mix(in srgb, var(--highlight) 15%, transparent)";
const QUAD_STROKE_WIDTH = 2;
const CORNER_RADIUS = 12;
const CORNER_STROKE_COLOR = "white";

/** Convert a `QuadCorners` ordered object to a `QuadPoints` tuple. */
const cornersToPoints = (c: QuadCorners): QuadPoints => [
  c.topLeft,
  c.topRight,
  c.bottomRight,
  c.bottomLeft,
];

/**
 * Full-screen overlay for manually adjusting document crop corners.
 *
 * Displays the original image (rotated by `rotationStep`) with a draggable SVG quad overlay.
 * Corners are stored in rotated image space during drag and converted back to original image
 * space on confirm so the pipeline always receives unrotated coordinates.
 *
 * Internally uses `QuadPoints` (unordered tuple) during drag to keep corner indices stable.
 * Sorts into `QuadCorners` (ordered object) for rendering and on confirm.
 *
 * @param imageUrl - Original image URL.
 * @param quadCorners - Initial corners in original image space, or `null` to default to full image bounds.
 * @param rotationStep - Current rotation in 90° steps. Applied as CSS and used for coordinate conversion.
 * @param onConfirm - Apply the adjusted corners in original image space coordinates.
 * @param onClose - Dismiss without applying changes.
 */
const CropOverlay = ({
  imageUrl,
  quadCorners,
  rotationStep,
  onConfirm,
  onClose,
}: {
  imageUrl: string;
  quadCorners: QuadCorners | null;
  rotationStep: number;
  onConfirm: (corners: QuadCorners) => void;
  onClose: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // quadPoints are stored in rotated image space during drag.
  const [quadPoints, setQuadPoints] = useState<QuadPoints | null>(null);

  // Rendered image rect in viewport coordinates, computed without CSS rotation applied.
  const [unrotatedRect, setUnrotatedRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  /** Derive rendered image size from `naturalWidth/naturalHeight` and container bounds. */
  const updateRect = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    const degrees = rotationStep * 90;
    const isAxesSwapped = Math.abs(degrees) % 180 === 90;

    const displayWidth = isAxesSwapped ? naturalHeight : naturalWidth;
    const displayHeight = isAxesSwapped ? naturalWidth : naturalHeight;

    const containerRect = containerRef.current.getBoundingClientRect();
    const scale = Math.min(
      containerRect.width / displayWidth,
      containerRect.height / displayHeight,
    );

    const w = displayWidth * scale;
    const h = displayHeight * scale;

    setUnrotatedRect({
      width: w,
      height: h,
      left: containerRect.left + (containerRect.width - w) / 2,
      top: containerRect.top + (containerRect.height - h) / 2,
    });
  }, [rotationStep]);

  // Re-compute rect on container resize so circles stay aligned with the image.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateRect);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateRect]);

  /**
   * Initialize `quadPoints` once the image has loaded and its natural dimensions are available.
   *
   * Existing corners arrive in original image space and must be rotated into the current display space.
   */
  const handleImageLoad = useCallback((): void => {
    updateRect();
    if (!imageRef.current) return;

    const { naturalWidth, naturalHeight } = imageRef.current;
    const degrees = rotationStep * 90;
    const isAxesSwapped = Math.abs(degrees) % 180 === 90;
    const displayWidth = isAxesSwapped ? naturalHeight : naturalWidth;
    const displayHeight = isAxesSwapped ? naturalWidth : naturalHeight;

    if (quadCorners) {
      const rotated: QuadPoints = [
        rotatePoint(quadCorners.topLeft, degrees, naturalWidth, naturalHeight),
        rotatePoint(quadCorners.topRight, degrees, naturalWidth, naturalHeight),
        rotatePoint(
          quadCorners.bottomRight,
          degrees,
          naturalWidth,
          naturalHeight,
        ),
        rotatePoint(
          quadCorners.bottomLeft,
          degrees,
          naturalWidth,
          naturalHeight,
        ),
      ];
      setQuadPoints(rotated);
    } else {
      setQuadPoints(cornersToPoints(defaultQuad(displayWidth, displayHeight)));
    }
  }, [rotationStep, quadCorners, updateRect]);

  /**
   * Convert a point from rotated image space to container-relative screen space for rendering.
   *
   * Use `unrotatedRect` rather than the image's bounding rect so CSS rotation doesn't affect the mapping.
   *
   * @param point - Point in rotated image pixel coordinates.
   * @returns Point in pixels relative to the container div.
   */
  const imagePointToScreenPoint = useCallback(
    (point: Point): Point => {
      if (!imageRef.current || !unrotatedRect || !containerRef.current)
        return point;
      const { naturalWidth, naturalHeight } = imageRef.current;
      const degrees = rotationStep * 90;
      const isAxesSwapped = Math.abs(degrees) % 180 === 90;
      const displayWidth = isAxesSwapped ? naturalHeight : naturalWidth;
      const displayHeight = isAxesSwapped ? naturalWidth : naturalHeight;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scaleX = unrotatedRect.width / displayWidth;
      const scaleY = unrotatedRect.height / displayHeight;
      const offsetX = unrotatedRect.left - containerRect.left;
      const offsetY = unrotatedRect.top - containerRect.top;

      return {
        x: offsetX + point.x * scaleX,
        y: offsetY + point.y * scaleY,
      };
    },
    [unrotatedRect, rotationStep],
  );

  /**
   * Convert a point in viewport screen space to rotated image pixel space.
   *
   * The output point is clamped to image bounds so dragging past the image edge snaps to the boundary.
   *
   * @param point - Point in pixel coordinates relative to the viewport.
   * @returns Point in rotated image pixel coordinates.
   */
  const screenPointToImagePoint = useCallback(
    (point: Point): Point => {
      if (!imageRef.current || !unrotatedRect) return { x: 0, y: 0 };
      const { naturalWidth, naturalHeight } = imageRef.current;
      const degrees = rotationStep * 90;
      const isAxesSwapped = Math.abs(degrees) % 180 === 90;
      const displayWidth = isAxesSwapped ? naturalHeight : naturalWidth;
      const displayHeight = isAxesSwapped ? naturalWidth : naturalHeight;

      const scaleX = displayWidth / unrotatedRect.width;
      const scaleY = displayHeight / unrotatedRect.height;

      return {
        x: Math.max(
          0,
          Math.min(displayWidth, (point.x - unrotatedRect.left) * scaleX),
        ),
        y: Math.max(
          0,
          Math.min(displayHeight, (point.y - unrotatedRect.top) * scaleY),
        ),
      };
    },
    [unrotatedRect, rotationStep],
  );

  /**
   * Begin dragging a corner.
   *
   * Reading index from data-index avoids creating a new handler closure per corner.
   * Pointer capture keeps the drag alive even if the pointer leaves the circle.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGElement>) => {
    e.preventDefault();
    const index = Number((e.currentTarget as SVGElement).dataset.index);
    draggingIndex.current = index;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  /**
   * Move the active corner to the pointer's current position.
   *
   * Functional updater avoids closing over `quadPoints` so it's not in the dependency array.
   *
   * The hanler only recreates when `screenPointToImagePoint` changes, not on every drag tick.
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingIndex.current === null || !quadPoints) return;
      const newPoint = screenPointToImagePoint({ x: e.clientX, y: e.clientY });
      const updatedQuadPoints: QuadPoints = [...quadPoints];
      updatedQuadPoints[draggingIndex.current] = newPoint;
      setQuadPoints(updatedQuadPoints);
    },
    [quadPoints, screenPointToImagePoint],
  );

  /** Release the active drag. */
  const handlePointerUp = useCallback(() => {
    draggingIndex.current = null;
  }, []);

  /**
   * Unrotate corners back to original image space and call `onConfirm()`.
   *
   * `quadPoints` are in rotated display space during drag.
   * Before passing them to the pipeline, they must be unrotated so the pipeline receives coordinates in the original image's pixel space.
   */
  const handleConfirm = useCallback(() => {
    if (!quadPoints || !imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    const degrees = rotationStep * 90;
    const sorted = sortQuad(quadPoints);

    const unrotated: QuadPoints = [
      unrotatePoint(sorted.topLeft, degrees, naturalWidth, naturalHeight),
      unrotatePoint(sorted.topRight, degrees, naturalWidth, naturalHeight),
      unrotatePoint(sorted.bottomRight, degrees, naturalWidth, naturalHeight),
      unrotatePoint(sorted.bottomLeft, degrees, naturalWidth, naturalHeight),
    ];

    onConfirm(sortQuad(unrotated));
  }, [quadPoints, rotationStep, onConfirm]);

  // Sort for rendering to keep polygon convex. Memoized so it only reruns when quadPoints changes.
  // Sorted for rendering to keep the polygon convex. Not used ofr circles because
  const sortedQuadCorners = useMemo(
    () => (quadPoints ? sortQuad(quadPoints) : null),
    [quadPoints],
  );

  // Derive screen-space corners and polygon string from the sorted corners.
  // Memoized so imagePointToScreenPoint is not called on every render.
  const { screenQuadCorners, polygonPoints } = useMemo(() => {
    if (!sortedQuadCorners)
      return { screenQuadCorners: null, polygonPoints: undefined };
    const pts = cornersToPoints(sortedQuadCorners).map(imagePointToScreenPoint);
    return {
      screenQuadCorners: pts,
      polygonPoints: pts.map((p) => `${p.x},${p.y}`).join(" "),
    };
  }, [sortedQuadCorners, imagePointToScreenPoint]);

  return (
    <div
      className="flex flex-col fixed inset-x-0 top-0 z-50 bg-background gap-4 overflow-hidden"
      style={{ height: "100dvh" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Header */}
      <div className="flex items-center justify-end h-20 px-6">
        <button className="cursor-pointer" onClick={onClose}>
          <Icon src={CloseIcon} className="size-10" />
        </button>
      </div>

      {/* Original image with quad overlay */}
      <div className="flex flex-1 min-h-0 items-center justify-center px-4">
        <div
          ref={containerRef}
          className="relative"
          style={{
            aspectRatio: "1",
            maxHeight: "100%",
            maxWidth: "100%",
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            className="w-full h-full object-contain"
            style={{ transform: `rotate(${rotationStep * 90}deg)` }}
            onLoad={handleImageLoad}
          />

          {screenQuadCorners && polygonPoints && (
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ overflow: "visible" }}
            >
              {/* Quad fill — uses sorted corners for a convex polygon */}
              <polygon
                points={polygonPoints}
                fill={QUAD_FILL_COLOR}
                stroke={QUAD_COLOR}
                strokeWidth={QUAD_STROKE_WIDTH}
                strokeLinejoin="round"
                className="pointer-events-none"
              />

              {/* Corner circles */}
              {quadPoints?.map((point, index) => {
                const screenPoint = imagePointToScreenPoint(point);
                return (
                  <circle
                    key={index}
                    data-index={index}
                    cx={screenPoint.x}
                    cy={screenPoint.y}
                    r={CORNER_RADIUS}
                    fill={QUAD_COLOR}
                    stroke={CORNER_STROKE_COLOR}
                    strokeWidth={QUAD_STROKE_WIDTH}
                    className="cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={handlePointerDown}
                  />
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-6 shrink-0 px-6 py-4 bg-highlight/50">
        <button
          className="cursor-pointer text-sm px-6 py-2 border rounded-full"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="cursor-pointer text-sm px-6 py-2 bg-highlight text-white rounded-full"
          onClick={handleConfirm}
        >
          Apply
        </button>
      </div>
    </div>
  );
};

export default CropOverlay;
