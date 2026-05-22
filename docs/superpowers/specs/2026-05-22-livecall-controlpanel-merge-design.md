# LiveCallController 与 ControlPanel 合并设计规范

本规范定义了将 `LiveCallController`（实时语音通话栏）合并并集成到 `ControlPanel`（底部控制台）中的技术设计方案。通过该重构，可完全释放智能协作面板的中段日志区域，统一用户的操作入口。

## 1. 架构与流程设计

重构前后，组件结构变化如下：

### 重构前：
```
+------------------------------------------+
| src/renderer.tsx (右侧智能协作面板)        |
|  +------------------------------------+  |
|  | 1. LiveCallController (顶部常驻条)  |  |
|  +------------------------------------+  |
|  | 2. UnifiedLogs (中段日志展示区)     |  |
|  +------------------------------------+  |
|  | 3. ControlPanel (底部控制/输入区)    |  |
|  +------------------------------------+  |
+------------------------------------------+
```

### 重构后：
```
+------------------------------------------+
| src/renderer.tsx (右侧智能协作面板)        |
|  +------------------------------------+  |
|  | 1. UnifiedLogs (由于顶部移除，向下拓展) |  |
|  |                                    |  |
|  |                                    |  |
|  +------------------------------------+  |
|  | 2. ControlPanel (全新合并操作面板)  |  |
|  |    +----------------------------+  |  |
|  |    | 统一的多行 textarea         |  |  |
|  |    | [语音胶囊 / Mic]  [发送]    |  |  |
|  |    +----------------------------+  |  |
|  +------------------------------------+  |
+------------------------------------------+
```

## 2. 详细设计细节

### 2.1 统一单输入框设计 (Textarea)
不再在“未连接”与“已连接”状态间切换渲染 `textarea` 和单行 `input`。
* **节点物理唯一**：在整个运行生命周期中，仅使用一个多行 `textarea`。
* **状态动态绑定**：
  * 连接状态 (`geminiStatus === 'connected'`)：
    * 值绑定：`geminiChatInput` / `setGeminiChatInput`
    * 占位符：`"发送文本指令给实时语音助手..."`
  * 未连接状态：
    * 值绑定：`agentInput` / `setAgentInput`
    * 占位符：`"给 Agent 发送指令... (例如：打开浏览器搜索最新AI新闻)"`

### 2.2 右下角动作按钮区域整合 (Absolute Container)
动作按键容器绝对定位在输入框的右下角 (`absolute bottom-4 right-4 flex items-center gap-2`)：

#### 2.2.1 未连接状态 (Disconnected / Connecting / Error)
* **副按钮 (Mic 键)**：
  * 点击触发：`handleStartLiveCall()`
  * 状态禁用：当 `!activeSerial` 时置灰禁用。
  * 样式：轻量边框小图标，完美融入底层背景。
* **主按钮 (Send 键)**：
  * 点击触发：`handleStartAgent()`
  * 运行时切换：若 `agentRunning === true`，按钮变为红色的 `[ Square ]` (停止键)，点击触发 `handleGlobalStop()`。

#### 2.2.2 语音连接中/通话中状态 (Connected)
* **副控件 (微型智能语音胶囊 - Voice Pill)**：
  * 代替原 Mic 按钮，原地以动画向左展开为圆角药丸。
  * **内部元素**：
    1. 绿点呼吸灯（`animate-pulse`）。
    2. 音频波形：渲染 5 条极简音频波动柱，高度随 `waveBars` 实时数组流式缩放，并加上 `wave-bar-anim` 动画。
    3. 分割线。
    4. 微型一键挂断按钮：红色 `PhoneOff` 图标，点击触发 `handleStopLiveCall()`。
* **主按钮 (Send 键)**：
  * 保持在最右端绝对原位不变，点击触发 `handleSendLiveChatText()` 向语音助手发送文本指令。

## 3. 接口 Props 定义变更

`ControlPanelProps` 将继承原本传入 `LiveCallController` 的所有语音呼叫核心参数：

```typescript
interface ControlPanelProps {
  // 1. 实时语音参数
  geminiStatus: ConnectionStatus;
  geminiChatInput: string;
  setGeminiChatInput: (val: string) => void;
  handleSendLiveChatText: () => void;
  waveBars: number[];
  handleStartLiveCall: () => void;
  handleStopLiveCall: () => void;

  // 2. Agent 任务参数
  agentInput: string;
  setAgentInput: (val: string) => void;
  agentRunning: boolean;
  activeSerial: string | null;
  handleStartAgent: () => void;
  handleGlobalStop: () => void;
}
```

## 4. 文件变动清单

1. **废弃并删除**：`src/renderer/components/LiveCallController.tsx`
2. **重构**：`src/renderer/components/ControlPanel.tsx` (实现胶囊形态切换与多行合并)
3. **更新**：`src/renderer.tsx` (移除 `LiveCallController`，向下传递 Props 并清理 import)
