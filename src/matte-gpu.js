// Turns a low-resolution mask into a full-resolution matte on the GPU and outputs the
// premultiplied foreground. Steps per frame:
//  1. joint bilateral upsampling guided by the camera frame (edges follow real colour edges),
//  2. contour / softness controls,
//  3. motion-aware temporal smoothing against the previous matte (anti-flicker),
//  4. optional RVM foreground colour in semi-transparent pixels (removes background spill).
// CpuMatte is a fallback for machines without WebGL2.
(() => {
  const VERTEX = `#version 300 es
  void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

  const REFINE = `#version 300 es
  precision highp float;
  uniform sampler2D uFrame, uPrevFrame, uMask, uPrevAlpha;
  uniform vec2 uOutSize, uMaskSize;
  uniform vec4 uMaskRect;
  uniform float uGuideLod, uRangeSigma, uShrink, uSoft, uHistory;
  uniform int uSegmentation, uHasHistory;
  out vec4 outColor;
  void main(){
    vec2 uv = gl_FragCoord.xy / uOutSize;               // image space, y = 0 is the top row
    vec3 c = texture(uFrame, uv).rgb;
    vec2 mt = mix(uMaskRect.xy, uMaskRect.zw, uv) * uMaskSize - 0.5;
    vec2 base = floor(mt), f = mt - base;
    float sum = 0.0, weights = 0.0, inv = 1.0 / (2.0 * uRangeSigma * uRangeSigma);
    for (int j = -1; j <= 2; j++) for (int i = -1; i <= 2; i++) {
      vec2 cell = base + vec2(i, j), d = vec2(i, j) - f;
      vec2 muv = (cell + 0.5) / uMaskSize;
      vec2 fuv = clamp((muv - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy), 0.0, 1.0);
      vec3 g = textureLod(uFrame, fuv, uGuideLod).rgb - c;
      float spatial = exp(-dot(d, d) * 0.7);
      float w = spatial * (exp(-dot(g, g) * inv) + 0.002);
      float m = texture(uMask, muv).r;
      if (isnan(m) || isinf(m)) m = 0.0;
      sum += clamp(m, 0.0, 1.0) * w; weights += w;
    }
    float a = clamp(sum / max(weights, 1e-6), 0.0, 1.0);
    if (uSegmentation == 1) { float lo = 0.5 + uShrink - uSoft * 0.5; a = smoothstep(lo, lo + uSoft, a); }
    else a = clamp((a - uShrink) / max(1.0 - uShrink, 1e-3), 0.0, 1.0);
    if (uHasHistory == 1) {
      float previous = texture(uPrevAlpha, uv).r;
      vec3 pc = texture(uPrevFrame, uv).rgb;
      float colourChange = (abs(c.r - pc.r) + abs(c.g - pc.g) + abs(c.b - pc.b)) * 85.0 / 24.0;
      float motion = max(min(1.0, colourChange), min(1.0, abs(a - previous) / 0.22));
      a = mix(a, previous, uHistory * (1.0 - motion));
    }
    outColor = vec4(a, a, a, a);
  }`;

  const COMPOSE = `#version 300 es
  precision highp float;
  uniform sampler2D uFrame, uAlpha, uFgr;
  uniform vec2 uOutSize;
  uniform int uUseFgr;
  out vec4 outColor;
  void main(){
    vec2 uv = vec2(gl_FragCoord.x / uOutSize.x, 1.0 - gl_FragCoord.y / uOutSize.y);
    float a = texture(uAlpha, uv).r;
    vec3 colour = texture(uFrame, uv).rgb;
    if (uUseFgr == 1) {
      float y = uv.y / 3.0;
      vec3 fg = vec3(texture(uFgr, vec2(uv.x, y)).r, texture(uFgr, vec2(uv.x, y + 1.0 / 3.0)).r, texture(uFgr, vec2(uv.x, y + 2.0 / 3.0)).r);
      // Invalid model colour must never blank the picture: keep the camera colour instead.
      if (!any(isnan(fg)) && !any(isinf(fg))) colour = mix(clamp(fg, 0.0, 1.0), colour, smoothstep(0.6, 1.0, a));
    }
    outColor = vec4(colour * a, a);
  }`;

  class GpuMatte {
    constructor() {
      this.canvas = document.createElement('canvas');
      const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.gl = gl;
      this.refine = this.program(REFINE); this.compose = this.program(COMPOSE);
      this.vao = gl.createVertexArray();
      this.frames = [this.texture(true), this.texture(true)];
      this.mask = this.texture(); this.fgr = this.texture();
      this.alphas = [this.texture(), this.texture()];
      this.fbos = this.alphas.map(t => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.width = 0; this.height = 0; this.current = 0; this.hasHistory = false;
      this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    }
    program(source) {
      const gl = this.gl, p = gl.createProgram();
      for (const [type, text] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, source]]) {
        const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const uniforms = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) { const name = gl.getActiveUniform(p, i).name; uniforms[name] = gl.getUniformLocation(p, name); }
      return { p, u: uniforms };
    }
    texture(mipmap = false) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    reset() { this.hasHistory = false; }
    uploadPlane(texture, { data, type, width, height }, rows = 1) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (type === 'half') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, width, height * rows, 0, gl.RED, gl.HALF_FLOAT, Matting.halfView(data));
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, width, height * rows, 0, gl.RED, gl.FLOAT, data instanceof Float32Array ? data : Float32Array.from(data));
    }
    render(frame, inference, { segmentation, shrink, soft, history }) {
      const gl = this.gl;
      if (this.lost || gl.isContextLost()) throw new Error('WebGL context lost');
      const width = frame.width, height = frame.height;
      if (width !== this.width || height !== this.height) {
        this.width = width; this.height = height; this.canvas.width = width; this.canvas.height = height;
        for (const t of this.alphas) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
        this.hasHistory = false;
      }
      // Ping-pong: the previous frame and matte stay available for the temporal filter.
      const next = 1 - this.current;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.frames[next]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      gl.generateMipmap(gl.TEXTURE_2D);
      const mask = inference.mask;
      this.uploadPlane(this.mask, mask);
      const useFgr = !!inference.fgr;
      if (useFgr) this.uploadPlane(this.fgr, inference.fgr, 3);

      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      const r = this.refine, rect = mask.rect;
      gl.useProgram(r.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[next]);
      gl.viewport(0, 0, width, height);
      this.bind(r, 'uFrame', 0, this.frames[next]); this.bind(r, 'uPrevFrame', 1, this.frames[this.current]);
      this.bind(r, 'uMask', 2, this.mask); this.bind(r, 'uPrevAlpha', 3, this.alphas[this.current]);
      gl.uniform2f(r.u.uOutSize, width, height);
      gl.uniform2f(r.u.uMaskSize, mask.width, mask.height);
      gl.uniform4f(r.u.uMaskRect, rect[0], rect[1], rect[2], rect[3]);
      const maskPixelsAcross = mask.width * (rect[2] - rect[0]);
      gl.uniform1f(r.u.uGuideLod, Math.max(0, Math.log2(width / maskPixelsAcross)));
      gl.uniform1f(r.u.uRangeSigma, segmentation ? 0.08 : 0.16);
      gl.uniform1f(r.u.uShrink, shrink); gl.uniform1f(r.u.uSoft, soft); gl.uniform1f(r.u.uHistory, history);
      gl.uniform1i(r.u.uSegmentation, segmentation ? 1 : 0);
      gl.uniform1i(r.u.uHasHistory, this.hasHistory ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const c = this.compose;
      gl.useProgram(c.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      this.bind(c, 'uFrame', 0, this.frames[next]); this.bind(c, 'uAlpha', 1, this.alphas[next]); this.bind(c, 'uFgr', 2, this.fgr);
      gl.uniform2f(c.u.uOutSize, width, height);
      gl.uniform1i(c.u.uUseFgr, useFgr ? 1 : 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.current = next; this.hasHistory = true;
      return this.canvas;
    }
    bind(program, name, unit, texture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(program.u[name], unit);
    }
    dispose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  }

  // CPU fallback: same inputs, uses MatteRefiner for segmentation masks.
  class CpuMatte {
    constructor() {
      this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d');
      this.maskCanvas = document.createElement('canvas'); this.mc = this.maskCanvas.getContext('2d', { willReadFrequently: true });
      this.guide = document.createElement('canvas'); this.gc = this.guide.getContext('2d', { willReadFrequently: true });
      this.refiner = new MatteRefiner();
    }
    reset() { this.refiner.reset(); }
    render(frame, inference, { segmentation, edge, feather, stability }) {
      const { width: mw, height: mh, rect } = inference.mask, values = Matting.toFloat32(inference.mask.data, inference.mask.type);
      if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) { this.maskCanvas.width = mw; this.maskCanvas.height = mh; }
      const image = this.mc.createImageData(mw, mh);
      for (let i = 0; i < values.length; i++) { const p = i * 4; image.data[p] = image.data[p + 1] = image.data[p + 2] = 255; image.data[p + 3] = Math.round(Math.max(0, Math.min(1, values[i])) * 255); }
      this.mc.putImageData(image, 0, 0);
      const sx = rect[0] * mw, sy = rect[1] * mh, sw = (rect[2] - rect[0]) * mw, sh = (rect[3] - rect[1]) * mh;
      let mask = this.maskCanvas, mx = sx, my = sy, mw2 = sw, mh2 = sh;
      if (segmentation) {
        const scale = 320 / Math.max(frame.width, frame.height), w = Math.max(1, Math.round(frame.width * scale)), h = Math.max(1, Math.round(frame.height * scale));
        if (this.guide.width !== w || this.guide.height !== h) { this.guide.width = w; this.guide.height = h; }
        this.gc.clearRect(0, 0, w, h); this.gc.drawImage(this.maskCanvas, sx, sy, sw, sh, 0, 0, w, h);
        const pixels = this.gc.getImageData(0, 0, w, h);
        this.gc.drawImage(frame, 0, 0, w, h);
        const rgb = this.gc.getImageData(0, 0, w, h).data;
        pixels.data.set(this.refiner.refine(pixels.data, rgb, w, h, { edge, feather, stability }));
        this.gc.putImageData(pixels, 0, 0);
        mask = this.guide; mx = 0; my = 0; mw2 = w; mh2 = h;
      }
      if (this.canvas.width !== frame.width || this.canvas.height !== frame.height) { this.canvas.width = frame.width; this.canvas.height = frame.height; }
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(mask, mx, my, mw2, mh2, 0, 0, frame.width, frame.height);
      ctx.globalCompositeOperation = 'source-in'; ctx.drawImage(frame, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      return this.canvas;
    }
    dispose() {}
  }

  window.MatteCompositor = { GpuMatte, CpuMatte, create() { try { return new GpuMatte(); } catch (error) { console.warn('GPU matte unavailable: ' + error.message); return new CpuMatte(); } } };
})();
