import { AgentContext } from './types';
import { createTapTool } from './tools/tap';
import { createSwipeTool } from './tools/swipe';
import { createInputTextTool } from './tools/input-text';
import { createKeyEventTool } from './tools/key-event';
import { createWaitTool } from './tools/wait';
import { createReadFileTool } from './tools/read-file';
import { createWriteFileTool } from './tools/write-file';
import { createBashTool } from './tools/bash';
import { createAdbPushFileTool } from './tools/adb-push-file';
import { createAdbPushImageTool } from './tools/adb-push-image';
import { createLaunchAppTool } from './tools/launch-app';
import { createPlanTool } from './tools/plan';
import { createReplanTool } from './tools/replan';
import { createClearTextTool } from './tools/clear-text';

export class ToolRegistry {
  constructor(private context: AgentContext) {}

  getTools() {
    return [
      createTapTool(this.context),
      createSwipeTool(this.context),
      createInputTextTool(this.context),
      createKeyEventTool(this.context),
      createWaitTool(this.context),
      createReadFileTool(this.context),
      createWriteFileTool(this.context),
      createBashTool(this.context),
      createAdbPushFileTool(this.context),
      createAdbPushImageTool(this.context),
      createLaunchAppTool(this.context),
      createPlanTool(this.context),
      createReplanTool(this.context),
      createClearTextTool(this.context),
    ];
  }
}
