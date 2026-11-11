// Downloads model files that are not kept in the repository and verifies their SHA-256.
// Usage: node scripts/fetch-models.js [--optional]
// --optional: report failures without a non-zero exit code (used by npm postinstall).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const optional = process.argv.includes('--optional');

const models = [{
  file: 'src/vendor/mediapipe/selfie_multiclass_256x256.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  sha256: 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0'
}];

const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

async function ensure(model) {
  const target = path.join(root, model.file);
  if (fs.existsSync(target) && hash(fs.readFileSync(target)) === model.sha256) return 'present';
  const response = await fetch(model.url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${model.url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (hash(buffer) !== model.sha256) throw new Error(`Checksum mismatch for ${model.file}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  return 'downloaded';
}

(async () => {
  let failed = false;
  for (const model of models) {
    try { console.log(`fetch-models: ${model.file} ${await ensure(model)}`); }
    catch (error) { failed = true; console.error(`fetch-models: ${model.file} failed: ${error.message}`); }
  }
  if (failed && !optional) process.exit(1);
  if (failed) console.error('fetch-models: the quality mode will use the general selfie model until this file is available.');
})();
