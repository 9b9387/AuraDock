import { ipcMain, BrowserWindow } from 'electron';
import { scrcpyManager } from './scrcpy-manager';
import { ToolRegistry } from './agent/tool-registry';
import { AgentLoop } from './agent/agent-loop';
import { AgentContext } from './agent/types';
import { ConfigManager } from './config-manager';
import { SkillManager } from './skill-manager';

function truncateBase64AndThought(str: string): string {
  if (typeof str !== 'string') return str;
  let clean = str;
  // Truncate Base64 (images/screenshots/etc.) down to 20 characters
  clean = clean.replace(/([a-zA-Z0-9+/=]{100,})/g, (match) => {
    return `${match.substring(0, 20)}... [truncated ${match.length} chars]`;
  });
  // Truncate thoughtSignature down to 20 characters
  clean = clean.replace(/(["']?thoughtSignature["']?\s*:\s*["'])([^"'\\]+)(["'])/gi, (match, prefix, signature, suffix) => {
    if (signature.length <= 20) return match;
    return `${prefix}${signature.substring(0, 20)}... [truncated ${signature.length} chars]${suffix}`;
  });
  return clean;
}

class CustomAdkLogger {
  private logLevel = 1; // LogLevel.INFO

  setLogLevel(level: number) {
    this.logLevel = level;
  }

  log(level: number, ...args: any[]) {
    if (this.logLevel > level) return;
    const cleanArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return truncateBase64AndThought(arg);
      }
      try {
        return truncateBase64AndThought(JSON.stringify(arg));
      } catch (e) {
        return String(arg);
      }
    });
    const prefix = level === 0 ? 'DEBUG' : level === 1 ? 'INFO' : level === 2 ? 'WARN' : 'ERROR';
    console.log(`${prefix}: [ADK] ${new Date().toISOString()} ${cleanArgs.join(' ')}`);
  }

  debug(...args: any[]) {
    this.log(0, ...args);
  }

  info(...args: any[]) {
    this.log(1, ...args);
  }

  warn(...args: any[]) {
    this.log(2, ...args);
  }

  error(...args: any[]) {
    this.log(3, ...args);
  }
}

export class VisionAgent implements AgentContext {
  private agent: any = null;
  private currentSerial: string | null = null;
  private screenshotPromise: { resolve: (data: string) => void; reject: (err: any) => void } | null = null;
  private loop: AgentLoop | null = null;
  private activeModel: string | null = null;
  private activeSkillName: string | null = null;

  constructor() {
    this.setupIpc();
  }

  private async ensureAgent(skillName: string | null = null) {
    const settings = ConfigManager.loadSettings();
    const modelName = settings.visionAgentModel || 'gemini-3-flash-preview';
    const normalizedSkill = skillName || null;

    if (this.agent && this.activeModel === modelName && this.activeSkillName === normalizedSkill) return;

    const skillSuffix = normalizedSkill ? ` with skill: ${normalizedSkill}` : '';
    this.log('status', `Initializing ADK Agent using model: ${modelName}${skillSuffix}...`);
    try {
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY in configuration/environment/.env');
      }

      // Update environment variables so @google/adk is synchronized
      process.env.GOOGLE_API_KEY = apiKey;
      process.env.GEMINI_API_KEY = apiKey;

      const adk = await import('@google/adk');
      const { LlmAgent, setLogger, SkillToolset } = adk;
      setLogger(new CustomAdkLogger());
      
      const registry = new ToolRegistry(this);
      const tools = registry.getTools();

      // Build the tools array. When a skill is selected, attach SkillToolset
      // (ADK-recommended), keeping the existing UI tools as additionalTools.
      let llmTools: any[] = tools;
      if (normalizedSkill && settings.skillsPath) {
        const skill = await SkillManager.loadSkill(settings.skillsPath, normalizedSkill);
        if (skill) {
          const toolset = new SkillToolset([skill], { additionalTools: tools });
          llmTools = [toolset];
          this.log('status', `Loaded skill: ${normalizedSkill}`);
        } else {
          this.log('status', `Failed to load skill "${normalizedSkill}", running without it.`);
        }
      }

      this.agent = new LlmAgent({
        name: 'VisionMobileAgent',
        model: modelName,
        instruction: `You are a strategic autonomous Vision Agent.
        
COORDINATE SYSTEM:
- All UI coordinates (tap, swipe) MUST be normalized from 0 to 1000.
- (0, 0) is the top-left corner.
- (1000, 1000) is the bottom-right corner.
- Use the visual feedback to determine the 0-1000 values.

TASK COMPLETION:
- If all steps in your plan are completed, or the task goal is fully achieved, DO NOT call any more tools. Just output a final text explanation stating that the task is finished (e.g. "Task complete: [explanation]").
- Do not perform redundant, continuous, or extra UI operations after your plan has been executed.`, 
        tools: llmTools,
      });

      this.activeModel = modelName;
      this.activeSkillName = normalizedSkill;
      this.loop = new AgentLoop(this, this.agent);
      this.log('status', `Agent successfully initialized with model: ${modelName}${skillSuffix}.`);
    } catch (e: any) {
      console.error('[VisionAgent] Failed to load ADK:', e);
      this.log('status', `Agent Initialization Failed: ${e.message}`);
    }
  }

  private notifyStatus(running: boolean) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('agent:status-change', { running });
    }
  }

  private setupIpc() {
    ipcMain.on('agent:start', async (event, payload) => {
      const { task, skillName } = typeof payload === 'string'
        ? { task: payload, skillName: null as string | null }
        : { task: payload?.task ?? '', skillName: (payload?.skillName ?? null) as string | null };

      this.currentSerial = this.findActiveSerial();
      if (!this.currentSerial) {
        this.log('status', 'No active device connected.');
        return;
      }

      const skillSuffix = skillName ? ` (skill: ${skillName})` : '';
      this.log('status', `Agent started for task: ${task}${skillSuffix}`);
      
      try {
        await this.ensureAgent(skillName);
        if (!this.loop) throw new Error('Agent failed to initialize');
        this.log('status', `Executing task using model: ${this.activeModel}${skillSuffix}`);
        this.notifyStatus(true);
        await this.loop.run(task);
      } catch (e: any) {
        this.log('status', `Agent Error: ${e.message}`);
      } finally {
        this.notifyStatus(false);
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
    const cleanMessage = truncateBase64AndThought(message);
    if (win) {
      win.webContents.send('agent:log', { type, message: cleanMessage });
    }
    console.log(`[Agent ${type.toUpperCase()}] ${cleanMessage}`);
  }
}
