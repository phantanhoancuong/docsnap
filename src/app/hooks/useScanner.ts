"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { arrayMove } from "@dnd-kit/sortable";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";

import { ImageEntry, ImageFile, ScanMode } from "@/app/types/image";

import { processImage } from "@/app/lib/pipeline";

import { useLatest, useProcessingQueue } from "@/app/hooks";

/**
 * Core scanner hook.
 *
 * Behavior:
 *    - Manage the image list, scan mode, processing pipeline, and PDF export.
 *    - Own and revoke all blob URLs created during the session.
 *    - Processing is delegated to `useProcessingQueue` which handles sequential processing, deduplication by `imageKey`,
 * and automatic re-processing when scan mode changes mid-flight.
 *    - Processing is triggered with `scanImages()` or `downloadPDF()`.
 *    - Switching scan mode while processing re-enqueues all images images under the new mode. Switching while idle just updates the mode.
 *
 * @returns Scanner state and controls.
 */
export const useScanner = () => {
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [images, setImages] = useState<Map<string, ImageEntry>>(new Map());
  const [scanMode, setScanMode] = useState<ScanMode>("bw");
  const [exportError, setExportError] = useState<string | null>(null);

  // Track blob URLs so we can revoke on unmount.
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Revoke blob URLs when unmounting.
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  /**
   * Load an image from a URL into an `HTMLImageElement`.
   *
   * @param url - The URL to load the image from.
   * @returns A promise resolving to the loaded `HTMLImageElement`.
   * @throws If the image fails to load.
   */
  const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      image.src = url;
    });

  /**
   * Process a single image entry through the ML pipeline.
   *
   * Behavior:
   *    - Mark the entry as `processing` before the run.
   *    - On success update it to `processed` with the result.
   *    - On failure mark it as `failed` with the error message.
   *
   * @param entry - The image entry to process.
   * @returns A promise resolving to the processed `ImageFile`.
   * @throws If `processImage` fails, after marking the entry as `failed`.
   */
  const processor = async (entry: ImageEntry): Promise<ImageFile> => {
    const { imageKey, scanMode: entryScanMode } = entry;

    setImages((prev) => {
      const updated = new Map(prev);
      updated.set(imageKey, {
        ...updated.get(imageKey)!,
        processPhase: "processing",
        errorMessage: undefined,
      });
      return updated;
    });

    try {
      const originalImage =
        imagesRef.current.get(imageKey)?.originalImage ?? entry.originalImage;
      const image = await loadImage(originalImage.url);
      const result = await processImage(originalImage, image, entryScanMode);

      setImages((prev) => {
        const updated = new Map(prev);
        updated.set(imageKey, {
          ...updated.get(imageKey)!,
          processedImage: result.processedImage,
          processPhase: "processed",
          scanMode: entryScanMode,
          errorMessage: undefined,
        });
        return updated;
      });

      return result.processedImage;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Processing failed";

      setImages((prev) => {
        const updated = new Map(prev);
        updated.set(imageKey, {
          ...updated.get(imageKey)!,
          processPhase: "failed",
          errorMessage,
        });
        return updated;
      });

      throw e;
    }
  };

  const { enqueue, cancel, isProcessing } = useProcessingQueue<
    ImageEntry,
    ImageFile
  >({ processor });

  const imagesRef = useLatest(images);
  const imageKeysRef = useLatest(imageKeys);

  /**
   * Return entries that need processing in the current display order.
   *
   * Include entries that are `notProcessed`, `failed` or processed under a different scan mode than `targetScanMode`.
   *
   * @param targetScanMode - The scan mode to check staleness against.
   * @returns Array of stale or unprocessed `ImageEntry` in display order.
   */
  const getStaleEntries = (targetScanMode: ScanMode): ImageEntry[] =>
    imageKeysRef.current
      .map((key) => imagesRef.current.get(key)!)
      .filter(
        (entry) =>
          entry &&
          (entry.processPhase === "notProcessed" ||
            entry.processPhase === "failed" ||
            (entry.processPhase === "processed" &&
              entry.scanMode !== targetScanMode)),
      );

  /**
   * Insert images from a file list.
   *
   * Behavior:
   *    - Create a blob URL for each image and add them to the image list with `processPhase` set to `notProcessed`.
   *
   * @param files - The file list of images to be inserted.
   */
  const insertImages = (files: File[]): void => {
    const newImageKeys: string[] = [];
    const newImageEntries: [string, ImageEntry][] = Array.from(files).map(
      (file) => {
        const imageKey = uuidv4();
        const blobUrl = URL.createObjectURL(file);
        blobUrlsRef.current.add(blobUrl);
        newImageKeys.push(imageKey);
        return [
          imageKey,
          {
            processPhase: "notProcessed",
            scanMode,
            imageKey,
            originalName: file.name,
            originalImage: { file, url: blobUrl },
          },
        ];
      },
    );

    setImageKeys((prev) => [...prev, ...newImageKeys]);
    setImages((prev) => {
      const updated = new Map(prev);
      newImageEntries.forEach(([key, entry]) => updated.set(key, entry));
      return updated;
    });
  };

  /**
   * Replace an existing image in-place with a new one, preserving its position in the list.
   *
   * Behavior:
   *    - Cancel any pending or in-flight processing for the old image.
   *    - Revoke the old image's blob URLs.
   *    - Insert the new image at the same index in `imageKeys`.
   *    - Reset the new entry to `notProcessed`.
   *
   * @param oldImageKey - The key of the image to replace.
   * @param file - The new image file to insert in its place.
   */
  const retakeImage = (oldImageKey: string, file: File) => {
    const oldImageKeyIndex = imageKeysRef.current.indexOf(oldImageKey);
    if (oldImageKeyIndex === -1) return;

    cancel(oldImageKey);

    const oldEntry = imagesRef.current.get(oldImageKey);
    if (oldEntry) {
      URL.revokeObjectURL(oldEntry.originalImage.url);
      blobUrlsRef.current.delete(oldEntry.originalImage.url);
      if (oldEntry.processedImage) {
        URL.revokeObjectURL(oldEntry.processedImage.url);
      }
    }

    const newImageKey = uuidv4();
    const blobUrl = URL.createObjectURL(file);
    blobUrlsRef.current.add(blobUrl);

    setImageKeys((prev) =>
      prev.map((key) => (key === oldImageKey ? newImageKey : key)),
    );

    setImages((prev) => {
      const updated = new Map(prev);
      updated.delete(oldImageKey);
      updated.set(newImageKey, {
        processPhase: "notProcessed",
        scanMode,
        imageKey: newImageKey,
        originalName: file.name,
        originalImage: { file, url: blobUrl },
      });
      return updated;
    });

    return { newImageKey, blobUrl };
  };

  /**
   * Enqueue all stale or unprocessed images in current display order.
   * Already processed images under the current mode are skipped.
   */
  const scanImages = (): void => {
    getStaleEntries(scanMode).forEach((entry) =>
      enqueue({ ...entry, scanMode }),
    );
  };

  /**
   * Re-enqueue a single failed image for processing under the current scan mode.
   *
   * Reset the entry phase to `notProcessed` before enqueuing so the UI immediately shows that the retry is pending.
   *
   * @param imageKey - The key of the failed image to retry.
   */
  const retryImage = useCallback(
    (imageKey: string): void => {
      const entry = imagesRef.current.get(imageKey);
      if (!entry || entry.processPhase !== "failed") return;

      setImages((prev) => {
        const updated = new Map(prev);
        updated.set(imageKey, {
          ...updated.get(imageKey)!,
          processPhase: "notProcessed",
          errorMessage: undefined,
        });
        return updated;
      });

      enqueue({ ...entry, scanMode });
    },
    [enqueue, scanMode, imagesRef],
  );

  /**
   * Remove an image.
   *
   * Behavior:
   *    - Remove the image from the image list.
   *    - Cancel any pending or in-flight processing.
   *    - Revoke its blob URLs.
   *
   * @param imageKey - The key of the image to remove.
   */
  const removeImage = useCallback(
    (imageKey: string): void => {
      cancel(imageKey);

      const entry = imagesRef.current.get(imageKey);
      if (entry) {
        URL.revokeObjectURL(entry.originalImage.url);
        blobUrlsRef.current.delete(entry.originalImage.url);
        if (entry.processedImage) {
          URL.revokeObjectURL(entry.processedImage.url);
        }
      }

      setImageKeys((prev) => prev.filter((key) => key !== imageKey));
      setImages((prev) => {
        const updated = new Map(prev);
        updated.delete(imageKey);
        return updated;
      });
    },
    [cancel, imagesRef],
  );

  /**
   * Reorder images after drag-and-drop.
   *
   * Behavior:
   *    - Move the item at `activeKey` to the position of `overKey`.
   *    - Update `imageKeys`, the images map and queue are unaffected.
   *    - Processing order on the next scan reflects the new display order.
   *
   * @param activeKey - The `imageKey` to the item being dragged.
   * @param overKey - The `imageKey` of the item it was dropped onto.
   */
  const reorderImages = useCallback(
    (activeKey: string, overKey: string): void => {
      if (activeKey === overKey) return;
      setImageKeys((prev) => {
        const oldIndex = prev.indexOf(activeKey);
        const newIndex = prev.indexOf(overKey);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [],
  );

  /**
   * Enqueue images and export PDF file for download.
   *
   * Behavior:
   *    - Enqueue all stale or unprocessed images in display order.
   *    - Wait for all promises to settle and export processed images to a PDF.
   *    - Trigger a browser download of that PDF.
   *    - Failed images are skipped in the export.
   *
   * @param fileName - The name of the downloaded PDF file. Defaults to "scan.pdf".
   * @returns A promise that resolves when the PDF has been saved.
   */
  const exportPDF = async (fileName: string = "scan.pdf"): Promise<void> => {
    const allEntries = imageKeysRef.current.map(
      (key) => imagesRef.current.get(key)!,
    );

    const results = await Promise.all(
      allEntries.map(async (entry) => {
        const stale =
          entry.processPhase === "notProcessed" ||
          entry.processPhase === "failed" ||
          (entry.processPhase === "processed" && entry.scanMode !== scanMode);

        if (stale) {
          const processedImage = await enqueue({ ...entry, scanMode }).catch(
            () => null,
          );
          return processedImage;
        }

        return entry.processedImage ?? null;
      }),
    );

    const validResults = results.filter(
      (result): result is ImageFile => result !== null,
    );

    if (validResults.length === 0) return;

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();

    try {
      const loadedImages = await Promise.all(
        validResults.map((processedImage) => loadImage(processedImage.url)),
      );

      loadedImages.forEach((image, index) => {
        const imageWidth = pageWidth;
        const imageHeight = (image.height / image.width) * pageWidth;
        if (index > 0) pdf.addPage();
        pdf.addImage(image, "JPEG", 0, 0, imageWidth, imageHeight);
      });

      pdf.save(fileName);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Failed to export PDF");
    }
  };

  /**
   * Clear the current PDF export error message.
   */
  const clearExportError = (): void => setExportError(null);

  const failedCount = Array.from(images.values()).filter(
    (entry) => entry.processPhase === "failed",
  ).length;

  return {
    imageKeys,
    images,
    scanMode,
    isProcessing,
    hasImages: imageKeys.length > 0,
    failedCount,
    exportError,
    clearExportError,
    insertImages,
    scanImages,
    setScanMode,
    retryImage,
    removeImage,
    reorderImages,
    retakeImage,
    exportPDF,
  };
};
