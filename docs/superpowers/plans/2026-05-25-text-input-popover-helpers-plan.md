# Input Popover Backspace and Clear All Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Backspace (DEL key event) and Clear All (ADB_CLEAR_TEXT broadcast) functionality to the input text popover, with dedicated buttons in the popover form footer.

**Architecture:** 
1. **Backend**: Extend `scrcpy-manager.ts` in `adb:execute-tool` IPC handler:
   - Handle key event `DEL` via scrcpy native `ControlMessageType.INJECT_KEYCODE` (keycode `67`).
   - Add case `clear_text` that broadcasts `ADB_CLEAR_TEXT` to ADBKeyBoard.
2. **Frontend UI**:
   - In `NavigationBar.tsx`, add a footer row in the Popover content form with two compact icon buttons:
     - "Clear All" with `<Trash2 />` icon: Clears both local input `textValue` and device input via `clear_text`.
     - "Backspace" with `<Delete />` icon: Deletes last character of `textValue` and sends `DEL` key_event to the device.
3. **i18n**: Add localized text keys `nav.clearAll` and `nav.backspace` in Chinese and English.

**Tech Stack:** React 19, TypeScript, Electron IPC, scrcpy control protocol, lucide-react

---

### Task 1: Add DEL key_event and clear_text handler in `scrcpy-manager.ts`

**Files:**
- Modify: `src/main/scrcpy-manager.ts`

- [ ] **Step 1: Handle DEL key event**
  Add `DEL` to the `key_event` switch block. KEYCODE_DEL is 67.
  ```typescript
            case 'DEL':
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 0, keycode: 67, repeat: 0, metaState: 0 });
              service.sendControlMessage({ type: ControlMessageType.INJECT_KEYCODE, action: 1, keycode: 67, repeat: 0, metaState: 0 });
              break;
  ```

- [ ] **Step 2: Add `clear_text` tool case**
  Add case `clear_text` next to `key_event` under `adb:execute-tool`.
  ```typescript
        case 'clear_text': {
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execPromise = promisify(exec);
          const command = `adb -s ${serial} shell am broadcast -a ADB_CLEAR_TEXT`;

          console.log(`[ScrcpyManager] Clear text tool executing...`);

          try {
            await execPromise(command);
            return { status: 'success', details: 'Text cleared successfully' };
          } catch (e: any) {
            console.error(`[ScrcpyManager] Clear text failed:`, e);
            throw new Error(`ADBKeyBoard clear text failed: ${e.message}`);
          }
        }
  ```

- [ ] **Step 3: Commit backend changes**
  Stage and commit with message:
  `feat(backend): support DEL key_event and clear_text tool in scrcpy manager`

---

### Task 2: Add locales keys for clearAll and backspace

**Files:**
- Modify: `src/renderer/locales/zh.json`
- Modify: `src/renderer/locales/en.json`

- [ ] **Step 1: Update `zh.json`**
  Inside the `"nav"` object, add:
  - `"clearAll": "全部清除"`
  - `"backspace": "回退删除"`

- [ ] **Step 2: Update `en.json`**
  Inside the `"nav"` object, add:
  - `"clearAll": "Clear All"`
  - `"backspace": "Backspace"`

- [ ] **Step 3: Commit i18n changes**
  Stage and commit with message:
  `locales: add clearAll and backspace translations`

---

### Task 3: Implement Helper Buttons in Popover Content Form

**Files:**
- Modify: `src/renderer/components/NavigationBar.tsx`

- [ ] **Step 1: Import Trash2 and Delete icons**
  In `NavigationBar.tsx`, import `Trash2` and `Delete` from `lucide-react`.

- [ ] **Step 2: Add button handler functions**
  Implement handlers:
  ```typescript
  const handleClearText = async () => {
    try {
      await (window as any).adb.executeTool(activeSerial, 'clear_text', {});
      setTextValue('');
    } catch (err: any) {
      console.error('[NavigationBar] Failed to clear text:', err);
      setErrorMsg(err.message || t('nav.sendFailed'));
    }
  };

  const handleBackspace = async () => {
    try {
      await (window as any).adb.executeTool(activeSerial, 'key_event', { key: 'DEL' });
      setTextValue(prev => prev.slice(0, -1));
    } catch (err: any) {
      console.error('[NavigationBar] Failed to backspace:', err);
      setErrorMsg(err.message || t('nav.sendFailed'));
    }
  };
  ```

- [ ] **Step 3: Render button row inside PopoverContent**
  Add a footer row right below the main input form container:
  ```tsx
  <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
    <button
      type="button"
      onClick={handleClearText}
      className="flex items-center gap-1 px-2 py-1 text-[10px] font-extrabold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer"
    >
      <Trash2 className="w-3.5 h-3.5" />
      {t('nav.clearAll')}
    </button>
    <button
      type="button"
      onClick={handleBackspace}
      className="flex items-center gap-1 px-2 py-1 text-[10px] font-extrabold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
    >
      <Delete className="w-3.5 h-3.5" />
      {t('nav.backspace')}
    </button>
  </div>
  ```

- [ ] **Step 4: Commit UI changes**
  Stage and commit with message:
  `feat(ui): add clear all and backspace button row in input popover`

---

### Task 4: Compilation, Linting, and Verification

- [ ] **Step 1: Check Typescript & Lint**
  Verify `npm run lint` and `npx tsc --noEmit` are clean.

- [ ] **Step 2: Commit any final fixes if needed**
