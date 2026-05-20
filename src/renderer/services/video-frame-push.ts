export class VideoFramePush {
  private sourceCanvas: HTMLCanvasElement;
  private hiddenCanvas: HTMLCanvasElement | null = null;
  private hiddenCtx: CanvasRenderingContext2D | null = null;
  
  private intervalId: any = null;
  private isPushing = false;

  // Custom configurations to prevent hardcoding
  private targetWidth = 768; // Gemini recommended visual width
  private intervalMs = 1000;  // 1 FPS = 1000ms
  private jpegQuality = 0.8;  // Compression quality (0.0 to 1.0)

  constructor(sourceCanvas: HTMLCanvasElement) {
    this.sourceCanvas = sourceCanvas;
  }

  /**
   * Set configuration overrides.
   */
  public setConfig(width: number, fps: number, quality: number): void {
    this.targetWidth = width;
    this.intervalMs = Math.round(1000 / fps);
    this.jpegQuality = quality;
    console.log(`[VideoFramePush] Config updated - Width: ${this.targetWidth}, Interval: ${this.intervalMs}ms, Quality: ${this.jpegQuality}`);
  }

  /**
   * Start 1 FPS frame-grabbing and push via callback.
   */
  public start(onFrame: (jpegBase64: string) => void): void {
    if (this.isPushing) return;
    this.isPushing = true;

    // Create the offscreen downsampling canvas
    this.hiddenCanvas = document.createElement('canvas');
    this.hiddenCtx = this.hiddenCanvas.getContext('2d');

    this.intervalId = setInterval(() => {
      if (!this.sourceCanvas || this.sourceCanvas.width === 0 || this.sourceCanvas.height === 0) {
        return;
      }

      try {
        const sw = this.sourceCanvas.width;
        const sh = this.sourceCanvas.height;

        // Calculate aspect ratio downsampled dimensions
        const tw = this.targetWidth;
        const th = Math.floor(tw * (sh / sw));

        if (this.hiddenCanvas && this.hiddenCtx) {
          // Resize hidden canvas if dimensions changed
          if (this.hiddenCanvas.width !== tw || this.hiddenCanvas.height !== th) {
            this.hiddenCanvas.width = tw;
            this.hiddenCanvas.height = th;
          }

          // Draw and scale down the image
          this.hiddenCtx.drawImage(this.sourceCanvas, 0, 0, tw, th);

          // Compress to JPEG and get Base64
          const dataUrl = this.hiddenCanvas.toDataURL('image/jpeg', this.jpegQuality);
          // Split off the "data:image/jpeg;base64," prefix
          const base64 = dataUrl.split(',')[1];

          if (base64) {
            onFrame(base64);
          }
        }
      } catch (err) {
        console.error('[VideoFramePush] Error capturing frame:', err);
      }
    }, this.intervalMs);

    console.log(`[VideoFramePush] Started frame pusher at ${1000 / this.intervalMs} FPS`);
  }

  /**
   * Stop pushing frames.
   */
  public stop(): void {
    if (!this.isPushing) return;
    this.isPushing = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.hiddenCanvas = null;
    this.hiddenCtx = null;
    console.log('[VideoFramePush] Frame pusher stopped');
  }
}
