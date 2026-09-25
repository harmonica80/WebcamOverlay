// Fixed-shape PP-MattingV2. All assets stay local; no camera frames leave the app.
class PPMatting {
  constructor() {
    this.input = document.createElement('canvas'); this.input.width = this.input.height = 512;
    this.snapshot = document.createElement('canvas');
    this.mask = document.createElement('canvas'); this.mask.width = this.mask.height = 512;
    this.rgb = this.input.getContext('2d', { willReadFrequently: true });
    this.mc = this.mask.getContext('2d');
    this.pixels = this.mc.createImageData(512, 512);
    this.data = new Float32Array(3 * 512 * 512);
  }
  async initialize() {
    if (!this.ready) this.ready = (async () => {
      if (!navigator.gpu) throw new Error('WebGPU unavailable');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = new URL('vendor/onnxruntime/', document.baseURI).href;
      ort.env.webgpu.powerPreference = 'high-performance';
      this.session = await ort.InferenceSession.create('vendor/ppmatting/ppmattingv2.onnx', {
        executionProviders: ['webgpu'], graphOptimizationLevel: 'all'
      });
    })();
    return this.ready;
  }
  async send(image) {
    await this.initialize();
    const width = image.videoWidth || image.width, height = image.videoHeight || image.height;
    if (!width || !height) throw new Error('Camera frame not ready');
    // Capture once so the image and alpha belong to the same frame even during inference.
    if (this.snapshot.width !== width || this.snapshot.height !== height) {
      this.snapshot.width = width; this.snapshot.height = height;
    }
    this.snapshot.getContext('2d').drawImage(image, 0, 0, width, height);
    this.rgb.drawImage(this.snapshot, 0, 0, 512, 512);
    const rgba = this.rgb.getImageData(0, 0, 512, 512).data, count = 512 * 512;
    for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) this.data[c * count + i] = rgba[i * 4 + c] / 127.5 - 1;
    const tensor = new ort.Tensor('float32', this.data, [1, 3, 512, 512]);
    let outputs;
    try {
      outputs = await this.session.run({ [this.session.inputNames[0]]: tensor });
      const alpha = outputs[this.session.outputNames[0]].data;
      for (let i = 0; i < count; i++) {
        this.pixels.data[i * 4] = this.pixels.data[i * 4 + 1] = this.pixels.data[i * 4 + 2] = 255;
        this.pixels.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, alpha[i])) * 255);
      }
      this.mc.putImageData(this.pixels, 0, 0);
      return { image: this.snapshot, segmentationMask: this.mask, advanced: true };
    } finally {
      tensor.dispose();
      if (outputs) for (const output of Object.values(outputs)) output.dispose();
    }
  }
  async close() {
    try { await this.ready; } catch {}
    if (this.session) await this.session.release();
    this.session = null; this.ready = null;
  }
}
