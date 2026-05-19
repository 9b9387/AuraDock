import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execPromise = promisify(exec);

export const createAdbPushImageTool = (context: AgentContext) => new FunctionTool({
  name: 'adb_push_image',
  description: 'Push a local image file to the device\'s DCIM/Camera directory and trigger a media scan to make it appear in the gallery.',
  parameters: z.object({
    localPath: z.string().describe('The local path of the image file to push.'),
  }),
  execute: async ({ localPath }) => {
    context.log('action', `ADB Pushing image to gallery: ${localPath}`);
    const serial = context.getCurrentSerial();
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
