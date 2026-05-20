export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveServiceOptions {
  model?: string;
  voiceName?: string; // Aoede, Fenrir, Puck, Charon, Kore
  systemInstruction?: string;
}

export class GeminiLiveService {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';

  // Config options to avoid hardcoding
  private model = 'models/gemini-2.0-flash-exp';
  private voiceName = 'Aoede';
  private systemInstruction = 'You are a helpful real-time voice and vision assistant. You can see the user\'s Android phone screen from the image frames provided and hear the mixed audio of their microphone and phone system sound. Keep your voice responses concise, conversational, and lively.';

  // Callback listeners
  public onStatusChanged: ((status: ConnectionStatus, message?: string) => void) | null = null;
  public onAudioReceived: ((pcmBuffer: ArrayBuffer) => void) | null = null;
  public onTextReceived: ((text: string) => void) | null = null;
  public onInterrupted: (() => void) | null = null;
  public onLogMessage: ((type: 'thought' | 'action' | 'status', message: string) => void) | null = null;

  constructor(options?: GeminiLiveServiceOptions) {
    if (options?.model) this.model = options.model;
    if (options?.voiceName) this.voiceName = options.voiceName;
    if (options?.systemInstruction) this.systemInstruction = options.systemInstruction;
  }

  /**
   * Connect to the Gemini Live API over WebSocket.
   */
  public connect(apiKey: string): void {
    if (this.ws) {
      this.disconnect();
    }

    this.setStatus('connecting');
    this.log('status', `Connecting to Gemini Live API (${this.model})...`);

    // Standard Live API Bidi-streaming WebSocket URL
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        this.setStatus('connected');
        this.log('status', 'WebSocket connected. Sending setup configuration...');
        this.sendSetupMessage();
      };

      this.ws.onclose = (event) => {
        this.setStatus('disconnected');
        this.log('status', `WebSocket closed (Code: ${event.code}, Reason: ${event.reason || 'None'})`);
        this.ws = null;
      };

      this.ws.onerror = (error) => {
        this.setStatus('error', 'WebSocket error occurred');
        this.log('status', 'WebSocket error. Check connection or API Key.');
        console.error('[GeminiLiveService] WebSocket Error:', error);
      };

      this.ws.onmessage = (messageEvent) => {
        this.handleServerMessage(messageEvent.data);
      };
    } catch (err: any) {
      this.setStatus('error', err.message);
      this.log('status', `Connection initiation failed: ${err.message}`);
    }
  }

  /**
   * Disconnect from Gemini Live API.
   */
  public disconnect(): void {
    if (this.ws) {
      this.log('status', 'Disconnecting from Gemini...');
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Send mixed 16kHz PCM audio chunk (Base64) to Gemini.
   */
  public sendAudioChunk(base64Data: string): void {
    this.sendRealtimeInput('audio/pcm;rate=16000', base64Data);
  }

  /**
   * Send mixed 16kHz PCM audio buffer as a raw binary WebSocket frame.
   * Following ADK streaming best practices, sending raw binary frames eliminates
   * Base64 CPU encoding/decoding overhead and saves ~33% bandwidth.
   */
  public sendAudioBuffer(pcmBuffer: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(pcmBuffer);
  }

  /**
   * Send 1 FPS JPEG screen frame (Base64) to Gemini.
   */
  public sendImageFrame(base64Data: string): void {
    this.sendRealtimeInput('image/jpeg', base64Data);
  }

  /**
   * Get current connection status.
   */
  public get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Helper: Update status and fire callback.
   */
  private setStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    if (this.onStatusChanged) {
      this.onStatusChanged(status, message);
    }
  }

  /**
   * Helper: Send Logger event.
   */
  private log(type: 'thought' | 'action' | 'status', message: string): void {
    if (this.onLogMessage) {
      this.onLogMessage(type, message);
    }
    console.log(`[GeminiLiveService ${type.toUpperCase()}] ${message}`);
  }

  /**
   * Helper: Send Setup Message (v1beta layout).
   */
  private sendSetupMessage(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const setupMsg = {
      setup: {
        model: this.model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName,
              },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: this.systemInstruction,
            },
          ],
        },
      },
    };

    this.ws.send(JSON.stringify(setupMsg));
    this.log('action', `Sent setup configuration frame. Preset Voice: ${this.voiceName}`);
  }

  /**
   * Helper: Send Realtime Input Frame.
   */
  private sendRealtimeInput(mimeType: string, base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputMsg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType,
            data: base64Data,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(inputMsg));
  }

  /**
   * Helper: Parse received WebSocket message.
   */
  private handleServerMessage(dataStr: string): void {
    try {
      const msg = JSON.parse(dataStr);

      if (msg.serverContent) {
        const content = msg.serverContent;

        // 1. Handle user interruption signal
        if (content.interrupted) {
          this.log('thought', 'Gemini reports interruption! Cutting playback...');
          if (this.onInterrupted) {
            this.onInterrupted();
          }
        }

        // 2. Handle model speech and text output
        if (content.modelTurn && content.modelTurn.parts) {
          const parts = content.modelTurn.parts;
          for (const part of parts) {
            // Text transcription of output
            if (part.text) {
              if (this.onTextReceived) {
                this.onTextReceived(part.text);
              }
            }

            // Audio output inlineData
            if (part.inlineData && part.inlineData.data) {
              const base64Audio = part.inlineData.data;
              const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
              if (this.onAudioReceived) {
                this.onAudioReceived(arrayBuffer);
              }
            }
          }
        }
      }

      // Handle raw tool calls if Gemini requests them (Optional log)
      if (msg.toolCall) {
        this.log('action', `Gemini requested tool call: ${JSON.stringify(msg.toolCall)}`);
      }
    } catch (err) {
      console.error('[GeminiLiveService] Failed to parse message:', err);
    }
  }

  /**
   * Helper: Convert Base64 string to ArrayBuffer.
   * Following RFC 4648 and ADK guidelines, this handles standard base64 as well as
   * base64url (which uses '-' and '_' and omits padding '=').
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Convert base64url to standard base64 (RFC 4648 compliance)
    let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }

    const binaryString = window.atob(standardBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
