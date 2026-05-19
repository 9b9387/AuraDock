import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { scrcpyManager } from './scrcpy-manager';
import { ControlMessageType } from '@9b9387/android-stream-scrcpy';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

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
          return { status: 'success' };
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

      const readFileTool = new FunctionTool({
        name: 'read_file',
        description: 'Read the contents of a local file.',
        parameters: z.object({
          path: z.string().describe('The path to the file to read.'),
        }),
        execute: async ({ path }) => {
          this.log('action', `Reading file: ${path}`);
          try {
            const content = await fs.readFile(path, 'utf-8');
            return { status: 'success', content };
          } catch (e: any) {
            return { status: 'error', message: e.message };
          }
        },
      });

      const writeFileTool = new FunctionTool({
        name: 'write_file',
        description: 'Write content to a local file.',
        parameters: z.object({
          path: z.string().describe('The path to the file to write.'),
          content: z.string().describe('The content to write to the file.'),
        }),
        execute: async ({ path, content }) => {
          this.log('action', `Writing file: ${path}`);
          try {
            await fs.writeFile(path, content, 'utf-8');
            return { status: 'success' };
          } catch (e: any) {
            return { status: 'error', message: e.message };
          }
        },
      });

      const bashTool = new FunctionTool({
        name: 'run_bash',
        description: 'Execute a bash command and return its output.',
        parameters: z.object({
          command: z.string().describe('The bash command to execute.'),
        }),
        execute: async ({ command }) => {
          this.log('action', `Executing bash: ${command}`);
          try {
            const { stdout, stderr } = await execPromise(command);
            return { status: 'success', stdout, stderr };
          } catch (e: any) {
            return { status: 'error', message: e.message, stderr: e.stderr };
          }
        },
      });

      const adbPushFileTool = new FunctionTool({
        name: 'adb_push_file',
        description: 'Push a local file to the Android device using ADB. If the file is an image (.jpg, .png, etc.), it will be pushed to the gallery (DCIM) and a media scan will be triggered.',
        parameters: z.object({
          localPath: z.string().describe('The local path of the file to push.'),
          remotePath: z.string().describe('The destination path on the device.'),
        }),
        execute: async ({ localPath, remotePath }) => {
          this.log('action', `ADB Pushing file: ${localPath} to ${remotePath}`);
          const serial = this.currentSerial;
          if (!serial) return { status: 'error', message: 'No active device' };

          try {
            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(localPath);
            const finalRemotePath = isImage ? `/sdcard/DCIM/Camera/${path.basename(localPath)}` : remotePath;

            await execPromise(`adb -s ${serial} push "${localPath}" "${finalRemotePath}"`);
            
            if (isImage) {
              await execPromise(`adb -s ${serial} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${finalRemotePath}"`);
              return { status: 'success', message: `Image pushed to gallery: ${finalRemotePath}` };
            }
            
            return { status: 'success', message: `File pushed to: ${finalRemotePath}` };
          } catch (e: any) {
            return { status: 'error', message: e.message };
          }
        },
      });

      const adbPushImageTool = new FunctionTool({
        name: 'adb_push_image',
        description: 'Push a local image file to the device\'s DCIM/Camera directory and trigger a media scan to make it appear in the gallery.',
        parameters: z.object({
          localPath: z.string().describe('The local path of the image file to push.'),
        }),
        execute: async ({ localPath }) => {
          this.log('action', `ADB Pushing image to gallery: ${localPath}`);
          const serial = this.currentSerial;
          if (!serial) return { status: 'error', message: 'No active device' };

          try {
            const filename = path.basename(localPath);
            const remotePath = `/sdcard/DCIM/Camera/${filename}`;
            
            await execPromise(`adb -s ${serial} push "${localPath}" "${remotePath}"`);
            await execPromise(`adb -s ${serial} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${remotePath}"`);
            
            return { status: 'success', message: `Image successfully added to gallery: ${remotePath}` };
          } catch (e: any) {
            return { status: 'error', message: e.message };
          }
        },
      });

      this.agent = new LlmAgent({
        name: 'VisionMobileAgent',
        model: 'gemini-3-flash-preview',
        instruction: `You are a strategic autonomous Vision Agent.
OPERATIONAL ARCHITECTURE:
1. PLANNING: Create and maintain a multi-step plan.
2. STATE TRACKING: Track your current step, progress, and total task status.
3. DECIDING: Perform ONE action to move closer to finishing the CURRENT step.
4. VERIFYING & MANAGING: Use results to update your plan and current step state.`,
        tools: [tapTool, swipeTool, inputTextTool, keyEventTool, waitTool, readFileTool, writeFileTool, bashTool, adbPushFileTool, adbPushImageTool],
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
    const { InMemoryRunner, isFinalResponse, toStructuredEvents, EventType } = await import('@google/adk');
    
    const runner = new InMemoryRunner({
      agent: this.agent,
      appName: 'OmniAgent',
    });

    const sessionId = 'vision-session-' + Date.now();
    const userId = 'user';

    await runner.sessionService.createSession({ appName: 'OmniAgent', userId, sessionId });

    let cycleCount = 0;
    const maxCycles = 50;
    const actionHistory: string[] = [];

    const meta = this.getService().currentMeta;
    const resolutionInfo = meta ? `Screen Resolution: ${meta.width}x${meta.height}. ` : '';

    // --- PHASE 0: INITIAL PLANNING (TEXT ONLY) ---
    this.log('status', 'Phase 0: Initial Planning');
    let currentPlan = '';
    let stepContext = 'Initializing task...'; // VARIABLE FOR STEP MANAGEMENT

    const planningMessage: any = {
      role: 'user',
      parts: [
        { text: `Task: ${task}.
Analyze this task and provide:
1. A high-level 3-5 step PLAN.
2. The INITIAL STEP you will attempt.
Do not call tools.` }
      ]
    };

    try {
      for await (const event of runner.runAsync({ userId, sessionId, newMessage: planningMessage })) {
        if (isFinalResponse(event)) {
          currentPlan = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
          stepContext = `Starting Plan. Current Step: Determining first move.`;
        }
      }
    } catch (e: any) {
      this.log('status', `Planning Error: ${e.message}`);
      return;
    }
    this.log('thought', `Plan: ${currentPlan}`);

    // --- MAIN LOOP ---
    while (cycleCount < maxCycles && this.isRunning) {
      cycleCount++;
      
      const historySummary = actionHistory.length > 0 
        ? `Action History:\n${actionHistory.join('\n')}` 
        : 'Action History: No actions yet.';

      // --- PHASE 1: DECISION (ACT) ---
      this.log('status', `Cycle ${cycleCount} - Decision Phase`);
      const base64Decision = await this.captureScreenshot();
      if (!this.isRunning) break;

      const decisionMessage: any = {
        role: 'user',
        parts: [
          { text: `TASK: ${task}
FULL PLAN: ${currentPlan}
CURRENT STEP CONTEXT: ${stepContext}
${historySummary}

Observe the screenshot and perform the NEXT SINGLE ACTION for the CURRENT STEP.
If the entire task is finished, say "Task is complete".` },
          { inlineData: { mimeType: 'image/jpeg', data: base64Decision } }
        ]
      };

      let actionTaken = false;
      let decisionText = '';
      let toolCallDescription = '';

      try {
        for await (const event of runner.runAsync({ userId, sessionId, newMessage: decisionMessage })) {
          if (!this.isRunning) break;
          if (isFinalResponse(event)) {
            decisionText = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
          }
          const structured = toStructuredEvents(event);
          for (const se of structured) {
            if (se.type === EventType.TOOL_CALL) {
              toolCallDescription = `${se.call.name}(${JSON.stringify(se.call.args)})`;
            }
            if (se.type === EventType.TOOL_RESULT) {
              actionTaken = true;
            }
          }
          if (actionTaken) break;
        }
      } catch (e: any) {
        this.log('status', `Decision Error: ${e.message}`);
        break;
      }

      if (!this.isRunning) break;
      if (decisionText) this.log('thought', `Decision: ${decisionText}`);

      if (decisionText.toLowerCase().includes('task is complete')) {
        this.log('status', 'Task finished successfully!');
        break;
      }

      // --- PHASE 2: VERIFICATION (VISUAL) ---
      let verificationResult = 'No action performed.';
      if (actionTaken) {
        this.log('status', `Cycle ${cycleCount} - Verification Phase`);
        await new Promise(r => setTimeout(r, 2000));
        const base64Verify = await this.captureScreenshot();
        if (!this.isRunning) break;

        const verifyMessage: any = {
          role: 'user',
          parts: [
            { text: `Action performed: ${toolCallDescription}.
Compare screen with previous state. Is this SUCCESS or FAILURE? Describe visual changes.` },
            { inlineData: { mimeType: 'image/jpeg', data: base64Verify } }
          ]
        };

        try {
          for await (const event of runner.runAsync({ userId, sessionId, newMessage: verifyMessage })) {
            if (!this.isRunning) break;
            if (isFinalResponse(event)) {
              verificationResult = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
            }
          }
        } catch (e: any) {
          this.log('status', `Verification Error: ${e.message}`);
        }
        this.log('thought', `Verify Result: ${verificationResult}`);
      }

      // --- PHASE 3: STATE MANAGEMENT & REPLANNING (TEXT ONLY) ---
      if (this.isRunning) {
        this.log('status', `Cycle ${cycleCount} - State Manager Phase`);
        const stateManagerMessage: any = {
          role: 'user',
          parts: [
            { text: `TASK: ${task}
FULL PLAN: ${currentPlan}
PREVIOUS STEP CONTEXT: ${stepContext}
LAST ACTION: ${toolCallDescription}
VERIFICATION RESULT: ${verificationResult}

As the STATE MANAGER, update the execution status:
1. Is the CURRENT STEP complete?
2. What is the NEW "CURRENT STEP CONTEXT" for the next turn? (Be specific)
3. Do we need to REPLAN the "FULL PLAN"?
4. Is the TOTAL TASK complete?

Respond with the updated FULL PLAN and NEW STEP CONTEXT. Do not use tools.` }
          ]
        };

        let managerResponse = '';
        try {
          for await (const event of runner.runAsync({ userId, sessionId, newMessage: stateManagerMessage })) {
            if (!this.isRunning) break;
            if (isFinalResponse(event)) {
              managerResponse = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
            }
          }
        } catch (e: any) {
          this.log('status', `State Manager Error: ${e.message}`);
        }

        if (managerResponse) {
          this.log('thought', `State Update: ${managerResponse}`);
          // Simplified extraction logic: treat the whole response as the updated plan and context
          stepContext = managerResponse; 
          actionHistory.push(`Turn ${cycleCount}: ${toolCallDescription} -> Result: ${verificationResult}`);
        }
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    if (cycleCount >= maxCycles && this.isRunning) {
      this.log('status', 'Reached max cycles.');
    }
  }
}
