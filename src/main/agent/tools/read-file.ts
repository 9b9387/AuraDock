import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import * as fs from 'node:fs/promises';

export const createReadFileTool = (context: AgentContext) => new FunctionTool({
  name: 'read_file',
  description: 'Read the contents of a local file.',
  parameters: z.object({
    path: z.string().describe('The path to the file to read.'),
  }),
  execute: async ({ path }) => {
    context.log('action', `Reading file: ${path}`);
    try {
      const content = await fs.readFile(path, 'utf-8');
      return { status: 'success', content };
    } catch (e: any) {
      return { status: 'error', message: e.message };
    }
  },
});
