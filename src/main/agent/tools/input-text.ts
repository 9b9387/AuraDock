import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export const createInputTextTool = (context: AgentContext) => new FunctionTool({
  name: 'input_text',
  description: 'Input text into the focused field using ADBKeyBoard. Supports long text, Unicode, and emojis via Base64 encoding.',
  parameters: z.object({
    text: z.string(),
  }),
  execute: async ({ text }) => {
    const serial = context.getCurrentSerial();
    if (!serial) throw new Error('No active device serial');

    // Use Base64 encoding to avoid shell escaping nightmares and garbled characters
    // Ref: https://github.com/senzhk/ADBKeyBoard
    const b64Text = Buffer.from(text).toString('base64');
    const command = `adb -s ${serial} shell am broadcast -a ADB_INPUT_B64 --es msg '${b64Text}'`;
    
    try {
      await execPromise(command);
      return { status: 'success' };
    } catch (e: any) {
      context.log('status', `ADBKeyBoard Base64 input failed: ${e.message}`);
      return { status: 'error', message: `ADBKeyBoard failed: ${e.message}` };
    }
  },
});
