export type ImageAsset = { file: File; url: string };

export type Point = { x: number; y: number };

export type ScanMode = "bw" | "color";

export type ProcessingStatus =
  | "notProcessed"
  | "processing"
  | "processed"
  | "failed";

export type DocumentImage = {
  status: ProcessingStatus;
  id: string;
  scanMode: ScanMode;
  rotationStep: number;
  original: ImageAsset;
  processed?: ImageAsset;
  error?: string;
  corners?: QuadCorners;
};

export type QuadCorners = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

export type QuadPoints = [Point, Point, Point, Point];
