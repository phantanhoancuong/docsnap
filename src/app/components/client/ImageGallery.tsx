"use client";

import React from "react";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { CloseIcon, HourglassIcon } from "@/app/assets/icons";
import { DocumentImage } from "@/app/types";
import { Icon } from "@/app/components/server";

/**
 * A draggable image card in the gallery.
 *
 * Memoized so it only re-renders when its own data changes, not when sibling cards update during processing.
 *
 * @param documentImage - `DocumentImage` containing status, URLs, rotation, and error state.
 * @param index - 0-based display position, shown as a 1-based page number badge.
 * @param isProcessing - When `true`, drag is disabled.
 * @param onRetry - Called with `documentImage.id` when the user retries a failed card.
 * @param onRemove - Called with `documentImage.id` when the user deletes the card.
 * @param onSelect - Called with `documentImage.id` when the user taps the card.
 */
const ImageCard = React.memo(
  function SortableImageCard({
    documentImage,
    index,
    isProcessing,
    onRetry,
    onRemove,
    onSelect,
  }: {
    documentImage: DocumentImage;
    index: number;
    isProcessing: boolean;
    onRetry: (imageId: string) => void;
    onRemove: (imageId: string) => void;
    onSelect: (imageId: string) => void;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: documentImage.id });

    const cardStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
      zIndex: isDragging ? 10 : undefined,
      touchAction: "none",
    };

    const imageStyle = {
      transform: `rotate(${documentImage.rotationStep * 90}deg)`,
    };

    const { status } = documentImage;

    return (
      <div
        ref={setNodeRef}
        style={cardStyle}
        className={`relative aspect-square ${
          isProcessing ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        }`}
        {...attributes}
        {...listeners}
      >
        {status === "notProcessed" && (
          <img
            src={documentImage.original.url}
            className="absolute inset-0 w-full h-full object-contain"
            style={imageStyle}
            onClick={() => {
              if (isDragging) return;
              onSelect(documentImage.id);
            }}
          />
        )}

        {status === "processing" && (
          <>
            <img
              className="absolute inset-0 w-full h-full object-contain opacity-25"
              src={documentImage.original.url}
              style={imageStyle}
            />
            <Icon
              src={HourglassIcon}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-8 animate-spin"
            />
          </>
        )}

        {status === "processed" && (
          <img
            src={documentImage.processed!.url}
            className="absolute inset-0 w-full h-full object-contain"
            style={imageStyle}
            onClick={() => {
              if (isDragging) return;
              onSelect(documentImage.id);
            }}
          />
        )}

        {status === "failed" && (
          <>
            <img
              className="absolute inset-0 w-full h-full object-contain opacity-25"
              src={documentImage.original.url}
              style={imageStyle}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
              <p className="text-xs text-red-500 text-center line-clamp-3">
                {documentImage.error ?? "Processing failed"}
              </p>
              <button
                className="text-xs border border-red-500 text-red-500 rounded-sm px-2 py-1 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(documentImage.id);
                }}
              >
                Retry
              </button>
            </div>
          </>
        )}

        {/* Page number badge */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs rounded-full px-2 py-0.5 pointer-events-none">
          {index + 1}
        </div>

        {/* Delete button */}
        <button
          className="absolute top-1 right-1 size-5 flex items-center justify-center bg-black/50 text-white rounded-full cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(documentImage.id);
          }}
        >
          <Icon src={CloseIcon} className="size-3" />
        </button>
      </div>
    );
  },

  // Only re-render when this card's data changes.
  (prev, next) =>
    prev.documentImage.id === next.documentImage.id &&
    prev.index === next.index &&
    prev.isProcessing === next.isProcessing &&
    prev.documentImage.status === next.documentImage.status &&
    prev.documentImage.error === next.documentImage.error &&
    prev.documentImage.rotationStep === next.documentImage.rotationStep &&
    prev.documentImage.original.url === next.documentImage.original.url &&
    prev.documentImage.processed?.url === next.documentImage.processed?.url &&
    prev.onRetry === next.onRetry &&
    prev.onRemove === next.onRemove,
);

/**
 * Responsive drag-to-reorder grid of `ImageCard`.
 *
 * Drag-to-reorder is blocked while `isProcessing` is true.
 *
 * @param imageIds - Ordered list of image IDs reflecting PDF page order.
 * @param imagesById - Map of `imageId` to `DocumentImage`. Should be always in sync with `imageIds`.
 * @param isProcessing - When `true`, drag-to-reorder is blocked.
 * @param onRetry - Called with `documentImage.id` when the user retries a failed image.
 * @param onRemove - Called with `documentImage.id` when the user deletes an image.
 * @param onReorder - Called with `activeId` and `overId` when the user drops a card.
 * @param onSelect - Called with `documentImage.id` when the user taps a card.
 */
export default function ImageGallery({
  imageIds,
  imagesById,
  isProcessing,
  onRetry,
  onRemove,
  onReorder,
  onSelect,
}: {
  imageIds: string[];
  imagesById: Map<string, DocumentImage>;
  isProcessing: boolean;
  onRetry: (imageId: string) => void;
  onRemove: (imageId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onSelect: (imageId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (isProcessing) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={imageIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 overflow-hidden">
          {imageIds.map((id, index) => (
            <ImageCard
              key={id}
              documentImage={imagesById.get(id)!}
              index={index}
              isProcessing={isProcessing}
              onRetry={onRetry}
              onRemove={onRemove}
              onSelect={onSelect}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
