/** Browser inputs mapped to the game's canonical config key names. */
export const APEX_BINDING_BY_KEYBOARD_CODE: Readonly<Record<string, string>> = {
  Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER', NumpadEnter: 'KP_ENTER', Escape: 'ESCAPE',
  Backspace: 'BACKSPACE', CapsLock: 'CAPSLOCK', ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT',
  ControlLeft: 'LCTRL', ControlRight: 'RCTRL', AltLeft: 'LALT', AltRight: 'RALT',
  ArrowUp: 'UPARROW', ArrowDown: 'DOWNARROW', ArrowLeft: 'LEFTARROW', ArrowRight: 'RIGHTARROW',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[[', BracketRight: ']', Backslash: '\\',
  IntlBackslash: '\\', Semicolon: 'SEMICOLON', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Numpad0: 'KP_INS', NumLock: 'NUMLOCK', ScrollLock: 'SCROLLLOCK', Numpad1: 'KP_END', Numpad2: 'KP_DOWNARROW', Numpad3: 'KP_PGDN', Numpad4: 'KP_LEFTARROW',
  Numpad5: 'KP_5', Numpad6: 'KP_RIGHTARROW', Numpad7: 'KP_HOME', Numpad8: 'KP_UPARROW',
  Numpad9: 'KP_PGUP', NumpadDivide: 'KP_SLASH', NumpadMultiply: 'KP_MULTIPLY',
  NumpadSubtract: 'KP_MINUS', NumpadAdd: 'KP_PLUS', NumpadDecimal: 'KP_DEL',
};

export const APEX_BINDING_BY_MOUSE_BUTTON: Readonly<Record<number, string>> = {
  0: 'MOUSE1', 1: 'MOUSE3', 2: 'MOUSE2', 3: 'MOUSE4', 4: 'MOUSE5',
};
