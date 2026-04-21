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
import { ImageEntry } from "@/app/types";
import { Icon } from "@/app/components/server";

/**
 * An image card.
 *
 * Behavior:
 *    - The card is draggable unless `isProcessing` is true.
 *    - Buttons inside stop propagation so licks are not mistaken for drag starts.
 *
 * Notes: Memoized so it only re-renders when its own entry changes, not when sibling cards update their state during processing.
 *
 * @param imageKey - Stable ID used as the DnD ID.
 * @param entry - `ImageEntry` containing phase, image URLs, and error state.
 * @param index - Position in display ordered.
 * @param onRetry - Called with `imageKey` when the user retries a failed card.
 * @param onRemove - Called with `imageKey` when the user deletes the card.
 */
const ImageCard = React.memo(
  function SortableImageCard({
    imageKey,
    entry,
    index,
    isProcessing,
    onRetry,
    onRemove,
  }: {
    imageKey: string;
    entry: ImageEntry;
    index: number;
    isProcessing: boolean;
    onRetry: (imageKey: string) => void;
    onRemove: (imageKey: string) => void;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: imageKey });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
      zIndex: isDragging ? 10 : undefined,
      touchAction: "none",
    };

    const { processPhase } = entry;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative ${
          isProcessing ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        }`}
        {...attributes}
        {...listeners}
      >
        {processPhase === "notProcessed" && (
          <img src={entry.originalImage.url} className="w-full" />
        )}

        {processPhase === "processing" && (
          <>
            <img className="opacity-25 w-full" src={entry.originalImage.url} />
            <Icon
              src={HourglassIcon}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-8 animate-spin"
            />
          </>
        )}

        {processPhase === "processed" && (
          <img src={entry.processedImage!.url} className="w-full" />
        )}

        {processPhase === "failed" && (
          <>
            <img className="opacity-25 w-full" src={entry.originalImage.url} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
              <p className="text-xs text-red-500 text-center line-clamp-3">
                {entry.errorMessage ?? "Processing failed"}
              </p>
              <button
                className="text-xs border border-red-500 text-red-500 rounded-sm px-2 py-1 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(imageKey);
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
            onRemove(imageKey);
          }}
        >
          <Icon src={CloseIcon} className="size-3" />
        </button>
      </div>
    );
  },
  // Only re-render when this card's data changes.
  (prev, next) =>
    prev.imageKey === next.imageKey &&
    prev.index === next.index &&
    prev.isProcessing === next.isProcessing &&
    prev.entry.processPhase === next.entry.processPhase &&
    prev.entry.errorMessage === next.entry.errorMessage &&
    prev.entry.originalImage.url === next.entry.originalImage.url &&
    prev.entry.processedImage?.url === next.entry.processedImage?.url &&
    prev.onRetry === next.onRetry &&
    prev.onRemove === next.onRemove,
);

/**
 * Responsive drag-to-reoder grid of image cards.
 *
 * Behavior:
 *    - Each card shows the current process phase, a page number badge, and a delete button.
 *    - The card is draggable for reordering when not processing.
 *
 * @param imageKeys - Ordered list of image keys reflecting PDF page order.
 * @param images - Map of `imageKey` to ImageEntry.
 * @param isProcessing - When true, drag-to-reorder is blocked.
 * @param onRetry - Called with the `imageKey` when the user retries a failed image.
 * @param onRemove - Called with the `imageKey` when the user deletes an image.
 * @param onReorder - Called with `activeKey` and `overKey` when the user drops a card.
 */
export default function ImageGallery({
  imageKeys,
  images,
  isProcessing,
  onRetry,
  onRemove,
  onReorder,
}: {
  imageKeys: string[];
  images: Map<string, ImageEntry>;
  isProcessing: boolean;
  onRetry: (imageKey: string) => void;
  onRemove: (imageKey: string) => void;
  onReorder: (activeKey: string, overKey: string) => void;
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
      <SortableContext items={imageKeys} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 overflow-hidden">
          {imageKeys.map((key, index) => (
            <ImageCard
              key={key}
              imageKey={key}
              entry={images.get(key)!}
              index={index}
              isProcessing={isProcessing}
              onRetry={onRetry}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
