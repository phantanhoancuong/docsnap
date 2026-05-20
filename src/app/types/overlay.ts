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

export type ExportOptions = {
  fileName: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  quality: number;
};
