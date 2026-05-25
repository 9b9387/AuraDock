# i18n 国际化模块集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集成本地化 i18n 模块，收集整理界面所有的中文字符并翻译为英文，实现设置页面的语言切换，完美符合 React、Electron 的最佳实践。

**Architecture:** 
1. 采用 `i18next` 和 `react-i18next` 方案。
2. 在 `src/renderer/locales/` 下维护 `zh.json` 和 `en.json` 翻译文件。
3. 创建 `src/renderer/i18n.ts` 配置文件，在 `src/renderer.tsx` 顶部引入。
4. 渲染进程启动时，通过异步调用 `window.adb.getSettings()` 获取保存的语言，并调用 `i18n.changeLanguage`。
5. 在 `SettingsModal` 中修改语言时，实时调用 `i18n.changeLanguage` 并在保存设置时将语言持久化到本地 `settings.json`。

**Tech Stack:** `react-i18next`, `i18next`, React 19, Vite, Electron

---

### Task 1: 安装依赖与基础配置

**Files:**
- Modify: `package.json`
- Create: `src/renderer/locales/zh.json`
- Create: `src/renderer/locales/en.json`
- Create: `src/renderer/i18n.ts`
- Modify: `src/renderer.tsx:1-25`

- [ ] **Step 1: 安装 i18next 与 react-i18next 依赖**
  Run: `npm install i18next react-i18next`
  Expected: 安装成功，`package.json` 的 `dependencies` 中新增相关依赖。

- [ ] **Step 2: 创建中文语言文件 `src/renderer/locales/zh.json`**
  ```json
  {
    "common": {
      "cancel": "取消",
      "connecting": "连接中..."
    },
    "nav": {
      "back": "返回",
      "home": "主页",
      "recentApps": "最近应用",
      "screenshot": "屏幕截图",
      "disconnect": "断开手机连接"
    },
    "titleBar": {
      "deviceInfo": "设备：{{model}}",
      "streaming": "推流中",
      "connecting": "连接中",
      "hideWorkspace": "隐藏智能协作空间",
      "showWorkspace": "显示智能协作空间",
      "preferences": "偏好设置"
    },
    "deviceSelector": {
      "androidConnection": "Android 设备连接",
      "selectDeviceTip": "请选择一台设备开始智能协作",
      "availableDevices": "可用设备列表 ({{count}})",
      "refreshList": "刷新设备列表",
      "noDevicesFound": "未发现可用设备",
      "step1": "1. 开启手机的 \"USB调试\" 模式。",
      "step2": "2. 数据线已连接电脑与手机。",
      "unknownAndroidDevice": "未知安卓设备",
      "connect": "连接"
    },
    "screenMirror": {
      "connectionError": "连接错误",
      "connecting": "正在连接中...",
      "reconnecting": "自动重连中 {{attempt}} / 3次...",
      "disconnectedTip": "与设备失去连接，请检查设备连接状态",
      "back": "返回",
      "reconnect": "重新连接"
    },
    "controlPanel": {
      "connecting": "连接中...",
      "muted": "已静音",
      "hangUp": "挂断通话",
      "establishingConnection": "正在建立连接，请稍候...",
      "sendVoiceAssistantPlaceholder": "发送文本指令给实时语音助手...",
      "sendAgentPlaceholder": "给 Agent 发送指令...",
      "startVoiceCall": "开启 Gemini 语音通话",
      "stopAgent": "停止当前运行的 Agent",
      "sendTextToAssistant": "发送文本给语音助手",
      "runAgentTask": "运行 Agent 任务指令 (Enter)"
    },
    "micCheck": {
      "noMicTitle": "未检测到麦克风设备",
      "noMicDesc": "您的设备目前没有可用的麦克风。请检查硬件连接，或直接切换至文字对话模式与 Gemini Live 进行沟通。",
      "textDialogue": "以文字方式对话",
      "permissionDeniedTitle": "麦克风访问权限被拒绝",
      "permissionDeniedDesc": "Omni Agent 无法访问您的麦克风权限。请前往系统设置允许此应用访问麦克风，或暂时以文本方式继续对话。",
      "openSystemSettings": "打开系统设置",
      "textDialogueFirst": "先以文字方式对话",
      "micUnavailableTitle": "麦克风设备不可用",
      "micUnavailableDesc": "检测到麦克风，但系统无法启动音频录制流。麦克风可能已被其他程序独占，或者音频服务发生了驱动错误。",
      "cancel": "取消"
    },
    "logs": {
      "waitingForTask": "等待接收任务指令",
      "enterTaskDesc": "在下方输入框描述你的任务目标并运行",
      "newContent": "有 {{count}} 条新内容"
    },
    "settings": {
      "title": "偏好设置 (PREFERENCES)",
      "apiModelConfig": "API 与模型配置 (GEMINI API)",
      "geminiApiKey": "Gemini 密钥",
      "geminiApiKeyPlaceholder": "输入您的 Gemini API 密钥...",
      "geminiApiKeyTip": "* 秘钥保存在本地安全的 UserData 路径，仅用于调用官方 Gemini Live 与 ADK Agent 服务。",
      "proxyConfig": "HTTP 代理配置 (选填)",
      "proxyPlaceholder": "http://127.0.0.1:7890 (不填则默认使用系统/环境变量代理)",
      "proxyTip": "* 在中国大陆地区，设置本地代理服务器可确保稳定连接 Google Gemini。修改代理后，建议重启应用完全生效。",
      "liveCallModel": "实时语音模型 (Live Call)",
      "visionAgentModel": "智能体模型 (Vision Agent)",
      "appearanceLang": "常规与显示",
      "systemTheme": "系统主题",
      "themeLight": "浅色模式",
      "themeDark": "深色模式",
      "themeSystem": "系统默认",
      "interfaceLang": "界面语言",
      "langZh": "简体中文",
      "langEn": "English",
      "securityPermissions": "系统安全与权限",
      "micPermission": "麦克风权限",
      "micPermissionDesc": "允许 App 访问系统麦克风。此权限为实时双向语音通话的必需权限。",
      "authorized": "已授权",
      "requestAuth": "请求授权",
      "goAuthorize": "去授权",
      "cancel": "取消",
      "saving": "正在保存...",
      "saveSuccess": "保存成功 ✓",
      "saveError": "保存失败 ✗",
      "save": "保存设置"
    }
  }
  ```

