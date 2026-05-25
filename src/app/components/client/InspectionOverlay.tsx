"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  CropIcon,
  RetakePhotoIcon,
  RotateRightIcon,
} from "@/app/assets/icons";
import { Icon } from "@/app/components/server";

/**
 * Full-screen overlay for inspecting and editing scanned images.
 *
 * Responsibilities:
 *    - Display the scanned image, falling back to the original if not yet processed.
 *    - Navigate between images via arrows or horizontal swipe.
 *    - Lock scroll and intercept touchmove via a non-passive listener to prevent the browser
 *      URL bar from toggling and resizing the viewport on mobile.
 *    - Expose tool actions (Retake, Rotate, Crop) in a bottom bar.
 *    - Render a border that wraps only the rendered image pixels, not the letterbox area.
 *
 * @param activeIndex - 1-based position of the current image.
 * @param totalImages - Total number of images in the session.
 * @param rotationStep - Current rotation in 90° steps, applied as CSS transform.
 * @param activeImageUrl - Original image URL, used as fallback if not yet scanned.
 * @param scannedImageUrl - Processed image URL, shown when available.
 * @param getPreviousImage - Navigate to the previous image.
 * @param getNextImage - Navigate to the next image.
 * @param cropImage - Open the crop overlay.
 * @param retakeImage - Open the camera in retake mode.
 * @param rotateRightImage - Rotate the image 90° clockwise.
 * @param onClose - Dismiss the overlay.
 */
const InspectionOverlay = ({
  activeIndex,
  totalImages,
  rotationStep,
  activeImageUrl,
  scannedImageUrl,
  getPreviousImage,
  getNextImage,
  cropImage,
  retakeImage,
  rotateRightImage,
  onClose,
}: {
  activeIndex: number;
  totalImages: number;
  rotationStep: number;
  activeImageUrl: string;
  scannedImageUrl: string | null;
  getPreviousImage: () => void;
  getNextImage: () => void;
  cropImage: () => void;
  retakeImage: () => void;
  rotateRightImage: () => void;
  onClose: () => void;
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const touchStartX = useRef<number>(0);

  // Rendered image rect in container-relative coordinates, computed without CSS rotation.
  const [imageRect, setImageRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  /**
   * Compute the rendered image size from naturalWidth/naturalHeight and the container bounds.
   * Uses object-contain scaling so the border wraps the actual image pixels, not the letterbox.
   */
  const updateImageRect = useCallback(() => {
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

    setImageRect({
      width: w,
      height: h,
      left: (containerRect.width - w) / 2,
      top: (containerRect.height - h) / 2,
    });
  }, [rotationStep]);

  // Re-compute on container resize.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateImageRect);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateImageRect]);

  // Lock scroll and block touchmove to prevent the browser URL bar from toggling on mobile.
  // Non-passive listener is attached here because React's onTouchMove is passive by default so `preventDefault()` has no effect.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const element = overlayRef.current;
    const handler = (event: TouchEvent) => event.preventDefault();
    element?.addEventListener("touchmove", handler, { passive: false });
    return () => {
      document.body.style.overflow = "";
      element?.removeEventListener("touchmove", handler);
    };
  }, []);

  /**
   * Record the horizontal start position of a touch for swipe detection.
   *
   * @param e - Touch start event.
   */
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  /**
   * Navigate based on swipe direction. Ignore swipes under 50px.
   *
   * @param e - Touch end event.
   */
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) < 50) return;
    if (delta > 0) getNextImage();
    else getPreviousImage();
  };

  const imageUrl = scannedImageUrl ?? activeImageUrl;

  return (
    <div
      ref={overlayRef}
      className="flex flex-col fixed inset-x-0 top-0 z-20 bg-overlay-background gap-4 overflow-hidden"
      style={{ height: "100dvh" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-end h-20 px-6">
        <button
          className="cursor-pointer text-overlay-foreground"
          onClick={onClose}
        >
          <Icon src={CloseIcon} className="size-10" />
        </button>
      </div>

      {/* Image — square container prevents layout shift during rotation */}
      <div className="flex flex-1 min-h-0 items-center justify-center px-4">
        <div
          ref={containerRef}
          className="relative"
          style={{ aspectRatio: "1", maxHeight: "100%", maxWidth: "100%" }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            className="w-full h-full object-contain"
            style={{ transform: `rotate(${rotationStep * 90}deg)` }}
            onLoad={updateImageRect}
          />

          {/* Border overlay sized to the actual rendered image pixels */}
          {imageRect && (
            <div
              className="absolute pointer-events-none border-2 border-overlay-foreground"
              style={{
                left: imageRect.left,
                top: imageRect.top,
                width: imageRect.width,
                height: imageRect.height,
              }}
            />
          )}
        </div>
      </div>

      {/* Navigation pill */}
      <div className="flex items-center gap-4 w-fit mx-auto border-2 border-primary bg-primary text-primary-foreground rounded-full">
        <button
          className="cursor-pointer"
          onClick={getPreviousImage}
          disabled={activeIndex === 1}
        >
          <Icon
            src={ArrowLeftIcon}
            className={`size-10 ${activeIndex === 1 ? "opacity-30" : ""}`}
          />
        </button>
        <span>
          {activeIndex} / {totalImages}
        </span>
        <button
          className="cursor-pointer"
          onClick={getNextImage}
          disabled={activeIndex === totalImages}
        >
          <Icon
            src={ArrowRightIcon}
            className={`size-10 ${activeIndex === totalImages ? "opacity-30" : ""}`}
          />
        </button>
      </div>

      {/* Tools */}
      <div className="flex items-center justify-center gap-10 shrink-0 px-6 py-2 border-primary bg-primary text-primary-foreground">
        <button
          className="flex flex-col gap-1 items-center cursor-pointer py-1"
          onClick={retakeImage}
        >
          <Icon src={RetakePhotoIcon} className="size-6" />
          <p className="text-xs">Retake</p>
        </button>
        <button
          className="flex flex-col gap-1 items-center cursor-pointer py-1"
          onClick={rotateRightImage}
        >
          <Icon src={RotateRightIcon} className="size-6" />
          <p className="text-xs">Rotate</p>
        </button>
        <button
          className="flex flex-col gap-1 items-center cursor-pointer py-1"
          onClick={cropImage}
        >
          <Icon src={CropIcon} className="size-6" />
          <p className="text-xs">Crop</p>
        </button>
      </div>
    </div>
  );
};

export default InspectionOverlay;
