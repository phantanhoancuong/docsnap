"use client";

import Link from "next/link";

import { ImageGallery } from "@/app/components/client";
import { Icon } from "@/app/components/server";

import { useState } from "react";

import { useScanner } from "@/app/hooks";

import { AlbumIcon, DownloadIcon, ScanIcon } from "@/app/assets/icons";

import { ScanMode } from "@/app/types";

import {
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
 * @returns
 */
export default function Home() {
  const scanner = useScanner();
  const [showFailedOverlay, setShowFailedOverlay] = useState(false);

  const handleDownload = () => {
    if (scanner.failedCount > 0) {
      setShowFailedOverlay(true);
      return;
    }
    scanner.exportPDF();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center h-20 pl-10">
        <Link href="/" className="flex items-center gap-3 cursor-pointer">
          <h1 className="text-2xl font-bold tracking-tight">docsnap</h1>
        </Link>
      </header>

      <main className="flex flex-col flex-1 gap-6 p-10 overflow-hidden">
        <div className="flex flex-col gap-10">
          <div
            className="grid gap-2"
            style={{
              gridTemplateRows: scanner.hasImages
                ? "auto auto auto auto"
                : "auto",
            }}
          >
            <label className="flex items-center justify-center gap-2 p-4 border-2 rounded-sm cursor-pointer whitespace-nowrap">
              <Icon src={AlbumIcon} />
              <span>Upload Photos</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={scanner.insertImages}
              />
            </label>

            {scanner.hasImages && (
              <>
                {/* Mode switcher */}
                <div className="flex gap-2">
                  {SCAN_MODES.map((mode) => {
                    const isActive = scanner.scanMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={scanner.toggleScanMode}
                        disabled={isActive}
                        className={[
                          "flex items-center justify-center p-4 border-2 rounded-sm transition-all duration-300",
                          isActive
                            ? "flex-[2] cursor-default"
                            : "flex-[1] cursor-pointer",
                        ].join(" ")}
                      >
                        <span>{SCAN_MODE_LABELS[mode]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Scan button */}
                <button
                  onClick={scanner.scanImages}
                  disabled={scanner.isProcessing}
                  className={[
                    "flex w-full items-center justify-center gap-2 p-4 border-2 rounded-sm transition-all",
                    scanner.isProcessing
                      ? "cursor-not-allowed opacity-30"
                      : "cursor-pointer opacity-100",
                  ].join(" ")}
                >
                  <Icon src={ScanIcon} />
                  <span>Scan</span>
                </button>

                {/* Download button -- red when there are failed images */}
                <button
                  onClick={handleDownload}
                  disabled={scanner.isProcessing}
                  className={[
                    "flex w-full items-center justify-center gap-2 p-4 border-2 rounded-sm transition-all",
                    scanner.isProcessing
                      ? "cursor-not-allowed opacity-30"
                      : scanner.failedCount > 0
                        ? "cursor-pointer border-red-500 text-red-500"
                        : "cursor-pointer opacity-100",
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

      {/* Export error overlay */}
      {scanner.exportError && (
        <ExportErrorOverlay
          errorMessage={scanner.exportError}
          onClose={scanner.clearExportError}
        />
      )}
    </div>
  );
}