- [ ] **Step 3: 创建英文语言文件 `src/renderer/locales/en.json`**
  ```json
  {
    "common": {
      "cancel": "Cancel",
      "connecting": "Connecting..."
    },
    "nav": {
      "back": "Back",
      "home": "Home",
      "recentApps": "Recents",
      "screenshot": "Screenshot",
      "disconnect": "Disconnect"
    },
    "titleBar": {
      "deviceInfo": "Device: {{model}}",
      "streaming": "Streaming",
      "connecting": "Connecting",
      "hideWorkspace": "Hide Workspace",
      "showWorkspace": "Show Workspace",
      "preferences": "Preferences"
    },
    "deviceSelector": {
      "androidConnection": "Android Connection",
      "selectDeviceTip": "Select a device to start collaboration",
      "availableDevices": "Available Devices ({{count}})",
      "refreshList": "Refresh Devices",
      "noDevicesFound": "No devices found",
      "step1": "1. Enable \"USB Debugging\" on your phone.",
      "step2": "2. Connect your phone via USB cable.",
      "unknownAndroidDevice": "Unknown Android Device",
      "connect": "Connect"
    },
    "screenMirror": {
      "connectionError": "Connection Error",
      "connecting": "Connecting...",
      "reconnecting": "Reconnecting {{attempt}} / 3...",
      "disconnectedTip": "Disconnected. Please check device status.",
      "back": "Back",
      "reconnect": "Reconnect"
    },
    "controlPanel": {
      "connecting": "Connecting...",
      "muted": "Muted",
      "hangUp": "Hang Up",
      "establishingConnection": "Establishing connection, please wait...",
      "sendVoiceAssistantPlaceholder": "Send text command to voice assistant...",
      "sendAgentPlaceholder": "Send command to Agent...",
      "startVoiceCall": "Start Gemini Voice Call",
      "stopAgent": "Stop Current Agent",
      "sendTextToAssistant": "Send text to assistant",
      "runAgentTask": "Run Agent Task (Enter)"
    },
    "micCheck": {
      "noMicTitle": "No Microphone Detected",
      "noMicDesc": "No available microphone was found. Please check your connection or switch to text mode.",
      "textDialogue": "Chat via Text",
      "permissionDeniedTitle": "Microphone Permission Denied",
      "permissionDeniedDesc": "Omni Agent cannot access your microphone. Please allow access in System Settings, or continue in text mode.",
      "openSystemSettings": "Open Settings",
      "textDialogueFirst": "Chat via Text First",
      "micUnavailableTitle": "Microphone Unavailable",
      "micUnavailableDesc": "Microphone is detected but cannot be recorded. It might be in use by another program, or there is a driver issue.",
      "cancel": "Cancel"
    },
    "logs": {
      "waitingForTask": "Waiting for tasks",
      "enterTaskDesc": "Describe your task goal below and click Run",
      "newContent": "{{count}} new items"
    },
    "settings": {
      "title": "Preferences",
      "apiModelConfig": "API & Model Config (GEMINI API)",
      "geminiApiKey": "Gemini API Key",
      "geminiApiKeyPlaceholder": "Enter your Gemini API key...",
      "geminiApiKeyTip": "* Stored securely in local UserData, used only for Gemini Live and ADK Agent services.",
      "proxyConfig": "HTTP Proxy (Optional)",
      "proxyPlaceholder": "http://127.0.0.1:7890 (leave empty to use system/env proxy)",
      "proxyTip": "* Setting a local proxy ensures stable connections to Gemini. Restarts may be required to fully apply.",
      "liveCallModel": "Live Call Model",
      "visionAgentModel": "Vision Agent Model",
      "appearanceLang": "Appearance & Language",
      "systemTheme": "System Theme",
      "themeLight": "Light Mode",
      "themeDark": "Dark Mode",
      "themeSystem": "System Default",
      "interfaceLang": "Interface Language",
      "langZh": "简体中文",
      "langEn": "English",
      "securityPermissions": "Security & Permissions",
      "micPermission": "Microphone Permission",
      "micPermissionDesc": "Allow the app to access the microphone. Required for real-time voice calls.",
      "authorized": "Authorized",
      "requestAuth": "Authorize",
      "goAuthorize": "Authorize",
      "cancel": "Cancel",
      "saving": "Saving...",
      "saveSuccess": "Saved ✓",
      "saveError": "Failed ✗",
      "save": "Save Settings"
    }
  }
  ```

