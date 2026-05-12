"use client";

import { useRef, useState, useEffect } from "react";
import { CloseIcon } from "@/app/assets/icons";
import { Icon } from "../server";
import { Point } from "@/app/types";

import { defaultQuad, sortQuad } from "@/app/lib";

const QUAD_COLOR = "var(--highlight)";
const QUAD_FILL_COLOR = "color-mix(in srgb, var(--highlight) 15%, transparent)";
const QUAD_STROKE_WIDTH = 2;
const CORNER_RADIUS = 12;
const CORNER_STROKE_COLOR = "white";

/**
 * Full-screen overlay for manually adjusting document crop corners.
 *
 * Display the original image with a draggable SVG quad overlay.
 * The quad is sorted into [TL, TR, BR, BL] order for rendering and on confirm, but NOT during drag.
 * This is to keep corner indices stable so they don't jump when crossed.
 *
 * @param onClose - Dismiss without applying changes.
 * @param onConfirm - Apply the adjusted quad in image space coordinates.
 * @param imageUrl - Original image URL.
 * @param corners - Initial quad in image space coordinates, or `null` to default to full image bounds.
 */
const CropOverlay = ({
  onClose,
  onConfirm,
  imageUrl,
  corners,
}: {
  onClose: () => void;
  onConfirm: (quad: [Point, Point, Point, Point]) => void;
  imageUrl: string;
  corners: [Point, Point, Point, Point] | null;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [quad, setQuad] = useState<[Point, Point, Point, Point] | null>(null);
  const [renderedRect, setRenderedRect] = useState<DOMRect | null>(null);

  /** Snapshot the rendered image rect for coordinate conversion. */
  const updateRect = () => {
    if (imageRef.current)
      setRenderedRect(imageRef.current.getBoundingClientRect());
  };

  /**
   * On image load, snapshot the rendered rect and initialize the quad.
   * Default to full image bounds if no corners were provided.
   */
  const handleImageLoad = () => {
    updateRect();
    if (!imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    setQuad(corners ?? defaultQuad(naturalWidth, naturalHeight));
  };

  // Re-compute rect on resize so dots stay aligned with the image.
  useEffect(() => {
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, []);

  /**
   * Convert a point from image space to container-relative screen space for rendering.
   *
   * @param point - Point in natural image pixel coordinates.
   * @returns Point in pixels relative to the container div.
   */
  const imagePointToScreenPoint = (point: Point): Point => {
    if (!imageRef.current || !renderedRect || !containerRef.current)
      return point;
    const { naturalWidth, naturalHeight } = imageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();

    const scaleX = renderedRect.width / naturalWidth;
    const scaleY = renderedRect.height / naturalHeight;
    const offsetX = renderedRect.left - containerRect.left;
    const offsetY = renderedRect.top - containerRect.top;

    return {
      x: offsetX + point.x * scaleX,
      y: offsetY + point.y * scaleY,
    };
  };

  /**
   * Convert a point from container-relative screen space to image space.
   *
   * Clamp to image bounds so corners can't be dragged outside the image.
   *
   * @param point - Point in pixel coordinates relative to the viewport.
   * @returns Point in natural image pixel coordinates.
   */
  const screenPointToImagePoint = (point: Point): Point => {
    if (!imageRef.current || !renderedRect) return { x: 0, y: 0 };
    const { naturalWidth, naturalHeight } = imageRef.current;

    const scaleX = naturalWidth / renderedRect.width;
    const scaleY = naturalHeight / renderedRect.height;

    return {
      x: Math.max(
        0,
        Math.min(naturalWidth, (point.x - renderedRect.left) * scaleX),
      ),
      y: Math.max(
        0,
        Math.min(naturalHeight, (point.y - renderedRect.top) * scaleY),
      ),
    };
  };

  /**
   * Begin dragging a corner.
   *
   * Pointer capture ensures the drag continues even if the pointer leaves the circle element.
   *
   * @param index - Corner index in the quad array.
   */
  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingIndex.current = index;
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  };

  /**
   * Move the active corner to the pointer's current position.
   *
   * @param e - Pointer move event from the overlay container.
   */
  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIndex.current === null || !quad) return;
    const newPoint = screenPointToImagePoint({ x: e.clientX, y: e.clientY });
    const newQuad = [...quad] as [Point, Point, Point, Point];
    newQuad[draggingIndex.current] = newPoint;
    setQuad(newQuad);
  };

  /** Release the active drag. */
  const handlePointerUp = () => {
    draggingIndex.current = null;
  };

  /** Sort on confirm so the pipeline receives a well-ordered quad. */
  const handleConfirm = () => {
    if (quad) onConfirm(sortQuad(quad));
  };

  const sortedQuad = quad ? sortQuad(quad) : null;
  const screenPoints = sortedQuad?.map(imagePointToScreenPoint);
  const polygonPoints = screenPoints?.map((p) => `${p.x},${p.y}`).join(" ");

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
      <div
        ref={containerRef}
        className="relative flex flex-1 min-h-0 items-center px-4"
      >
        <img
          ref={imageRef}
          src={imageUrl}
          className="max-h-full max-w-full object-contain mx-auto"
          onLoad={handleImageLoad}
        />

        {screenPoints && polygonPoints && (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ overflow: "visible" }}
          >
            {/* Quad fill */}
            <polygon
              points={polygonPoints}
              fill={QUAD_FILL_COLOR}
              stroke={QUAD_COLOR}
              strokeWidth={QUAD_STROKE_WIDTH}
              strokeLinejoin="round"
              className="pointer-events-none"
            />

            {/* Corner dots */}
            {quad!.map((p, i) => {
              const screen = imagePointToScreenPoint(p);
              return (
                <circle
                  key={i}
                  cx={screen.x}
                  cy={screen.y}
                  r={CORNER_RADIUS}
                  fill={QUAD_COLOR}
                  stroke={CORNER_STROKE_COLOR}
                  strokeWidth={QUAD_STROKE_WIDTH}
                  className="cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={handlePointerDown(i)}
                />
              );
            })}
          </svg>
        )}
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
