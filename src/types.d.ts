export interface AdbDeviceInfo {
  serial: string;
  type: string;
  product?: string;
  model?: string;
  device?: string;
  transportId?: string;
}

declare global {
  interface Window {
    adb: {
      getDevices: () => Promise<AdbDeviceInfo[]>;
      requestScrcpy: (serial: string) => void;
      onScrcpyPort: (callback: (port: MessagePort) => void) => () => void;
    };
  }
}
