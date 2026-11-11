// Person-matting engines. Every engine takes a frame canvas and returns a low-resolution
// alpha mask; GPU refinement and compositing happen in matte-gpu.js.
// All models are bundled locally; no camera frame leaves the computer.
(() => {
  const abs = file => new URL(file, document.baseURI).href;
  const HAS_F16 = typeof Float16Array === 'function';

  // Float -> IEEE half bits, only used when Float16Array is unavailable.
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  function toHalfBits(value) {
    f32[0] = value; const x = u32[0];
    const sign = (x >>> 16) & 0x8000, exp = ((x >>> 23) & 0xff) - 112, mant = x & 0x7fffff;
    if (exp <= 0) return sign;
    if (exp >= 31) return sign | 0x7c00;
    return sign | (exp << 10) | (mant >>> 13);
  }
  function halfBitsToFloat(h) {
    const exp = (h >> 10) & 0x1f, mant = h & 0x3ff, sign = h & 0x8000 ? -1 : 1;
    if (exp === 0) return sign * mant * 5.960464477539063e-8;
    if (exp === 31) return mant ? NaN : sign * Infinity;
    return sign * (1 + mant / 1024) * 2 ** (exp - 15);
  }
  const halfView = data => new Uint16Array(data.buffer, data.byteOffset, data.length);
  function toFloat32(data, type) {
    if (type !== 'half') return data;
    if (HAS_F16 && data instanceof Float16Array) return Float32Array.from(data);
    const bits = halfView(data), out = new Float32Array(bits.length);
    for (let i = 0; i < bits.length; i++) out[i] = halfBitsToFloat(bits[i]);
    return out;
  }

  function scratch(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
  }

  let ortConfigured = false;
  async function createSession(model, allowCpu, needsF16 = false) {
    if (!ortConfigured) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = abs('vendor/onnxruntime/');
      ort.env.webgpu.powerPreference = 'high-performance';
      ortConfigured = true;
    }
    let reason = 'WebGPU unavailable';
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter && (!needsF16 || adapter.features.has('shader-f16'))) {
        const session = await ort.InferenceSession.create(abs(model), { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
        return { session, backend: 'webgpu' };
      }
      reason = adapter ? 'GPU lacks FP16 shader support' : 'No GPU adapter';
    }
    // CPU inference is far too slow for live video; only automated tests enable it.
    if (!allowCpu) throw new Error(reason);
    const session = await ort.InferenceSession.create(abs(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { session, backend: 'wasm' };
  }

  // Robust Video Matting (GPL-3.0). Recurrent state gives temporal stability and
  // the predicted foreground colour removes background spill at the edges.
  // ONNX Runtime Web's WebGPU Conv computes some layers wrongly when the input channel
  // count is not a multiple of 4 (RVM's 171-channel decoder conv), which made the person
  // transparent. The bundled model is zero-padded by scripts/patch-rvm-model.py and is
  // mathematically identical to the official FP32 model.
  class RVMMatting {
    constructor({ allowCpu = false } = {}) { this.allowCpu = allowCpu; this.longSide = 960; this.rec = null; this.timings = []; this.badFrames = 0; this.frames = 0; }
    initialize() {
      this.ready ||= createSession('vendor/rvm/rvm_mobilenetv3_webgpu.onnx', this.allowCpu).then(({ session, backend }) => {
        this.session = session; this.backend = backend;
        if (backend === 'wasm') this.longSide = 384;
      });
      return this.ready;
    }
    reset() { this.disposeState(); this.timings = []; this.badFrames = 0; this.frames = 0; }
    disposeState() { if (this.rec) for (const t of this.rec) t.dispose?.(); this.rec = null; }
    async infer(frame) {
      await this.initialize();
      const scale = Math.min(1, this.longSide / Math.max(frame.width, frame.height));
      const width = Math.max(32, Math.round(frame.width * scale / 16) * 16);
      const height = Math.max(32, Math.round(frame.height * scale / 16) * 16);
      if (width !== this.width || height !== this.height) {
        this.disposeState();
        this.width = width; this.height = height;
        this.work = scratch(width, height);
        this.input = new Float32Array(3 * width * height);
      }
      const { ctx } = this.work;
      ctx.drawImage(frame, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data, count = width * height, input = this.input;
      for (let i = 0, p = 0; i < count; i++, p += 4) { input[i] = rgba[p] / 255; input[count + i] = rgba[p + 1] / 255; input[2 * count + i] = rgba[p + 2] / 255; }
      const zero = () => new ort.Tensor('float32', new Float32Array(1), [1, 1, 1, 1]);
      const rec = this.rec || [zero(), zero(), zero(), zero()];
      const feeds = {
        src: new ort.Tensor('float32', input, [1, 3, height, width]),
        r1i: rec[0], r2i: rec[1], r3i: rec[2], r4i: rec[3],
        // Keep the coarse pass near 480 px on the long side, as recommended for HD video.
        downsample_ratio: new ort.Tensor('float32', new Float32Array([Math.min(1, 480 / Math.max(width, height))]), [1])
      };
      const started = performance.now();
      let out;
      try { out = await this.session.run(feeds); }
      finally { feeds.src.dispose(); feeds.downsample_ratio.dispose(); }
      for (const t of rec) t.dispose?.();
      this.rec = [out.r1o, out.r2o, out.r3o, out.r4o];
      this.adapt(performance.now() - started);
      const stats = outputStats(out.pha.data, out.fgr.data);
      this.frames++;
      if (this.frames <= 3 || stats.nonFinite) this.lastStats = { ...stats, width, height, backend: this.backend };
      // Never show a silently broken matte: invalid output for several frames -> fall back.
      if (stats.nonFinite) {
        if (++this.badFrames >= 3) { out.pha.dispose(); out.fgr.dispose(); this.disposeState(); throw new Error(`RVM output invalid (${stats.nonFinite} non-finite samples)`); }
      } else this.badFrames = 0;
      return {
        matting: true,
        mask: { data: out.pha.data, type: 'float', width, height, rect: [0, 0, 1, 1] },
        fgr: { data: out.fgr.data, type: 'float', width, height },
        dispose() { out.pha.dispose(); out.fgr.dispose(); }
      };
    }
    // Drop to a lighter input size when the GPU cannot keep up with the camera.
    adapt(ms) {
      this.timings.push(ms);
      if (this.timings.length < 15) return;
      const sorted = [...this.timings].sort((a, b) => a - b), median = sorted[7];
      this.timings = [];
      if (median > 45 && this.longSide > 640) { this.longSide = 640; this.disposeState(); }
    }
    async close() {
      try { await this.ready; } catch {}
      this.disposeState();
      if (this.session) await this.session.release();
      this.session = null; this.ready = null;
    }
  }

  // Sampled sanity statistics of a model output (cheap: every 13th value).
  function outputStats(alpha, colour) {
    let nonFinite = 0, sum = 0, n = 0;
    for (let i = 0; i < alpha.length; i += 13) { const v = alpha[i]; if (!Number.isFinite(v)) nonFinite++; else { sum += v; n++; } }
    if (colour) for (let i = 0; i < colour.length; i += 13) if (!Number.isFinite(colour[i])) nonFinite++;
    return { nonFinite, alphaMean: n ? +(sum / n).toFixed(3) : null };
  }

  // PP-MattingV2 (Apache-2.0), FP16, fixed 512 x 512 input. Letterboxing keeps the
  // camera aspect ratio instead of squeezing a 16:9 frame into a square.
  class PPMatting {
    constructor({ allowCpu = false } = {}) {
      this.allowCpu = allowCpu;
      this.work = scratch(512, 512);
      this.input = new Float32Array(3 * 512 * 512);
    }
    initialize() {
      this.ready ||= createSession('vendor/ppmatting/ppmattingv2_fp16.onnx', this.allowCpu, true).then(({ session, backend }) => { this.session = session; this.backend = backend; });
      return this.ready;
    }
    reset() {}
    async infer(frame) {
      await this.initialize();
      const S = 512, fw = frame.width, fh = frame.height, scale = Math.min(S / fw, S / fh);
      const dw = Math.round(fw * scale), dh = Math.round(fh * scale), ox = (S - dw) >> 1, oy = (S - dh) >> 1;
      const { ctx } = this.work;
      ctx.drawImage(frame, ox, oy, dw, dh);
      // Replicate the outer rows/columns into the padding so the model sees no hard border.
      if (oy > 0) { ctx.drawImage(frame, 0, 0, fw, 1, ox, 0, dw, oy); ctx.drawImage(frame, 0, fh - 1, fw, 1, ox, oy + dh, dw, S - oy - dh); }
      if (ox > 0) { ctx.drawImage(frame, 0, 0, 1, fh, 0, oy, ox, dh); ctx.drawImage(frame, fw - 1, 0, 1, fh, ox + dw, oy, S - ox - dw, dh); }
      const rgba = ctx.getImageData(0, 0, S, S).data, count = S * S, input = this.input;
      for (let i = 0, p = 0; i < count; i++, p += 4) { input[i] = rgba[p] / 127.5 - 1; input[count + i] = rgba[p + 1] / 127.5 - 1; input[2 * count + i] = rgba[p + 2] / 127.5 - 1; }
      const tensor = new ort.Tensor('float32', input, [1, 3, S, S]);
      let out;
      try { out = await this.session.run({ [this.session.inputNames[0]]: tensor }); }
      finally { tensor.dispose(); }
      const alpha = out[this.session.outputNames[0]];
      this.lastStats = { ...outputStats(alpha.data), backend: this.backend };
      return {
        matting: true,
        mask: { data: alpha.data, type: 'float', width: S, height: S, rect: [ox / S, oy / S, (ox + dw) / S, (oy + dh) / S] },
        dispose() { alpha.dispose(); }
      };
    }
    async close() {
      try { await this.ready; } catch {}
      if (this.session) await this.session.release();
      this.session = null; this.ready = null;
    }
  }

  // MediaPipe Tasks Vision image segmenter (Apache-2.0).
  // quality: selfie multiclass (hair / skin / clothes); falls back to the general selfie model.
  // fast: landscape selfie model.
  class TasksSegmenter {
    constructor(kind) {
      this.kind = kind; this.lastTimestamp = 0;
      this.models = kind === 'quality'
        ? ['vendor/mediapipe/selfie_multiclass_256x256.tflite', 'vendor/mediapipe/selfie_segmentation.tflite']
        : ['vendor/mediapipe/selfie_segmentation_landscape.tflite'];
    }
    initialize() {
      this.ready ||= (async () => {
        const fileset = { wasmLoaderPath: abs('vendor/mediapipe/wasm/vision_wasm_internal.js'), wasmBinaryPath: abs('vendor/mediapipe/wasm/vision_wasm_internal.wasm') };
        let lastError;
        for (const model of this.models) for (const delegate of ['GPU', 'CPU']) {
          try {
            this.segmenter = await Vision.ImageSegmenter.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: abs(model), delegate },
              runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false
            });
            this.model = model.split('/').pop(); this.backend = delegate;
            return;
          } catch (error) { lastError = error; }
        }
        throw lastError;
      })();
      return this.ready;
    }
    reset() {}
    async infer(frame) {
      await this.initialize();
      // The models run at 256 px; a ~512 px input keeps mask read-back small.
      const scale = Math.min(1, 512 / Math.max(frame.width, frame.height));
      const width = Math.max(1, Math.round(frame.width * scale)), height = Math.max(1, Math.round(frame.height * scale));
      if (!this.work || this.work.canvas.width !== width || this.work.canvas.height !== height) {
        this.work = scratch(width, height);
        this.alpha = new Float32Array(width * height);
      }
      this.work.ctx.drawImage(frame, 0, 0, width, height);
      const timestamp = this.lastTimestamp = Math.max(this.lastTimestamp + 1, performance.now());
      const result = this.segmenter.segmentForVideo(this.work.canvas, timestamp);
      try {
        const masks = result.confidenceMasks || [];
        if (!masks.length) throw new Error('Segmenter returned no mask');
        const values = masks[0].getAsFloat32Array(), alpha = this.alpha;
        // Multiclass: mask 0 is "background", so person = 1 - background.
        if (masks.length > 1) for (let i = 0; i < alpha.length; i++) alpha[i] = 1 - values[i];
        else alpha.set(values);
        return { matting: false, mask: { data: alpha, type: 'float', width: masks[0].width, height: masks[0].height, rect: [0, 0, 1, 1] } };
      } finally { result.close(); }
    }
    async close() {
      try { await this.ready; } catch {}
      this.segmenter?.close();
      this.segmenter = null; this.ready = null;
    }
  }

  window.Matting = { RVMMatting, PPMatting, TasksSegmenter, toFloat32, halfView, outputStats, HAS_F16 };
})();
