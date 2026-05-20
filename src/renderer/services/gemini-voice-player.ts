export class GeminiVoicePlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private sampleRate = 24000; // Gemini default audio output rate

  constructor() {
    // Initialized when start is called
  }

  /**
   * Start/resume the audio player with an AudioContext.
   */
  public start(audioCtx?: AudioContext): void {
    if (audioCtx) {
      this.audioCtx = audioCtx;
    } else if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.nextStartTime = this.audioCtx.currentTime;
    console.log('[GeminiVoicePlayer] Voice player started');
  }

  /**
   * Queue raw 24kHz Mono 16-bit PCM bytes for playback.
   */
  public playRawPCM(pcmBuffer: ArrayBuffer): void {
    if (!this.audioCtx) {
      console.warn('[GeminiVoicePlayer] AudioContext not initialized. Call start() first.');
      return;
    }

    // Convert Int16 buffer to Float32 samples
    const dataView = new DataView(pcmBuffer);
    const sampleCount = pcmBuffer.byteLength / 2;
    const float32Samples = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const val = dataView.getInt16(i * 2, true);
      float32Samples[i] = val / 32768.0;
    }

    // Schedule the buffer
    this.scheduleFloat32Buffer(float32Samples);
  }

  /**
   * Schedule the Float32 samples back-to-back for seamless playback.
   */
  private scheduleFloat32Buffer(samples: Float32Array): void {
    if (!this.audioCtx) return;

    // Create an AudioBuffer (Mono, 24000Hz)
    const audioBuffer = this.audioCtx.createBuffer(1, samples.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(samples);

    // Create Source Node
    const sourceNode = this.audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(this.audioCtx.destination);

    // Calculate start time
    const currentTime = this.audioCtx.currentTime;
    let playTime = this.nextStartTime;

    // If we fell behind, catch up
    if (playTime < currentTime) {
      playTime = currentTime;
    }

    // Schedule playback
    sourceNode.start(playTime);
    this.nextStartTime = playTime + audioBuffer.duration;

    // Keep track of active nodes for interruption
    this.activeSources.push(sourceNode);

    // Clean up node when done playing
    sourceNode.onended = () => {
      const index = this.activeSources.indexOf(sourceNode);
      if (index > -1) {
        this.activeSources.splice(index, 1);
      }
    };
  }

  /**
   * Instant interruption: stops all currently playing sounds,
   * clears the buffer queue, and resets scheduling timeline.
   */
  public interrupt(): void {
    console.log('[GeminiVoicePlayer] Interrupting playback!');
    
    // Stop all playing nodes
    this.activeSources.forEach((node) => {
      try {
        node.stop();
      } catch (e) {
        // Node might have already finished or stopped
      }
    });

    this.activeSources = [];
    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
  }

  /**
   * Stop and release resources.
   */
  public stop(): void {
    this.interrupt();
    this.audioCtx = null;
  }
}
