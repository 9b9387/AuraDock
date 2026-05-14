import { Buffer } from "node:buffer";
import { ControlMessageType } from "./types";

export const ACTION_DOWN = 0;
export const ACTION_UP = 1;
export const ACTION_MOVE = 2;

export const KEY_ACTION_DOWN = 0;
export const KEY_ACTION_UP = 1;

export const BUTTON_PRIMARY = 1 << 0;
export const BUTTON_SECONDARY = 1 << 1;
export const BUTTON_TERTIARY = 1 << 2;

export const POINTER_ID_MOUSE = -1n; // 0xFFFF_FFFF_FFFF_FFFF as signed i64
export const POINTER_ID_GENERIC_FINGER = -2n; // 0xFFFF_FFFF_FFFF_FFFE

export const INJECT_TEXT_MAX_LENGTH = 300;
export const SET_CLIPBOARD_TEXT_MAX_LENGTH = (1 << 18) - 1;

export interface ControlMessage {
  type: ControlMessageType;
  action?: number;
  keycode?: number;
  repeat?: number;
  metaState?: number;
  pointerId?: bigint;
  pressure?: number;
  actionButton?: number;
  buttons?: number;
  x?: number;
  y?: number;
  screenWidth?: number;
  screenHeight?: number;
  hScroll?: number;
  vScroll?: number;
  text?: string;
  paste?: boolean;
  sequence?: bigint;
  copyKey?: number;
  on?: boolean;
  width?: number;
  height?: number;
}

function u16FixedPoint(value: number): number {
  if (value >= 1.0) return 0xffff;
  if (value <= 0.0) return 0;
  return Math.floor(value * 0x10000) & 0xffff;
}

function i16FixedPoint(value: number): number {
  if (value >= 1.0) return 0x7fff;
  if (value <= -1.0) return 0x8000; // stored as unsigned 16-bit
  return Math.floor(value * 0x8000) & 0xffff;
}

function truncateUtf8(text: string, maxBytes: number): Buffer {
  const buf = Buffer.from(text, "utf-8");
  if (buf.length <= maxBytes) return buf;

  let end = maxBytes;
  // If the last byte is a continuation byte (10xxxxxx), move back
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end--;
  }
  // If the last byte is a leading byte of a multi-byte sequence, drop it
  if (end > 0 && (buf[end] & 0x80) !== 0) {
    end--;
  }
  return buf.subarray(0, end);
}

export function serializeControlMessage(msg: ControlMessage): Buffer {
  const type = msg.type;
  switch (type) {
    case ControlMessageType.INJECT_KEYCODE: {
      const buf = Buffer.alloc(14);
      buf.writeUInt8(type, 0);
      buf.writeUInt8((msg.action || 0) & 0xff, 1);
      buf.writeUInt32BE(msg.keycode || 0, 2);
      buf.writeUInt32BE(msg.repeat || 0, 6);
      buf.writeUInt32BE(msg.metaState || 0, 10);
      return buf;
    }
    case ControlMessageType.INJECT_TEXT: {
      const textBuf = truncateUtf8(msg.text || "", INJECT_TEXT_MAX_LENGTH);
      const buf = Buffer.alloc(5 + textBuf.length);
      buf.writeUInt8(type, 0);
      buf.writeUInt32BE(textBuf.length, 1);
      textBuf.copy(buf, 5);
      return buf;
    }
    case ControlMessageType.INJECT_TOUCH_EVENT: {
      const buf = Buffer.alloc(32);
      buf.writeUInt8(type, 0);
      buf.writeUInt8((msg.action || 0) & 0xff, 1);
      buf.writeBigUInt64BE(BigInt.asUintN(64, msg.pointerId || 0n), 2);
      buf.writeInt32BE(Math.floor(msg.x || 0), 10);
      buf.writeInt32BE(Math.floor(msg.y || 0), 14);
      buf.writeUInt16BE((msg.screenWidth || 0) & 0xffff, 18);
      buf.writeUInt16BE((msg.screenHeight || 0) & 0xffff, 20);
      buf.writeUInt16BE(u16FixedPoint(msg.pressure ?? 1.0), 22);
      buf.writeUInt32BE((msg.actionButton || 0) & 0xffffffff, 24);
      buf.writeUInt32BE((msg.buttons || 0) & 0xffffffff, 28);
      return buf;
    }
    case ControlMessageType.INJECT_SCROLL_EVENT: {
      const buf = Buffer.alloc(21);
      buf.writeUInt8(type, 0);
      buf.writeInt32BE(Math.floor(msg.x || 0), 1);
      buf.writeInt32BE(Math.floor(msg.y || 0), 5);
      buf.writeUInt16BE((msg.screenWidth || 0) & 0xffff, 9);
      buf.writeUInt16BE((msg.screenHeight || 0) & 0xffff, 11);
      const h = Math.max(-1.0, Math.min(1.0, (msg.hScroll || 0.0) / 16.0));
      const v = Math.max(-1.0, Math.min(1.0, (msg.vScroll || 0.0) / 16.0));
      buf.writeUInt16BE(i16FixedPoint(h), 13);
      buf.writeUInt16BE(i16FixedPoint(v), 15);
      buf.writeUInt32BE((msg.buttons || 0) & 0xffffffff, 17);
      return buf;
    }
    case ControlMessageType.BACK_OR_SCREEN_ON: {
      const buf = Buffer.alloc(2);
      buf.writeUInt8(type, 0);
      buf.writeUInt8((msg.action || 0) & 0xff, 1);
      return buf;
    }
    case ControlMessageType.SET_CLIPBOARD: {
      const textBuf = truncateUtf8(
        msg.text || "",
        SET_CLIPBOARD_TEXT_MAX_LENGTH
      );
      const buf = Buffer.alloc(14 + textBuf.length);
      buf.writeUInt8(type, 0);
      buf.writeBigUInt64BE(BigInt.asUintN(64, msg.sequence || 0n), 1);
      buf.writeUInt8(msg.paste ? 1 : 0, 9);
      buf.writeUInt32BE(textBuf.length, 10);
      textBuf.copy(buf, 14);
      return buf;
    }
    case ControlMessageType.SET_DISPLAY_POWER:
    case ControlMessageType.CAMERA_SET_TORCH: {
      const buf = Buffer.alloc(2);
      buf.writeUInt8(type, 0);
      buf.writeUInt8(msg.on ? 1 : 0, 1);
      return buf;
    }
    case ControlMessageType.RESIZE_DISPLAY: {
      const buf = Buffer.alloc(5);
      buf.writeUInt8(type, 0);
      buf.writeUInt16BE((msg.width || 0) & 0xffff, 1);
      buf.writeUInt16BE((msg.height || 0) & 0xffff, 3);
      return buf;
    }
    case ControlMessageType.EXPAND_NOTIFICATION_PANEL:
    case ControlMessageType.EXPAND_SETTINGS_PANEL:
    case ControlMessageType.COLLAPSE_PANELS:
    case ControlMessageType.ROTATE_DEVICE:
    case ControlMessageType.OPEN_HARD_KEYBOARD_SETTINGS:
    case ControlMessageType.RESET_VIDEO:
    case ControlMessageType.CAMERA_ZOOM_IN:
    case ControlMessageType.CAMERA_ZOOM_OUT: {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(type, 0);
      return buf;
    }
    default:
      throw new Error(`unsupported control message type: ${type}`);
  }
}
