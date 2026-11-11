// Copies the runtime files the renderer needs from node_modules into src/vendor.
// Only the SIMD builds are copied: every supported Electron release has WASM SIMD.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const modules = path.join(root, 'node_modules');

function copy(from, to, transform) {
  const source = path.join(modules, from), target = path.join(root, 'src/vendor', to);
  if (!fs.existsSync(source)) throw new Error(`Missing ${from}; run npm install first.`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (transform) fs.writeFileSync(target, transform(fs.readFileSync(source, 'utf8')));
  else fs.copyFileSync(source, target);
}

if (!fs.existsSync(modules)) {
  console.log('sync-vendor: node_modules not found, skipped.');
  process.exit(0);
}

for (const name of ['ort.webgpu.min.js', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  copy(`onnxruntime-web/dist/${name}`, `onnxruntime/${name}`);
}
// The IIFE bundle exposes window.Vision and works as a classic <script>.
copy('@mediapipe/tasks-vision/vision_bundle.js', 'mediapipe/vision_bundle.js',
  text => text.replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n'));
for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  copy(`@mediapipe/tasks-vision/wasm/${name}`, `mediapipe/wasm/${name}`);
}
console.log('sync-vendor: ONNX Runtime and MediaPipe Tasks files are up to date.');
