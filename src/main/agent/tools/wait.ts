import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';

export const createWaitTool = (context: AgentContext) => new FunctionTool({
  name: 'wait',
  description: 'Wait for a specified number of seconds for the UI to load or change.',
  parameters: z.object({
    seconds: z.number().min(0.5).max(10),
  }),
  execute: async ({ seconds }) => {
    context.log('status', `Waiting for ${seconds}s...`);
    await new Promise(r => setTimeout(r, seconds * 1000));
    return { status: 'success' };
  },
});
