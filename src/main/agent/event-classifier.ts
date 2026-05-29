import { ConfigManager } from '../config-manager';

export interface ClassifyInput {
  /** Natural-language condition that defines a "real" event, e.g. "有人给我发微信消息". */
  condition: string;
  /** Cheap textual context (notification text / uiautomator dump). Preferred over images. */
  contextText: string;
  /** Optional screenshot (base64 JPEG, no data: prefix) used only when text is insufficient. */
  screenshotBase64?: string;
  /** Cheap model name for the gate. */
  model: string;
  /** What triggered this candidate, for logging/grounding. */
  source: 'notification' | 'screen';
}

export interface ClassifyResult {
  shouldAct: boolean;
  reason: string;
  sender?: string;
  message?: string;
}

/**
 * A lightweight, zero-token notification pre-filter. Sourced from the selected Watch
 * Skill's `metadata.watch` (packages/keywords), it lets Layer-0 cheaply skip irrelevant
 * notifications before paying for a Layer-1 classify call.
 */
export interface WatchMatcher {
  /** Words/phrases likely to appear in a relevant notification's title/text. */
  keywords: string[];
  /** Android package name fragments, e.g. "com.tencent.mm". */
  packageHints: string[];
}

const INSTRUCTION = `You are a lightweight, low-cost event gate for a phone-watching agent.
Your ONLY job is to decide whether the observed change matches the user's watch condition and therefore warrants taking action (e.g. replying).
Be conservative: only return shouldAct=true when you are confident the condition is genuinely met (e.g. a NEW incoming message addressed to the user). Ignore the user's own outgoing messages, system UI, ads, and unrelated changes.

You MUST respond with a single minified JSON object and nothing else, matching exactly:
{"shouldAct": boolean, "reason": string, "sender": string, "message": string}
- "sender": best-effort sender/contact name, or "" if unknown.
- "message": best-effort incoming message content, or "" if unknown.
Do not wrap the JSON in markdown fences. Do not add commentary.`;

/**
 * Layer-1 gate of the watch funnel: a single, cheap LLM call that decides whether a
 * programmatic candidate is a real event worth acting on. Stateless per call.
 */
export class EventClassifier {
  static async classify(input: ClassifyInput): Promise<ClassifyResult> {
    // Ensure API key env is synchronized for @google/adk fetch.
    const settings = ConfigManager.loadSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { shouldAct: false, reason: 'Missing Gemini API key; cannot classify.' };
    }
    process.env.GOOGLE_API_KEY = apiKey;
    process.env.GEMINI_API_KEY = apiKey;

    const adk = await import('@google/adk');
    const { LlmAgent, InMemoryRunner, isFinalResponse } = adk as any;

    const agent = new LlmAgent({
      name: 'WatchEventClassifier',
      model: input.model,
      instruction: INSTRUCTION,
    });

    const runner = new InMemoryRunner({ agent, appName: 'OmniAgentWatch' });
    const sessionId = 'watch-classify-' + Date.now();
    const userId = 'watch';
    await runner.sessionService.createSession({ appName: 'OmniAgentWatch', userId, sessionId });

    const parts: any[] = [
      {
        text: `WATCH CONDITION:\n${input.condition}\n\nTRIGGER SOURCE: ${input.source}\n\nOBSERVED CONTEXT:\n${input.contextText || '(no text context available)'}\n\nDecide if this matches the watch condition.`,
      },
    ];
    if (input.screenshotBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: input.screenshotBase64 } });
    }

    let finalText = '';
    let errMsg: string | null = null;
    try {
      for await (const event of runner.runAsync({
        userId,
        sessionId,
        newMessage: { role: 'user', parts },
        runConfig: { maxLlmCalls: 1 },
      })) {
        const code = (event as any).errorCode;
        const msg = (event as any).errorMessage;
        if (code || msg) {
          errMsg = msg || String(code);
          break;
        }
        if (isFinalResponse(event)) {
          finalText = event.content?.parts?.map((p: any) => p.text || '').join('') || '';
        }
      }
    } catch (e: any) {
      errMsg = e?.message || String(e);
    }

    if (errMsg) {
      return { shouldAct: false, reason: `Classifier error: ${errMsg}` };
    }

    return this.parseResult(finalText);
  }

  /** Robustly extract the JSON verdict, tolerating markdown fences or stray prose. */
  private static parseResult(raw: string): ClassifyResult {
    if (!raw || !raw.trim()) {
      return { shouldAct: false, reason: 'Empty classifier response.' };
    }
    let text = raw.trim();
    // Strip ```json fences if present.
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fence) text = fence[1].trim();
    // Fall back to the first {...} block.
    if (!text.startsWith('{')) {
      const brace = /\{[\s\S]*\}/.exec(text);
      if (brace) text = brace[0];
    }
    try {
      const obj = JSON.parse(text);
      return {
        shouldAct: Boolean(obj.shouldAct),
        reason: typeof obj.reason === 'string' ? obj.reason : '',
        sender: typeof obj.sender === 'string' && obj.sender ? obj.sender : undefined,
        message: typeof obj.message === 'string' && obj.message ? obj.message : undefined,
      };
    } catch {
      return { shouldAct: false, reason: `Unparseable classifier response: ${raw.slice(0, 160)}` };
    }
  }
}
