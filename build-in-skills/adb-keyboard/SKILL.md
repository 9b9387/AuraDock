---
name: adb-keyboard
description: 管理和设置 ADBKeyBoard 输入法，支持安装、切换到 ADBKeyBoard、恢复先前的输入法以及检查当前输入法。
metadata:
  version: 1.0.0
---

# ADBKeyBoard 输入法管理 Skill

本 Skill 旨在指导 Agent 自动管理和设置 Android 设备上的 ADBKeyBoard 输入法（https://github.com/senzhk/ADBKeyBoard）。你将负责检查当前的输入法、在需要时安装并切换到 ADBKeyBoard，以及在操作完成后恢复到之前的输入法。

> [!NOTE]
> 本 Skill 仅处理输入法服务的生命周期和切换管理（检查、安装、启用、设置、还原），不涉及通过 ADBKeyBoard 进行的具体输入操作（输入或清空操作已由内置工具 `input_text` 和 `clear_text` 自动利用 ADB 广播完成）。

---

## 核心任务与指令

### 1. 检查当前输入法 (Check Current IME)

在进行任何切换操作前，你**必须**首先读取并记录当前设备的默认输入法 ID，以便后续安全还原。

- **获取当前默认输入法 ID**：
  ```bash
  adb shell settings get secure default_input_method
  ```
  *输出示例*：`com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME`
- **保存记录**：将此 ID 完整记录在你的上下文/状态中，作为还原目标。

---

### 2. 检查并安装 ADBKeyBoard (Check & Install)

- **检查是否已安装**：
  ```bash
  adb shell pm list packages | grep adbkeyboard
  ```
  如果输出包含 `package:com.android.adbkeyboard`，则说明已安装，直接进入下一步；若无任何输出或报错，则需进行安装。
- **安装 APK**：
  使用本 Skill 资源中的 APK 文件进行安装。APK 位于当前 Skill 的 `assets` 目录中：
  `build-in-skills/adb-keyboard/assets/keyboardservice-debug.apk`
  使用 ADB 进行覆盖安装：
  ```bash
  adb install -r build-in-skills/adb-keyboard/assets/keyboardservice-debug.apk
  ```

---

### 3. 启用并切换到 ADBKeyBoard (Enable & Switch)

安装完成后，必须将 ADBKeyBoard 启用并设置为默认输入法。

- **启用输入法服务**：
  ```bash
  adb shell ime enable com.android.adbkeyboard/.AdbIME
  ```
- **设置为默认输入法**：
  ```bash
  adb shell ime set com.android.adbkeyboard/.AdbIME
  ```
  或者：
  ```bash
  adb shell settings put secure default_input_method com.android.adbkeyboard/.AdbIME
  ```
- **验证设置**：
  再次读取默认输入法以确保切换成功：
  ```bash
  adb shell settings get secure default_input_method
  ```
  确认输出为 `com.android.adbkeyboard/.AdbIME`。

---

### 4. 恢复之前的输入法 (Restore Previous IME)

当任务结束、不再需要 ADBKeyBoard 服务时，你**必须**将设备的输入法还原为在步骤 1 中记录的原输入法 ID。

- **恢复输入法**：
  使用在步骤 1 中保存的 `<previous_ime_id>` 运行：
  ```bash
  adb shell ime set <previous_ime_id>
  ```
  或者：
  ```bash
  adb shell settings put secure default_input_method <previous_ime_id>
  ```
- **验证恢复**：
  运行以下命令确认已成功变回原输入法：
  ```bash
  adb shell settings get secure default_input_method
  ```

---

## 异常处理与安全准则

- **未连接设备**：若执行 adb 命令时报错 `no devices/emulators found`，请提示用户确保 Android 设备已连接且 USB 调试已开启。
- **权限不足**：在部分高度定制的 Android 系统上，切换输入法可能会弹出系统权限确认框。若切换命令失败，请尝试在屏幕上观察是否有相关弹窗，并执行相应的点击同意。
- **安全第一**：在任务结束时，务必将输入法还原为之前的输入法，切勿在用户设备上残留 ADBKeyBoard 作为默认输入法，以免影响用户的日常打字体验。
