/**
 * ScrcpyAudioQueue manages a thread-safe-like ring buffer for raw audio
 * streamed from Scrcpy (16-bit signed LE PCM, Stereo, 48,000Hz).
 * It converts interleaved Int16 samples into separate Float32 channels,
 * and handles buffered queuing for smooth playback and mixing.
 */
export class ScrcpyAudioQueue {
  private leftBuffer: number[] = [];
  private rightBuffer: number[] = [];

  /**
   * Write raw PCM bytes (48kHz Stereo 16-bit LE) into the queue.
   */
  public write(rawBytes: Uint8Array): void {
    // 16-bit LE PCM means 2 bytes per sample.
    // Interleaved Stereo: L, R, L, R...
    const dataView = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const sampleCount = rawBytes.byteLength / 4; // 4 bytes per stereo frame (2 bytes L + 2 bytes R)

    const left: number[] = new Array(sampleCount);
    const right: number[] = new Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const offset = i * 4;
      // Read 16-bit signed integer (little endian)
      const lVal = dataView.getInt16(offset, true);
      const rVal = dataView.getInt16(offset + 2, true);

      // Normalize to [-1.0, 1.0]
      left[i] = lVal / 32768.0;
      right[i] = rVal / 32768.0;
    }

    this.leftBuffer.push(...left);
    this.rightBuffer.push(...right);

    // Safety limit to avoid unbounded memory growth in case of lag
    const maxBufferSize = 48000 * 2; // 2 seconds of buffer max
    if (this.leftBuffer.length > maxBufferSize) {
      this.leftBuffer.splice(0, this.leftBuffer.length - maxBufferSize);
      this.rightBuffer.splice(0, this.rightBuffer.length - maxBufferSize);
    }
  }

  /**
   * Read specified number of samples from the queue.
   * If there are fewer samples available, pads with silence.
   */
  public read(count: number): { left: Float32Array; right: Float32Array } {
    const leftOut = new Float32Array(count);
    const rightOut = new Float32Array(count);

    const actualCount = Math.min(count, this.leftBuffer.length);
    for (let i = 0; i < actualCount; i++) {
      leftOut[i] = this.leftBuffer[i];
      rightOut[i] = this.rightBuffer[i];
    }

    // Remove read items
    this.leftBuffer.splice(0, actualCount);
    this.rightBuffer.splice(0, actualCount);

    return { left: leftOut, right: rightOut };
  }

  /**
   * Clear all samples from the queue.
   */
  public clear(): void {
    this.leftBuffer = [];
    this.rightBuffer = [];
  }

  /**
   * Return the current number of buffered samples.
   */
  public get length(): number {
    return this.leftBuffer.length;
  }
}
