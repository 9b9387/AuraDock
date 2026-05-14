import { Buffer } from "node:buffer";

export const SESSION_PACKET_FLAG = 1n << 63n;
export const CONFIG_PACKET_FLAG = 1n << 62n;
export const KEY_FRAME_FLAG = 1n << 61n;
export const PTS_MASK = (1n << 61n) - 1n;

export enum VideoCodec {
  H264 = "h264",
  H265 = "h265",
  AV1 = "av1",
}

export enum AudioCodec {
  OPUS = "opus",
  AAC = "aac",
  FLAC = "flac",
  RAW = "raw",
}

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
