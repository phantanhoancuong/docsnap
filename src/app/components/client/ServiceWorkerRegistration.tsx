"use client";

import { useEffect } from "react";

import { useLoading } from "@/app/hooks/useLoading";

/**
 * Register the service worker and wire up update detection.
 *
 * Behavior:
 *    - Mark the service worker as ready once registered.
 *    - Reload when a new service worker activates.
 *    - Mark the service worker as ready even if registration fails or is unsupported so the UI is never blocked.
 */
const ServiceWorkerRegistration = () => {
  const { setSwReady } = useLoading();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          setSwReady();

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            newWorker?.addEventListener("statechange", () => {
              if (
                newWorker.state === "activated" &&
                navigator.serviceWorker.controller
              ) {
                window.location.reload();
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
