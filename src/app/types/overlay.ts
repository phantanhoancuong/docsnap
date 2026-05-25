export type OverlayState =
  | { type: "none" }
  | { type: "camera"; mode: "capture" }
  | { type: "camera"; mode: "retake"; imageId: string }
  | { type: "inspection"; imageId: string; imageIndex: number }
  | { type: "crop"; imageId: string }
  | { type: "failedImages" }
  | { type: "exportError" }
  | { type: "export" };

export type PageSize = "a4" | "a3" | "letter";
export type PageOrientation = "portrait" | "landscape";

export const EXPORT_QUALITY = {
  low: { label: "Low", value: 60 },
  medium: { label: "Medium", value: 80 },
  high: { label: "High", value: 92 },
  max: { label: "Max", value: 100 },
};

export type ExportQuality = keyof typeof EXPORT_QUALITY;

export type ExportOptions = {
  fileName: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  quality: ExportQuality;
};
