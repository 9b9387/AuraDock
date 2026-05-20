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

  setupHandlers() {
    ipcMain.handle('adb:get-devices', () => this.getDevices());
    ipcMain.on('adb:request-scrcpy', (event, serial) => {
      const { port1, port2 } = new MessageChannelMain();
      this.startScrcpy(serial, port2);
      event.sender.postMessage('adb:scrcpy-port', { serial }, [port1]);
    });
  }
}

export const scrcpyManager = new ScrcpyManager();
