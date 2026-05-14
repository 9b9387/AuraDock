import { Buffer } from "node:buffer";
import * as net from "node:net";
import { EventEmitter } from "node:events";
import * as path from "node:path";
import adbkit, { Client, Device } from "@u4/adbkit";
import {
  AudioCodec,
  AUDIO_CODEC_IDS,
  ControlMessage,
  parseDeviceMessage,
  parseFrameHeader,
  serializeControlMessage,
  SessionPacket,
  VideoCodec,
  VIDEO_CODEC_IDS,
} from "../protocol";
import { StreamReader } from "./stream-reader";

const Adb = (adbkit as unknown as { default: typeof adbkit }).default || adbkit;

export const SCRCPY_V4_VERSION = "4.0";
const DEFAULT_SOCKET_NAME = "scrcpy_0000000a";

export interface StreamMeta {
  deviceName: string;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  width: number;
  height: number;
}

export interface DeviceClientOptions {
  deviceSerial?: string;
  maxSize?: number;
  maxFps?: number;
  videoBitRate?: number;
  audioBitRate?: number;
  video?: boolean;
  audio?: boolean;
  control?: boolean;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  socketName?: string;
  connectionTimeoutMs?: number;
  deployTimeoutMs?: number;
  serverJarPath?: string;
}

/**
 * ScrcpyDeviceClient handles the low-level ADB connection, server deployment,
 * and raw socket communication with the scrcpy-server on the Android device.
 */
export class ScrcpyDeviceClient extends EventEmitter {
  private options: Required<DeviceClientOptions>;
  private adb: Client = Adb.createClient();
  private device: Device | null = null;
  private serverStream: net.Socket | null = null;
  private videoSocket: net.Socket | null = null;
  private audioSocket: net.Socket | null = null;
  private controlSocket: net.Socket | null = null;
  private videoReader: StreamReader | null = null;
  private audioReader: StreamReader | null = null;
  private controlReader: StreamReader | null = null;
  private running = false;
  private meta: StreamMeta | null = null;

  constructor(options: DeviceClientOptions = {}) {
    super();
    this.options = {
      deviceSerial: options.deviceSerial || "",
      maxSize: options.maxSize || 0,
      maxFps: options.maxFps || 30,
      videoBitRate: options.videoBitRate || 8000000,
      audioBitRate: options.audioBitRate || 128000,
      video: options.video !== false,
      audio: options.audio !== false,
      control: options.control !== false,
      videoCodec: options.videoCodec || VideoCodec.H264,
      audioCodec: options.audioCodec || AudioCodec.OPUS,
      socketName: options.socketName || DEFAULT_SOCKET_NAME,
      connectionTimeoutMs: options.connectionTimeoutMs || 8000,
      deployTimeoutMs: options.deployTimeoutMs || 5000,
      serverJarPath:
        options.serverJarPath ||
        path.join(__dirname, "assets", `scrcpy-server-v${SCRCPY_V4_VERSION}.jar`),
    };
  }

  async start(): Promise<StreamMeta> {
    if (this.running) throw new Error("backend already running");

    const devices = await this.adb.listDevices();
    if (devices.length === 0) throw new Error("no ADB device found");

    const serial = this.options.deviceSerial || devices[0].id;
    console.log(`Using device: ${serial}`);
    this.device = this.adb.getDevice(serial);

    await this.spawnServer();
    await this.connectSockets();
    this.meta = await this.handshake();
    this.running = true;

    this.startWorkerLoops();
    return this.meta;
  }

  stop(): void {
    this.running = false;
    this.cleanup();
  }

  sendControlMessage(msg: ControlMessage): void {
    if (!this.running || !this.controlSocket) {
      throw new Error("control channel is not available");
    }
    const payload = serializeControlMessage(msg);
    this.controlSocket.write(payload);
  }

