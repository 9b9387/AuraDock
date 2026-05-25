import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Cpu, Brain, Info, Terminal, ArrowDown } from 'lucide-react';
import type { LogEntry } from '../types';

interface UnifiedLogsProps {
  unifiedLogs: LogEntry[];
}

export const UnifiedLogs: React.FC<UnifiedLogsProps> = ({
  unifiedLogs,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const isNearBottomRef = useRef(true);
  const prevLogsLengthRef = useRef(unifiedLogs.length);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    // A buffer of 60px is extremely safe and natural for detecting bottom.
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = scrollBottom < 60;

    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);

    if (nearBottom) {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prevLength = prevLogsLengthRef.current;
    prevLogsLengthRef.current = unifiedLogs.length;

    if (unifiedLogs.length > prevLength) {
      if (isNearBottomRef.current) {
        // Smooth scroll to bottom with a micro-delay for the DOM to finish layout updates.
        const scrollTimer = setTimeout(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
          });
        }, 50);
        return () => clearTimeout(scrollTimer);
      } else {
        // User has scrolled up, count new unread messages
        setUnreadCount(prev => prev + (unifiedLogs.length - prevLength));
      }
    } else if (unifiedLogs.length > 0 && prevLength === 0) {
      // First load or reset, scroll instantly to bottom
      const scrollTimer = setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
      return () => clearTimeout(scrollTimer);
    }
  }, [unifiedLogs]);

  const scrollToBottom = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
      setIsNearBottom(true);
      isNearBottomRef.current = true;
      setUnreadCount(0);
    }
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-[250px] mb-4">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 rounded-2xl p-4 space-y-3 shadow-inner"
      >
        {unifiedLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <Bot className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mb-3" />
            <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400">{t('logs.waitingForTask')}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">{t('logs.enterTaskDesc')}</p>
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
              badgeColor = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/10';
              icon = <Brain className="w-3.5 h-3.5" />;
              cardBg = 'bg-purple-500/[0.02] border-purple-500/10';
              textColor = 'text-purple-800 dark:text-purple-200';
            } else if (log.type === 'action') {
              badgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10';
              icon = <Terminal className="w-3.5 h-3.5" />;
              cardBg = 'bg-amber-500/[0.02] border-amber-500/10';
              textColor = 'text-amber-800 dark:text-amber-200';
            } else if (log.type === 'status') {
              badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10';
              icon = <Info className="w-3.5 h-3.5" />;
              cardBg = 'bg-blue-500/[0.02] border-blue-500/10';
              textColor = 'text-blue-800 dark:text-blue-200';
            }

            return (
              <div 
                key={index}
                className={`p-3 rounded-xl border ${cardBg} flex gap-2.5 items-start animate-in fade-in slide-in-from-bottom-2 duration-200`}
              >
                <div className={`p-1 rounded-lg ${badgeColor} flex-shrink-0 mt-0.5 flex items-center justify-center`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed font-sans ${textColor}`}>
                    {log.message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Premium Floating Scroll to Bottom Button */}
      {!isNearBottom && unreadCount > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/90 dark:bg-zinc-100/95 hover:bg-zinc-800 dark:hover:bg-zinc-50 text-white dark:text-zinc-950 text-xxs font-semibold rounded-full shadow-lg border border-zinc-800 dark:border-zinc-200 backdrop-blur transition-all duration-300 hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-3 cursor-pointer z-10"
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          <span>{t('logs.newContent', { count: unreadCount })}</span>
        </button>
      )}
    </div>
  );
};