- [ ] **Step 4: 创建 i18n 配置文件 `src/renderer/i18n.ts`**
  ```typescript
  import i18n from 'i18next';
  import { initReactI18next } from 'react-i18next';
  import zhTranslations from './locales/zh.json';
  import enTranslations from './locales/en.json';

  i18n
    .use(initReactI18next)
    .init({
      resources: {
        zh: { translation: zhTranslations },
        en: { translation: enTranslations }
      },
      lng: 'zh', // 默认语言
      fallbackLng: 'zh',
      interpolation: {
        escapeValue: false // react already safes from xss
      }
    });

  export default i18n;
  ```

- [ ] **Step 5: 在 `src/renderer.tsx` 头部导入 `src/renderer/i18n.ts` 并初始化**
  ```typescript
  import './renderer/i18n'; // 确保在渲染任何 React 组件前加载 i18n
  ```

- [ ] **Step 6: 提交基础结构**
  ```bash
  git add package.json src/renderer/locales/zh.json src/renderer/locales/en.json src/renderer/i18n.ts src/renderer.tsx
  git commit -m "feat(i18n): install dependencies and configure i18next basis"
  ```

---

### Task 2: 改造 TitleBar 与 NavigationBar 组件

**Files:**
- Modify: `src/renderer/components/TitleBar.tsx`
- Modify: `src/renderer/components/NavigationBar.tsx`

- [ ] **Step 1: 改造 `src/renderer/components/TitleBar.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `设备：{activeDeviceModel}` -> `t('titleBar.deviceInfo', { model: activeDeviceModel || t('deviceSelector.unknownAndroidDevice') })`
  - `'推流中'` -> `t('titleBar.streaming')`
  - `'连接中'` -> `t('titleBar.connecting')`
  - `showWorkspace ? "隐藏智能协作空间" : "显示智能协作空间"` -> `showWorkspace ? t('titleBar.hideWorkspace') : t('titleBar.showWorkspace')`
  - `偏好设置` -> `t('titleBar.preferences')`

- [ ] **Step 2: 改造 `src/renderer/components/NavigationBar.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `返回` -> `t('nav.back')`
  - `主页` -> `t('nav.home')`
  - `最近应用` -> `t('nav.recentApps')`
  - `屏幕截图` -> `t('nav.screenshot')`
  - `断开手机连接` -> `t('nav.disconnect')`

