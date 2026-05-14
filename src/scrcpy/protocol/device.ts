import { Buffer } from "node:buffer";

export enum DeviceMessageType {
  CLIPBOARD = 0,
  ACK_CLIPBOARD = 1,
  UHID_OUTPUT = 2,
}

export interface DeviceMessage {
  type: DeviceMessageType;
  text?: string;
  sequence?: bigint;
  uhidId?: number;
  data?: Buffer;
}

export async function parseDeviceMessage(
  readExact: (n: number) => Promise<Buffer>
): Promise<DeviceMessage> {
  const head = await readExact(1);
  const type = head[0] as DeviceMessageType;

  switch (type) {
    case DeviceMessageType.CLIPBOARD: {
      const lenBuf = await readExact(4);
      const length = lenBuf.readUInt32BE(0);
      const textBuf = await readExact(length);
      return { type, text: textBuf.toString("utf-8") };
    }
    case DeviceMessageType.ACK_CLIPBOARD: {
      const seqBuf = await readExact(8);
      return { type, sequence: seqBuf.readBigUInt64BE(0) };
    }
    case DeviceMessageType.UHID_OUTPUT: {
      const metaBuf = await readExact(4);
      const uhidId = metaBuf.readUInt16BE(0);
      const length = metaBuf.readUInt16BE(2);
      const data = await readExact(length);
      return { type, uhidId, data };
    }
    default:
      throw new Error(`unknown device message type: ${type}`);
  }
}
