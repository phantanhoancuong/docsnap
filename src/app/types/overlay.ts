import { Point } from "@/app/types/image";

export type OverlayState =
  | { type: "none" }
  | { type: "camera"; mode: "capture" }
  | {
      type: "camera";
      mode: "retake";
      imageKey: string;
      imageIndex: number;
      corners: [Point, Point, Point, Point] | null;
    }
  | {
      type: "inspection";
      imageKey: string;
      imageUrl: string;
      scannedUrl: string | null;
      imageIndex: number;
      corners: [Point, Point, Point, Point] | null;
    }
  | {
      type: "crop";
      imageKey: string;
      imageUrl: string;
      corners: [Point, Point, Point, Point] | null;
    }
  | { type: "failedImages" }
  | { type: "exportError" };
