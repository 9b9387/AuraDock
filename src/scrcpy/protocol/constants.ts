import { Buffer } from "node:buffer";
import { VideoCodec, AudioCodec } from "./types";

export const SESSION_PACKET_FLAG = 1n << 63n;
export const CONFIG_PACKET_FLAG = 1n << 62n;
export const KEY_FRAME_FLAG = 1n << 61n;
export const PTS_MASK = (1n << 61n) - 1n;

function getCodecId(name: string): number {
  const buf = Buffer.alloc(4, 0);
  const nameBuf = Buffer.from(name, "ascii");
  nameBuf.copy(buf, 4 - nameBuf.length);
  return buf.readUInt32BE(0);
}

export const VIDEO_CODEC_IDS: Record<number, VideoCodec> = Object.fromEntries(
  Object.values(VideoCodec).map((c) => [getCodecId(c), c])
);

export const AUDIO_CODEC_IDS: Record<number, AudioCodec> = Object.fromEntries(
  Object.values(AudioCodec).map((c) => [getCodecId(c), c])
);
