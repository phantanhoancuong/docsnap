declare global {
  interface Window {
    cv: any;
  }
}

export type OpenCV = typeof window.cv;
export type CVMat = InstanceType<OpenCV["Mat"]>;
export type CVMatVector = InstanceType<OpenCV["MatVector"]>;
