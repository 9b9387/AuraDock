# Android Status Bar Text Input Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button to the NavigationBar that triggers a shadcn/ui Popover allowing users to type and send text to the connected device.

**Architecture:** We utilize the existing Radix UI `Popover` added to `@/renderer/components/ui/popover.tsx` to handle the floating UI. The Popover triggers a form inside `NavigationBar.tsx`. On submission, the text is sent via the existing IPC bridge `(window as any).adb.executeTool(activeSerial, 'input_text', { text })`.

**Tech Stack:** React 19, Tailwind v4, shadcn/ui (Radix UI) Popover, `lucide-react`, i18next

---

### Task 1: Add i18n Localization Keys

**Files:**
- Modify: `src/renderer/locales/zh.json`
- Modify: `src/renderer/locales/en.json`

- [ ] **Step 1: Update `zh.json`**
  Add keys for input text in the `nav` and `common` sections.

```json:1:15:src/renderer/locales/zh.json
// Locate "nav" section and add "inputText" and "inputTextPlaceholder".
// Locate "common" section (or we can just put action buttons in "common").
```
  Let's define the exact JSON strings.
  In `src/renderer/locales/zh.json`:
  Inside `"nav"` object, add:
  `"inputText": "输入文本"`
  `"inputTextPlaceholder": "请输入要发送到手机的文本..."`
  Inside `"common"` object (if exists, or add):
  `"send": "发送"`

- [ ] **Step 2: Update `en.json`**
  Inside `"nav"` object, add:
  `"inputText": "Input Text"`
  `"inputTextPlaceholder": "Type text to send to device..."`
  Inside `"common"` object:
  `"send": "Send"`

- [ ] **Step 3: Commit i18n changes**
```bash
git add src/renderer/locales/zh.json src/renderer/locales/en.json
git commit -m "locales: add localization keys for text input popover"
```

---

### Task 2: Modify NavigationBar layout and implement Input Popover

**Files:**
- Modify: `src/renderer/components/NavigationBar.tsx`

- [ ] **Step 1: Import Popover components and Lucide icons**
  Open `src/renderer/components/NavigationBar.tsx`.
  Import `Popover`, `PopoverTrigger`, `PopoverContent` from `src/renderer/components/ui/popover`.
  Import `Keyboard`, `Send`, `Loader2` from `lucide-react`.

- [ ] **Step 2: Declare state variables**
  Add states within `NavigationBar` component:
  ```typescript
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [textValue, setTextValue] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  ```

- [ ] **Step 3: Implement submit handler**
  Add text submit handler in `NavigationBar`:
  ```typescript
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textValue.trim() || isSending) return;

    setIsSending(true);
    setErrorMsg('');
    try {
      await (window as any).adb.executeTool(activeSerial, 'input_text', { text: textValue });
      setTextValue('');
      setIsPopoverOpen(false);
    } catch (err: any) {
      console.error('[NavigationBar] Failed to send text:', err);
      setErrorMsg(err.message || '发送失败，请重试');
    } finally {
      setIsSending(false);
    }
  };
  ```

- [ ] **Step 4: Integrate Keyboard button and Popover UI**
  Update the **Left Slot** (`w-20` is currently there; we should expand it to `w-24` or similar, and do the same for the **Right Slot** to keep balance):
  - Expand Left Slot container: `<div className="w-28 flex justify-start items-center gap-1.5">`
  - Expand Right Slot container: `<div className="w-28 flex justify-end items-center gap-1.5">`
  - Render Popover trigger and content:
  ```tsx
  <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
    <PopoverTrigger asChild>
      <button
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors cursor-pointer ${
          isPopoverOpen
            ? "text-emerald-500 bg-emerald-100/60 dark:bg-emerald-950/40"
            : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800/80"
        }`}
      >
        <Keyboard className="w-4 h-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent 
      side="top" 
      align="start" 
      sideOffset={12}
      className="w-80 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl flex flex-col gap-2.5"
    >
      <form onSubmit={handleSendText} className="flex flex-col gap-2">
        <div className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
          {t('nav.inputText')}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={t('nav.inputTextPlaceholder')}
            className="flex-1 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-lg px-2.5 py-1.5 focus:outline-none transition-colors text-zinc-800 dark:text-zinc-100"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !textValue.trim()}
            className="flex items-center justify-center size-7 shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-colors cursor-pointer"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {errorMsg && (
          <div className="text-[10px] text-rose-500 dark:text-rose-400 font-medium">
            {errorMsg}
          </div>
        )}
      </form>
    </PopoverContent>
  </Popover>
  ```

- [ ] **Step 5: Run tests / check linting**
  Check that the NavigationBar compiles correctly without typescript or linter errors.

- [ ] **Step 6: Commit changes**
```bash
git add src/renderer/components/NavigationBar.tsx
git commit -m "feat: integrate input text popover in bottom navigation bar"
```

---

### Task 3: Verification & Manual QA

**Files:**
- Manual Verification

- [ ] **Step 1: Verify layout visual balance**
  Launch the app or verify in code that the left and right slots of the bottom NavigationBar are balanced and properly sized (`w-28`).

- [ ] **Step 2: Verify localization loads correctly**
  Open the app and check that hovering over or opening the popover correctly shows English and Chinese depending on settings.

- [ ] **Step 3: Test text entry flow**
  Connect a device, click the ⌨️ icon, enter text, hit Enter / click Send. Verify that text is inputted to the device and popover closes automatically.

- [ ] **Step 4: Test edge cases**
  - Verify that ESC key closes popover.
  - Verify that clicking outside closes popover.
  - Verify that while text is sending, inputs/buttons are disabled and a loader is shown.
  - Verify that sending empty text is blocked.
