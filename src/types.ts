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

// Vite injected constants
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
