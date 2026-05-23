import { ScrcpyAudioQueue } from './scrcpy-audio-queue';

export class AudioMixer {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private scrcpyPlayerNode: ScriptProcessorNode | null = null;
  private recorderNode: ScriptProcessorNode | null = null;

  // Dedicated preview player states (no mic acquisition required)
  private previewAudioCtx: AudioContext | null = null;
  private previewPlayerNode: ScriptProcessorNode | null = null;
  private localPlaybackEnabled = true;
  
  private scrcpyInputQueue: ScrcpyAudioQueue;

  // Configuration options to prevent hardcoding
  private micGain = 1.0;
  private scrcpyGain = 0.5; // Default lower gain for phone audio to not drown out voice
  private bufferSize = 2048; // Standard buffer size for low latency
  private targetSampleRate = 16000;

  private onMixedAudioCallback: ((pcmData: ArrayBuffer) => void) | null = null;
  private onMicWaveCallback: ((bars: number[]) => void) | null = null;
  private prevWaveBars: number[] = Array(24).fill(10);

  constructor(scrcpyInputQueue: ScrcpyAudioQueue) {
    this.scrcpyInputQueue = scrcpyInputQueue;
  }

  /**
   * Set callback for microphone wave levels (24 channels).
   */
  public setOnMicWave(callback: ((bars: number[]) => void) | null): void {
    this.onMicWaveCallback = callback;
  }

  /**
   * Set gains for mixing.
   */
  public setGains(micGain: number, scrcpyGain: number): void {
    this.micGain = micGain;
    this.scrcpyGain = scrcpyGain;
    console.log(`[AudioMixer] Gains updated - Mic: ${this.micGain}, Scrcpy: ${this.scrcpyGain}`);
  }

  /**
   * Start recording and mixing.
   */
  public async start(onMixedAudio: (pcmData: ArrayBuffer) => void): Promise<void> {
    this.stopPreview(); // Ensure preview playback is stopped before starting the mixer
    this.onMixedAudioCallback = onMixedAudio;

    try {
      // 1. Initialize AudioContext
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      if (!this.audioCtx) {
        console.warn('[AudioMixer] AudioContext was stopped before initialization completed.');
        return;
      }

      console.log(`[AudioMixer] Web AudioContext initialized. Native Sample Rate: ${this.audioCtx.sampleRate}Hz`);

      // 2. Setup Microphone Input
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (!this.audioCtx) {
        console.warn('[AudioMixer] AudioContext was stopped during mic acquisition.');
        if (this.micStream) {
          this.micStream.getTracks().forEach((track) => track.stop());
          this.micStream = null;
        }
        return;
      }

      this.micSourceNode = this.audioCtx.createMediaStreamSource(this.micStream);

      // 3. Create Recording and Unified Stereo Mixing Node
      // ScriptProcessorNode parameters: bufferSize, numInputChannels (1, mono mic), numOutputChannels (2, stereo speakers)
      this.recorderNode = this.audioCtx.createScriptProcessor(this.bufferSize, 1, 2);
      this.recorderNode.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer;
        const micData = inputBuffer.getChannelData(0); // Mono microphone input

        const outputBuffer = e.outputBuffer;
        const outL = outputBuffer.getChannelData(0); // Left speaker output
        const outR = outputBuffer.getChannelData(1); // Right speaker output

        const count = outputBuffer.length;
        const { left, right } = this.scrcpyInputQueue.read(count);

        // A. Copy Scrcpy audio to output channels for local playback (if local playback is enabled)
        if (this.localPlaybackEnabled) {
          outL.set(left);
          outR.set(right);
        } else {
          outL.fill(0);
          outR.fill(0);
        }

        // B. Mix Scrcpy audio (mono downmixed) and Microphone input for Gemini Live
        const mono = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          mono[i] = (left[i] + right[i]) / 2.0;
        }

        const mixed = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          mixed[i] = (micData[i] * this.micGain) + (mono[i] * this.scrcpyGain);
        }

        // C. Downsample the mixed audio to 16,000Hz for Gemini
        const downsampled = this.downsample(mixed, this.audioCtx!.sampleRate, this.targetSampleRate);

        // D. Convert Float32 downsampled data to Int16 PCM ArrayBuffer
        const pcmBuffer = this.float32ToInt16(downsampled);

        // E. Emit via callback
        if (this.onMixedAudioCallback) {
          this.onMixedAudioCallback(pcmBuffer);
        }

