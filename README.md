# Omni-Agent (AuraDock)

Omni-Agent (AuraDock) 是一款基于 **Electron + React + TypeScript** 构建的现代化桌面端应用。它无缝集成了 Android 设备实时投屏（Scrcpy）与 Gemini Multimodal 视觉 Agent，为用户提供实时流畅的屏幕控制、自主视觉规划执行，以及基于 Gemini Live 的双向实时语音交互能力。

---

## 🌟 核心特性

- **🚀 极速投屏与反向控制**：基于 WebCodecs (H.264/H.265) 视频硬解码，支持毫秒级超低延迟投屏与高精度鼠标手势触控反向控制。
- **🤖 智能视觉自主 Agent**：集成 Gemini ADK (`@google/adk`)，能够理解屏幕内容，生成多步任务规划，并自主执行点击、滑动、输入等 UI 操作。
- **🎙️ 双向实时语音交互 (Gemini Live)**：支持 WebSocket 双向音频流（Gemini 3.1 Flash Live），混合手机音频和麦克风，支持全双工实时语音交互。
- **🔌 健壮的自动重连机制**：智能监听 ADB 设备插拔状态，保障在硬件意外断开时秒级内无缝恢复投屏和控制流。
- **🎨 现代极致美学**：精致暗黑/明亮双色主题自适应、玻璃拟态交互组件与极简微动画。

---

## 🛠️ 技术栈

- **桌面核心**：Electron 42, Vite, ADBKit, TypeScript
- **前端框架**：React 19, Tailwind CSS v4, Shadcn UI, Lucide Icons
- **AI 引擎**：Gemini Live API (WebSockets), `@google/adk` (Agent Development Kit)
- **投屏解码**：`@9b9387/android-stream-scrcpy` (Scrcpy 视频与系统音频流)

---

## 📂 项目结构

```text
omni-agent/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── agent/            # Agent 执行循环、系统提示词与工具集
│   │   ├── config-manager.ts # 配置与环境变量管理
│   │   ├── scrcpy-manager.ts # Scrcpy 与 ADB 进程控制中心
│   │   └── vision-agent.ts   # 视觉 Agent IPC 桥接
│   ├── renderer/             # React 渲染进程
│   │   ├── components/       # 播放控制面板、设备选择、设置与镜像组件
│   │   ├── services/         # 音频混音器、Gemini Live 双向流服务、视频推流
│   │   └── renderer.tsx      # App 主入口与核心状态管理
│   ├── main.ts               # 主进程入口
│   └── preload.ts            # 安全沙箱桥接 (ContextBridge)
├── package.json              # 项目依赖与运行脚本
└── tsconfig.json             # TypeScript 配置
```

---

## 🚀 快速开始

```bash
npm install
npm run start
```
启动应用后，点击界面上的 **“设置” (Settings)** 按钮，在配置面板中可以直接填入您的 **Gemini API Key**、代理服务器（Proxy）和模型选择等。


### 构建与打包
```bash
# 打包为对应平台的安装包
npm run make
```

---

## 📄 开源协议

本项目采用 [MIT](LICENSE) 许可协议。
