import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { AgentContext } from '../types';
import { ControlMessageType } from '@9b9387/android-stream-scrcpy';

export const createKeyEventTool = (context: AgentContext) => new FunctionTool({
  name: 'key_event',
  description: 'Send a special key event (e.g., BACK, HOME, APP_SWITCH).',
  parameters: z.object({
    key: z.enum(['BACK', 'HOME', 'APP_SWITCH']),
  }),
  execute: async ({ key }) => {
    const service = context.getService();
    switch (key) {
      case 'BACK':
        service.sendControlMessage({ type: ControlMessageType.BACK_OR_SCREEN_ON, action: 0 });
        service.sendControlMessage({ type: ControlMessageType.BACK_OR_SCREEN_ON, action: 1 });
        break;
      case 'HOME':
        service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 3, repeat: 0, metaState: 0 });
        service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 3, repeat: 0, metaState: 0 });
        break;
      case 'APP_SWITCH':
        service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 187, repeat: 0, metaState: 0 });
        service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 187, repeat: 0, metaState: 0 });
        break;
    }
    return { status: 'success' };
  },
});
