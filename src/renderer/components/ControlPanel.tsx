import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Square, PhoneOff, Loader2, MicOff, Play, Power, HelpCircle, Sparkles, X } from 'lucide-react';
import type { ConnectionStatus } from '../services/gemini-live-service';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from './ui/command';
import { Badge } from './ui/badge';

export interface SkillSummary {
  name: string;
  description: string;
}

interface VoiceCapsuleProps {
  geminiStatus: ConnectionStatus;
  textOnlyMode: boolean;
  waveBars: number[];
  handleStopLiveCall: () => void;
}

const VoiceCapsule: React.FC<VoiceCapsuleProps> = ({ 
  geminiStatus, 
  textOnlyMode, 
  waveBars, 
  handleStopLiveCall 
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5 px-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-500/20 rounded-xl h-10 shadow-lg dark:shadow-none shrink-0">
      {geminiStatus === 'connecting' ? (
        <>
          <Loader2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-spin" />
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{t('controlPanel.connecting')}</span>
        </>
      ) : textOnlyMode ? (
        <>
          <MicOff className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{t('controlPanel.muted')}</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <div className="h-4 flex items-center gap-0.5 shrink-0">
            {waveBars.map((height, i) => (
              <div 
                key={i} 
                style={{ height: `${height}%` }} 
                className="w-0.5 bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-100" 
              />
            ))}
          </div>
        </>
      )}
      <div className="w-[1px] h-4 bg-zinc-200 dark:bg-emerald-500/20 mx-0.5" />
      <button 
        onClick={handleStopLiveCall} 
        className="text-rose-600 dark:text-rose-400 hover:text-rose-500 transition-colors cursor-pointer"
        title={t('controlPanel.hangUp')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

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
  waveBars: number[];
  handleStartLiveCall: () => void;
  handleStopLiveCall: () => void;
  textOnlyMode: boolean;
  // Skill selection (only used in agent mode)
  skills: SkillSummary[];
  selectedSkill: SkillSummary | null;
  setSelectedSkill: (s: SkillSummary | null) => void;
  onLoadSkills?: () => void;
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
  waveBars,
  handleStartLiveCall,
  handleStopLiveCall,
  textOnlyMode,
  skills,
  selectedSkill,
  setSelectedSkill,
  onLoadSkills,
}) => {
  const { t } = useTranslation();
  const isConnected = geminiStatus === 'connected';
  const isConnecting = geminiStatus === 'connecting';
  const isCallActive = isConnected || isConnecting;

  const inputValue = isCallActive ? geminiChatInput : agentInput;
  const setInputValue = isCallActive ? setGeminiChatInput : setAgentInput;
  const placeholderText = isConnecting
    ? t('controlPanel.establishingConnection')
    : isConnected
      ? t('controlPanel.sendVoiceAssistantPlaceholder')
      : t('controlPanel.sendAgentPlaceholder');

  const handleSend = () => {
    if (isCallActive) {
      handleSendLiveChatText();
    } else {
      handleStartAgent();
    }
  };

  // 1. Determine if button should act as a Stop button
  const isStopButton = !isCallActive && agentRunning;

  // 2. Compute disabled state based on role
  const isSendDisabled = isConnecting || !inputValue.trim() || (!isCallActive && !activeSerial);
  const isButtonDisabled = isStopButton ? false : isSendDisabled;

  // 3. Unified click handler
  const onButtonClick = () => {
    if (isStopButton) {
      handleGlobalStop();
    } else {
      handleSend();
    }
  };

  // ---------------- Skill slash menu ----------------
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Skill menu only applicable in agent mode (no live call)
  const skillMenuApplicable = !isCallActive && !selectedSkill;

  // Get current "/token" at cursor position. Returns null if no active token.
  const getSlashTokenAtCursor = (): { token: string; start: number; end: number } | null => {
    const el = textareaRef.current;
    if (!el) return null;
    const value = el.value;
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = /(^|\s)(\/(\S*))$/.exec(before);
    if (!match) return null;
    const token = match[2];
    const start = before.length - token.length;
    return { token, start, end: cursor };
  };

  const updateSkillMenuFromInput = () => {
    if (!skillMenuApplicable) {
      if (skillMenuOpen) setSkillMenuOpen(false);
      return;
    }
    const slash = getSlashTokenAtCursor();
    if (slash) {
      if (!skillMenuOpen) {
        if (onLoadSkills) onLoadSkills();
        setSkillMenuOpen(true);
        setHighlightIndex(0);
      }
      setSkillQuery(slash.token.slice(1));
    } else if (skillMenuOpen) {
      setSkillMenuOpen(false);
      setSkillQuery('');
    }
  };

  // Close menu when switching to live mode or when selectedSkill set externally
  useEffect(() => {
    if (!skillMenuApplicable && skillMenuOpen) {
      setSkillMenuOpen(false);
      setSkillQuery('');
    }
  }, [skillMenuApplicable, skillMenuOpen]);

  const filteredSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
  }, [skills, skillQuery]);

  // Keep highlight in range as filteredSkills changes
  useEffect(() => {
    if (highlightIndex >= filteredSkills.length) {
      setHighlightIndex(filteredSkills.length > 0 ? 0 : 0);
    }
  }, [filteredSkills.length, highlightIndex]);

  // Reset highlight to top whenever the query (filter) changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [skillQuery]);

  // Scroll the highlighted item into view on keyboard navigation
  const highlightedName = filteredSkills[highlightIndex]?.name;
  useEffect(() => {
    if (!skillMenuOpen || !highlightedName) return;
    const el = itemRefs.current.get(highlightedName);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedName, skillMenuOpen]);

  const pickSkill = (skill: SkillSummary) => {
    const el = textareaRef.current;
    if (el) {
      const slash = getSlashTokenAtCursor();
      if (slash) {
        const value = el.value;
        const next = value.slice(0, slash.start) + value.slice(slash.end);
        setInputValue(next);
        // Restore cursor at the slash start position after React re-render
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(slash.start, slash.start);
          }
        });
      }
    }
    setSelectedSkill(skill);
    setSkillMenuOpen(false);
    setSkillQuery('');
  };

  return (
    <div className="shrink-0">
      <div className="relative">
        {/* Skill chip rendered inside the textarea container, top-left */}
        {!isCallActive && selectedSkill && (
          <div className="absolute top-3 left-3 z-10 pointer-events-auto">
            <Badge
              variant="secondary"
              className="h-6 gap-1 pr-1 pl-2 text-xs bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
            >
              <Sparkles className="w-3 h-3" />
              <span className="truncate max-w-[160px]">{selectedSkill.name}</span>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="ml-0.5 p-0.5 rounded hover:bg-emerald-200/60 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                title={t('controlPanel.removeSkill') || '移除 skill'}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          </div>
        )}

        <Popover
          open={skillMenuOpen}
          onOpenChange={(open) => {
            setSkillMenuOpen(open);
            if (!open) setSkillQuery('');
          }}
        >
          <PopoverAnchor asChild>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                // Defer so selectionStart reflects the new value
                requestAnimationFrame(updateSkillMenuFromInput);
              }}
              onKeyUp={() => updateSkillMenuFromInput()}
              onClick={() => updateSkillMenuFromInput()}
              placeholder={placeholderText}
              disabled={isConnecting || (!isCallActive && (agentRunning || !activeSerial))}
              onKeyDown={(e) => {
                if (skillMenuOpen && filteredSkills.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIndex((idx) => (idx + 1) % filteredSkills.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIndex((idx) => (idx - 1 + filteredSkills.length) % filteredSkills.length);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    const skill = filteredSkills[highlightIndex];
                    if (skill) pickSkill(skill);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSkillMenuOpen(false);
                    setSkillQuery('');
                    return;
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const skill = filteredSkills[highlightIndex];
                    if (skill) pickSkill(skill);
                    return;
                  }
                }
                if (e.key === 'Backspace' && !isCallActive && selectedSkill) {
                  const el = textareaRef.current;
                  if (el && (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === 0) {
                    e.preventDefault();
                    setSelectedSkill(null);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!isButtonDisabled) {
                    onButtonClick();
                  }
                }
              }}
              className={`block w-full h-28 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl p-4 pr-[220px] text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors dark:shadow-none m-0 ${!isCallActive && selectedSkill ? 'pt-11' : ''}`}
            />
          </PopoverAnchor>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-80 p-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 ring-1 ring-black/5 dark:ring-white/5 shadow-2xl"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Command
              shouldFilter={false}
              className="bg-white dark:bg-zinc-900"
              value={highlightedName ?? ''}
              onValueChange={(v) => {
                const idx = filteredSkills.findIndex((s) => s.name === v);
                if (idx >= 0) setHighlightIndex(idx);
              }}
            >
              <div className="px-3 pt-2 pb-1 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
                <span className="text-xxs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  {t('controlPanel.skillMenuTitle') || 'Skills'}
                </span>
                {skillQuery && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">/{skillQuery}</span>
                )}
              </div>
              <CommandList className="max-h-64">
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-1 py-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {skills.length === 0
                        ? (t('controlPanel.skillEmpty') || '请在设置中配置 Skills 路径')
                        : (t('controlPanel.skillNoMatch') || '未找到匹配的 skill')}
                    </span>
                  </div>
                </CommandEmpty>
                {filteredSkills.length > 0 && (
                  <CommandGroup>
                    {filteredSkills.map((s, idx) => (
                      <CommandItem
                        key={s.name}
                        ref={(el) => {
                          if (el) itemRefs.current.set(s.name, el as unknown as HTMLDivElement);
                          else itemRefs.current.delete(s.name);
                        }}
                        value={s.name}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        onSelect={() => pickSkill(s)}
                        className="data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-700 dark:data-[selected=true]:bg-emerald-950/40 dark:data-[selected=true]:text-emerald-300 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-emerald-200 dark:data-[selected=true]:ring-emerald-500/30"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{s.name}</span>
                          {s.description && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                              {s.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          {isCallActive ? (
            <VoiceCapsule 
              geminiStatus={geminiStatus}
              textOnlyMode={textOnlyMode}
              waveBars={waveBars} 
              handleStopLiveCall={handleStopLiveCall} 
            />
          ) : (
            <div className="relative group">
              <button
                onClick={handleStartLiveCall}
                disabled={!activeSerial}
                className="flex items-center justify-center p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-emerald-600 dark:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-200 text-xxs font-semibold rounded-lg shadow-xl border border-zinc-200/10 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 scale-95 group-hover:scale-100">
                {t('controlPanel.startVoiceCall')}
              </div>
            </div>
          )}

          <div className="relative group">
            <button
              onClick={onButtonClick}
              disabled={isButtonDisabled}
              className={`flex items-center justify-center p-3 rounded-xl transition-all disabled:opacity-30 active:scale-95 cursor-pointer ${
                isStopButton 
                  ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse" 
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
              }`}
            >
              {isStopButton ? (
                <Power className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-200 text-xxs font-semibold rounded-lg shadow-xl border border-zinc-200/10 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 scale-95 group-hover:scale-100">
              {isStopButton ? t('controlPanel.stopAgent') : (isCallActive ? t('controlPanel.sendTextToAssistant') : t('controlPanel.runAgentTask'))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
