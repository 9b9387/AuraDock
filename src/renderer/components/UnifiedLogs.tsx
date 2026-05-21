import React from 'react';
import { Bot, Cpu, Sparkles, Check, Play } from 'lucide-react';
import type { LogEntry } from '../types';

interface UnifiedLogsProps {
  unifiedLogs: LogEntry[];
  unifiedLogEndRef: React.RefObject<HTMLDivElement | null>;
}

export const UnifiedLogs: React.FC<UnifiedLogsProps> = ({
  unifiedLogs,
  unifiedLogEndRef,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 rounded-2xl p-4 mb-4 space-y-3 min-h-[250px] shadow-inner">
      {unifiedLogs.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6">
          <Bot className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mb-3" />
          <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400">等待接收任务指令</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">在下方输入框描述你的任务目标并运行</p>
        </div>
      ) : (
        unifiedLogs.map((log, index) => {
          const isUserSpeech = log.message.startsWith('You:');
          const isGeminiSpeech = log.message.startsWith('Gemini:');

          if (isUserSpeech || isGeminiSpeech) {
            const displayText = log.message.replace(/^(Gemini:|You:)/, '').trim();
            return (
              <div 
                key={index} 
                className={`flex ${isGeminiSpeech ? 'justify-start' : 'justify-end'} animate-in fade-in duration-150`}
              >
                <div className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                  isGeminiSpeech 
                    ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800/40 rounded-tl-none' 
                    : 'bg-emerald-600 text-white rounded-tr-none font-semibold shadow-md'
                }`}>
                  <p>{displayText}</p>
                  <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 text-right mt-1 font-mono opacity-60">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          }

          let badgeColor = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400';
          let icon = <Cpu className="w-3.5 h-3.5" />;
          let cardBg = 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/40';
          let textColor = 'text-zinc-700 dark:text-zinc-300';

          if (log.type === 'thought') {
            badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10';
            icon = <Sparkles className="w-3.5 h-3.5" />;
            cardBg = 'bg-blue-500/[0.02] border-blue-500/10';
            textColor = 'text-blue-800 dark:text-blue-200';
          } else if (log.type === 'action') {
            badgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10';
            icon = <Play className="w-3.5 h-3.5" />;
            cardBg = 'bg-amber-500/[0.02] border-amber-500/10';
            textColor = 'text-amber-800 dark:text-amber-200';
          } else if (log.type === 'status') {
            badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10';
            icon = <Check className="w-3.5 h-3.5" />;
            cardBg = 'bg-emerald-500/[0.02] border-emerald-500/10';
            textColor = 'text-emerald-800 dark:text-emerald-200';
          }

          return (
            <div 
              key={index}
              className={`p-3 rounded-xl border ${cardBg} space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1 text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}`}>
                  {icon}
                  {log.type}
                </span>
                <span className="text-xxs text-zinc-400 dark:text-zinc-600 font-mono">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <p className={`text-xs leading-relaxed font-sans ${textColor}`}>
                {log.message}
              </p>
            </div>
          );
        })
      )}
      <div ref={unifiedLogEndRef} />
    </div>
  );
};
