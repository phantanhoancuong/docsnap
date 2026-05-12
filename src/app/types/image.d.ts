export type ImageFile = { file: File; url: string };

export type Point = { x: number; y: number };

export type ScanMode = "bw" | "color";

export type ProcessPhase =
  | "notProcessed"
  | "processing"
  | "processed"
  | "failed";

export type ImageEntry = {
  processPhase: ProcessPhase;
  imageKey: string;
  scanMode: ScanMode;
  originalName: string;
  originalImage: ImageFile;
  processedImage?: ImageFile;
  errorMessage?: string;
  corners?: [Point, Point, Point, Point];
};
