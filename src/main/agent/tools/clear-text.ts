import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export const createClearTextTool = (context: AgentContext) => new FunctionTool({
  name: 'clear_text',
  description: 'Clear all text in the currently focused input field using ADBKeyBoard.',
  parameters: z.object({}),
  execute: async ({}) => {
    const serial = context.getCurrentSerial();
    if (!serial) throw new Error('No active device serial');

    // Use ADBKeyBoard broadcast to clear text
    // Ref: https://github.com/senzhk/ADBKeyBoard
    const command = `adb -s ${serial} shell am broadcast -a ADB_CLEAR_TEXT`;
    
    try {
      await execPromise(command);
      return { status: 'success' };
    } catch (e: any) {
      context.log('status', `ADBKeyBoard clear failed: ${e.message}`);
      return { status: 'error', message: 'Failed to clear text. Ensure ADBKeyBoard is active.' };
    }
  },
});
