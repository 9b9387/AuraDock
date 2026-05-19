import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';

export const createPlanTool = (context: AgentContext) => new FunctionTool({
  name: 'plan',
  description: 'Create a multi-step plan to achieve the goal. Should be used at the very beginning.',
  parameters: z.object({
    steps: z.array(z.string()).describe('List of steps to take'),
  }),
  execute: async ({ steps }) => {
    context.log('thought', `Initial Plan: ${steps.join(' -> ')}`);
    return { status: 'success', plan: steps };
  },
});
