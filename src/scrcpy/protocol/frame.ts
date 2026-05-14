import { Buffer } from "node:buffer";
import { 
  SESSION_PACKET_FLAG, 
  CONFIG_PACKET_FLAG, 
  KEY_FRAME_FLAG, 
  PTS_MASK 
} from "./constants";

export interface SessionPacket {
  kind: "session";
  width: number;
  height: number;
  clientResized: boolean;
}

export interface FrameMeta {
  kind: "frame";
  ptsUs: bigint;
  size: number;
  config: boolean;
  keyFrame: boolean;
}

export function parseFrameHeader(header: Buffer): SessionPacket | FrameMeta {
  if (header.length !== 12) {
    throw new Error(`frame header must be 12 bytes, got ${header.length}`);
  }

  const ptsAndFlags = header.readBigUInt64BE(0);
  const size = header.readUInt32BE(8);

  if (ptsAndFlags & SESSION_PACKET_FLAG) {
    const flagsHigh = Number((ptsAndFlags >> 32n) & 0xffffffffn);
    const width = Number(ptsAndFlags & 0xffffffffn);
    const height = size;
    return {
      kind: "session",
      width,
      height,
      clientResized: (flagsHigh & 0x01) !== 0,
    };
  }

  return {
    kind: "frame",
    ptsUs: ptsAndFlags & PTS_MASK,
    size,
    config: (ptsAndFlags & CONFIG_PACKET_FLAG) !== 0n,
    keyFrame: (ptsAndFlags & KEY_FRAME_FLAG) !== 0n,
  };
}
