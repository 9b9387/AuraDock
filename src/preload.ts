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
  onAgentStatusChange: (callback: (status: { running: boolean }) => void) => {
    const listener = (_event: any, status: { running: boolean }) => callback(status);
    ipcRenderer.on("agent:status-change", listener);
    return () => ipcRenderer.removeListener("agent:status-change", listener);
  },
  startAgent: (payload: string | { task: string; skillName?: string | null }) =>
    ipcRenderer.send("agent:start", payload),
  stopAgent: () => ipcRenderer.send("agent:stop"),
  pauseAgent: () => ipcRenderer.send("agent:pause"),
  resumeAgent: (newContext?: string) => ipcRenderer.send("agent:resume", newContext),
  getAgentState: () => ipcRenderer.invoke("agent:get-state"),
  setTheme: (theme: "dark" | "light" | "system") => ipcRenderer.invoke("dark-mode:set", theme),
  getCurrentTheme: () => ipcRenderer.invoke("dark-mode:get-current"),
  onThemeUpdated: (callback: (data: { isDark: boolean; themeSource: "dark" | "light" | "system" }) => void) => {
    const listener = (_event: any, data: { isDark: boolean; themeSource: "dark" | "light" | "system" }) => callback(data);
    ipcRenderer.on("dark-mode:updated", listener);
    return () => ipcRenderer.removeListener("dark-mode:updated", listener);
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: any) => ipcRenderer.invoke("settings:save", settings),
  getMicrophoneStatus: () => ipcRenderer.invoke("permission:get-microphone-status"),
  requestMicrophone: () => ipcRenderer.invoke("permission:request-microphone"),
  openSystemSettings: () => ipcRenderer.invoke("permission:open-system-settings"),
  db: {
    getAllSessions: () => ipcRenderer.invoke("db:get-all-sessions"),
    saveSession: (session: any) => ipcRenderer.invoke("db:save-session", session),
    deleteSession: (id: string) => ipcRenderer.invoke("db:delete-session", id),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    pickFolder: () => ipcRenderer.invoke("skills:pick-folder"),
  },
});