  private async spawnServer(): Promise<void> {
    if (!this.device) throw new Error("no device");
    const devicePath = `/data/local/tmp/scrcpy-server-v${SCRCPY_V4_VERSION}.jar`;
    await this.device.push(this.options.serverJarPath, devicePath);

    const args = [
      `CLASSPATH=${devicePath}`,
      "app_process",
      "/",
      "com.genymobile.scrcpy.Server",
      SCRCPY_V4_VERSION,
      "log_level=info",
      "tunnel_forward=true",
      "scid=0000000a",
      `video=${this.options.video}`,
      `audio=${this.options.audio}`,
      `control=${this.options.control}`,
      `video_codec=${this.options.videoCodec}`,
      `audio_codec=${this.options.audioCodec}`,
      `max_size=${this.options.maxSize}`,
      `max_fps=${this.options.maxFps}`,
      `video_bit_rate=${this.options.videoBitRate}`,
      `audio_bit_rate=${this.options.audioBitRate}`,
      "send_device_meta=true",
      "send_frame_meta=true",
      "send_dummy_byte=true",
      "send_stream_meta=true",
      "cleanup=true",
      "stay_awake=false",
      "show_touches=false",
      "power_off_on_close=false",
      "clipboard_autosync=false",
    ];

    this.serverStream = (await this.device.shell(args.join(" "))) as unknown as net.Socket;
    
    this.serverStream.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      this.emit("serverLog", text);
    });

    // Wait for initial server output or timeout
    await new Promise<void>((resolve, reject) => {
      if (!this.serverStream) return reject(new Error("no server stream"));
      const timeout = setTimeout(() => reject(new Error("server spawn timeout")), this.options.deployTimeoutMs);
      
      const onData = () => {
        clearTimeout(timeout);
        this.serverStream?.removeListener("data", onData);
        resolve();
      };
      this.serverStream.on("data", onData);
      this.serverStream.once("error", (e: Error) => {
        clearTimeout(timeout);
        reject(e);
      });
      this.serverStream.once("end", () => {
        clearTimeout(timeout);
        reject(new Error("server exited prematurely"));
      });
    });
  }

  private async connectSockets(): Promise<void> {
    if (!this.device) throw new Error("no device");
    const order: ("video" | "audio" | "control")[] = [];
    if (this.options.video) order.push("video");
    if (this.options.audio) order.push("audio");
    if (this.options.control) order.push("control");

    const deadline = Date.now() + this.options.connectionTimeoutMs;

    for (const name of order) {
      let connected = false;
      let attempts = 0;
      while (Date.now() < deadline) {
        attempts++;
        try {
          const socket = (await this.device.openLocal(`localabstract:scrcpy_0000000a`)) as unknown as net.Socket;
          if (name === "video") this.videoSocket = socket;
          else if (name === "audio") this.audioSocket = socket;
          else if (name === "control") this.controlSocket = socket;
          
          connected = true;
          console.log(`Connected to ${name} socket on attempt ${attempts}`);
          break;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (attempts % 5 === 0) {
            console.error(`Failed to connect to ${name} socket (attempt ${attempts}): ${msg}`);
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!connected) throw new Error(`failed to connect scrcpy ${name} socket after ${attempts} attempts`);
    }
  }

  private async handshake(): Promise<StreamMeta> {
    const firstSocket = this.videoSocket || this.audioSocket || this.controlSocket;
    if (!firstSocket) throw new Error("no sockets connected");

    console.log("Starting handshake...");
    const sharedReader = new StreamReader(firstSocket);

    console.log("Reading dummy byte...");
    const dummy = await sharedReader.readExact(1);
    console.log(`Dummy byte: 0x${dummy.toString("hex")}`);
    if (dummy[0] !== 0) throw new Error("invalid dummy byte");

    console.log("Reading device name (64 bytes)...");
    const deviceNameRaw = await sharedReader.readExact(64);
    console.log(`Device name raw (hex): ${deviceNameRaw.toString("hex")}`);
    const deviceName = deviceNameRaw.toString("utf-8").split("\0")[0];
    console.log(`Device name: ${deviceName}`);

    let videoCodec: VideoCodec | undefined;
    let audioCodec: AudioCodec | undefined;
    let width = 0;
    let height = 0;

    if (this.videoSocket) {
      this.videoReader = this.videoSocket === firstSocket ? sharedReader : new StreamReader(this.videoSocket);
      console.log("Reading video codec id...");
      const codecIdBuf = await this.videoReader.readExact(4);
      console.log(`Video codec ID hex: ${codecIdBuf.toString("hex")}`);
      videoCodec = VIDEO_CODEC_IDS[codecIdBuf.readUInt32BE(0)];
      console.log(`Video codec: ${videoCodec}`);
      
      console.log("Reading session meta...");
      const sessionBuf = await this.videoReader.readExact(12);
      console.log(`Session meta hex: ${sessionBuf.toString("hex")}`);
      const session = parseFrameHeader(sessionBuf) as SessionPacket;
      width = session.width;
      height = session.height;
      console.log(`Initial resolution: ${width}x${height}`);
    }

    if (this.audioSocket) {
      this.audioReader = this.audioSocket === firstSocket ? sharedReader : new StreamReader(this.audioSocket);
      console.log("Reading audio codec id...");
      const codecIdBuf = await this.audioReader.readExact(4);
      const codecId = codecIdBuf.readUInt32BE(0);
      if (codecId === 0) {
        console.log("Audio disabled by server (codec id 0)");
        this.audioSocket.destroy();
        this.audioSocket = null;
        this.audioReader = null;
      } else {
        audioCodec = AUDIO_CODEC_IDS[codecId];
        console.log(`Audio codec: ${audioCodec}`);
      }
    }

    if (this.controlSocket) {
      this.controlReader = this.controlSocket === firstSocket ? sharedReader : new StreamReader(this.controlSocket);
    }

    console.log("Handshake complete.");
    return { deviceName, videoCodec, audioCodec, width, height };
  }

  private async socketReadExact(socket: net.Socket, n: number): Promise<Buffer> {
    if (this.videoSocket === socket && this.videoReader) return this.videoReader.readExact(n);
    if (this.audioSocket === socket && this.audioReader) return this.audioReader.readExact(n);
    if (this.controlSocket === socket && this.controlReader) return this.controlReader.readExact(n);

    // Fallback for unexpected cases
    return new Promise((resolve, reject) => {
      const check = () => {
        if (socket.readableLength >= n) {
          resolve(socket.read(n));
          return true;
        }
        return false;
      };
      if (check()) return;
      const onData = () => { if (check()) socket.removeListener("data", onData); };
      socket.on("data", onData);
      socket.once("error", reject);
      socket.once("end", () => reject(new Error("socket closed")));
    });
  }

  private startWorkerLoops(): void {
    if (this.videoSocket) this.workerLoop("video", this.videoSocket, this.handleVideoHeader.bind(this));
    if (this.audioSocket) this.workerLoop("audio", this.audioSocket, this.handleAudioHeader.bind(this));
    if (this.controlSocket) this.controlWorkerLoop();
  }

  private async workerLoop(_kind: "video" | "audio", socket: net.Socket, headerHandler: (header: Buffer) => Promise<void>): Promise<void> {
    try {
      while (this.running) {
        const header = await this.socketReadExact(socket, 12);
        await headerHandler(header);
      }
    } catch (e) {
      if (this.running) this.emit("error", e);
    }
  }

  private async handleVideoHeader(header: Buffer): Promise<void> {
    const parsed = parseFrameHeader(header);
    if (parsed.kind === "session") {
      this.emit("session", parsed);
      return;
    }
    const payload = await this.socketReadExact(this.videoSocket!, parsed.size);
    this.emit("video", parsed, payload);
  }

  private async handleAudioHeader(header: Buffer): Promise<void> {
    const parsed = parseFrameHeader(header);
    if (parsed.kind === "session") return; // Should not happen
    const payload = await this.socketReadExact(this.audioSocket!, parsed.size);
    this.emit("audio", parsed, payload);
  }

  private async controlWorkerLoop(): Promise<void> {
    const readExact = (n: number) => this.socketReadExact(this.controlSocket!, n);
    try {
      while (this.running) {
        const msg = await parseDeviceMessage(readExact);
        this.emit("deviceMessage", msg);
      }
    } catch (e) {
      if (this.running) this.emit("error", e);
    }
  }

  private cleanup(): void {
    [this.videoSocket, this.audioSocket, this.controlSocket].forEach(s => s?.destroy());
    this.videoSocket = this.audioSocket = this.controlSocket = null;
    this.videoReader = this.audioReader = this.controlReader = null;
    this.serverStream?.destroy();
    this.serverStream = null;
  }
}
