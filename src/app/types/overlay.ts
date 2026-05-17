export type OverlayState =
  | { type: "none" }
  | { type: "camera"; mode: "capture" }
  | { type: "camera"; mode: "retake"; imageId: string }
  | { type: "inspection"; imageId: string; imageIndex: number }
  | { type: "crop"; imageId: string }
  | { type: "failedImages" }
  | { type: "exportError" };
