import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';

export const createReplanTool = (context: AgentContext) => new FunctionTool({
  name: 'replan',
  description: 'Update the existing plan based on new observations or if the current plan is no longer valid.',
  parameters: z.object({
    reason: z.string().describe('Reason for replanning'),
    new_steps: z.array(z.string()).describe('The updated list of steps'),
  }),
  execute: async ({ reason, new_steps }) => {
    context.log('thought', `Replanning because: ${reason}`);
    context.log('thought', `Updated Plan: ${new_steps.join(' -> ')}`);
    return { status: 'success', plan: new_steps };
  },
});
