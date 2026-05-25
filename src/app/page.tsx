"use client";

import Link from "next/link";
import { useState } from "react";

import { useScanner } from "@/app/hooks";
import {
  AlbumIcon,
  CameraIcon,
  DownloadIcon,
  ScanIcon,
} from "@/app/assets/icons";
import {
  CameraView,
  CropOverlay,
  ExportErrorModal,
  ExportModal,
  FailedImagesModal,
  ImageGallery,
  InspectionOverlay,
} from "@/app/components/client";
import { Icon } from "@/app/components/server";
import {
  ExportOptions,
  OverlayState,
  QuadCorners,
  ScanMode,
} from "@/app/types";

const SCAN_MODES: ScanMode[] = ["bw", "color"];
const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  bw: "B&W",
  color: "Color",
};

const ACTION_BUTTON_STYLING =
  "flex items-center justify-center gap-2 p-4 border-2 border-primary bg-primary text-primary-foreground rounded-sm cursor-pointer whitespace-nowrap";

/**
 * Home page component.
 *
 * Responsibilities:
 *    - Handle image uploads and camera capture.
 *    - Allow user to switch scan modes.
 *    - Explicitly trigger scanning with the scan button.
 *    - Trigger processing and download with the download button.
 *    - Display uploaded images in a sortable gallery.
 *    - Manage all overlay visibility via a single discriminated union state.
 *    - Support image inspection, retake, and crop from the inspection overlay.
 */
