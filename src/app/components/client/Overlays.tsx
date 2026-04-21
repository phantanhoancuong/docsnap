"use client";

import { Icon } from "@/app/components/server";

import { CloseIcon } from "@/app/assets/icons";

/**
 * Base modal overlay. Clicking the backdrop or the close button dismisses it.
 *
 * @param onClose - Called when the overlay should be dismissed.
 * @param children - Content rendered inside the panel.
 */
export function Overlay({
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
export function FailedImagesOverlay({
  failedCount,
  onClose,
}: {
  failedCount: number;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
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
    </Overlay>
  );
}

/**
 * Shown when PDF export fails.
 *
 * @param errorMessage - The error message to display.
 * @param onClose - Called when the overlay should be dismissed.
 */
export function ExportErrorOverlay({
  errorMessage,
  onClose,
}: {
  errorMessage: string;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <p className="text-sm font-medium text-red-500">Export failed</p>
      <p className="text-sm opacity-60">{errorMessage}</p>
      <button
        className="w-full p-3 border-2 rounded-sm text-sm cursor-pointer"
        onClick={onClose}
      >
        Dismiss
      </button>
    </Overlay>
  );
}
