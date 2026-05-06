# Changelog

## [1.0.1] - 2026/05/06

### Performance

- Perspective correction now runs on the GPU and is ~2.5× faster with no
  random slowdowns. Falls back to CPU on devices without WebGL support.
- Black-and-white enhancement is ~35% faster by removing a redundant
  processing step on binary images.
- Overall processing time reduced from ~950ms to ~660ms per image.

## [1.0.0]

- Initial release
