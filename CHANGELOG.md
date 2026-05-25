# Changelog

## [1.3.1] - 2026/05/26

### Fixed

## [1.3.1] - 2026/05/26

### Fixed

- App now checks for updates when returning to the tab or app, making updates more reliable on mobile PWA installs.

## [1.3.0] - 2026/05/26

### Improved

- Light and dark mode now look consistent and intentional across the entire app.
- Camera, inspection, and crop overlays always use a dark background for better document visibility.
- Document images in the inspection and crop overlays now have a border that wraps the actual image pixels.
- Export modal quality setting is now a slider with four named levels — Low, Medium, High, and Max.

## [1.3.0] - 2026/05/25

### Improved

- Light and dark mode now look more consistent and intentional.
- Camera, inspection, and crop overlays always use a dark background for better document visibility.
- Document images in the inspection and crop overlays now have a border that wraps the actual image pixels.
- Export modal quality setting is now a slider with four pre-defined levels instead of an integer value.

## [1.2.1] - 2026/05/21

### Added

- Privacy page covering on-device processing, data ethics, third-party services, and contact information. All image processing happens locally in your browser.

## [1.2.0] - 2026/05/20

### Added

- Export modal lets you customize page size (A4, A3, Letter), orientation (portrait, landscape), and image quality before downloading.
- Image quality slider controls JPEG compression (lower quality means smaller files, higher quality means larger files). Default to 92%.
- Images are now processed at full quality internally and compressed at export, so adjusting quality doesn't require re-processing..

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
