import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";

const buildId = readFileSync(".next/BUILD_ID", "utf-8").trim();

const modelBuffer = readFileSync("public/seg-model/seg_model.onnx");
const modelHash = createHash("sha256")
  .update(modelBuffer)
  .digest("hex")
  .slice(0, 12);

const template = readFileSync("sw.template.js", "utf-8");
const output = template
  .replaceAll("__APP_VERSION__", buildId)
  .replaceAll("__MODEL_VERSION__", modelHash);

writeFileSync("public/sw.js", output);
console.log(`sw.js generated - build: ${buildId}, model: ${modelHash}`);
