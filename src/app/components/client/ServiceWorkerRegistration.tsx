"use client";

import { useEffect } from "react";

import { useLoading } from "@/app/hooks/useLoading";

/**
 * Register the service worker and wire up update detection.
 *
 * Behavior:
 *    - If already active with no update pending, mark ready immediately.
 *    - On first install, mark ready once the SW fully activates.
 *    - On update, reload to apply the new version.
 *    - Check for updates whenever the user returns to the app via visibility change.
 *    - Mark ready if registration fails or SW is unsupported so the UI is never blocked.
 */
const ServiceWorkerRegistration = () => {
  const { setSwReady } = useLoading();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setSwReady();
      return;
    }

    let cleanup: (() => void) | undefined;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (
          registration.active &&
          !registration.waiting &&
          !registration.installing
        ) {
          setSwReady();
        }

        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            registration.update();
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        cleanup = () =>
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
          );

        let isReloading = false;
        const reload = () => {
          if (isReloading) return;
          isReloading = true;
          window.location.reload();
        };

        navigator.serviceWorker.addEventListener("controllerchange", reload);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state !== "activated") return;
            if (navigator.serviceWorker.controller) {
              reload();
            } else {
              setSwReady();
            }
          });
        });
      })
      .catch(() => setSwReady());

    return () => cleanup?.();
  }, []);

  return null;
};

export default ServiceWorkerRegistration;
