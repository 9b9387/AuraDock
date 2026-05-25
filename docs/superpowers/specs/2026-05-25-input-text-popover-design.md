# Design Spec: Status Bar Text Input Popover (shadcn/ui Popover)

This specification outlines the implementation details for adding a text input button to the bottom status bar (`NavigationBar`), which triggers a shadcn/ui-based Popover to input text and send it to the connected Android device.

## 1. Background & Goals

Currently, the Scrcpy screen mirror supports touch interaction (tap, swipe) and some basic system keys (BACK, HOME, APP_SWITCH) at the bottom. However, typing text directly into input fields on the device can be cumbersome, especially when dealing with complex Unicode text or clipboard operations.
We want to add a "Keyboard / Input Text" button at the bottom status bar. Clicking this button will display a floating Popover containing a text input field and a "Send" button to allow users to quickly send typed text to the connected device via the ADBKeyBoard protocol.

## 2. Technical Stack & Components

- **Framework**: Electron + React 19 + Tailwind v4
- **UI Components**: shadcn/ui Popover (`@/renderer/components/ui/popover.tsx`, utilizing Radix UI)
- **Icons**: `lucide-react` (specifically `<Keyboard className="w-4 h-4" />` and `<Send className="w-3.5 h-3.5" />`)
- **IPC Protocol**: `(window as any).adb.executeTool(serial, 'input_text', { text })`
- **Internationalization (i18n)**: i18next (`src/renderer/locales/zh.json` and `src/renderer/locales/en.json`)

## 3. UI/UX & Layout Design

### 3.1 Bottom Navigation Bar Changes (`NavigationBar.tsx`)
We will place the "Input Text" button next to the "Audio Output Toggle" in the **Left Slot** of the NavigationBar, and expand both the left and right slots' widths to maintain a balanced, symmetrical layout.

```tsx
// Left Slot: Audio output & Keyboard text input
<div className="w-24 flex justify-start items-center gap-2">
  <Tooltip content={audioEnabled ? t('nav.muteAudio') : t('nav.unmuteAudio')} position="top">
    {/* Audio Button */}
  </Tooltip>

  <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
    <PopoverTrigger asChild>
      <button ...>
        <Keyboard className="w-4 h-4" />
      </button>
    </PopoverTrigger>
    
    <PopoverContent className="w-80 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl flex flex-col gap-3">
      {/* Popover Form */}
    </PopoverContent>
  </Popover>
</div>

// Right Slot: Screenshot & Disconnect (expanded to w-24 to balance)
<div className="w-24 flex justify-end items-center gap-2">
  {/* Screenshot & Disconnect buttons */}
</div>
```

### 3.2 Popover Form Details
The Popover's content will float right above the keyboard button, using the Radix UI placement and alignment, offset by a few pixels (`side="top" align="start" sideOffset={12}`).
Inside the Popover:
1.  **Header**: A clean title with `t('nav.inputText')` ("输入文本" / "Input Text").
2.  **Input Area**: A text field with `autoFocus`, bound to `inputTextValue`, supporting `placeholder={t('nav.inputTextPlaceholder')}`.
3.  **Action Footer**:
    -   "Cancel" button to close the Popover.
    -   "Send" button (with `Send` icon) to execute the action. It will show a loading spinner / be disabled during sending (`isSending`).
    -   Pressing `Enter` on the input field submits the form.
    -   Pressing `Esc` closes the Popover.

## 4. State Management & IPC Flow

Inside `NavigationBar.tsx`:
-   `const [isPopoverOpen, setIsPopoverOpen] = useState(false);`
-   `const [textValue, setTextValue] = useState('');`
-   `const [isSending, setIsSending] = useState(false);`

When the user clicks "Send" or hits "Enter":
1.  Set `isSending` to `true`.
2.  Trigger IPC call:
    ```typescript
    await (window as any).adb.executeTool(activeSerial, 'input_text', { text: textValue });
    ```
3.  On success, reset `textValue` to empty, and set `isPopoverOpen` to `false`.
4.  If it fails, keep the Popover open and display a temporary error warning or alert (or log the error) so the user doesn't lose their typed text.
5.  Set `isSending` to `false` in `finally`.

## 5. i18n Localization Keys

### 5.1 Chinese (`zh.json`)
```json
"nav": {
  ...
  "inputText": "输入文本",
  "inputTextPlaceholder": "请输入要发送到手机的文本..."
}
```

### 5.2 English (`en.json`)
```json
"nav": {
  ...
  "inputText": "Input Text",
  "inputTextPlaceholder": "Type text to send to device..."
}
```

## 6. Implementation Checklist

- [ ] Add localization keys in `zh.json` and `en.json`.
- [ ] Import `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverHeader`, `PopoverTitle` from `@/renderer/components/ui/popover`.
- [ ] Import `Keyboard`, `Send` from `lucide-react`.
- [ ] Integrate Popover component and state logic into `src/renderer/components/NavigationBar.tsx`.
- [ ] Adjust slot styling to `w-24` and align buttons nicely.
- [ ] Validate and test layout, interaction, and functionality.
