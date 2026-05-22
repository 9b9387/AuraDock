import { ScrcpyAudioQueue } from './scrcpy-audio-queue';

export class AudioMixer {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private scrcpyPlayerNode: ScriptProcessorNode | null = null;
  private recorderNode: ScriptProcessorNode | null = null;
  
  private scrcpyInputQueue: ScrcpyAudioQueue;
  private playedScrcpyQueue: number[] = [];

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
    this.onMixedAudioCallback = onMixedAudio;
    this.playedScrcpyQueue = [];

    try {
      // 1. Initialize AudioContext
      // Note: We don't specify sampleRate here, we let the browser select its native rate
      // (usually 44.1kHz or 48kHz) and downsample manually for maximum compatibility.
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

      // 3. Create Scrcpy Stereo Player Node
      // ScriptProcessorNode parameters: bufferSize, numInputChannels, numOutputChannels
      this.scrcpyPlayerNode = this.audioCtx.createScriptProcessor(this.bufferSize, 0, 2);
      this.scrcpyPlayerNode.onaudioprocess = (e) => {
        const outputBuffer = e.outputBuffer;
        const outL = outputBuffer.getChannelData(0);
        const outR = outputBuffer.getChannelData(1);

        const count = outputBuffer.length;
        const { left, right } = this.scrcpyInputQueue.read(count);

        // Copy to output channels for local playback
        outL.set(left);
        outR.set(right);

        // Mix to mono and write to the played queue for Gemini mixing
        const mono = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          mono[i] = (left[i] + right[i]) / 2.0;
        }

        // Push played mono samples to played queue
        // Limit queue size to avoid memory leaks if recorder isn't running
        if (this.playedScrcpyQueue.length < this.audioCtx!.sampleRate * 2) {
          this.playedScrcpyQueue.push(...Array.from(mono));
        }
      };

      // Connect Scrcpy Player directly to destination so user can hear phone audio
      this.scrcpyPlayerNode.connect(this.audioCtx.destination);

      // 4. Create Recording and Mixing Node
      this.recorderNode = this.audioCtx.createScriptProcessor(this.bufferSize, 1, 1);
      this.recorderNode.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer;
        const micData = inputBuffer.getChannelData(0); // Mono microphone
        const count = inputBuffer.length;

        // Pull corresponding Scrcpy played mono samples
        const scrcpyData = new Float32Array(count);
        const availableScrcpy = Math.min(count, this.playedScrcpyQueue.length);
        for (let i = 0; i < availableScrcpy; i++) {
          scrcpyData[i] = this.playedScrcpyQueue[i];
        }
        this.playedScrcpyQueue.splice(0, availableScrcpy);

        // Mix both sources
        const mixed = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          mixed[i] = (micData[i] * this.micGain) + (scrcpyData[i] * this.scrcpyGain);
        }

        // Downsample the mixed audio to 16,000Hz for Gemini
        const downsampled = this.downsample(mixed, this.audioCtx!.sampleRate, this.targetSampleRate);

        // Convert Float32 downsampled data to Int16 PCM ArrayBuffer
        const pcmBuffer = this.float32ToInt16(downsampled);

        // Emit via callback
        if (this.onMixedAudioCallback) {
          this.onMixedAudioCallback(pcmBuffer);
        }

        // Calculate 24 real-time microphone amplitude wave bars
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
            // Standard microphone values are small (usually 0.005 to 0.15 for normal talking)
            // Let's multiply by a multiplier and scale to range [10, 100]
            let height = Math.floor(rms * 450);
            height = Math.max(10, Math.min(100, height));
            
            // Temporal smoothing to avoid sudden jitter
            const prev = this.prevWaveBars[b] || 10;
            const smoothHeight = Math.floor(prev * 0.5 + height * 0.5);
            newBars[b] = smoothHeight;
            this.prevWaveBars[b] = smoothHeight;
          }
          this.onMicWaveCallback(newBars);
        }
      };

      // Connect Mic Node -> Recorder Node -> Destination (silence output)
      this.micSourceNode.connect(this.recorderNode);
      // Connect to destination is necessary to trigger the onaudioprocess callback
      // We can use a GainNode with 0 gain to prevent microphone audio looping back to speakers
      const silenceGain = this.audioCtx.createGain();
      silenceGain.gain.value = 0.0;
      this.recorderNode.connect(silenceGain);
      silenceGain.connect(this.audioCtx.destination);

      console.log('[AudioMixer] Audio mixing graph started successfully');
    } catch (err) {
      console.error('[AudioMixer] Failed to start audio mixing graph:', err);
      this.stop();
      throw err;
    }
  }

  /**
   * Stop recording and mixing.
   */
  public stop(): void {
    console.log('[AudioMixer] Stopping audio mixer...');
    
    if (this.scrcpyPlayerNode) {
      try { this.scrcpyPlayerNode.disconnect(); } catch (e) {}
      this.scrcpyPlayerNode = null;
    }

    if (this.recorderNode) {
      try { this.recorderNode.disconnect(); } catch (e) {}
      this.recorderNode = null;
    }

    if (this.micSourceNode) {
      try { this.micSourceNode.disconnect(); } catch (e) {}
      this.micSourceNode = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (e) {}
      this.audioCtx = null;
    }

    this.playedScrcpyQueue = [];
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
      let s = Math.max(-1, Math.min(1, samples[i]));
      // Convert to Int16
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, val, true); // Little Endian
    }
    return buffer;
  }
}
