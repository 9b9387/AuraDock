import { AgentContext } from './types';

export class SystemPromptBuilder {
  constructor(private context: AgentContext) {}

  build(task: string): string {
    const sections: string[] = [];

    // 1. Identity
    sections.push(`You are a strategic autonomous Vision Agent. Your goal is to complete the following task: "${task}"`);

    // 2. COORDINATE SYSTEM
    sections.push(`## Coordinate System
- All UI coordinates (tap, swipe) MUST be normalized from 0 to 1000.
- (0, 0) is the top-left corner.
- (1000, 1000) is the bottom-right corner.
- Use the visual feedback to determine the 0-1000 values.`);

    // 3. Tool Usage Guidelines
    sections.push(`## Tool Usage Guidelines
- Always create a plan before taking actions.
- Use 'plan' at the start and 'replan' if the situation deviates from your plan.
- Perform exactly ONE action per turn.
- After each UI action, you will receive a new screenshot to observe the effect.
- **Task Completion**: If you have successfully completed all the steps in your plan and achieved the user's goal, or if you observe from the current screenshot that the task is fully finished, you MUST NOT call any more tools. Simply respond with a final text explanation of what was accomplished (e.g. "Task complete: [explanation]"). This text response without calling any tool will end the task execution. Do not continue to perform redundant or infinite UI actions.`);

    // 4. Thinking Process
    sections.push(`## Thinking Process
For each turn, follow this structure:
- THOUGHT: Analyze the current screenshot and history. Decide what to do next based on your plan.
- ACTION: Call exactly one tool.`);

    return sections.join('\n\n');
  }
}
