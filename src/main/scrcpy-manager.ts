import { ipcMain, MessageChannelMain } from 'electron';
import path from 'node:path';
import { ScrcpyStreamService, MediaKind, ControlMessageType } from '@9b9387/android-stream-scrcpy';

import { AdbDeviceInfo } from '../types';

export class ScrcpyManager {
  private adb: any = null;
  private services: Map<string, ScrcpyStreamService> = new Map();

  constructor() {
    // Initialized asynchronously
  }

  private async ensureAdb() {
    if (this.adb) return;
    try {
      // Use dynamic import for ESM-only @u4/adbkit
      const { createClient } = await import('@u4/adbkit');
      this.adb = createClient();
    } catch (e) {
      console.error('[ScrcpyManager] Failed to load adbkit:', e);
    }
  }

  async getDevices(): Promise<AdbDeviceInfo[]> {
    await this.ensureAdb();
    if (!this.adb) return [];
    try {
      const devices = await this.adb.listDevices();
      return devices.map((d: any) => ({
        id: d.id,
        serial: d.id, 
        type: d.type
      })) as unknown as AdbDeviceInfo[];
    } catch (e) {
      console.error('Failed to list devices:', e);
      return [];
    }
  }

  async startScrcpy(serial: string, port: Electron.MessagePortMain) {
    await this.ensureAdb();
    if (this.services.has(serial)) {
      this.services.get(serial)?.stop();
    }

    // Cleanup old processes on device to prevent "Connection refused"
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      // Kill processes that might be holding the socket
      await execAsync(`adb -s ${serial} shell "pkill -f scrcpy-server"`).catch(() => {});
      console.log(`[Scrcpy Manager] Cleaned up old processes for ${serial}`);
    } catch (e) {
      console.warn(`[Scrcpy Manager] Failed to cleanup processes for ${serial}:`, e);
    }

    // Explicitly point to the jar in node_modules
    const serverJarPath = path.join(process.cwd(), 'node_modules/@9b9387/android-stream-scrcpy/assets/scrcpy-server-v4.0.jar');

    // Generate a stable scid
    const scid = 0x0000000a;
    console.log(`[Scrcpy Manager] Starting service for ${serial} with scid: 0x${scid.toString(16)}`);

    const service = new ScrcpyStreamService({
      deviceSerial: serial,
      scid,
      maxSize: 1024,
      video: true,
      audio: true, 
      audioCodec: 'raw' as any,
      control: true,
      serverJarPath,
      connectionTimeoutMs: 15000, // Increase timeout for slow devices
    });


    this.services.set(serial, service);

    service.on('error', (err) => {
      console.error(`[Scrcpy Manager] Service error for ${serial}:`, err);
      try {
        port.postMessage({ type: 'error', error: err.message });
      } catch (e) {
        // Port might be closed
      }
    });

