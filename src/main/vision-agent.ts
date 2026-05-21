import { ipcMain, BrowserWindow } from 'electron';
import { scrcpyManager } from './scrcpy-manager';
import { ToolRegistry } from './agent/tool-registry';
import { AgentLoop } from './agent/agent-loop';
import { AgentContext } from './agent/types';

function truncateBase64(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/([a-zA-Z0-9+/=]{200,})/g, (match) => {
    return `${match.substring(0, 50)}... [truncated ${match.length} chars]`;
  });
}

export class VisionAgent implements AgentContext {
  private agent: any = null;
  private currentSerial: string | null = null;
  private screenshotPromise: { resolve: (data: string) => void; reject: (err: any) => void } | null = null;
  private loop: AgentLoop | null = null;

  constructor() {
    this.setupIpc();
  }

  private async ensureAgent() {
    if (this.agent) return;
    this.log('status', 'Initializing ADK Agent...');
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY in environment/.env');
      }
      if (!process.env.GOOGLE_API_KEY) {
        process.env.GOOGLE_API_KEY = apiKey;
      }

      const { LlmAgent } = await import('@google/adk');
      
      const registry = new ToolRegistry(this);
      const tools = registry.getTools();

      this.agent = new LlmAgent({
        name: 'VisionMobileAgent',
        model: 'gemini-3-flash-preview',
        instruction: `You are a strategic autonomous Vision Agent.
        
COORDINATE SYSTEM:
- All UI coordinates (tap, swipe) MUST be normalized from 0 to 1000.
- (0, 0) is the top-left corner.
- (1000, 1000) is the bottom-right corner.
- Use the visual feedback to determine the 0-1000 values.

TASK COMPLETION:
- If all steps in your plan are completed, or the task goal is fully achieved, DO NOT call any more tools. Just output a final text explanation stating that the task is finished (e.g. "Task complete: [explanation]").
- Do not perform redundant, continuous, or extra UI operations after your plan has been executed.`, 
        tools: tools,
      });

      this.loop = new AgentLoop(this, this.agent);
      this.log('status', 'Agent successfully initialized.');
    } catch (e: any) {
      console.error('[VisionAgent] Failed to load ADK:', e);
      this.log('status', `Agent Initialization Failed: ${e.message}`);
    }
  }

  private setupIpc() {
    ipcMain.on('agent:start', async (event, task) => {
      this.currentSerial = this.findActiveSerial();
      if (!this.currentSerial) {
        this.log('status', 'No active device connected.');
        return;
      }

      this.log('status', `Agent started for task: ${task}`);
      
      try {
        await this.ensureAgent();
        if (!this.loop) throw new Error('Agent failed to initialize');
        await this.loop.run(task);
      } catch (e: any) {
        this.log('status', `Agent Error: ${e.message}`);
      }
    });

    ipcMain.on('agent:stop', () => {
      if (this.loop) {
        this.loop.stop();
        this.log('status', 'Stop signal received. Stopping agent...');
      }
    });

    ipcMain.on('agent:pause', () => {
      if (this.loop) {
        this.loop.pause();
      }
    });

    ipcMain.on('agent:resume', (event, newContext?: string) => {
      if (this.loop) {
        this.loop.resume(newContext);
      }
    });

    ipcMain.handle('agent:get-state', () => {
      if (this.loop) {
        return this.loop.getShareableState();
      }
      return null;
    });

    ipcMain.on('agent:screenshot-data', (event, base64Data) => {
      if (this.screenshotPromise) {
        this.screenshotPromise.resolve(base64Data);
        this.screenshotPromise = null;
      }
    });
  }

  private findActiveSerial(): string | null {
    const services = (scrcpyManager as any).services;
    for (const serial of services.keys()) {
      return serial;
    }
    return null;
  }

  getService() {
    if (!this.currentSerial) throw new Error('No active device');
    const service = scrcpyManager.getService(this.currentSerial);
    if (!service) throw new Error('Service not found');
    return service;
  }

  getCurrentSerial(): string | null {
    return this.currentSerial;
  }

  async captureScreenshot(): Promise<string> {
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await new Promise((resolve, reject) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (!win) return reject(new Error('No window'));

          this.screenshotPromise = { resolve, reject };
          win.webContents.send('agent:request-screenshot');
          
          setTimeout(() => {
            if (this.screenshotPromise) {
              this.screenshotPromise.reject(new Error('Screenshot timeout'));
              this.screenshotPromise = null;
            }
          }, 5000);
        });
      } catch (e: any) {
        if (e.message === 'Screenshot timeout' && i < maxRetries - 1) {
          this.log('status', `Screenshot timed out, retrying (${i + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw e;
      }
    }
    throw new Error('Screenshot failed after retries');
  }

  log(type: 'thought' | 'action' | 'status', message: string) {
    const win = BrowserWindow.getAllWindows()[0];
    const cleanMessage = truncateBase64(message);
    if (win) {
      win.webContents.send('agent:log', { type, message: cleanMessage });
    }
    console.log(`[Agent ${type.toUpperCase()}] ${cleanMessage}`);
  }
}
