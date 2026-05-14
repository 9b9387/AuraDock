import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("adb", {
  getDevices: () => ipcRenderer.invoke("adb:get-devices"),
  requestScrcpy: (serial: string) => ipcRenderer.send("adb:request-scrcpy", serial),
  onScrcpyPort: (_callback: (port: MessagePort) => void) => {
    const listener = (event: Electron.IpcRendererEvent) => {
      const port = event.ports[0];
      // Pass the port to the renderer via window.postMessage
      // This is necessary because contextBridge doesn't support transferring MessagePorts directly in arguments
      window.postMessage({ type: "scrcpy-port" }, "*", [port]);
    };
    ipcRenderer.on("adb:scrcpy-port", listener);
    return () => ipcRenderer.removeListener("adb:scrcpy-port", listener);
  },
});
