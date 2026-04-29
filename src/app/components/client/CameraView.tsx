"use client";

import { useEffect, useState } from "react";

import { useCamera } from "@/app/hooks/useCamera";

/**
 * Full-screen camera overlay for capturing photos.
 *
 * Render below the app header (top-20) and lock page scroll while mounted.
 * Delegate camera stream management to `useCamera`.
 *
 * Responsibilities:
 *    - Lock/unlock page scroll on mount/unmount.
 *    - Display the live camera feed.
 *    - Handle photo capture with a shutter flash effect.
 *    - Prevent double captures while a capture is in progress.
 */
const CameraView = ({ onCapture }: { onCapture: (files: File[]) => void }) => {
  const { videoRef, capturePhoto } = useCamera();

  // Lock page scroll while the overlay is open.
  // Even though the content doesn't change, scrolling can hide or unhide the browser banner or stretch the viewport on mobile.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // `shuttering` is true for ~150ms after a capture give user feedback on a photo capture.
  const [shuttering, setShuttering] = useState<boolean>(false);
  // `isCapturing` blocks the shutter button while `takePhoto()` is in flight.
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  /**
   * Trigger a brief shutter flash by showing a background-colored overlay over the video feed for 150ms.
   */
  const shutter = async () => {
    setShuttering(true);
    setTimeout(() => setShuttering(false), 150);
  };

  return (
    <div className="flex flex-col fixed inset-x-0 top-20 bottom-0 z-20 bg-background">
      {/* Video feed with shutter flash overlay */}
      <div className="relative flex flex-1 min-h-0 items-center w-full">
        <video
          className="w-full h-full object-contain"
          ref={videoRef}
          muted
          playsInline
        />

        {shuttering && <div className="absolute inset-0 bg-background z-20" />}
      </div>

      {/* Photo capture button */}
      <div className="flex justify-center shrink-0 py-4">
        <button
          disabled={isCapturing}
          className="w-20 h-20 rounded-full border-4 border-foreground bg-background active:bg-foreground/20 transition-colors disabled:opacity-50"
          onClick={async () => {
            if (isCapturing) return;
            setIsCapturing(true);
            try {
              const file = (await capturePhoto()) as File;
              await shutter();
              // Remember to pass as an array.
              onCapture([file]);
            } finally {
              setIsCapturing(false);
            }
          }}
        />
      </div>
    </div>
  );
};

export default CameraView;
