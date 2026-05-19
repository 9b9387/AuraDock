import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execPromise = promisify(exec);

export const createAdbPushFileTool = (context: AgentContext) => new FunctionTool({
  name: 'adb_push_file',
  description: 'Push a local file to the Android device using ADB. If the file is an image (.jpg, .png, etc.), it will be pushed to the gallery (DCIM) and a media scan will be triggered.',
  parameters: z.object({
    localPath: z.string().describe('The local path of the file to push.'),
    remotePath: z.string().describe('The destination path on the device.'),
  }),
  execute: async ({ localPath, remotePath }) => {
    context.log('action', `ADB Pushing file: ${localPath} to ${remotePath}`);
    const serial = context.getCurrentSerial();
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
