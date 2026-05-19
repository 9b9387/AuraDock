import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import * as fs from 'node:fs/promises';

export const createWriteFileTool = (context: AgentContext) => new FunctionTool({
  name: 'write_file',
  description: 'Write content to a local file.',
  parameters: z.object({
    path: z.string().describe('The path to the file to write.'),
    content: z.string().describe('The content to write to the file.'),
  }),
  execute: async ({ path, content }) => {
    context.log('action', `Writing file: ${path}`);
    try {
      await fs.writeFile(path, content, 'utf-8');
      return { status: 'success' };
    } catch (e: any) {
      return { status: 'error', message: e.message };
    }
  },
});