    try {
      const meta = await service.start();
      
      // Send initial metadata from handshake
      port.postMessage({ 
        type: 'metadata', 
        width: meta.width, 
        height: meta.height, 
        codec: meta.videoCodec,
        deviceName: meta.deviceName
      });

      const subscription = service.subscribe();
      
      port.on('message', (event) => {
        const msg = event.data;
        if (msg.type === 'control') {
          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: msg.data.action,
            pointerId: -1n, // Mouse
            x: msg.data.pointerX,
            y: msg.data.pointerY,
            screenWidth: msg.data.videoWidth,
            screenHeight: msg.data.videoHeight,
            pressure: msg.data.pressure,
          });
        }
      });
      port.start();

      (async () => {
        try {
          for await (const packet of subscription) {
            if (packet.kind === MediaKind.VIDEO) {
              port.postMessage({ 
                type: 'packet', 
                data: packet.payload,
                keyFrame: packet.keyFrame,
                config: packet.config
              });
            } else if (packet.kind === MediaKind.AUDIO) {
              port.postMessage({
                type: 'audio-packet',
                data: packet.payload
              });
            } else if (packet.kind === MediaKind.SESSION) {
              port.postMessage({ type: 'metadata', width: packet.width, height: packet.height });
            }
          }
        } catch (e) {
          console.error(`[Scrcpy Manager] Subscription loop error for ${serial}:`, e);
        }
      })();

    } catch (e: any) {
      console.error(`[Scrcpy Manager] Failed to start scrcpy for ${serial}:`, e);
      try {
        port.postMessage({ type: 'error', error: e.message });
      } catch (err) {
        // Port might be closed
      }
    }
  }

  getService(serial: string): ScrcpyStreamService | undefined {
    return this.services.get(serial);
  }

  stopAll() {
    console.log('[ScrcpyManager] Stopping all stream services and clean up...');
    for (const [serial, service] of this.services.entries()) {
      try {
        service.stop();
        console.log(`[ScrcpyManager] Stream service stopped for ${serial}`);
      } catch (e) {
        console.error(`[ScrcpyManager] Failed to stop service for ${serial}:`, e);
      }
    }
    this.services.clear();
  }

  setupHandlers() {
    ipcMain.handle('adb:get-devices', () => this.getDevices());
    ipcMain.on('adb:request-scrcpy', (event, serial) => {
      const { port1, port2 } = new MessageChannelMain();
      this.startScrcpy(serial, port2);
      event.sender.postMessage('adb:scrcpy-port', { serial }, [port1]);
    });

    ipcMain.handle('adb:execute-tool', async (event, { serial, name, args }) => {
      const service = this.getService(serial);
      if (!service) {
        throw new Error(`Scrcpy stream service not found for serial: ${serial}`);
      }

      console.log(`[ScrcpyManager] Executing tool '${name}' on device '${serial}' with args:`, args);

      switch (name) {
        case 'tap': {
          const { x, y } = args;
          const meta = service.currentMeta;
          if (!meta) throw new Error('No stream metadata available');

          // Scale normalized coordinate (0-1000) to actual pixels
          const pixelX = Math.round((x / 1000) * meta.width);
          const pixelY = Math.round((y / 1000) * meta.height);

          console.log(`[ScrcpyManager] Tap tool: (${x}, ${y}) -> Pixels: (${pixelX}, ${pixelY})`);

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 0, // DOWN
            pointerId: -1n,
            x: pixelX,
            y: pixelY,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 1,
          });

          await new Promise(resolve => setTimeout(resolve, 50));

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 1, // UP
            pointerId: -1n,
            x: pixelX,
            y: pixelY,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 0,
          });

          return { status: 'success', details: `Tapped at normalized (${x}, ${y}) / pixels (${pixelX}, ${pixelY})` };
        }

        case 'swipe': {
          const { x1, y1, x2, y2, durationMs = 300 } = args;
          const meta = service.currentMeta;
          if (!meta) throw new Error('No stream metadata available');

          const px1 = Math.round((x1 / 1000) * meta.width);
          const py1 = Math.round((y1 / 1000) * meta.height);
          const px2 = Math.round((x2 / 1000) * meta.width);
          const py2 = Math.round((y2 / 1000) * meta.height);

          console.log(`[ScrcpyManager] Swipe tool: (${x1}, ${y1}) -> (${x2}, ${y2}) in ${durationMs}ms`);

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 0, // DOWN
            pointerId: -1n,
            x: px1,
            y: py1,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 1,
          });

          const steps = 10;
          for (let i = 1; i <= steps; i++) {
            await new Promise(resolve => setTimeout(resolve, durationMs / steps));
            service.sendControlMessage({
              type: ControlMessageType.INJECT_TOUCH_EVENT,
              action: 2, // MOVE
              pointerId: -1n,
              x: Math.round(px1 + (px2 - px1) * (i / steps)),
              y: Math.round(py1 + (py2 - py1) * (i / steps)),
              screenWidth: meta.width,
              screenHeight: meta.height,
              pressure: 1,
            });
          }

          await new Promise(resolve => setTimeout(resolve, 50));

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 1, // UP
            pointerId: -1n,
            x: px2,
            y: py2,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 0,
          });

          return { status: 'success', details: `Swiped from (${x1}, ${y1}) to (${x2}, ${y2})` };
        }

        case 'input_text': {
          const { text } = args;
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execPromise = promisify(exec);

          // Use Base64 encoding to avoid shell escaping nightmares and garbled characters
          const b64Text = Buffer.from(text).toString('base64');
          const command = `adb -s ${serial} shell am broadcast -a ADB_INPUT_B64 --es msg '${b64Text}'`;

          console.log(`[ScrcpyManager] Input text tool: "${text}"`);

          try {
            await execPromise(command);
            return { status: 'success', details: `Text entered successfully: "${text}"` };
          } catch (e: any) {
            console.error(`[ScrcpyManager] Text entry failed:`, e);
            throw new Error(`ADBKeyBoard text entry failed: ${e.message}`);
          }
        }

        case 'key_event': {
          const { key } = args;
          console.log(`[ScrcpyManager] Key event tool: ${key}`);

          switch (key) {
            case 'BACK':
              service.sendControlMessage({ type: ControlMessageType.BACK_OR_SCREEN_ON, action: 0 });
              service.sendControlMessage({ type: ControlMessageType.BACK_OR_SCREEN_ON, action: 1 });
              break;
            case 'HOME':
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 3, repeat: 0, metaState: 0 });
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 3, repeat: 0, metaState: 0 });
              break;
            case 'APP_SWITCH':
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 187, repeat: 0, metaState: 0 });
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 187, repeat: 0, metaState: 0 });
              break;
            default:
              throw new Error(`Unsupported key event: ${key}`);
          }

          return { status: 'success', details: `Sent key event: ${key}` };
        }

        default:
          throw new Error(`Unsupported tool name: ${name}`);
      }
    });
  }
}

export const scrcpyManager = new ScrcpyManager();
