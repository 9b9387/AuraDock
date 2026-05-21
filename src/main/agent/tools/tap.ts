import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { ControlMessageType } from '@9b9387/android-stream-scrcpy';

export const createTapTool = (context: AgentContext) => new FunctionTool({
  name: 'tap',
  description: 'Tap on the screen at specified coordinates (x, y).',
  parameters: z.object({
    x: z.number().describe('X coordinate (normalized 0-1000)'),
    y: z.number().describe('Y coordinate (normalized 0-1000)'),
  }),
  execute: async ({ x, y }) => {
    const service = context.getService() as any;
    const width = service.latestSession?.width ?? service.currentMeta?.width;
    const height = service.latestSession?.height ?? service.currentMeta?.height;
    if (!width || !height) throw new Error('No stream metadata or session info available');

    // Scale normalized 0-1000 to actual pixels
    const pixelX = Math.round((x / 1000) * width);
    const pixelY = Math.round((y / 1000) * height);

    context.log('action', `Tapping at (${x}, ${y}) -> Pixels: (${pixelX}, ${pixelY})`);

    service.sendControlMessage({
      type: ControlMessageType.INJECT_TOUCH_EVENT,
      action: 0, // DOWN
      pointerId: -1n,
      x: pixelX,
      y: pixelY,
      screenWidth: width,
      screenHeight: height,
      pressure: 1,
    });
    await new Promise(r => setTimeout(r, 50));
    service.sendControlMessage({
      type: ControlMessageType.INJECT_TOUCH_EVENT,
      action: 1, // UP
      pointerId: -1n,
      x: pixelX,
      y: pixelY,
      screenWidth: width,
      screenHeight: height,
      pressure: 0,
    });
    return { status: 'success' };
  },
});
