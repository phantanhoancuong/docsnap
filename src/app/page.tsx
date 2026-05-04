"use client";

import Link from "next/link";

import { ImageGallery } from "@/app/components/client";
import { Icon } from "@/app/components/server";

import { useState } from "react";

import { useScanner } from "@/app/hooks";

import {
  AlbumIcon,
  CameraIcon,
  CloseIcon,
  DownloadIcon,
  FlashOffIcon,
  FlashOnIcon,
  ScanIcon,
} from "@/app/assets/icons";

import { ScanMode } from "@/app/types";

import {
  CameraView,
  ExportErrorOverlay,
  FailedImagesOverlay,
} from "@/app/components/client";

const SCAN_MODES: ScanMode[] = ["bw", "color"];
const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  bw: "B&W",
  color: "Color",
};

/**
 * Home page component.
 *
 * Responsibilities:
 *    - Handle image uploads.
 *    - Allow user to switch scan modes.
 *    - Explicitly trigger scanning with the scan button.
 *    - Trigger processing and download with the download button.
 *    - Display uploaded images in a sortable gallery.
 *    - Show a dismissible banner when PDF export fails.
 *    - Manage camera overlay visibility and close action.
 * @returns
 */
export default function Home() {
  const scanner = useScanner();
  const [showFailedOverlay, setShowFailedOverlay] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  // Show the failed images overlay instead of exporting if any images failed.
  const handleDownload = () => {
    if (scanner.failedCount > 0) {
      setShowFailedOverlay(true);
      return;
    }
    scanner.exportPDF();
  };

  const handleCloseCamera = () => {
    setShowCamera(false);
    setIsTorchOn(false);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header -- shows close button when camera is open */}
      <header className="flex items-center justify-between h-20 px-6">
        <Link href="/" className="flex items-center gap-3 cursor-pointer">
          <h1 className="text-3xl font-bold tracking-tight">docsnap</h1>
        </Link>
        {showCamera && (
          <div>
            <button
              className="cursor-pointer"
              onClick={() => setIsTorchOn((torch) => !torch)}
            >
              <Icon
                src={isTorchOn ? FlashOnIcon : FlashOffIcon}
                className="size-10"
              />
            </button>
            <button
              className="cursor-pointer"
              onClick={() => handleCloseCamera()}
            >
              <Icon src={CloseIcon} className="size-10" />
            </button>
          </div>
        )}
      </header>

      <main className="flex flex-col flex-1 gap-6 p-6 overflow-hidden">
        <div className="flex flex-col gap-10">
          {/* Action buttons */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateRows: scanner.hasImages
                ? "auto auto auto auto"
                : "auto",
            }}
          >
            {/* Upload from gallery */}
            <label className="flex items-center justify-center gap-2 p-6 border-2 rounded-sm cursor-pointer whitespace-nowrap">
              <Icon src={AlbumIcon} />
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
              className="flex items-center justify-center gap-2 p-6 border-2 rounded-sm cursor-pointer whitespace-nowrap"
              onClick={() => setShowCamera(true)}
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
                          "flex items-center justify-center p-6 border-2 rounded-sm transition-all duration-300",
                          isActive
                            ? "flex-2 cursor-default"
                            : "flex-1 cursor-pointer",
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
                    "flex w-full items-center justify-center gap-2 p-6 border-2 rounded-sm transition-all",
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
                  onClick={handleDownload}
                  disabled={scanner.isProcessing}
                  className={[
                    "flex w-full items-center justify-center gap-2 p-6 border-2 rounded-sm transition-all",
                    scanner.isProcessing
                      ? "cursor-not-allowed opacity-30"
                      : scanner.failedCount > 0
                        ? "cursor-pointer border-red-500 text-red-500"
                        : "cursor-pointer",
                  ].join(" ")}
                >
                  <Icon src={DownloadIcon} />
                  <span>Download</span>
                </button>
              </>
            )}
          </div>

          <ImageGallery
            imageKeys={scanner.imageKeys}
            images={scanner.images}
            onRetry={scanner.retryImage}
            onRemove={scanner.removeImage}
            onReorder={scanner.reorderImages}
            isProcessing={scanner.isProcessing}
          />
        </div>
      </main>

      {/* Failed images overlay */}
      {showFailedOverlay && (
        <FailedImagesOverlay
          failedCount={scanner.failedCount}
          onClose={() => setShowFailedOverlay(false)}
        />
      )}

      {/* Export error overlay (shown when PDF generation fails) */}
      {scanner.exportError && (
        <ExportErrorOverlay
          errorMessage={scanner.exportError}
          onClose={scanner.clearExportError}
        />
      )}

      {/* Camera overlay (renders below the header, close is handled in header) */}
      {showCamera && (
        <CameraView onCapture={scanner.insertImages} isTorchOn={isTorchOn} />
      )}
      <footer className="text-xs text-gray-400 text-center pb-4">
        app version: {process.env.NEXT_PUBLIC_VERSION}
      </footer>
    </div>
  );
}
