# LiveCallController 与 ControlPanel 合并实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将顶部的 LiveCallController 实时通话状态栏完美整合进入底部的 ControlPanel 输入框右下角，实现输入框物理节点唯一、无任何高度抖动的高级 UI 交互。

**Architecture:** 丢弃原本多分支渲染不同输入框的复杂逻辑，采用单一多行 `textarea`。连接状态下，通过右下角的绝对定位容器变身为一个精美的“语音控制胶囊”（含动态波形与挂断按钮）以及原位不动的“发送”主按钮。

**Tech Stack:** React, Tailwind CSS, Lucide Icons, TypeScript

---

### Task 1: 重构 ControlPanel 组件

**Files:**
- Modify: `src/renderer/components/ControlPanel.tsx`

- [ ] **Step 1: 修改 Props 接口与组件主体定义**

将 `src/renderer/components/ControlPanel.tsx` 中的接口与组件定义重构为支持完整语音参数的多模态输入框：

```typescript
import React from 'react';
import { Send, Square, Mic, PhoneOff } from 'lucide-react';
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
  waveBars: number[];
  handleStartLiveCall: () => void;
  handleStopLiveCall: () => void;
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
}) => {
  const isConnected = geminiStatus === 'connected';
  const inputValue = isConnected ? geminiChatInput : agentInput;
  const setInputValue = isConnected ? setGeminiChatInput : setAgentInput;
  const placeholderText = isConnected 
    ? "发送文本指令给实时语音助手..." 
    : "给 Agent 发送指令... (例如：打开浏览器搜索最新AI新闻)";

  const handleSend = () => {
    if (isConnected) {
      handleSendLiveChatText();
    } else {
      handleStartAgent();
    }
  };

  return (
    <div className="shrink-0">
      <div className="relative">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholderText}
          disabled={!isConnected && (agentRunning || !activeSerial)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="block w-full h-24 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors dark:shadow-none m-0"
        />
        
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/45 border border-emerald-200 dark:border-emerald-500/30 rounded-full h-8 shadow-lg shrink-0">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <div className="h-3 flex items-center gap-0.5 w-10 shrink-0">
                {waveBars.map((height, i) => (
                  <div 
                    key={i} 
                    style={{ height: `${height}%` }} 
                    className="w-0.5 bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all" 
                  />
                ))}
              </div>
              <div className="w-[1px] h-3 bg-zinc-200 dark:bg-emerald-500/20 mx-0.5" />
              <button 
                onClick={handleStopLiveCall} 
                className="text-rose-600 dark:text-rose-400 hover:text-rose-500 cursor-pointer"
                title="挂断通话"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartLiveCall}
              disabled={!activeSerial}
              className="flex items-center justify-center p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-emerald-600 dark:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
              title="开启实时语音通话"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || (!isConnected && !activeSerial)}
            className="flex items-center justify-center p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
            title={isConnected ? "发送文本" : "发送任务指令"}
          >
            {agentRunning && !isConnected ? (
              <Square className="w-3.5 h-3.5 fill-white text-transparent animate-pulse" onClick={(e) => { e.stopPropagation(); handleGlobalStop(); }} />
            ) : (
              <Send className="w-3.5 h-3.5 fill-white text-transparent" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 编译打包验证类型是否正确**

执行本地的 linter 检查或执行 TypeScript 校验，确认语法正确。
命令：`npx tsc --noEmit`
期待输出：只有关于 `src/renderer.tsx` 处传参未匹配的报错，无本文件的内部编译报错。

- [ ] **Step 3: 提交更改**

```bash
git add src/renderer/components/ControlPanel.tsx
git commit -m "feat: refactor ControlPanel to support single textarea and right-bottom voice capsule"
```

---

### Task 2: 更新主渲染入口 renderer.tsx 并剔除旧组件

**Files:**
- Modify: `src/renderer.tsx`
- Delete: `src/renderer/components/LiveCallController.tsx`

- [ ] **Step 1: 修改 src/renderer.tsx 内部布局引用**

去除最顶部关于 `LiveCallController` 的引入，并在 JSX 部分移除旧组件渲染，直接向下传递Props。

```typescript
// 1. 去除第 9 行的 import:
// import { LiveCallController } from './renderer/components/LiveCallController';

// 2. 修改 1017-1044 行：
            {/* 1. MIDDLE SECTION: Unified Chronological Log Feed */}
            <UnifiedLogs
              unifiedLogs={unifiedLogs}
            />

            {/* 2. BOTTOM PANEL: Controls & Input Panel */}
            <ControlPanel
              geminiStatus={geminiStatus}
              geminiChatInput={geminiChatInput}
              setGeminiChatInput={setGeminiChatInput}
              handleSendLiveChatText={handleSendLiveChatText}
              agentInput={agentInput}
              setAgentInput={setAgentInput}
              agentRunning={agentRunning}
              activeSerial={activeSerial}
              handleStartAgent={handleStartAgent}
              handleGlobalStop={handleGlobalStop}
              waveBars={waveBars}
              handleStartLiveCall={handleStartLiveCall}
              handleStopLiveCall={handleStopLiveCall}
            />
```

- [ ] **Step 2: 删除无用的 LiveCallController.tsx 组件文件**

命令：`rm src/renderer/components/LiveCallController.tsx`

- [ ] **Step 3: 运行完整类型检查确认编译通过**

运行：`npx tsc --noEmit`
期待输出：无任何 TypeScript 编译错误。

- [ ] **Step 4: 提交主应用布局重构**

```bash
git add src/renderer.tsx
git rm src/renderer/components/LiveCallController.tsx
git commit -m "refactor: remove LiveCallController and wire unified voice capsule into ControlPanel"
```

---

### Task 3: 最终成果验证与清理

**Files:**
- Modify: None (测试验证与服务清理)

- [ ] **Step 1: 关闭可视化辅助设计服务**

运行：`scripts/stop-server.sh` 并清理临时生成的原型文件目录。

- [ ] **Step 2: 自检代码确认没有残留 Linter 报错**

运行 `git status` 确认一切完美。
