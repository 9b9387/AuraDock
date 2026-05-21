import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { ControlMessageType } from '@9b9387/android-stream-scrcpy';

export const createSwipeTool = (context: AgentContext) => new FunctionTool({
  name: 'swipe',
  description: 'Swipe on the screen from (x1, y1) to (x2, y2).',
  parameters: z.object({
    x1: z.number().describe('Start X (normalized 0-1000)'),
    y1: z.number().describe('Start Y (normalized 0-1000)'),
    x2: z.number().describe('End X (normalized 0-1000)'),
    y2: z.number().describe('End Y (normalized 0-1000)'),
    durationMs: z.number().default(300),
  }),
  execute: async ({ x1, y1, x2, y2, durationMs }) => {
    const service = context.getService() as any;
    const width = service.latestSession?.width ?? service.currentMeta?.width;
    const height = service.latestSession?.height ?? service.currentMeta?.height;
    if (!width || !height) throw new Error('No stream metadata or session info available');

    const px1 = Math.round((x1 / 1000) * width);
    const py1 = Math.round((y1 / 1000) * height);
    const px2 = Math.round((x2 / 1000) * width);
    const py2 = Math.round((y2 / 1000) * height);

    context.log('action', `Swiping (${x1}, ${y1})->(${x2}, ${y2}) -> Pixels (${px1}, ${py1})->(${px2}, ${py2})`);

    service.sendControlMessage({
      type: ControlMessageType.INJECT_TOUCH_EVENT,
      action: 0, // DOWN
      pointerId: -1n,
      x: px1,
      y: py1,
      screenWidth: width,
      screenHeight: height,
      pressure: 1,
    });

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, durationMs / steps));
      service.sendControlMessage({
        type: ControlMessageType.INJECT_TOUCH_EVENT,
        action: 2, // MOVE
        pointerId: -1n,
        x: px1 + (px2 - px1) * (i / steps),
        y: py1 + (py2 - py1) * (i / steps),
        screenWidth: width,
        screenHeight: height,
        pressure: 1,
      });
    }

    service.sendControlMessage({
      type: ControlMessageType.INJECT_TOUCH_EVENT,
      action: 1, // UP
      pointerId: -1n,
      x: px2,
      y: py2,
      screenWidth: width,
      screenHeight: height,
      pressure: 0,
    });
    return { status: 'success' };
  },
});
