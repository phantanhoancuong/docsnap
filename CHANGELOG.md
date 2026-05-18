# Changelog

## [1.1.2] - 2026/05/17

### Improved

- B&W scans are now sharper and cleaner across a wider range of document types and phone cameras, particularly on lower resolution photos.

## [1.1.1] - 2026/05/17

- Corner dragging in `CropOverlay` now works correctly on mobile. React's `onTouchMovre` is passive by default so `preventDefault()` had no effect, causing the browser to intercept touch events with scroll and URL bar toggling. This was fixed by attaching a non passive `touchmove` listener through. This is applied to both `CropOverlay` and `InspectionOverlay`.

## [1.1.0] - 2026/05/17

### Added

- Rotate any image right from the inspection oveerlay. Rotation is stored per image and shown in the gallery, inspection overlay, and PDF export.
- Manually adjust crop corners through a full-screen overlay with a draggable SVG quad. On confirm the pipeline re-processed using the provided corners skipping ML inference.

## [1.0.3] - 2026/05/07

### Fixed

- Camera stream is now properly released when closing the overlay.

### Changed

- Torch and close controls moved into the camera overlay. The app header is now clean while the camera is open.

## [1.0.2] - 2026/05/07

### Fixed

- Loading overlay now stays visible during service worker updates instead of flashing before the page reloads.
- Mid-session service worker updates are no longer applied immediately; they are deferred to the next app open to avoid interrupting the user.

## [1.0.1] - 2026/05/06

### Performance

- Perspective correction now runs on the GPU and is ~2.5× faster with no
  random slowdowns. Falls back to CPU on devices without WebGL support.
- Black-and-white enhancement is ~35% faster by removing a redundant
  processing step on binary images.
- Overall processing time reduced from ~950ms to ~660ms per image.

## [1.0.0]

- Initial release
