import { AgentContext } from './types';
import { SystemPromptBuilder } from './system-prompt';

export class AgentLoop {
  private isRunning = false;
  private isPaused = false;
  private currentTask = '';
  private currentPlan = 'NOT_CREATED';
  private currentContext = 'Waiting for initial plan.';
  private actionHistory: string[] = [];
  private maxCycles = 50;

  constructor(private context: AgentContext, private agent: any) {}

  public getShareableState() {
    return {
      task: this.currentTask,
      currentPlan: this.currentPlan,
      currentContext: this.currentContext,
      actionHistory: this.actionHistory,
    };
  }

  public pause() {
    this.isPaused = true;
    this.context.log('status', 'Agent paused. Waiting for live voice call control...');
  }

  public resume(newContext?: string) {
    this.isPaused = false;
    if (newContext) {
      this.currentContext = newContext;
    }
    this.context.log('status', 'Agent resumed. Continuing autonomous execution...');
  }

  async run(task: string) {
    this.currentTask = task;
    const { InMemoryRunner, isFinalResponse, toStructuredEvents, EventType } = await import('@google/adk');
    const promptBuilder = new SystemPromptBuilder(this.context);
    const systemPrompt = promptBuilder.build(task);
    
    const runner = new InMemoryRunner({
      agent: this.agent,
      appName: 'OmniAgent',
    });

    const sessionId = 'vision-session-' + Date.now();
    const userId = 'user';

    await runner.sessionService.createSession({ appName: 'OmniAgent', userId, sessionId });

    this.isRunning = true;
    this.actionHistory = [];
    this.context.log('status', 'Agent Started');

    const UI_TOOLS = ['tap', 'swipe', 'input_text', 'key_event', 'wait'];

    let cycleCount = 0;
    while (cycleCount < this.maxCycles && this.isRunning) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      cycleCount++;
      this.context.log('status', `Cycle ${cycleCount}`);

      // 1. Capture Current State
      const screenshot = await this.context.captureScreenshot();
      if (!this.isRunning) break;

      // 2. DECISION PHASE
      const historySummary = this.actionHistory.length > 0 
        ? `--- HISTORY ---\n${this.actionHistory.join('\n')}\n---------------` 
        : 'No history yet.';

      const decisionPrompt = [
        { text: `TASK: ${task}\n\nCURRENT PLAN:\n${this.currentPlan}\n\nCURRENT CONTEXT:\n${this.currentContext}\n\n${historySummary}\n\nINSTRUCTIONS:\n- If plan is NOT_CREATED, use 'plan' tool first.\n- If all steps in your plan are completed, or you confirm the task goal is achieved from the screenshot, DO NOT call any tools. Just output a final text message explaining the completion.\n- Observe the screenshot.\n- Perform EXACTLY ONE action.` }
      ];

      if (screenshot) {
        decisionPrompt.push({ inlineData: { mimeType: 'image/jpeg', data: screenshot } });
      }

      let toolCall: any = null;
      let finalAnswer = '';

      try {
        for await (const event of runner.runAsync({ 
          userId, 
          sessionId, 
          newMessage: { role: 'user', parts: decisionPrompt },
          runConfig: { pauseOnToolCalls: true, maxLlmCalls: 1 }
        })) {
          if (!this.isRunning) break;
          const structured = toStructuredEvents(event);
          for (const se of structured) {
            if (se.type === EventType.TOOL_CALL) {
              toolCall = se.call;
              break;
            }
          }
          if (toolCall) break;
          if (isFinalResponse(event)) {
            finalAnswer = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
          }
        }
      } catch (e: any) {
        if (!this.isRunning) break;
        this.context.log('status', `Error in Decision: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!this.isRunning) break;

      if (finalAnswer && !toolCall) {
        this.context.log('thought', `Task Completed: ${finalAnswer}`);
        this.context.log('status', 'Success');
        break;
      }

      if (toolCall) {
        const toolName = toolCall.name;
        const toolArgs = toolCall.args;
        this.context.log('action', `${toolName}(${JSON.stringify(toolArgs)})`);

        // Execute
        let toolResult: any;
        try {
          const tool = this.agent.tools.find((t: any) => t.name === toolName);
          if (!tool) throw new Error(`Tool ${toolName} not found`);
          toolResult = await tool.execute(toolArgs);

          if (toolName === 'plan' || toolName === 'replan') {
            this.currentPlan = toolResult.plan.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
          }
        } catch (e: any) {
          toolResult = { status: 'error', message: e.message };
        }

        if (!this.isRunning) break;

        // 3. OBSERVATION PHASE
        if (UI_TOOLS.includes(toolName)) {
          this.context.log('status', 'Observing...');
          await new Promise(r => setTimeout(r, 2000));
          if (!this.isRunning) break;
          const afterScreenshot = await this.context.captureScreenshot();
          if (!this.isRunning) break;

          const observationPrompt = [
            { text: `You just performed: ${toolName}(${JSON.stringify(toolArgs)})\nResult: ${JSON.stringify(toolResult)}\n\nObserve the new screenshot and answer:\n1. Did it work as expected?\n2. What is the current UI state?\n3. What is the NEXT step in the plan? (If all steps are completed and the goal is achieved, explicitly state that the task is finished)\n\nUpdate CONTEXT_UPDATE: <summary>` }
          ];

          if (afterScreenshot) {
            observationPrompt.push({ inlineData: { mimeType: 'image/jpeg', data: afterScreenshot } });
          }

          try {
            let obsText = '';
            for await (const event of runner.runAsync({
              userId,
              sessionId,
              newMessage: { role: 'user', parts: observationPrompt },
              runConfig: { maxLlmCalls: 1, pauseOnToolCalls: true }
            })) {
              if (!this.isRunning) break;
              if (isFinalResponse(event)) {
                obsText = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
              }
            }
            if (!this.isRunning) break;
            this.currentContext = obsText;
            this.actionHistory.push(`Turn ${cycleCount}: ${toolName} -> ${obsText.split('\n')[0]}`);
          } catch (e) {
            if (!this.isRunning) break;
            this.context.log('status', 'Observation failed');
            this.actionHistory.push(`Turn ${cycleCount}: ${toolName} -> (Visual verify failed)`);
          }
        } else {
          // Non-UI tool
          this.currentContext = `Executed ${toolName}. Result: ${JSON.stringify(toolResult)}`;
          this.actionHistory.push(`Turn ${cycleCount}: ${toolName} -> Success`);
        }
      }

      if (!this.isRunning) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    this.isRunning = false;
  }

  stop() {
    this.isRunning = false;
  }
}
