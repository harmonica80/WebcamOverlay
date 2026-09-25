// Small, image-guided mask filter. Kept independent of the DOM for regression tests.
class MatteRefiner {
  reset() { this.previous = null; this.previousRGB = null; this.width = 0; this.height = 0; }
  constructor() { this.reset(); }
  refine(mask, rgb, width, height, { edge = 15, feather = 25, stability = 40 } = {}) {
    const size = width * height;
    if (this.width !== width || this.height !== height) {
      this.reset(); this.width = width; this.height = height;
      this.filtered = new Float32Array(size); this.output = new Uint8ClampedArray(size * 4);
    }
    const clamp = (v, fallback) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) / 100 : fallback;
    const shrink = clamp(edge, .15) * .16;
    const softness = .24 + clamp(feather, .25) * .5;
    const historyWeight = clamp(stability, .4) * .8;
    const filtered = this.filtered, output = this.output;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      let sum = 0, weight = 0;
      // Neighbours across strong colour boundaries contribute less, avoiding a blurred halo.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
        const q = (yy * width + xx) * 4;
        const distance = Math.abs(rgb[p] - rgb[q]) + Math.abs(rgb[p+1] - rgb[q+1]) + Math.abs(rgb[p+2] - rgb[q+2]);
        const w = (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1) / (1 + distance * distance / 900);
        sum += mask[q+3] / 255 * w; weight += w;
      }
      const t = Math.max(0, Math.min(1, (sum / weight - (.5 + shrink - softness / 2)) / softness));
      let alpha = t * t * (3 - 2 * t);
      if (this.previous) {
        const colourChange = (Math.abs(rgb[p]-this.previousRGB[p]) + Math.abs(rgb[p+1]-this.previousRGB[p+1]) + Math.abs(rgb[p+2]-this.previousRGB[p+2])) / 3;
        const motion = Math.max(Math.min(1, colourChange / 24), Math.min(1, Math.abs(alpha - this.previous[i]) / .22));
        const blend = historyWeight * (1 - motion);
        alpha = alpha * (1 - blend) + this.previous[i] * blend;
      }
      filtered[i] = alpha;
      output[p] = output[p+1] = output[p+2] = 255; output[p+3] = Math.round(alpha * 255);
    }
    if (!this.previous) { this.previous = new Float32Array(size); this.previousRGB = new Uint8ClampedArray(rgb.length); }
    this.previous.set(filtered); this.previousRGB.set(rgb);
    return output;
  }
}
if (typeof module !== 'undefined') module.exports = MatteRefiner;