- [ ] **Step 3: 提交更改**
  ```bash
  git add src/renderer/components/TitleBar.tsx src/renderer/components/NavigationBar.tsx
  git commit -m "feat(i18n): localize TitleBar and NavigationBar components"
  ```

---

### Task 3: 改造 DeviceSelector 与 ScreenMirror 组件

**Files:**
- Modify: `src/renderer/components/DeviceSelector.tsx`
- Modify: `src/renderer/components/ScreenMirror.tsx`

- [ ] **Step 1: 改造 `src/renderer/components/DeviceSelector.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `Android 设备连接` -> `t('deviceSelector.androidConnection')`
  - `请选择一台设备开始智能协作` -> `t('deviceSelector.selectDeviceTip')`
  - `可用设备列表 ({devices.length})` -> `t('deviceSelector.availableDevices', { count: devices.length })`
  - `刷新设备列表` -> `t('deviceSelector.refreshList')`
  - `未发现可用设备` -> `t('deviceSelector.noDevicesFound')`
  - `1. 开启手机的 "USB调试" 模式。` -> `t('deviceSelector.step1')`
  - `2. 数据线已连接电脑与手机。` -> `t('deviceSelector.step2')`
  - `{device.model || '未知安卓设备'}` -> `{device.model || t('deviceSelector.unknownAndroidDevice')}`
  - `连接` -> `t('deviceSelector.connect')`

- [ ] **Step 2: 改造 `src/renderer/components/ScreenMirror.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `'连接错误'` -> `t('screenMirror.connectionError')`
  - `'正在连接中...'` -> `t('screenMirror.connecting')`
  - `自动重连中 {reconnectAttempt} / 3次...` -> `t('screenMirror.reconnecting', { attempt: reconnectAttempt })`
  - `'与设备失去连接，请检查设备连接状态'` -> `t('screenMirror.disconnectedTip')`
  - `'返回'` -> `t('screenMirror.back')`
  - `'重新连接'` -> `t('screenMirror.reconnect')`

- [ ] **Step 3: 提交更改**
  ```bash
  git add src/renderer/components/DeviceSelector.tsx src/renderer/components/ScreenMirror.tsx
  git commit -m "feat(i18n): localize DeviceSelector and ScreenMirror components"
  ```

---

### Task 4: 改造 ControlPanel 与 UnifiedLogs 组件

**Files:**
- Modify: `src/renderer/components/ControlPanel.tsx`
- Modify: `src/renderer/components/UnifiedLogs.tsx`

- [ ] **Step 1: 改造 `src/renderer/components/ControlPanel.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `'连接中...'` -> `t('controlPanel.connecting')`
  - `'已静音'` -> `t('controlPanel.muted')`
  - `title="挂断通话"` -> `title={t('controlPanel.hangUp')}`
  - `? "正在建立连接，请稍候..."` -> `? t('controlPanel.establishingConnection')`
  - `? "发送文本指令给实时语音助手..."` -> `? t('controlPanel.sendVoiceAssistantPlaceholder')`
  - `: "给 Agent 发送指令...";` -> `: t('controlPanel.sendAgentPlaceholder')`
  - `开启 Gemini 语音通话` -> `t('controlPanel.startVoiceCall')`
  - `isStopButton ? "停止当前运行的 Agent" : (isCallActive ? "发送文本给语音助手" : "运行 Agent 任务指令 (Enter)")` -> `isStopButton ? t('controlPanel.stopAgent') : (isCallActive ? t('controlPanel.sendTextToAssistant') : t('controlPanel.runAgentTask'))`

- [ ] **Step 2: 改造 `src/renderer/components/UnifiedLogs.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `等待接收任务指令` -> `t('logs.waitingForTask')`
  - `在下方输入框描述你的任务目标并运行` -> `t('logs.enterTaskDesc')`
  - `有 {unreadCount} 条新内容` -> `t('logs.newContent', { count: unreadCount })`

- [ ] **Step 3: 提交更改**
  ```bash
  git add src/renderer/components/ControlPanel.tsx src/renderer/components/UnifiedLogs.tsx
  git commit -m "feat(i18n): localize ControlPanel and UnifiedLogs components"
  ```

