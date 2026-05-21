import React from 'react';
import { Send, Square } from 'lucide-react';
import type { ConnectionStatus } from '../services/gemini-live-service';

interface ControlPanelProps {
  geminiStatus: ConnectionStatus;
  geminiChatInput: string;
  setGeminiChatInput: (val: string) => void;
  handleSendLiveChatText: () => void;
  agentInput: string;
  setAgentInput: (val: string) => void;
  agentRunning: boolean;
  activeSerial: string | null;
  handleStartAgent: () => void;
  handleGlobalStop: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  geminiStatus,
  geminiChatInput,
  setGeminiChatInput,
  handleSendLiveChatText,
  agentInput,
  setAgentInput,
  agentRunning,
  activeSerial,
  handleStartAgent,
  handleGlobalStop,
}) => {
  return (
    <div className="shrink-0">
      <div className="relative">
        {geminiStatus === 'connected' ? (
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
            <input
              type="text"
              value={geminiChatInput}
              onChange={(e) => setGeminiChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendLiveChatText(); }}
              placeholder="发送文本指令给实时语音助手..."
              className="flex-1 bg-transparent border-none focus:outline-none text-xs text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 px-3 py-3"
            />
            <button
              onClick={handleSendLiveChatText}
              disabled={!geminiChatInput.trim()}
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow disabled:opacity-30 transition-all shrink-0 active:scale-95 cursor-pointer mr-1"
            >
              <Send className="w-3.5 h-3.5 fill-white text-transparent" />
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              placeholder="给 Agent 发送指令... (例如：打开浏览器搜索最新AI新闻)"
              disabled={agentRunning || !activeSerial}
              className="block w-full h-24 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors dark:shadow-none m-0"
            />
            
            <div className="absolute bottom-4 right-4">
              {!agentRunning ? (
                <button
                  onClick={handleStartAgent}
                  disabled={!agentInput.trim() || !activeSerial}
                  className="flex items-center justify-center p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
                  title="发送任务指令"
                >
                  <Send className="w-3.5 h-3.5 fill-white text-transparent" />
                </button>
              ) : (
                <button
                  onClick={handleGlobalStop}
                  className="flex items-center justify-center p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow transition-all active:scale-95 animate-pulse cursor-pointer"
                  title="紧急停止 Agent 与通话"
                >
                  <Square className="w-3.5 h-3.5 fill-white text-transparent" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
