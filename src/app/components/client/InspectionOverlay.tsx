"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/app/components/server";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  CropIcon,
  RetakePhotoIcon,
  RotateLeftIcon,
} from "@/app/assets/icons";

/**
 * Full-screen overlay for inspecting and editing scanned images.
 *
 * Responsibilities:
 *    - Display the scanned image, falling back to the original if not yet processed.
 *    - Navigate between images via arrows or horizontal swipe.
 *    - Lock scroll and intercept touchmove to prevent the browser URL bar from toggling and resizing the viewport.
 *    - Expose tool actions (Retake, Rotate, Crop) in a bottom bar.
 *
 * @param onClose - Dismiss the overlay.
 * @param activeImageUrl - Original image URL, used as fallback if not yet scanned.
 * @param scannedImageUrl - Processed image URL, shown when available.
 * @param activeIndex - 1-based position of the current image.
 * @param totalImages - Total number of images in the session.
 * @param getPreviousImage - Navigate to the previous image.
 * @param getNextImage - Navigate to the next image.
 */
const InspectionOverlay = ({
  onClose,
  activeImageUrl,
  scannedImageUrl,
  activeIndex,
  totalImages,
  getPreviousImage,
  getNextImage,
  retakeImage,
}: {
  onClose: () => void;
  activeImageUrl: string;
  scannedImageUrl: string | null;
  activeIndex: number;
  totalImages: number;
  getPreviousImage: () => void;
  getNextImage: () => void;
  retakeImage: () => void;
}) => {
  const touchStartX = useRef<number>(0);

  // Lock page scroll while the overlay is open.
  // Even though the content doesn't change, scrolling can hide or unhide the browser banner or stretch the viewport on mobile.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  /**
   * Record the horizontal start position of a touch for swipe detection.
   *
   *  @param e - Touch event.
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

  /**
   * Block page scroll and URL bar resize on drag. Swipe detection still completes cause of `handleTouchEnd()`.
   *
   * @param e - Touch event.
   */
  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  const imageUrl = scannedImageUrl ?? activeImageUrl;

  return (
    <div
      className="flex flex-col fixed inset-x-0 top-0 z-20 bg-background gap-4 overflow-hidden"
      style={{ height: "100dvh" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-end h-20 px-6">
        <button className="cursor-pointer" onClick={onClose}>
          <Icon src={CloseIcon} className="size-10" />
        </button>
      </div>

      {/* Image */}
      <div className="flex flex-1 min-h-0 items-center px-4">
        <img
          src={imageUrl}
          className="max-h-full max-w-full object-contain mx-auto"
        />
      </div>

      {/* Navigation pill */}
      <div className="flex items-center gap-4 w-fit mx-auto bg-highlight/50 rounded-full">
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
      <div className="flex items-center justify-center gap-10 shrink-0 px-6 py-2 bg-highlight/50">
        <button
          className="flex flex-col gap-1 items-center cursor-pointer py-1"
          onClick={() => {
            retakeImage();
          }}
        >
          <Icon src={RetakePhotoIcon} className="size-6" />
          <p className="text-xs">Retake</p>
        </button>
        <button className="flex flex-col gap-1 items-center cursor-pointer py-1">
          <Icon src={RotateLeftIcon} className="size-6" />
          <p className="text-xs">WIP</p>
        </button>
        <button className="flex flex-col gap-1 items-center cursor-pointer py-1">
          <Icon src={CropIcon} className="size-6" />
          <p className="text-xs">WIP</p>
        </button>
      </div>
    </div>
  );
};

export default InspectionOverlay;