---

### Task 5: 改造 MicCheckModal 与 SettingsModal 组件，打通语言持久化与即时切换

**Files:**
- Modify: `src/renderer/components/MicCheckModal.tsx`
- Modify: `src/renderer/components/SettingsModal.tsx`
- Modify: `src/renderer.tsx:55-1110`

- [ ] **Step 1: 改造 `src/renderer/components/MicCheckModal.tsx`**
  引入 `useTranslation`，替换中文字符。
  - `title: '未检测到麦克风设备'` -> `title: t('micCheck.noMicTitle')`
  - `description: '您的设备目前没有可用的麦克风。请检查硬件连接，或直接切换至文字对话模式与 Gemini Live 进行沟通。'` -> `description: t('micCheck.noMicDesc')`
  - `<span>以文字方式对话</span>` -> `<span>{t('micCheck.textDialogue')}</span>`
  - `title: '麦克风访问权限被拒绝'` -> `title: t('micCheck.permissionDeniedTitle')`
  - `description: 'Omni Agent 无法访问您的麦克风权限。请前往系统设置允许此应用访问麦克风，或暂时以文本方式继续对话。'` -> `description: t('micCheck.permissionDeniedDesc')`
  - `<span>打开系统设置</span>` -> `<span>{t('micCheck.openSystemSettings')}</span>`
  - `<span>先以文字方式对话</span>` -> `<span>{t('micCheck.textDialogueFirst')}</span>`
  - `title: '麦克风设备不可用'` -> `title: t('micCheck.micUnavailableTitle')`
  - `description: '检测到麦克风，但系统无法启动音频录制流。麦克风可能已被其他程序独占，或者音频服务发生了驱动错误。'` -> `description: t('micCheck.micUnavailableDesc')`
  - `取消` -> `t('micCheck.cancel')`

- [ ] **Step 2: 改造 `src/renderer/components/SettingsModal.tsx`**
  引入 `useTranslation` 并在更改语言选择时动态切换 i18n 语言。
  - 使用 `const { t, i18n } = useTranslation();`
  - 替换标题与表单标签（`偏好设置 (PREFERENCES)` -> `t('settings.title')` 等，完整替换）。
  - 在语言切换下拉菜单中：
    - 移除原本 English 后面的 `(暂未支持)` 后缀：将 `<option value="en">English (暂未支持)</option>` 替换为 `<option value="en">{t('settings.langEn')}</option>`，简体中文选项替换为 `<option value="zh">{t('settings.langZh')}</option>`。
    - **核心逻辑：** 在 `onChange` 事件中，不仅更新 `localSettings`，还要立刻调用 `i18n.changeLanguage(e.target.value)` 使得设置界面即时变语言，提供 10 星级丝滑的用户体验。

- [ ] **Step 3: 改造主入口 `src/renderer.tsx` 的配置加载和保存回调**
  - 导入并使用 `useTranslation`：
    ```typescript
    import { useTranslation } from 'react-i18next';
    ```
  - 在 `App` 组件内部获取 `const { i18n } = useTranslation();`
  - 在 `loadConfig` 的 `useEffect` 中，当从 Electron 的 `window.adb.getSettings()` 获取到设置后，调用 `i18n.changeLanguage(res.language || 'zh')` 来同步设置的语言。
  - 在 `SettingsModal` 的 `onSettingsSaved` 回调中，同样添加：
    ```typescript
    onSettingsSaved={(newSettings) => {
      setTheme(newSettings.theme);
      geminiLiveService.setModel(newSettings.geminiLiveModel);
      i18n.changeLanguage(newSettings.language || 'zh');
    }}
    ```

- [ ] **Step 4: 提交更改**
  ```bash
  git add src/renderer/components/MicCheckModal.tsx src/renderer/components/SettingsModal.tsx src/renderer.tsx
  git commit -m "feat(i18n): complete system localization and seamless language switching"
  ```

---

### Task 6: 构建与验证

- [ ] **Step 1: 运行 Lint 与编译检查**
  Run: `npm run lint` 和 `npm run build` (如果是 vite 则检查构建)
  Expected: 零错误，所有 tsx 文件编译通过。

- [ ] **Step 2: 验证效果**
  测试界面多语言加载和切换。
