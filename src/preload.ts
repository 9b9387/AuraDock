import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("adb", {
  getGeminiApiKey: () => ipcRenderer.invoke("config:get-gemini-key"),
  getDevices: () => ipcRenderer.invoke("adb:get-devices"),
  executeTool: (serial: string, name: string, args: any) => ipcRenderer.invoke("adb:execute-tool", { serial, name, args }),
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
  onScreenshotRequest: (callback: () => void) => {
    ipcRenderer.on("agent:request-screenshot", () => callback());
  },
  sendScreenshot: (base64Data: string) => {
    ipcRenderer.send("agent:screenshot-data", base64Data);
  },
  onAgentLog: (callback: (log: any) => void) => {
    ipcRenderer.on("agent:log", (_event, log) => callback(log));
  },
  startAgent: (task: string) => ipcRenderer.send("agent:start", task),
  stopAgent: () => ipcRenderer.send("agent:stop"),
});
