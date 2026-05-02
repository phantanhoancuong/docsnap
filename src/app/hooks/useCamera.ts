import { useEffect, useRef } from "react";

/**
 * Hook for managing camera stream and photo capture.
 *
 * Responsibilities:
 *    - Request camera access with `getUserMedia()` for the back camera and ideally 4K resolution.
 *    - Attach the stream to a video element ref for live preview.
 *    - Wait for stream metadata before playing to avoid rendering at weird sizes.
 *    - Stop all tracks on unmount to release the camera hardware.
 *    - Capture a JPEG photo from the current video frame as a File.
 *
 * @returns videoRef - Ref to attach to the video element.
 * @returns takePhoto - Function to capture a photo from the current frame.
 */
export const useCamera = ({ isTorchOn }: { isTorchOn: boolean }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const isTorchOnRef = useRef(isTorchOn);

  const applyTorch = (value: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    if (!(track.getCapabilities() as any).torch) return;
    track.applyConstraints({ advanced: [{ torch: value } as any] });
  };

  useEffect(() => {
    isTorchOnRef.current = isTorchOn;
    applyTorch(isTorchOn);
  }, [isTorchOn]);

  /**
   * Request the camera stream and attach it to the video element.
   * Stop all tracks on unmount to release the camera hardware.
   */
  useEffect(() => {
    const start = async () => {
      try {
        if (!videoRef.current) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "environment",
            height: { ideal: 4096 },
            width: { ideal: 4096 },
          },
        });

        trackRef.current = stream.getVideoTracks()[0];
        videoRef.current.srcObject = stream;

        // Block until the browser has negotiated the stream resolution.
        await new Promise<void>((resolve) => {
          videoRef.current!.onloadedmetadata = () => resolve();
        });

        await videoRef.current.play();

        applyTorch(isTorchOnRef.current);
      } catch (err) {
        console.error("Camera access failed:", err);
      }
    };

    start();

    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  /**
   * Capture a photo from the current video frame.
   *
   * Draw the current frame onto an offscreen canvas sized to the stream resolution, then encode it as a JPEG File.
   *
   * @returns A promise resolving to a JPEG File named photo_{timestamp}.jpg.
   * @throws If the video element is not mounted or toBlob fails.
   */
  const capturePhoto = async (): Promise<File> => {
    if (!videoRef.current) throw new Error("No video element.");

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b
            ? resolve(
                new File([b], `photo_${Date.now()}.jpg`, {
                  type: "image/jpeg",
                }),
              )
            : reject(new Error("toBlob failed")),
        "image/jpeg",
        0.95,
      );
    });
  };

  return { videoRef, capturePhoto };
};
