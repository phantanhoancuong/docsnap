"use client";

import { useEffect } from "react";

import { useLoading } from "@/app/hooks/useLoading";

/**
 * Register the service worker and wire up update detection.
 *
 * Behavior:
 *    - If a SW is already active with no update pending, mark ready immediately.
 *    - If a new SW is pending on load, keep the overlay up and reload once it activates.
 *    - On first install, mark ready once the SW fully activates.
 *    - Mid-session updates are ignored and applied on the next app open.
 *    - Mark ready if registration fails or SW is unsupported so the UI is never blocked.
 */
const ServiceWorkerRegistration = () => {
  const { setSwReady } = useLoading();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting || registration.installing) {
            const sw = registration.waiting ?? registration.installing!;
            sw.addEventListener("statechange", () => {
              if (sw.state === "activated") window.location.reload();
            });
          } else if (registration.active) {
            setSwReady();
          }

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            newWorker?.addEventListener("statechange", () => {
              if (
                newWorker.state === "activated" &&
                !navigator.serviceWorker.controller
              ) {
                setSwReady();
              }
            });
          });
        })
        .catch(() => setSwReady());
    } else {
      setSwReady();
    }
  }, []);

  return null;
};

export default ServiceWorkerRegistration;
