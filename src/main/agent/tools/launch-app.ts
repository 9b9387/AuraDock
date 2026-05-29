import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export const createLaunchAppTool = (context: AgentContext) => new FunctionTool({
  name: 'launch_app',
  description: 'Launch (open / bring to foreground) an Android app directly by its package name, without navigating the home screen. Use this to quickly open a known app, e.g. WeChat (com.tencent.mm).',
  parameters: z.object({
    packageName: z.string().describe('The Android package name to launch, e.g. "com.tencent.mm".'),
  }),
  execute: async ({ packageName }) => {
    const pkg = (packageName || '').trim();
    context.log('action', `Launching app: ${pkg}`);
    const serial = context.getCurrentSerial();
    if (!serial) return { status: 'error', message: 'No active device' };
    if (!pkg) return { status: 'error', message: 'packageName is required' };

    try {
      // monkey resolves the app's LAUNCHER activity automatically, so no activity name is needed.
      const { stdout, stderr } = await execPromise(
        `adb -s ${serial} shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`
      );
      const out = `${stdout || ''}${stderr || ''}`;
      // monkey prints this when the package has no launchable activity (e.g. wrong package name).
      if (/No activities found|Error|aborted|monkey aborted/i.test(out) && !/Events injected: 1/i.test(out)) {
        return { status: 'error', message: `Failed to launch ${pkg}: ${out.trim().slice(0, 200)}` };
      }
      return { status: 'success', message: `Launched ${pkg}` };
    } catch (e: any) {
      return { status: 'error', message: e.message };
    }
  },
});
