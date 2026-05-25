"use client";

import { useState } from "react";

import { Icon } from "@/app/components/server";

import { CloseIcon, ErrorIcon } from "@/app/assets/icons";

import {
  EXPORT_QUALITY,
  ExportOptions,
  ExportQuality,
  PageOrientation,
  PageSize,
} from "@/app/types";

const QUALITY_KEYS = Object.keys(EXPORT_QUALITY) as ExportQuality[];

const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  a4: "A4",
  a3: "A3",
  letter: "Letter",
};

const ORIENTATION_LABELS: Record<PageOrientation, string> = {
  portrait: "Portrait",
  landscape: "Landscape",
};

const defaultFileName = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `scan-${year}-${month}-${day}-${hours}-${minutes}`;
};

/**
 * Base modal overlay. Clicking the backdrop or the close button dismisses it.
 *
 * @param onClose - Called when the overlay should be dismissed.
 * @param children - Content rendered inside the panel.
 */
export function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col gap-4 rounded-sm p-6 w-80 max-w-full mx-4 bg-background border-2 border-foreground/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          onClick={onClose}
        >
          <Icon src={CloseIcon} />
        </button>
        {children}
      </div>
    </div>
  );
}

/**
 * Shown when the user clicks Download but there are failed images.
 *
 * @param failedCount - Number of images currently in the failed phase.
 * @param onClose - Called when the overlay should be dismissed.
 */
export function FailedImagesModal({
  failedCount,
  onClose,
}: {
  failedCount: number;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-2">
        <Icon
          className="self-center text-primary-error size-10"
          src={ErrorIcon}
        />
        <p className="text-sm font-bold text-nowrap">
          {failedCount} {failedCount === 1 ? "image" : "images"} failed to scan
        </p>
      </div>
      <p className="text-sm text-foreground/60">
        Poor lighting or an obscured document are common causes. Remove failed
        images to export.
      </p>
      <button
        className="w-full p-3 border-2 border-primary bg-primary text-primary-foreground rounded-sm text-sm cursor-pointer"
        onClick={onClose}
      >
        OK
      </button>
    </Modal>
  );
}

/**
 * Shown when PDF export fails.
 *
 * @param errorMessage - The error message to display.
 * @param onClose - Called when the overlay should be dismissed.
 */
export function ExportErrorModal({
  errorMessage,
  onClose,
}: {
  errorMessage: string;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-2">
        <Icon
          className="self-center text-primary-error size-10"
          src={ErrorIcon}
        />
        <p className="text-sm font-bold">Export failed</p>
      </div>
      <p className="text-sm text-foreground/60">{errorMessage}</p>
      <button
        className="w-full p-3 border-2 border-primary bg-primary text-primary-foreground rounded-sm text-sm cursor-pointer"
        onClick={onClose}
      >
        OK
      </button>
    </Modal>
  );
}

/**
 * Shown before export to let the user customize output settings.
 *
 * @param onClose - Called when the overlay should be dismissed.
 * @param onExport - Called with the configured export options when the user confirms.
 */
export function ExportModal({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}) {
  const [options, setOptions] = useState<ExportOptions>({
    fileName: defaultFileName(),
    orientation: "portrait",
    pageSize: "a4",
    quality: "high",
  });

  return (
    <Modal onClose={onClose}>
      <p className="text-sm font-medium">Export</p>

      {/* File name */}
      <label className="flex flex-col gap-1">
        <span className="text-xs opacity-60">File name</span>
        <input
          type="text"
          value={options.fileName}
          onChange={(e) => setOptions({ ...options, fileName: e.target.value })}
          className="w-full p-2 border border-foreground/20 rounded-sm text-sm bg-transparent"
        />
      </label>

      {/* Orientation */}
      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Orientation</span>
        <div className="flex gap-2">
          {(["portrait", "landscape"] as const).map((o) => (
            <button
              key={o}
              className={`flex flex-1 cursor-pointer rounded-sm text-sm bg-transparent p-2 border justify-center ${
                options.orientation === o
                  ? "border-primary text-primary"
                  : "border-foreground/20 text-foreground/60"
              }`}
              onClick={() => setOptions({ ...options, orientation: o })}
            >
              {ORIENTATION_LABELS[o]}
            </button>
          ))}
        </div>
      </div>

      {/* Page size */}
      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Page size</span>
        <div className="flex gap-2">
          {(["a4", "a3", "letter"] as const).map((s) => (
            <button
              key={s}
              className={`flex flex-1 cursor-pointer rounded-sm text-sm bg-transparent p-2 border justify-center ${
                options.pageSize === s
                  ? "border-primary text-primary"
                  : "border-foreground/20 text-foreground/60"
              }`}
              onClick={() => setOptions({ ...options, pageSize: s })}
            >
              {PAGE_SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Quality */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-xs opacity-60">Quality</span>
          <span className="text-xs opacity-60">
            {EXPORT_QUALITY[options.quality].label}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={QUALITY_KEYS.length - 1}
          step={1}
          value={QUALITY_KEYS.indexOf(options.quality)}
          onChange={(e) =>
            setOptions({
              ...options,
              quality: QUALITY_KEYS[Number(e.target.value)],
            })
          }
          className="w-full accent-primary"
        />
        <div className="flex justify-between">
          {QUALITY_KEYS.map((q) => (
            <span key={q} className="text-xs opacity-40">
              {EXPORT_QUALITY[q].label}
            </span>
          ))}
        </div>
      </div>

      {/* Download */}
      <button
        className="w-full p-3 border-2 border-primary bg-primary text-primary-foreground rounded-sm text-sm cursor-pointer"
        onClick={() => {
          const normalizedFileName =
            (options.fileName.trim() || "scan").replace(/\.pdf$/i, "") + ".pdf";
          onExport({ ...options, fileName: normalizedFileName });
        }}
      >
        Download
      </button>
    </Modal>
  );
}
