"use client";

import { useEffect, useRef, useState } from "react";

import { arrayMove } from "@dnd-kit/sortable";
import { jsPDF } from "jspdf";
import { v4 as uuidv4 } from "uuid";

import {
  EXPORT_QUALITY,
  DocumentImage,
  ExportOptions,
  ImageAsset,
  QuadCorners,
  ScanMode,
} from "@/app/types";

import { processImage } from "@/app/lib/pipeline";

import { useLatest, useProcessingQueue } from "@/app/hooks";

/**
 * Core scanner hook.
 *
 * Behavior:
 *    - Manage the image list, scan mode, processing pipeline, and PDF export.
 *    - Own and revoke all blob URLs created during the session.
 *    - Processing is delegated to `useProcessingQueue` which handles sequential processing,
 *      deduplication by `id`, and automatic re-processing when scan mode changes mid-flight.
 *    - Images are enqueued automatically on insert.
 *    - Switching scan mode while idle re-enqueues all stale images via `scanImages`.
 *
 * @returns Scanner state and controls.
 */
export const useScanner = () => {
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [imagesById, setImagesById] = useState<Map<string, DocumentImage>>(
    new Map(),
  );
  const imagesByIdRef = useLatest(imagesById);
  const imageIdsRef = useLatest(imageIds);

  const [scanMode, setScanMode] = useState<ScanMode>("bw");
  const [exportError, setExportError] = useState<string | null>(null);

  // Track blob URLs so we can revoke on unmount.
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Revoke all tracked blob URLs when unmounting.
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  /**
   * Load an image from a URL into an `HTMLImageElement`.
   *
   * @param url - The URL to load.
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
   * Create a blob URL for a file and register it to `blobUrlsRef`.
   *
   * @param file - The file to create a blob URL for.
   * @returns The blob URL.
   */
  const createBlobUrl = (file: File): string => {
    const url = URL.createObjectURL(file);
    blobUrlsRef.current.add(url);
    return url;
  };

  /**
   * Create a new `DocumentImage` entry for a file, registering its blob URL.
   *
   * @param file - The image file to create an entry for.
   * @returns A new `DocumentImage` with `status: "notProcessed"`.
   */
  const createDocumentImage = (file: File): DocumentImage => ({
    status: "notProcessed",
    id: uuidv4(),
    scanMode,
    rotationStep: 0,
    original: { file, url: createBlobUrl(file) },
  });

  /**
   * Revoke all blob URLs for an image entry and remove them from tracking.
   *
   * @param entry - The entry whose URLs should be revoked.
   */
  const revokeImageUrls = (entry: DocumentImage): void => {
    URL.revokeObjectURL(entry.original.url);
    blobUrlsRef.current.delete(entry.original.url);
    if (entry.processed) {
      URL.revokeObjectURL(entry.processed.url);
      blobUrlsRef.current.delete(entry.processed.url);
    }
  };

  /**
   * Process a single image entry through the ML pipeline.
   *
   * If the entry has `corners` set, ML inference is skipped and those corners
   * are used directly for warping (crop path). Otherwise the full pipeline runs.
   *
   * Behavior:
   *    - Mark the entry as `processing` before the run.
   *    - On success update it to `processed` with the result and corners.
   *    - On failure mark it as `failed` with the error message.
   *
   * @param entry - The image entry to process.
   * @returns A promise resolving to the processed `ImageAsset`.
   * @throws If `processImage()` fails, after marking the entry as `failed`.
   */
  const processor = async (entry: DocumentImage): Promise<ImageAsset> => {
    setImagesById((prev) => {
      const updated = new Map(prev);
      updated.set(entry.id, {
        ...updated.get(entry.id)!,
        status: "processing",
        error: undefined,
      });
      return updated;
    });

    try {
      const original =
        imagesByIdRef.current.get(entry.id)?.original ?? entry.original;
      const imageElement = await loadImage(original.url);
      const mimeType = original.file.type || "image/jpeg";
      const fileName = original.file.name.replace(/(\.[^.]+)?$/, "_scanned$1");

      const { processedFile, quadCorners } = await processImage(
        imageElement,
        entry.scanMode,
        mimeType,
        fileName,
        entry.corners,
      );

      const processed: ImageAsset = {
        file: processedFile,
        url: createBlobUrl(processedFile),
      };

      setImagesById((prev) => {
        const updated = new Map(prev);
        updated.set(entry.id, {
          ...updated.get(entry.id)!,
          status: "processed",
          processed,
          corners: quadCorners,
          scanMode: entry.scanMode,
          error: undefined,
        });
        return updated;
      });

      return processed;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Processing failed";

      setImagesById((prev) => {
        const updated = new Map(prev);
        updated.set(entry.id, {
          ...updated.get(entry.id)!,
          status: "failed",
          error: errorMessage,
        });
        return updated;
      });

      throw error;
    }
  };

  const { enqueue, cancel, isProcessing } = useProcessingQueue<
    DocumentImage,
    ImageAsset
  >({ processor });

  /**
   * Return entries that need processing in the current display order.
   * Includes entries that are `notProcessed`, `failed`, or processed under a different scan mode.
   *
   * @param targetScanMode - The scan mode to check staleness against.
   * @returns Array of stale or unprocessed `DocumentImage` in display order.
   */
  const getStaleEntries = (targetScanMode: ScanMode): DocumentImage[] =>
    imageIdsRef.current
      .map((id) => imagesByIdRef.current.get(id)!)
      .filter(
        (entry) =>
          entry &&
          (entry.status === "notProcessed" ||
            entry.status === "failed" ||
            (entry.status === "processed" &&
              entry.scanMode !== targetScanMode)),
      );

  /**
   * Insert images from a file list and enqueue them for processing.
   *
   * @param files - The image files to insert.
   */
  const insertImages = (files: File[]): void => {
    const newEntries = Array.from(files).map(createDocumentImage);

    setImageIds((prev) => [...prev, ...newEntries.map((e) => e.id)]);
    setImagesById((prev) => {
      const updated = new Map(prev);
      newEntries.forEach((entry) => updated.set(entry.id, entry));
      return updated;
    });

    newEntries.forEach(enqueue);
  };

  /**
   * Replace an existing image in-place with a new one, preserving its position in the list.
   *
   * Behavior:
   *    - Cancel any pending or in-flight processing for the old image.
   *    - Revoke the old image's blob URLs.
   *    - Insert the new image at the same index and enqueue it for processing.
   *
   * @param oldId - The id of the image to replace.
   * @param file - The new image file.
   * @returns The new id and original URL, or `null` if `oldId` was not found.
   */
  const replaceImage = (
    oldId: string,
    file: File,
  ): { id: string; originalUrl: string; imageIndex: number } | null => {
    const index = imageIdsRef.current.indexOf(oldId);
    if (index === -1) return null;

    cancel(oldId);

    const oldEntry = imagesByIdRef.current.get(oldId);
    if (oldEntry) revokeImageUrls(oldEntry);

    const newEntry = createDocumentImage(file);

    setImageIds((prev) => {
      const updated = [...prev];
      updated[index] = newEntry.id;
      return updated;
    });

    setImagesById((prev) => {
      const updated = new Map(prev);
      updated.delete(oldId);
      updated.set(newEntry.id, newEntry);
      return updated;
    });

    enqueue(newEntry);

    return {
      id: newEntry.id,
      originalUrl: newEntry.original.url,
      imageIndex: index,
    };
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
   * Resets status to `notProcessed` so the UI reflects the pending retry immediately.
   *
   * @param id - The id of the failed image to retry.
   */
  const retryImage = (id: string): void => {
    const entry = imagesByIdRef.current.get(id);
    if (!entry || entry.status !== "failed") return;

    setImagesById((prev) => {
      const updated = new Map(prev);
      updated.set(id, {
        ...updated.get(id)!,
        status: "notProcessed",
        error: undefined,
      });
      return updated;
    });

    enqueue(entry);
  };

  /**
   * Remove an image, cancelling any pending processing and revoking its blob URLs.
   *
   * @param id - The id of the image to remove.
   */
  const removeImage = (id: string): void => {
    cancel(id);

    const entry = imagesByIdRef.current.get(id);
    if (entry) revokeImageUrls(entry);

    setImageIds((prev) => prev.filter((imageId) => imageId !== id));
    setImagesById((prev) => {
      const updated = new Map(prev);
      updated.delete(id);
      return updated;
    });
  };

  /**
   * Reorder images after drag-and-drop.
   * Only `imageIds` is updated — the map and queue are unaffected.
   *
   * @param activeId - The id of the item being dragged.
   * @param overId - The id of the item it was dropped onto.
   */
  const reorderImages = (activeId: string, overId: string): void => {
    if (activeId === overId) return;
    setImageIds((prev) => {
      const activeIndex = prev.indexOf(activeId);
      const overIndex = prev.indexOf(overId);
      if (activeIndex === -1 || overIndex === -1) return prev;
      return arrayMove(prev, activeIndex, overIndex);
    });
  };

  /**
   * Re-process an image with manually adjusted crop corners.
   * Skips ML inference and warps directly to the provided corners.
   * Enqueues immediately — processed image updates in the background.
   *
   * @param id - The id of the image to crop.
   * @param corners - The new crop corners in image space coordinates.
   */
  const cropImage = (id: string, corners: QuadCorners): void => {
    const documentImage = imagesByIdRef.current.get(id);
    if (!documentImage) return;

    const updatedDocumentImage: DocumentImage = {
      ...documentImage,
      corners,
      status: "notProcessed",
      processed: undefined,
      error: undefined,
    };

    setImagesById((prev) => {
      const updatedImages = new Map(prev);
      updatedImages.set(id, updatedDocumentImage);
      return updatedImages;
    });

    enqueue(updatedDocumentImage);
  };

  const rotateRightImage = (id: string): void => {
    const documentImage = imagesByIdRef.current.get(id);
    if (!documentImage) return;

    const updatedDocumentImage: DocumentImage = {
      ...documentImage,
      rotationStep: documentImage.rotationStep + 1,
    };

    setImagesById((prev) => {
      const updatedImages = new Map(prev);
      updatedImages.set(id, updatedDocumentImage);
      return updatedImages;
    });
  };

  /**
   * Rotate an image element by `degrees` clockwise onto a new canvas.
   * Swap canvas dimension for 90 and 270 degrees rotations.
   *
   * @param image - Source image element.
   * @param degrees - Clockwise rotation in degrees (90, 180, 270).
   * @returns Canvas with the rotated image drawn onto it.
   */
  const applyRotation = (
    image: HTMLImageElement,
    degrees: number,
  ): HTMLCanvasElement => {
    const isAxesSwapped = degrees === 90 || degrees === 270;
    const canvas = document.createElement("canvas");
    canvas.width = isAxesSwapped ? image.naturalHeight : image.naturalWidth;
    canvas.height = isAxesSwapped ? image.naturalWidth : image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((degrees * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    return canvas;
  };

  /**
   * Encode a canvas or image to a JPEG data URL at the given quality.
   *
   * @param source - Canvas or image element to encode.
   * @param quality - JPEG quality 0-1.
   * @returns Promise resolving to a data URL string.
   */
  const encodeToDataUrl = (
    source: HTMLImageElement | HTMLCanvasElement,
    quality: number,
  ): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const canvas =
        source instanceof HTMLCanvasElement
          ? source
          : (() => {
              const c = document.createElement("canvas");
              c.width = source.naturalWidth;
              c.height = source.naturalHeight;
              c.getContext("2d")!.drawImage(source, 0, 0);
              return c;
            })();

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("toBlob failed"));
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("FileReader failed"));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality,
      );
    });
  };

  /**
   * Export all processed images as a PDF file for download.
   *
   * Stale or unprocessed images are enqueued and awaited before export.
   * Failed iamges are skipped. Rotation is applied via canvas before encoding.
   * Each image is JPEG-encoded at the chosen quality before adding to the PDF.
   * Trigger a browser download of the resulting PDF.
   *
   * @param fileName - Downloaded file name. ".pdf" is appended automatically. Default to "scan".
   * @param orientation - Page orientation. Default to "portrait".
   * @param pageSize - Page size. Default to "a4".
   * @param quality - JPEG quality 0-100. Default to 92.
   */
  const exportPDF = async ({
    fileName = "scan",
    orientation = "portrait",
    pageSize = "a4",
    quality = "high",
  }: Partial<ExportOptions> = {}): Promise<void> => {
    const allDocumentImages = imageIdsRef.current.map(
      (id) => imagesByIdRef.current.get(id)!,
    );

    const pairs = await Promise.all(
      allDocumentImages.map(async (documentImage) => {
        const isStale =
          documentImage.status === "notProcessed" ||
          documentImage.status === "failed" ||
          (documentImage.status === "processed" &&
            documentImage.scanMode !== scanMode);

        const asset = isStale
          ? await enqueue({ ...documentImage, scanMode }).catch(() => null)
          : (documentImage.processed ?? null);

        return asset ? { documentImage, asset } : null;
      }),
    );

    const validPairs = pairs.filter(
      (pair): pair is { documentImage: DocumentImage; asset: ImageAsset } =>
        pair !== null,
    );

    if (validPairs.length === 0) return;

    const pdf = new jsPDF({ orientation, unit: "mm", format: pageSize });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const jpegQuality = EXPORT_QUALITY[quality].value / 100;
    const normalizedFileName =
      (fileName.trim() || "scan").replace(/\.pdf$/i, "") + ".pdf";
    try {
      const loadedImages = await Promise.all(
        validPairs.map(({ asset }) => loadImage(asset.url)),
      );

      for (let index = 0; index < validPairs.length; ++index) {
        const image = loadedImages[index];
        const { documentImage } = validPairs[index];

        const degrees = (((documentImage.rotationStep % 4) + 4) % 4) * 90;
        const source = degrees !== 0 ? applyRotation(image, degrees) : image;

        const dataUrl = await encodeToDataUrl(source, jpegQuality);

        const imageHeight = (source.height / source.width) * pageWidth;
        if (index > 0) pdf.addPage();
        pdf.addImage(dataUrl, "JPEG", 0, 0, pageWidth, imageHeight);
      }

      pdf.save(normalizedFileName);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Failed to export PDF",
      );
    }
  };

  /** Clear the current PDF export error message. */
  const clearExportError = (): void => setExportError(null);

  const failedCount = Array.from(imagesById.values()).filter(
    (entry) => entry.status === "failed",
  ).length;

  return {
    exportError,
    failedCount,
    hasImages: imageIds.length > 0,
    imageIds,
    imagesById,
    isProcessing,
    scanMode,
    insertImages,
    removeImage,
    reorderImages,
    replaceImage,
    retryImage,
    cropImage,
    rotateRightImage,
    scanImages,
    setScanMode,
    clearExportError,
    exportPDF,
  };
};
