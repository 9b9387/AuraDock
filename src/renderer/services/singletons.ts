import { ScrcpyAudioQueue } from './scrcpy-audio-queue';
import { AudioMixer } from './audio-mixer';
import { GeminiVoicePlayer } from './gemini-voice-player';
import { GeminiLiveService } from './gemini-live-service';

export const scrcpyAudioQueue = new ScrcpyAudioQueue();
export const audioMixer = new AudioMixer(scrcpyAudioQueue);
export const geminiVoicePlayer = new GeminiVoicePlayer();
export const geminiLiveService = new GeminiLiveService();

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
