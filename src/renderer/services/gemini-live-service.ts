export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveServiceOptions {
  model?: string;
  voiceName?: string; // Aoede, Fenrir, Puck, Charon, Kore
  systemInstruction?: string;
}

function truncateBase64AndThought(str: string): string {
  if (typeof str !== 'string') return str;
  let clean = str;
  // Truncate Base64 (images/screenshots/etc.) down to 20 characters
  clean = clean.replace(/([a-zA-Z0-9+/=]{100,})/g, (match) => {
    return `${match.substring(0, 20)}... [truncated ${match.length} chars]`;
  });
  // Truncate thoughtSignature down to 20 characters
  clean = clean.replace(/(["']?thoughtSignature["']?\s*:\s*["'])([^"'\\]+)(["'])/gi, (match, prefix, signature, suffix) => {
    if (signature.length <= 20) return match;
    return `${prefix}${signature.substring(0, 20)}... [truncated ${signature.length} chars]${suffix}`;
  });
  return clean;
}

export class GeminiLiveService {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private serial: string | null = null;

  // Config options to avoid hardcoding
  private model = 'models/gemini-3.1-flash-live-preview';
  private voiceName = 'Aoede';
  private defaultSystemInstruction = 'You are a helpful real-time voice and vision assistant. You can see the user\'s Android phone screen from the image frames provided and hear the mixed audio of their microphone and phone system sound. Keep your voice responses concise, conversational, and lively. You can control the phone screen using the provided tools. COORDINATE SYSTEM: All UI coordinates for tap and swipe MUST be normalized from 0 to 1000, where (0, 0) is top-left, and (1000, 1000) is bottom-right.';
  private systemInstruction = this.defaultSystemInstruction;

  // Callback listeners
  public onStatusChanged: ((status: ConnectionStatus, message?: string) => void) | null = null;
  public onAudioReceived: ((pcmBuffer: ArrayBuffer) => void) | null = null;
  public onTextReceived: ((text: string) => void) | null = null;
  public onInterrupted: (() => void) | null = null;
  public onLogMessage: ((type: 'thought' | 'action' | 'status', message: string) => void) | null = null;

  constructor(options?: GeminiLiveServiceOptions) {
    // Determine working model based on API compatibility.
    // gemini-3.1-flash-live-preview is the recommended latest Live API model for real-time conversations.
    this.model = options?.model || 'models/gemini-3.1-flash-live-preview';
    if (options?.voiceName) this.voiceName = options.voiceName;
    if (options?.systemInstruction) {
      this.defaultSystemInstruction = options.systemInstruction;
      this.systemInstruction = options.systemInstruction;
    }
  }

  /**
   * Set model dynamically
   */
  public setModel(model: string): void {
    if (model) {
      this.model = model;
    }
  }

  /**
   * Connect to the Gemini Live API over WebSocket.
   */
  public connect(apiKey: string, serial: string, customSystemInstruction?: string): void {
    if (this.ws) {
      this.disconnect();
    }

    this.systemInstruction = customSystemInstruction || this.defaultSystemInstruction;
    this.serial = serial;
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

      this.ws.onmessage = async (messageEvent) => {
        await this.handleServerMessage(messageEvent.data);
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
   * Following the latest Gemini 3.1 Live API specification, the "mediaChunks" array is deprecated.
   * Audio input must be sent directly under the "audio" field inside "realtimeInput".
   */
  public sendAudioChunk(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputMsg = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Data,
        },
      },
    };

    this.ws.send(JSON.stringify(inputMsg));
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
   * Following the latest Gemini 3.1 Live API specification, the "mediaChunks" array is deprecated.
   * Video input must be sent directly under the "video" field inside "realtimeInput".
   */
  public sendImageFrame(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputMsg = {
      realtimeInput: {
        video: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      },
    };

    this.ws.send(JSON.stringify(inputMsg));
  }

  /**
   * Send text message to Gemini Live.
   * Following the latest Gemini 3.1 Live API specification, direct "text" field can be sent in realtimeInput.
   */
  public sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputMsg = {
      realtimeInput: {
        text: text,
      },
    };

    this.ws.send(JSON.stringify(inputMsg));
    this.log('action', `Sent text chat input: "${text}"`);
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
    const cleanMessage = truncateBase64AndThought(message);
    if (this.onLogMessage) {
      this.onLogMessage(type, cleanMessage);
    }
    console.log(`[GeminiLiveService ${type.toUpperCase()}] ${cleanMessage}`);
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
        tools: [
          {
            functionDeclarations: [
              {
                name: 'tap',
                description: 'Tap on the screen at specified normalized coordinates (x, y). Use this to click buttons, icons, links, or text.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    x: { type: 'INTEGER', description: 'X coordinate (normalized 0-1000)' },
                    y: { type: 'INTEGER', description: 'Y coordinate (normalized 0-1000)' },
                  },
                  required: ['x', 'y'],
                },
              },
              {
                name: 'swipe',
                description: 'Swipe on the screen from normalized (x1, y1) to (x2, y2). Use this to scroll or drag.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    x1: { type: 'INTEGER', description: 'Start X coordinate (normalized 0-1000)' },
                    y1: { type: 'INTEGER', description: 'Start Y coordinate (normalized 0-1000)' },
                    x2: { type: 'INTEGER', description: 'End X coordinate (normalized 0-1000)' },
                    y2: { type: 'INTEGER', description: 'End Y coordinate (normalized 0-1000)' },
                    durationMs: { type: 'INTEGER', description: 'Swipe duration in milliseconds (default 300)' },
                  },
                  required: ['x1', 'y1', 'x2', 'y2'],
                },
              },
              {
                name: 'input_text',
                description: 'Input text into the currently focused text field.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    text: { type: 'STRING', description: 'The text to input' },
                  },
                  required: ['text'],
                },
              },
              {
                name: 'key_event',
                description: 'Press a physical/system button: BACK, HOME, or APP_SWITCH (recent apps list).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    key: { type: 'STRING', enum: ['BACK', 'HOME', 'APP_SWITCH'], description: 'The system key to press' },
                  },
                  required: ['key'],
                },
              },
            ],
          },
        ],
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
  private async handleServerMessage(data: any): Promise<void> {
    try {
      let jsonData = '';

      if (data instanceof Blob) {
        jsonData = await data.text();
      } else if (data instanceof ArrayBuffer) {
        jsonData = new TextDecoder().decode(data);
      } else if (typeof data === 'string') {
        jsonData = data;
      } else {
        console.warn('[GeminiLiveService] Received unknown message format:', data);
        return;
      }

      const msg = JSON.parse(jsonData);

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

      // Handle raw tool calls if Gemini requests them
      if (msg.toolCall) {
        this.handleToolCalls(msg.toolCall);
      }
    } catch (err) {
      console.error('[GeminiLiveService] Failed to parse message:', err);
    }
  }

  /**
   * Helper: Handle incoming Tool Calls asynchronously and return results.
   */
  private async handleToolCalls(toolCall: any): Promise<void> {
    if (!toolCall || !toolCall.functionCalls) return;

    const functionResponses: any[] = [];

    for (const call of toolCall.functionCalls) {
      const { name, id, args } = call;
      this.log('action', `Gemini Live requested tool call '${name}' with args: ${JSON.stringify(args)}`);

      try {
        if (!this.serial) {
          throw new Error('No active device serial connected to Gemini Live.');
        }

        // Execute the tool in the main process via IPC
        const result = await (window as any).adb.executeTool(this.serial, name, args);
        this.log('status', `Tool '${name}' completed: ${JSON.stringify(result)}`);

        functionResponses.push({
          id,
          response: {
            output: result,
          },
        });
      } catch (err: any) {
        this.log('status', `Tool '${name}' failed: ${err.message}`);
        functionResponses.push({
          id,
          response: {
            output: { status: 'error', error: err.message },
          },
        });
      }
    }

    if (functionResponses.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const responseMsg = {
        toolResponse: {
          functionResponses,
        },
      };
      this.ws.send(JSON.stringify(responseMsg));
      this.log('action', `Sent toolCall response back to Gemini.`);
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
