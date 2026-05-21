# Truncate Base64 Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简日志输出，将超长的图片 Base64 编码（包含 Data URI 格式和纯 Base64 字符串）截断，避免日志中打印完整的图片 base64，提升控制台和终端日志的可读性与流畅度。

**Architecture:** 
- 在 `src/main/vision-agent.ts`、`src/main/scrcpy-manager.ts` 和 `src/renderer/services/gemini-live-service.ts` 等主要的日志打印模块中实现/引入 `truncateBase64` 函数。
- 该截断函数将利用超轻量且无灾难性回溯风险的正则表达式 `/([a-zA-Z0-9+/=]{200,})/g` 匹配任何连续长于200个字符的 Base64 编码内容。
- 将捕获的超长 Base64 串截断为前 50 个字符，并添加 `... [truncated N chars]`。这样既不破坏 Data URI 前缀（如 `data:image/png;base64,`），也使得大段 Base64 被精简。

**Tech Stack:** TypeScript, RegExp, Node.js, Electron.

---

### Task 1: 编写 truncateBase64 日志截断辅助函数
在涉及日志输出的地方引入该实用程序。由于 Electron 存在主进程和渲染进程，且没有共享的 utils 模块，我们将在用到的位置安全地实现或导入本地的辅助函数 `truncateBase64`：

```typescript
function truncateBase64(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/([a-zA-Z0-9+/=]{200,})/g, (match) => {
    return `${match.substring(0, 50)}... [truncated ${match.length} chars]`;
  });
}
```

### Task 2: 优化主进程 Agent 日志输出 (src/main/vision-agent.ts)
- **Files:**
  - Modify: `src/main/vision-agent.ts`
- [ ] **Step 1: 在 `src/main/vision-agent.ts` 中实现并应用 `truncateBase64` 函数**
- [ ] **Step 2: 在 `log` 内部，将 `message` 先用 `truncateBase64` 进行清洗后再发送给 webContents 和控制台打印**

### Task 3: 优化 Agent 动作与结果日志截断 (src/main/agent/agent-loop.ts)
- **Files:**
  - Modify: `src/main/agent/agent-loop.ts`
- [ ] **Step 1: 在 `src/main/agent/agent-loop.ts` 中引入或实现 `truncateBase64` 辅助函数**
- [ ] **Step 2: 对 `this.context.log('action', ...)` 以及涉及 `JSON.stringify(toolArgs)` 和 `JSON.stringify(toolResult)` 的部分应用 `truncateBase64`**

### Task 4: 优化 Scrcpy 动作参数打印 (src/main/scrcpy-manager.ts)
- **Files:**
  - Modify: `src/main/scrcpy-manager.ts`
- [ ] **Step 1: 在 `src/main/scrcpy-manager.ts` 中实现并应用 `truncateBase64`**
- [ ] **Step 2: 对 `Executing tool ... with args:` 的 `JSON.stringify(args)` 使用 `truncateBase64`**

### Task 5: 优化渲染进程日志输出 (src/renderer/services/gemini-live-service.ts)
- **Files:**
  - Modify: `src/renderer/services/gemini-live-service.ts`
- [ ] **Step 1: 在 `src/renderer/services/gemini-live-service.ts` 中引入并应用 `truncateBase64`**
- [ ] **Step 2: 在 `log` 方法内对 `message` 进行截断清洗后再触发回调和控制台打印**

### Task 6: 验证代码质量与编译状态
- [ ] **Step 1: 运行 `npm run lint` 验证语法及 linter 是否全部通过**
- [ ] **Step 2: 确保没有引入任何新的 TypeScript 或打包错误**
