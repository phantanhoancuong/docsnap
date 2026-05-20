"use client";

import { useState } from "react";

import { Icon } from "@/app/components/server";

import { CloseIcon } from "@/app/assets/icons";

import { ExportOptions, PageOrientation, PageSize } from "@/app/types";

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
        className="relative flex flex-col gap-4 border-2 border-red rounded-sm p-6 w-80 max-w-full mx-4 bg-white dark:bg-black"
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
      <p className="text-sm font-medium text-red-500">
        {failedCount} {failedCount === 1 ? "image" : "images"} failed
      </p>

      <p className="text-sm opacity-60">
        Poor lighting or an obscured document are common causes. Remove failed
        images and rescan them.
      </p>
      <button
        className="w-full p-3 border-2 rounded-sm text-sm cursor-pointer"
        onClick={onClose}
      >
        Dismiss
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
      <p className="text-sm font-medium text-red-500">Export failed</p>
      <p className="text-sm opacity-60">{errorMessage}</p>
      <button
        className="w-full p-3 border-2 rounded-sm text-sm cursor-pointer"
        onClick={onClose}
      >
        Dismiss
      </button>
    </Modal>
  );
}

const defaultFileName = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `scan-${year}-${month}-${day}-${hours}-${minutes}`;
};

const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  a4: "A4",
  a3: "A3",
  letter: "Letter",
};

const ORIENTATION_LABELS: Record<PageOrientation, string> = {
  portrait: "Portrait",
  landscape: "Landscape",
};

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
    quality: 92,
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
          className="w-full p-2 border rounded-sm text-sm bg-transparent"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Orientation</span>
        <div className="flex gap-2">
          {(["portrait", "landscape"] as const).map((o) => (
            <button
              key={o}
              className={`flex flex-1 cursor-pointer rounded-sm text-sm bg-transparent p-2 border justify-center ${
                options.orientation === o
                  ? "border-foreground"
                  : "border-foreground/20"
              }`}
              onClick={() => setOptions({ ...options, orientation: o })}
            >
              {ORIENTATION_LABELS[o]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Page size</span>
        <div className="flex gap-2">
          {(["a4", "a3", "letter"] as const).map((s) => (
            <button
              key={s}
              className={`flex flex-1 cursor-pointer rounded-sm text-sm bg-transparent p-2 border justify-center ${
                options.pageSize === s
                  ? "border-foreground"
                  : "border-foreground/20"
              }`}
              onClick={() => setOptions({ ...options, pageSize: s })}
            >
              {PAGE_SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Quality — {options.quality}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={options.quality}
          onChange={(e) =>
            setOptions({ ...options, quality: Number(e.target.value) })
          }
          className="w-full accent-highlight"
        />
        <div className="flex justify-between">
          <span className="text-xs opacity-40">Smaller file</span>
          <span className="text-xs opacity-40">Better quality</span>
        </div>
      </div>

      <button
        className="w-full p-3 border-2 rounded-sm text-sm cursor-pointer"
        onClick={() => onExport(options)}
      >
        Download
      </button>
    </Modal>
  );
}
