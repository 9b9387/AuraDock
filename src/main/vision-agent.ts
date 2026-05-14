import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { scrcpyManager } from './scrcpy-manager';
import { ControlMessageType } from '../scrcpy/protocol/types';

export class VisionAgent {
  private agent: any = null;
  private currentSerial: string | null = null;
  private screenshotPromise: { resolve: (data: string) => void; reject: (err: any) => void } | null = null;
  private isRunning = false;

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

      this.log('status', `Loading ADK module... (Model: gemini-3-flash-preview)`);
      const { LlmAgent, FunctionTool } = await import('@google/adk');
      this.log('status', 'ADK module loaded, creating tools and agent instance...');

      const tapTool = new FunctionTool({
        name: 'tap',
        description: 'Tap on the screen at specified coordinates (x, y).',
        parameters: z.object({
          x: z.number().describe('X coordinate'),
          y: z.number().describe('Y coordinate'),
        }),
        execute: async ({ x, y }) => {
          this.log('action', `Tapping at (${x}, ${y})`);
          const service = this.getService();
          const meta = service.currentMeta;
          if (!meta) throw new Error('No stream metadata');

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 0, // DOWN
            pointerId: -1n,
            x, y,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 1,
          });
          await new Promise(r => setTimeout(r, 50));
          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 1, // UP
            pointerId: -1n,
            x, y,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 0,
          });
          return { status: 'success', message: `Tapped at ${x}, ${y}` };
        },
      });

      const swipeTool = new FunctionTool({
        name: 'swipe',
        description: 'Swipe on the screen from (x1, y1) to (x2, y2).',
        parameters: z.object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
          durationMs: z.number().default(300),
        }),
        execute: async ({ x1, y1, x2, y2, durationMs }) => {
          this.log('action', `Swiping from (${x1}, ${y1}) to (${x2}, ${y2})`);
          const service = this.getService();
          const meta = service.currentMeta;
          if (!meta) throw new Error('No stream metadata');

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 0, // DOWN
            pointerId: -1n,
            x: x1, y: y1,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 1,
          });

          const steps = 10;
          for (let i = 1; i <= steps; i++) {
            await new Promise(r => setTimeout(r, durationMs / steps));
            service.sendControlMessage({
              type: ControlMessageType.INJECT_TOUCH_EVENT,
              action: 2, // MOVE
              pointerId: -1n,
              x: x1 + (x2 - x1) * (i / steps),
              y: y1 + (y2 - y1) * (i / steps),
              screenWidth: meta.width,
              screenHeight: meta.height,
              pressure: 1,
            });
          }

          service.sendControlMessage({
            type: ControlMessageType.INJECT_TOUCH_EVENT,
            action: 1, // UP
            pointerId: -1n,
            x: x2, y: y2,
            screenWidth: meta.width,
            screenHeight: meta.height,
            pressure: 0,
          });
          return { status: 'success' };
        },
      });

      const inputTextTool = new FunctionTool({
        name: 'input_text',
        description: 'Input text into the focused field.',
        parameters: z.object({
          text: z.string(),
        }),
        execute: async ({ text }) => {
          this.log('action', `Inputting text: ${text}`);
          this.getService().sendControlMessage({
            type: ControlMessageType.INJECT_TEXT,
            text,
          });
          return { status: 'success' };
        },
      });

      const keyEventTool = new FunctionTool({
        name: 'key_event',
        description: 'Send a special key event (e.g., BACK, HOME, APP_SWITCH).',
        parameters: z.object({
          key: z.enum(['BACK', 'HOME', 'APP_SWITCH']),
        }),
        execute: async ({ key }) => {
          this.log('action', `Key event: ${key}`);
          const service = this.getService();
          switch (key) {
            case 'BACK':
              service.sendControlMessage({ type: ControlMessageType.BACK_OR_SCREEN_ON, action: 0 });
              service.sendControlMessage({ type: ControlMessageType.BACK_OR_SCREEN_ON, action: 1 });
              break;
            case 'HOME':
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 3, repeat: 0, metaState: 0 });
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 3, repeat: 0, metaState: 0 });
              break;
            case 'APP_SWITCH':
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 187, repeat: 0, metaState: 0 });
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 187, repeat: 0, metaState: 0 });
              break;
          }
          return { status: 'success' };
        },
      });

      const waitTool = new FunctionTool({
        name: 'wait',
        description: 'Wait for a specified number of seconds for the UI to load or change.',
        parameters: z.object({
          seconds: z.number().min(0.5).max(10),
        }),
        execute: async ({ seconds }) => {
          this.log('status', `Waiting for ${seconds}s...`);
          await new Promise(r => setTimeout(r, seconds * 1000));
          return { status: 'success' };
        },
      });

      this.agent = new LlmAgent({
        name: 'VisionMobileAgent',
        model: 'gemini-3-flash-preview',
        instruction: `You are a precise autonomous mobile agent.
OPERATIONAL RULES:
1. ONE ACTION AT A TIME: For each cycle, only perform ONE tool call (e.g., one tap). DO NOT chain multiple actions.
2. DETAILED OBSERVATION: Before acting, describe the screen state. If the task involves matching or selecting objects, list the objects you see, their labels, and their exact coordinates.
3. VERIFICATION: After an action, wait for the next screenshot to verify success.
4. COORDINATES: Ensure all coordinates are within the provided Screen Resolution bounds.
5. GAMEPLAY: For matching games, identify 'unblocked' tiles (tiles with no other tiles overlapping them).

PLAN -> PERCEIVE (list objects) -> DECIDE (one tool) -> ACT.`,
        tools: [tapTool, swipeTool, inputTextTool, keyEventTool, waitTool],
      });
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
      this.isRunning = true;
      
      try {
        await this.ensureAgent();
        if (!this.agent) throw new Error('Agent failed to initialize');
        await this.runLoop(task);
      } catch (e: any) {
        this.log('status', `Agent Error: ${e.message}`);
      } finally {
        this.isRunning = false;
        this.log('status', 'Agent loop stopped.');
      }
    });

    ipcMain.on('agent:stop', () => {
      this.isRunning = false;
      this.log('status', 'Stop signal received. Stopping agent...');
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

  private getService() {
    if (!this.currentSerial) throw new Error('No active device');
    const service = scrcpyManager.getService(this.currentSerial);
    if (!service) throw new Error('Service not found');
    return service;
  }

  private async captureScreenshot(): Promise<string> {
    return new Promise((resolve, reject) => {
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
  }

  private log(type: 'thought' | 'action' | 'status', message: string) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('agent:log', { type, message });
    }
    console.log(`[Agent ${type.toUpperCase()}] ${message}`);
  }

  private async runLoop(task: string) {
    const { InMemoryRunner, isFinalResponse } = await import('@google/adk');
    
    const runner = new InMemoryRunner({
      agent: this.agent,
      appName: 'OmniAgent',
    });

    const sessionId = 'vision-session-' + Date.now();
    const userId = 'user';

    await runner.sessionService.createSession({
      appName: 'OmniAgent',
      userId,
      sessionId,
    });

    let turn = 0;
    const maxTurns = 50; // Games might take more turns

    this.log('thought', `Starting session for task: ${task}`);

    while (turn < maxTurns && this.isRunning) {
      turn++;
      this.log('status', `Cycle ${turn} - Capturing screen...`);

      const base64Image = await this.captureScreenshot();
      if (!this.isRunning) break;

      const service = this.getService();
      const meta = service.currentMeta;
      const resolutionInfo = meta ? `Screen Resolution: ${meta.width}x${meta.height}. ` : '';
      
      const newMessage: any = {
        role: 'user',
        parts: [
          { text: `${resolutionInfo}Task: ${task}.
Analyze the image carefully.
IMPORTANT: You MUST ONLY perform ONE action (one tool call) in this turn.
After your action, I will provide a new screenshot.
If you have matched 3 pairs, or the task is finished, say "Task is complete".` },
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
        ]
      };

      this.log('status', 'Thinking...');
      let finalResponseText = '';
      try {
        for await (const event of runner.runAsync({
          userId,
          sessionId,
          newMessage,
        })) {
          if (!this.isRunning) break;
          const e = event as any;
          if (e.errorCode) {
            this.log('status', `Agent Error [${e.errorCode}]: ${e.errorMessage}`);
          }
          if (isFinalResponse(event)) {
            finalResponseText = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
          }
        }
      } catch (e: any) {
        this.log('status', `Error during cycle: ${e.message}`);
        console.error('Cycle error:', e);
        break;
      }

      if (!this.isRunning) break;

      if (finalResponseText) {
        this.log('thought', finalResponseText);
      }

      if (finalResponseText.toLowerCase().includes('task is complete') || finalResponseText.toLowerCase().includes('task complete')) {
        this.log('status', 'Task finished successfully!');
        break;
      }

      // Wait for UI to update before next cycle
      await new Promise(r => setTimeout(r, 1500));
    }

    if (turn >= maxTurns && this.isRunning) {
      this.log('status', 'Reached max turns without completion.');
    }
  }
}