export default function Home() {
  const scanner = useScanner();
  const [overlay, setOverlay] = useState<OverlayState>({ type: "none" });

  /**
   * Navigate to an image by id and open the inspection overlay.
   * Computes imageIndex from the current imageIds order.
   *
   * @param imageId - The id of the image to inspect.
   */
  const navigateToId = (imageId: string): void => {
    const index = scanner.imageIds.indexOf(imageId);
    if (index === -1) return;
    setOverlay({ type: "inspection", imageId, imageIndex: index + 1 });
  };

  /**
   * Navigate to the image at the given 0-based index and open the inspection overlay.
   *
   * @param index - 0-based index into `scanner.imageIds`.
   */
  const navigateToIndex = (index: number): void => {
    const imageId = scanner.imageIds[index];
    if (!imageId) return;
    setOverlay({
      type: "inspection",
      imageId: scanner.imageIds[index],
      imageIndex: index + 1,
    });
  };

  /** Navigate to the previous image in the gallery. */
  const getPreviousImage = (): void => {
    if (overlay.type !== "inspection" || overlay.imageIndex === 1) return;
    navigateToIndex(overlay.imageIndex - 2);
  };

  /** Navigate to the next image in the gallery. */
  const getNextImage = (): void => {
    if (
      overlay.type !== "inspection" ||
      overlay.imageIndex === scanner.imageIds.length
    )
      return;
    navigateToIndex(overlay.imageIndex);
  };

  /**
   * Open the export modal, or show the failed images modal if any images failed.
   * Prevent exporting a PDF with missing pages.
   */
  const handleExportOverlay = (): void => {
    if (scanner.failedCount > 0) {
      setOverlay({ type: "failedImages" });
      return;
    }
    setOverlay({ type: "export" });
  };

  /**
   * Trigger PDF export with the options configured in the export modal.
   *
   * @param options - Export options from `ExportModal`.
   */
  const handleExport = (options: ExportOptions): void => {
    scanner.exportPDF(options);
  };

  /** Open the crop overlay for the currently inspected image. */
  const handleCrop = (): void => {
    if (overlay.type !== "inspection") return;
    setOverlay({ type: "crop", imageId: overlay.imageId });
  };

  /** Apply crop corners and return to inspection. */
  const handleCropConfirm = (corners: QuadCorners): void => {
    if (overlay.type !== "crop") return;
    scanner.cropImage(overlay.imageId, corners);
    navigateToId(overlay.imageId);
  };

  /** Rotate the currently inspected image left. */
  const handleRotateRight = (): void => {
    if (overlay.type !== "inspection") return;
    scanner.rotateRightImage(overlay.imageId);
  };

  /**
   * Route a camera capture to either insert or retake an image.
   *
   * If the camera was opened in retake mode, replace the inspected image in-place and return to inspection. Otherwise insert as new images.
   *
   * @param files - Captured files from CameraView.
   */
  const handleCameraCapture = (files: File[]): void => {
    if (overlay.type !== "camera") return;

    if (overlay.mode === "capture") {
      scanner.insertImages(files);
      return;
    }

    const [file] = files;
    const result = scanner.replaceImage(overlay.imageId, file);
    if (!result) return;

    setOverlay({
      type: "inspection",
      imageId: result.id,
      imageIndex: result.imageIndex + 1,
    });
  };

  /** Open the camera in retake mode for the currently inspected image. */
  const handleRetake = (): void => {
    if (overlay.type !== "inspection") return;
    setOverlay({ type: "camera", mode: "retake", imageId: overlay.imageId });
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between h-20 px-6">
        <Link href="/" className="flex items-center gap-3 cursor-pointer">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            docsnap
          </h1>
        </Link>
      </header>

      <main className="flex flex-col flex-1 gap-6 p-6 overflow-hidden">
        <div className="flex flex-col gap-6">
          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {/* Upload from gallery */}
            <label className={ACTION_BUTTON_STYLING}>
              <Icon className="text-highlight" src={AlbumIcon} />
              <span>Upload Photos</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files) return;
                  scanner.insertImages(Array.from(files));
                  // Reset so the same file can be re-selected if needed.
                  e.target.value = "";
                }}
              />
            </label>

            {/* Open camera overlay */}
            <button
              className={ACTION_BUTTON_STYLING}
              onClick={() => setOverlay({ type: "camera", mode: "capture" })}
            >
              <Icon src={CameraIcon} />
              <span>Take Photos</span>
            </button>

            {scanner.hasImages && (
              <>
                {/* Scan mode switcher (active mode grows to show selection) */}
                <div className="flex gap-2">
                  {SCAN_MODES.map((mode) => {
                    const isActive = scanner.scanMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => scanner.setScanMode(mode)}
                        disabled={isActive}
                        className={[
                          "flex items-center justify-center gap-2 p-4 border-2 rounded-sm whitespace-nowrap transition-all duration-300",
                          isActive
                            ? "flex-2 text-primary-foreground border-primary bg-primary cursor-default"
                            : "flex-1 text-primary-foreground border-primary-inactive bg-primary-inactive cursor-pointer",
                        ].join(" ")}
                      >
                        <span>{SCAN_MODE_LABELS[mode]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Scan button (disabled while processing) */}
                <button
                  onClick={scanner.scanImages}
                  disabled={scanner.isProcessing}
                  className={[
                    "flex items-center justify-center gap-2 p-4 border-2 border-primary bg-primary text-primary-foreground rounded-sm cursor-pointer whitespace-nowrap",
                    scanner.isProcessing
                      ? "cursor-not-allowed opacity-30"
                      : "cursor-pointer",
                  ].join(" ")}
                >
                  <Icon src={ScanIcon} />
                  <span>Scan</span>
                </button>

                {/* Download button (turns red when there are failed images) */}
                <button
                  onClick={handleExportOverlay}
                  disabled={scanner.isProcessing}
                  className={[
                    "flex items-center justify-center gap-2 p-4 border-2 bg-primary text-primary-foreground rounded-sm whitespace-nowrap transition-all",
                    scanner.isProcessing
                      ? "border-primary opacity-30 cursor-not-allowed"
                      : scanner.failedCount > 0
                        ? "border-primary-error cursor-pointer"
                        : "border-primary cursor-pointer",
                  ].join(" ")}
                >
                  <Icon src={DownloadIcon} />
                  <span>Download</span>
                </button>
              </>
            )}
          </div>

          <ImageGallery
            imageIds={scanner.imageIds}
            imagesById={scanner.imagesById}
            onRetry={scanner.retryImage}
            onRemove={scanner.removeImage}
            onReorder={scanner.reorderImages}
            isProcessing={scanner.isProcessing}
            onSelect={navigateToId}
          />
        </div>
      </main>

      {/* Failed images modal */}
      {overlay.type === "failedImages" && (
        <FailedImagesModal
          failedCount={scanner.failedCount}
          onClose={() => setOverlay({ type: "none" })}
        />
      )}

      {/* Export error modal */}
      {scanner.exportError && (
        <ExportErrorModal
          errorMessage={scanner.exportError}
          onClose={scanner.clearExportError}
        />
      )}

      {/* Camera overlay */}
      {overlay.type === "camera" && (
        <CameraView
          onCapture={handleCameraCapture}
          onClose={() => setOverlay({ type: "none" })}
        />
      )}

      {/* Crop overlay */}
      {overlay.type === "crop" &&
        (() => {
          const documentImage = scanner.imagesById.get(overlay.imageId);
          if (!documentImage) return null;
          return (
            <CropOverlay
              imageUrl={documentImage.original.url}
              quadCorners={documentImage.corners ?? null}
              rotationStep={documentImage.rotationStep}
              onConfirm={handleCropConfirm}
              onClose={() => navigateToId(overlay.imageId)}
            />
          );
        })()}

      {/* Inspection overlay */}
      {overlay.type === "inspection" &&
        (() => {
          const documentImage = scanner.imagesById.get(overlay.imageId);
          if (!documentImage) return null;
          return (
            <InspectionOverlay
              activeIndex={overlay.imageIndex}
              totalImages={scanner.imageIds.length}
              rotationStep={documentImage.rotationStep}
              activeImageUrl={documentImage.original.url}
              scannedImageUrl={documentImage.processed?.url ?? null}
              getPreviousImage={getPreviousImage}
              getNextImage={getNextImage}
              retakeImage={handleRetake}
              cropImage={handleCrop}
              rotateRightImage={handleRotateRight}
              onClose={() => setOverlay({ type: "none" })}
            />
          );
        })()}

      {/* Export modal */}
      {overlay.type === "export" && (
        <ExportModal
          onExport={handleExport}
          onClose={() => setOverlay({ type: "none" })}
        />
      )}

      <footer className="text-xs text-gray-400 text-center pb-4 flex flex-col gap-1">
        <span>No data is sent to me. All processing happens on device.</span>
        <div className="flex gap-2 justify-center">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          <span>·</span>
          <span>App version: {process.env.NEXT_PUBLIC_VERSION}</span>
        </div>
      </footer>
    </div>
  );
}
