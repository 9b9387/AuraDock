import { EventEmitter } from "node:events";
import {
  DeviceClientOptions,
  ScrcpyDeviceClient,
  StreamMeta,
} from "./device-client";
import {
  ControlMessage,
  DeviceMessage,
  FrameMeta,
  SessionPacket,
} from "../protocol/index";
import { MediaKind, MediaPacket, MediaSubscriber } from "./media-subscriber";

export enum StreamState {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  STOPPING = "stopping",
  ERROR = "error",
}

export interface MediaServiceOptions extends DeviceClientOptions {
  queueMaxPackets?: number;
}

/**
 * MediaStreamService manages the higher-level logic of the scrcpy stream:
 * - Tracking stream state (stopped, running, error)
 * - Caching configuration packets (SPS/PPS) and latest keyframes
 * - Distributing media packets to subscribers
 */
export class MediaStreamService extends EventEmitter {
  private client: ScrcpyDeviceClient;
  private state = StreamState.STOPPED;
  private meta: StreamMeta | null = null;
  private options: Required<MediaServiceOptions>;

  private videoConfig: Buffer | null = null;
  private audioConfig: Buffer | null = null;
  private latestKeyFrame: MediaPacket | null = null;
  private latestSession: SessionPacket | null = null;

  private subscribers: Set<MediaSubscriber> = new Set();

  constructor(options: MediaServiceOptions = {}) {
    super();
    this.options = {
      queueMaxPackets: options.queueMaxPackets || 240,
      ...options,
    } as Required<MediaServiceOptions>;

    this.client = new ScrcpyDeviceClient(this.options);
    this.setupClientListeners();
  }

  private setupClientListeners(): void {
    this.client.on("video", (meta: FrameMeta, payload: Buffer) => {
      const packet: MediaPacket = {
        kind: MediaKind.VIDEO,
        ptsUs: meta.ptsUs,
        config: meta.config,
        keyFrame: meta.keyFrame,
        payload,
      };
      if (meta.config) this.videoConfig = payload;
      if (meta.keyFrame) this.latestKeyFrame = packet;
      this.broadcast(packet);
    });

    this.client.on("audio", (meta: FrameMeta, payload: Buffer) => {
      const packet: MediaPacket = {
        kind: MediaKind.AUDIO,
        ptsUs: meta.ptsUs,
        config: meta.config,
        keyFrame: false,
        payload,
      };
      if (meta.config) this.audioConfig = payload;
      this.broadcast(packet);
    });

    this.client.on("session", (session: SessionPacket) => {
      this.latestSession = session;
      const packet: MediaPacket = {
        kind: MediaKind.SESSION,
        ptsUs: 0n,
        config: false,
        keyFrame: false,
        payload: Buffer.alloc(0),
        width: session.width,
        height: session.height,
      };
      this.broadcast(packet);
    });

    this.client.on("deviceMessage", (msg: DeviceMessage) => {
      this.emit("deviceMessage", msg);
    });

    this.client.on("error", (e: Error) => {
      this.setState(StreamState.ERROR);
      this.emit("error", e);
      this.stop();
    });
  }

  async start(): Promise<StreamMeta> {
    if (this.state === StreamState.RUNNING || this.state === StreamState.STARTING) {
      return this.meta!;
    }
    this.setState(StreamState.STARTING);
    try {
      this.meta = await this.client.start();
      this.setState(StreamState.RUNNING);
      return this.meta;
    } catch (e) {
      this.setState(StreamState.ERROR);
      throw e;
    }
  }

  stop(): void {
    if (this.state === StreamState.STOPPED) return;
    this.setState(StreamState.STOPPING);
    this.client.stop();
    this.videoConfig = null;
    this.audioConfig = null;
    this.latestKeyFrame = null;
    this.latestSession = null;
    this.subscribers.forEach(sub => sub.close());
    this.subscribers.clear();
    this.setState(StreamState.STOPPED);
  }

  sendControlMessage(msg: ControlMessage): void {
    this.client.sendControlMessage(msg);
  }

  subscribe(): AsyncIterableIterator<MediaPacket> {
    const subscriber = new MediaSubscriber(this.options.queueMaxPackets);
    this.subscribers.add(subscriber);

    // Send initial snapshot
    if (this.latestSession) {
      subscriber.push({
        kind: MediaKind.SESSION,
        ptsUs: 0n,
        config: false,
        keyFrame: false,
        payload: Buffer.alloc(0),
        width: this.latestSession.width,
        height: this.latestSession.height,
      });
    }
    if (this.videoConfig) {
      subscriber.push({
        kind: MediaKind.VIDEO,
        ptsUs: 0n,
        config: true,
        keyFrame: false,
        payload: this.videoConfig,
      });
    }
    if (this.latestKeyFrame) {
      subscriber.push(this.latestKeyFrame);
    }
    if (this.audioConfig) {
      subscriber.push({
        kind: MediaKind.AUDIO,
        ptsUs: 0n,
        config: true,
        keyFrame: false,
        payload: this.audioConfig,
      });
    }

    const iterator = subscriber[Symbol.asyncIterator]();
    
    return {
      next: () => iterator.next(),
      return: async (value?: MediaPacket) => {
        this.subscribers.delete(subscriber);
        subscriber.close();
        if (iterator.return) return await iterator.return(value);
        return { done: true, value };
      },
      throw: async (e?: Error) => {
        this.subscribers.delete(subscriber);
        subscriber.close();
        if (iterator.throw) return await iterator.throw(e);
        throw e;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  private broadcast(packet: MediaPacket): void {
    for (const sub of this.subscribers) {
      sub.push(packet);
    }
  }

  private setState(state: StreamState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit("state", state);
  }

  get currentState() { return this.state; }
  get currentMeta() { return this.meta; }
}
