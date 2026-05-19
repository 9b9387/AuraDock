import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execPromise = promisify(exec);

export const createBashTool = (context: AgentContext) => new FunctionTool({
  name: 'run_bash',
  description: 'Execute a bash command and return its output.',
  parameters: z.object({
    command: z.string().describe('The bash command to execute.'),
  }),
  execute: async ({ command }) => {
    context.log('action', `Executing bash: ${command}`);
    try {
      const { stdout, stderr } = await execPromise(command);
      return { status: 'success', stdout, stderr };
    } catch (e: any) {
      return { status: 'error', message: e.message, stderr: e.stderr };
    }
  },
});
