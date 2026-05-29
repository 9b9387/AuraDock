/**
 * FrameDiffDetector: zero-token, purely client-side change detection over the scrcpy
 * canvas. Computes a 16x16 average-hash (aHash) of each sampled frame and emits a
 * single "changed" event (rate-limited) when the perceptual hash diverges enough from
 * the previous stable frame.
 *
 * This is Layer-0 of the watch funnel: it only decides "something changed", never what
 * changed. The expensive reasoning happens later, and only when this fires.
 */
export class FrameDiffDetector {
  private static readonly SIZE = 16; // 16x16 = 256-bit hash
  private prevHash: Uint8Array | null = null;
  private lastSampleAt = 0;
  private lastEmitAt = 0;

  private work: HTMLCanvasElement;
  private workCtx: CanvasRenderingContext2D | null;

  constructor(
    /** Min time between hash samples (ms) to keep CPU negligible. */
    private sampleIntervalMs = 600,
    /** Hamming-distance threshold (out of 256 bits) to consider the screen "changed". */
    private threshold = 18,
    /** Min time between emitted change events (ms), i.e. debounce. */
    private emitIntervalMs = 1500
  ) {
    this.work = document.createElement('canvas');
    this.work.width = FrameDiffDetector.SIZE;
    this.work.height = FrameDiffDetector.SIZE;
    this.workCtx = this.work.getContext('2d', { willReadFrequently: true });
  }

  /** Forget previous state so the next frame establishes a fresh baseline. */
  reset() {
    this.prevHash = null;
    this.lastSampleAt = 0;
    this.lastEmitAt = 0;
  }

  /**
   * Sample the canvas. Returns true exactly once per debounced significant change.
   * Cheap: throttled by sampleIntervalMs and operates on a 16x16 downscale.
   */
  process(source: HTMLCanvasElement): boolean {
    const now = performance.now();
    if (now - this.lastSampleAt < this.sampleIntervalMs) return false;
    this.lastSampleAt = now;

    const hash = this.computeHash(source);
    if (!hash) return false;

    if (!this.prevHash) {
      this.prevHash = hash; // first frame = baseline, never triggers
      return false;
    }

    const distance = this.hamming(this.prevHash, hash);
    this.prevHash = hash;

    if (distance >= this.threshold && now - this.lastEmitAt >= this.emitIntervalMs) {
      this.lastEmitAt = now;
      return true;
    }
    return false;
  }

  private computeHash(source: HTMLCanvasElement): Uint8Array | null {
    if (!this.workCtx || source.width === 0 || source.height === 0) return null;
    const n = FrameDiffDetector.SIZE;
    this.workCtx.drawImage(source, 0, 0, n, n);
    let data: Uint8ClampedArray;
    try {
      data = this.workCtx.getImageData(0, 0, n, n).data;
    } catch {
      return null; // tainted canvas or not ready
    }

    const gray = new Uint8Array(n * n);
    let sum = 0;
    for (let i = 0; i < n * n; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const v = (r * 299 + g * 587 + b * 114) / 1000;
      gray[i] = v;
      sum += v;
    }
    const avg = sum / (n * n);

    const bits = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      bits[i] = gray[i] >= avg ? 1 : 0;
    }
    return bits;
  }

  private hamming(a: Uint8Array, b: Uint8Array): number {
    let d = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) d++;
    }
    return d;
  }
}
