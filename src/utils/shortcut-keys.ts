/** 将 KeyboardEvent 转为加速键字符串，如 Ctrl+Alt+Z。修饰键单独按下时返回 null。 */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = normalizeKey(e);
  if (!key) return null;

  parts.push(key);
  return parts.join('+');
}

function normalizeKey(e: KeyboardEvent): string | null {
  const code = e.code;
  const key = e.key;

  if (
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Shift' ||
    key === 'Meta' ||
    key === 'OS'
  ) {
    return null;
  }

  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad') && code.length > 6) {
    const rest = code.slice(6);
    if (/^\d$/.test(rest)) return rest;
  }

  const special: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    ' ': 'Space',
    Spacebar: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    F1: 'F1',
    F2: 'F2',
    F3: 'F3',
    F4: 'F4',
    F5: 'F5',
    F6: 'F6',
    F7: 'F7',
    F8: 'F8',
    F9: 'F9',
    F10: 'F10',
    F11: 'F11',
    F12: 'F12',
  };

  if (special[key]) return special[key];
  if (special[code]) return special[code];

  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (/^[A-Z0-9]$/.test(upper)) return upper;
  }

  return null;
}

/** 展示用：Ctrl+Alt+Z → Ctrl + Alt + Z */
export function formatAcceleratorDisplay(accelerator: string): string {
  if (!accelerator) return '';
  return accelerator.split('+').join(' + ');
}

function isValidAccelerator(accelerator: string, requireModifier: boolean): boolean {
  if (!accelerator) return false;
  const parts = accelerator.split('+').filter(Boolean);
  if (parts.length < 1) return false;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key) return false;
  if (!mods.every((m) => m === 'Ctrl' || m === 'Alt' || m === 'Shift')) return false;
  if (requireModifier && mods.length === 0) return false;
  return true;
}

/** 应用内快捷键：需包含修饰键，避免与普通按键冲突。 */
export function isValidAppAccelerator(accelerator: string): boolean {
  return isValidAccelerator(accelerator, true);
}

/** 全局快捷键：必须带 Ctrl / Alt / Shift 修饰键。 */
export function isValidGlobalAccelerator(accelerator: string): boolean {
  return isValidAccelerator(accelerator, true);
}

/** APEX Q 计算器热键：允许单独 F1–F12（对接 Steam 截图），或带修饰键的组合。 */
export function isValidApexQAccelerator(accelerator: string): boolean {
  if (!accelerator) return false;
  if (/^F([1-9]|1[0-2])$/i.test(accelerator)) return true;
  return isValidAccelerator(accelerator, true);
}

export function matchesAccelerator(e: KeyboardEvent, accelerator: string): boolean {
  if (!accelerator) return false;
  const current = eventToAccelerator(e);
  return !!current && current === accelerator;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return !!target.closest('[contenteditable="true"]');
}
