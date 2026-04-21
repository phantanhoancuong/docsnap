import { PATH_TO_OPENCV } from "@/app/lib/opencv";

let cvReady: Promise<any> | null = null;

/**
 * Load OpenCV.js and its WASM binary from `PATH_TO_OPENCV` and return a promise that resolves with the initialized cv instance.
 * Subsequent calls return the same promise so the script is only ever loaded once.
 *
 * The following files are expected to be in `PATH_TO_OPEN`:
 *   - opencv_js.js
 *   - opencv_js.wasm
 *
 * Reject if:
 *   - The script fails to load.
 *   - The cv factory is not found on window after load.
 *   - The factory rejects.
 *   - The operation exceeds timeout.
 */
export const loadOpenCV = (): Promise<any> => {
  if (cvReady) return cvReady;

  // If OpenCV was already loaded, reuse the instance.
  const existingCv = (window as any).cv;
  if (existingCv && typeof existingCv !== "function") {
    cvReady = Promise.resolve(existingCv);
    return cvReady;
  }

  cvReady = new Promise((resolve, reject) => {
    // Guard flag so a late-resolving factory does not overwrite state after the timeout has already fired and cleared cvReady.
    let isCancelled = false;

    const script = document.createElement("script");
    script.src = PATH_TO_OPENCV;
    script.async = true;

    const cleanup = (removeScript: boolean) => {
      if (removeScript && document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };

    const timeout = setTimeout(() => {
      isCancelled = true;
      cleanup(true);
      cvReady = null;
      reject(
        new Error(
          "OpenCV load timed out -- check that opencv_js.js and opencv_js.wasm are in /public/opencv/",
        ),
      );
    }, 30000);

    script.onload = () => {
      const cvFactory = (window as any).cv;
      if (typeof cvFactory !== "function") {
        clearTimeout(timeout);
        cleanup(true);
        cvReady = null;
        reject(new Error("cv factory not found on window after script load"));
        return;
      }

      cvFactory({ locateFile: (file: string) => `/opencv/${file}` })
        .then((cvInstance: any) => {
          clearTimeout(timeout);

          // Discard the result if the timeout already fired.
          if (isCancelled) return;

          (window as any).cv = cvInstance;
          resolve(cvInstance);
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          if (isCancelled) return;
          cleanup(true);
          cvReady = null;
          reject(error);
        });
    };

    script.onerror = () => {
      clearTimeout(timeout);
      cleanup(true);
      cvReady = null;
      reject(
        new Error(
          `Failed to load opencv_js.js -- check that the file exists in ${PATH_TO_OPENCV},`,
        ),
      );
    };

    document.head.appendChild(script);
  });

  return cvReady;
};
