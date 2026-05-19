export interface AgentContext {
  getService(): any;
  log(type: 'thought' | 'action' | 'status', message: string): void;
  getCurrentSerial(): string | null;
  captureScreenshot(): Promise<string>;
}
