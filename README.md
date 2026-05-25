# docsnap

**docsnap** is a document scanner that runs entirely in the browser. Upload photos of documents and export them as clean scan, all processed in the browser with no server uploads.

Try it now at:
https://docsnap-hoancuong.vercel.app

You can even install it as a PWA on mobile and desktop, it works offline after first load.

---

## ML model

Document segmentation is handled by a custom model trained for the task.

### Architecture

- **Encoder**: MobileNetV4-Conv-Small, chosen for its efficiency on constrained hardware. Produces multi-scale feature maps used by the decoder.
- **Decoder**: U-Net style decoder with skip connections from the encoder. Upsamples the feature maps back to the input resolution and produces a per-pixel segmentation mask.
- **Output**: A single-channel binary mask indicating document versus background.

### Export and Runtime:

- The model is exported to ONNX format for portability.
- Inference runs entirely in the browser through `onnxruntime-web`, using WebAssembly or WebGPU depending on what the browser supports.
- No native dependencies or server-side compute required.

### Post-processing Pipeline:

After the model produces a segmentation mask, a series of image processing steps run to produce the final scan:

1. Mask-to-quad conversion: The mask boundary is simplified to a four-corner polygon representing the document corners.
2. Perspective warp: The quad is used to compute a homography, and the image is warped to a flat rectangular view.
3. Enhancement: Contrast, brightness, and sharpness adjustments are applied to improve readability.
4. Export: Images are encoded at the chosen quality and assembled into a PDF with jsPDF.

---

## Future Improvement Considerations:

- Improve model robustness on low-light or cluttered backgrounds.
- Explore lighter architectures for faster inference on low-end devices.
- Additional enhancement filters.
- Accessibility improvements.

These are exploratory and may or may not be implemented in the future.

---

## Feedback

If you have feedback, suggestions, or ideas then feel free to open an issue or reach out at:
phantanhoancuong@gmail.com

---

## Acknowledgements:

- **Training library**: [timm (PyTorch Image Models)](https://github.com/huggingface/pytorch-image-models) by Ross Wightman, used for the MobileNetV4-Conv-Small encoder backbone.
- **Training dataset**: [Doc3D](https://github.com/cvlab-stonybrook/doc3d-dataset) by Das et al. Used for training of the document segmentation model.

```
Das, S., Ma, K., Shen, Z., Shao, L., and Chellappa, R.
Document Rectification and Illumination Correction using a Patch-based CNN.
ACM Transactions on Graphics, 2019.
```