        // F. Calculate 24 real-time microphone amplitude wave bars for UI
        if (this.onMicWaveCallback) {
          const numBars = 24;
          const chunkSize = Math.floor(count / numBars);
          const newBars = new Array(numBars);
          
          for (let b = 0; b < numBars; b++) {
            const start = b * chunkSize;
            const end = Math.min(start + chunkSize, count);
            let sumSq = 0;
            for (let j = start; j < end; j++) {
              const val = micData[j];
              sumSq += val * val;
            }
            const rms = Math.sqrt(sumSq / (end - start || 1));
            // Scale and clamp rms for visualization
            let height = Math.floor(rms * 450);
            height = Math.max(10, Math.min(100, height));
            
            const prev = this.prevWaveBars[b] || 10;
            const smoothHeight = Math.floor(prev * 0.5 + height * 0.5);
            newBars[b] = smoothHeight;
            this.prevWaveBars[b] = smoothHeight;
          }
          this.onMicWaveCallback(newBars);
        }
      };

      // 4. Connect Mic Node -> Recorder Node -> Destination
      // Connecting to destination plays the overwritten output buffer (Scrcpy audio only)
      this.micSourceNode.connect(this.recorderNode);
      this.recorderNode.connect(this.audioCtx.destination);

      console.log('[AudioMixer] Unified audio mixing graph started successfully');
    } catch (err) {
      console.error('[AudioMixer] Failed to start unified audio mixing graph:', err);
      this.stop();
      throw err;
    }
  }

  /**
   * Start preview audio playback (no mic, no mixing, just local speaker output).
   */
  public async startPreview(): Promise<void> {
    if (this.previewAudioCtx) {
      console.log('[AudioMixer] Preview audio already running');
      return;
    }

    try {
      this.previewAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.previewAudioCtx.state === 'suspended') {
        await this.previewAudioCtx.resume();
      }

      console.log(`[AudioMixer] Preview AudioContext initialized at ${this.previewAudioCtx.sampleRate}Hz`);

      this.previewPlayerNode = this.previewAudioCtx.createScriptProcessor(this.bufferSize, 0, 2);
      this.previewPlayerNode.onaudioprocess = (e) => {
        const outputBuffer = e.outputBuffer;
        const outL = outputBuffer.getChannelData(0);
        const outR = outputBuffer.getChannelData(1);

        const count = outputBuffer.length;
        const { left, right } = this.scrcpyInputQueue.read(count);

        if (this.localPlaybackEnabled) {
          outL.set(left);
          outR.set(right);
        } else {
          outL.fill(0);
          outR.fill(0);
        }
      };

      this.previewPlayerNode.connect(this.previewAudioCtx.destination);
      console.log('[AudioMixer] Preview audio player connected');
    } catch (err) {
      console.error('[AudioMixer] Failed to start preview audio:', err);
      this.stopPreview();
    }
  }

  /**
   * Stop preview audio playback.
   */
  public stopPreview(): void {
    console.log('[AudioMixer] Stopping preview audio...');
    if (this.previewPlayerNode) {
      try { this.previewPlayerNode.disconnect(); } catch (e) { /* ignore */ }
      this.previewPlayerNode = null;
    }
    if (this.previewAudioCtx) {
      try { this.previewAudioCtx.close(); } catch (e) { /* ignore */ }
      this.previewAudioCtx = null;
    }
  }

  /**
   * Set local playback enabled state (mute/unmute local phone audio output).
   */
  public setLocalPlaybackEnabled(enabled: boolean): void {
    this.localPlaybackEnabled = enabled;
    console.log(`[AudioMixer] Local playback enabled state set to: ${enabled}`);
  }

  /**
   * Stop recording and mixing.
   */
  public stop(): void {
    console.log('[AudioMixer] Stopping audio mixer...');
    
    if (this.scrcpyPlayerNode) {
      try { this.scrcpyPlayerNode.disconnect(); } catch (e) { /* ignore */ }
      this.scrcpyPlayerNode = null;
    }

    if (this.recorderNode) {
      try { this.recorderNode.disconnect(); } catch (e) { /* ignore */ }
      this.recorderNode = null;
    }

    if (this.micSourceNode) {
      try { this.micSourceNode.disconnect(); } catch (e) { /* ignore */ }
      this.micSourceNode = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) { /* ignore */ }
      this.audioCtx = null;
    }

    this.onMixedAudioCallback = null;
    this.onMicWaveCallback = null;
  }

  /**
   * Helper: Downsample Float32Array from inputRate to outputRate.
   */
  private downsample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (inputRate === outputRate) {
      return input;
    }
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(input.length / ratio);
    const result = new Float32Array(outputLength);
    
    let offsetResult = 0;
    let offsetInput = 0;
    
    while (offsetResult < result.length) {
      const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
        accum += input[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetInput = nextOffsetInput;
    }
    
    return result;
  }

  /**
   * Helper: Convert Float32Array ([-1.0, 1.0]) to 16-bit Signed Integer PCM (ArrayBuffer).
   */
  private float32ToInt16(samples: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      // Convert to Int16
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, val, true); // Little Endian
    }
    return buffer;
  }
}
