import { ipcMain, MessageChannelMain } from 'electron';
import adbkit, { Client, Device } from '@u4/adbkit';
import { MediaStreamService, MediaKind, ControlMessageType } from '../scrcpy';

import { AdbDeviceInfo } from '../types';

const Adb = (adbkit as unknown as { default: typeof adbkit }).default || adbkit;

export class ScrcpyManager {
  private adb: Client = Adb.createClient();
  private services: Map<string, MediaStreamService> = new Map();

  async getDevices(): Promise<AdbDeviceInfo[]> {
    try {
      const devices = await this.adb.listDevices();
      return devices.map((d: Device) => ({
        id: d.id,
        serial: d.id, // AdbDeviceInfo uses serial
        type: d.type
      })) as unknown as AdbDeviceInfo[];
    } catch (e) {
      console.error('Failed to list devices:', e);
      return [];
    }
  }

  async startScrcpy(serial: string, port: Electron.MessagePortMain) {
    if (this.services.has(serial)) {
      this.services.get(serial)?.stop();
    }

    const service = new MediaStreamService({
      deviceSerial: serial,
      maxSize: 1024,
      video: true,
      audio: false, // Renderer doesn't handle audio yet
      control: true,
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
        } else if (msg.type === 'control-action') {
          // Additional control actions can be handled here
        }
      });
      port.start();

      // Bridge subscription to port
      (async () => {
        let packetCount = 0;
        try {
          for await (const packet of subscription) {
            if (packet.kind === MediaKind.VIDEO) {
              packetCount++;
              if (packetCount % 100 === 0 || packet.config) {
                console.log(`[Scrcpy Manager] Sending video packet #${packetCount}, size: ${packet.payload.length}, config: ${packet.config}, key: ${packet.keyFrame}`);
              }
              // Always send video data as a packet, including config (SPS/PPS)
              port.postMessage({ 
                type: 'packet', 
                data: packet.payload,
                keyFrame: packet.keyFrame,
                config: packet.config
              });
            } else if (packet.kind === MediaKind.SESSION) {
              console.log(`[Scrcpy Manager] Sending session update: ${packet.width}x${packet.height}`);
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
