import type {
  ApexBinding,
  ApexGameSettingDefinition,
  ApexGameSettingsFile,
} from '@/types/apex_game_settings.ts';

const DECIMAL_SETTING_VALUE = /^-?\d+(?:\.\d+)?$/;
const UNSIGNED_INTEGER_SETTING_VALUE = /^\d+$/;

function fieldOwnsStorageKey(field: ApexGameSettingDefinition, key: string): boolean {
  return field.key === key
    || field.readKey === key
    || field.writeKeys?.includes(key) === true;
}

export function matchingApexGameSettingOptionValue(
  field: ApexGameSettingDefinition,
  value: string,
): string | null {
  const exact = field.options?.find(option => option.value === value);
  if (exact) return exact.value;
  if (field.key !== 'hud_setting_pingAlpha' || !DECIMAL_SETTING_VALUE.test(value)) {
    return null;
  }
  const valueNumber = Number(value);
  return field.options?.find(option => (
    DECIMAL_SETTING_VALUE.test(option.value)
    && Number(option.value) === valueNumber
  ))?.value ?? null;
}

/** Validate a known stored setting value without rejecting forward-compatible unknown keys. */
export function isValidApexGameSettingValue(
  fields: readonly ApexGameSettingDefinition[],
  file: ApexGameSettingsFile,
  key: string,
  value: string,
): boolean {
  const definitions = fields.filter(field => (
    field.file === file && fieldOwnsStorageKey(field, key)
  ));
  if (definitions.length === 0) return true;
  if (Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return character === '"' || code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  })) return false;

  return definitions.some(field => {
    if (field.control === 'number') {
      if (!DECIMAL_SETTING_VALUE.test(value)) return false;
      const number = Number(value);
      return Number.isFinite(number)
        && (field.min === undefined || number >= field.min)
        && (field.max === undefined || number <= field.max);
    }
    if (field.control === 'rgb') {
      if (!value) return true;
      const channels = value.split(/\s+/);
      return channels.length === 3 && channels.every(channel => {
        if (!UNSIGNED_INTEGER_SETTING_VALUE.test(channel)) return false;
        const number = Number(channel);
        return Number.isInteger(number) && number >= 0 && number <= 255;
      });
    }
    if (field.control === 'packed-rgb') {
      if (!UNSIGNED_INTEGER_SETTING_VALUE.test(value)) return false;
      const packed = Number(value);
      return Number.isInteger(packed) && packed >= 0 && packed <= 0xFF_FF_FF;
    }
    if (field.options?.some(option => option.values?.[key] === value)) return true;
    return matchingApexGameSettingOptionValue(field, value) !== null;
  });
}

/** Return the existing binding that would collide with a proposed input. */
export function findApexBindingConflict(
  bindings: readonly ApexBinding[],
  targetId: string,
  input: string,
): ApexBinding | undefined {
  const normalized = input.toUpperCase();
  return bindings.find(binding => (
    binding.input
    && binding.id !== targetId
    && binding.input.toUpperCase() === normalized
  ));
}

const APEX_BINDING_BY_KEYBOARD_CODE: Readonly<Record<string, string>> = {
  Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER', NumpadEnter: 'KP_ENTER', Escape: 'ESCAPE',
  Backspace: 'BACKSPACE', CapsLock: 'CAPSLOCK', ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT',
  ControlLeft: 'LCTRL', ControlRight: 'RCTRL', AltLeft: 'LALT', AltRight: 'RALT',
  ArrowUp: 'UPARROW', ArrowDown: 'DOWNARROW', ArrowLeft: 'LEFTARROW', ArrowRight: 'RIGHTARROW',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  IntlBackslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Numpad0: 'KP_INS', NumLock: 'NUMLOCK', ScrollLock: 'SCROLLLOCK', Numpad1: 'KP_END', Numpad2: 'KP_DOWNARROW', Numpad3: 'KP_PGDN', Numpad4: 'KP_LEFTARROW',
  Numpad5: 'KP_5', Numpad6: 'KP_RIGHTARROW', Numpad7: 'KP_HOME', Numpad8: 'KP_UPARROW',
  Numpad9: 'KP_PGUP', NumpadDivide: 'KP_SLASH', NumpadMultiply: 'KP_MULTIPLY',
  NumpadSubtract: 'KP_MINUS', NumpadAdd: 'KP_PLUS', NumpadDecimal: 'KP_DEL',
};

export function apexBindingFromKeyboardCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return APEX_BINDING_BY_KEYBOARD_CODE[code] ?? null;
}

export function apexBindingFromMouseButton(button: number): string | null {
  return ({0: 'MOUSE1', 1: 'MOUSE3', 2: 'MOUSE2', 3: 'MOUSE4', 4: 'MOUSE5'} as const)[
    button as 0 | 1 | 2 | 3 | 4
  ] ?? null;
}

export function apexBindingFromWheelDelta(deltaY: number): string | null {
  if (deltaY === 0) return null;
  return deltaY < 0 ? 'MWHEELUP' : 'MWHEELDOWN';
}

/** Keep the editable catalog internally consistent before it reaches the UI. */
export function validateApexGameSettingsCatalog(
  fields: readonly ApexGameSettingDefinition[],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const field of fields) {
    if (ids.has(field.id)) errors.push(`duplicate id: ${field.id}`);
    ids.add(field.id);
    const qualifiedKey = `${field.file}:${field.key}`;
    if (keys.has(qualifiedKey)) errors.push(`duplicate key: ${qualifiedKey}`);
    keys.add(qualifiedKey);
    if (!field.labelKey || !field.descriptionKey) {
      errors.push(`missing labels: ${field.id}`);
    }
    if (field.control === 'number') {
      if (field.min === undefined || field.max === undefined || field.step === undefined) {
        errors.push(`missing numeric range: ${field.id}`);
      } else if (field.min > field.max || field.step <= 0) {
        errors.push(`invalid numeric range: ${field.id}`);
      }
    }
    if ((field.control === 'toggle' || field.control === 'enum')
      && (!field.options || field.options.length === 0)) {
      errors.push(`missing options: ${field.id}`);
    }
    if (field.writeKeys && (field.writeKeys.length === 0 || !field.readKey)) {
      errors.push(`invalid virtual field: ${field.id}`);
    }
    if (field.readKey && field.writeKeys && !field.writeKeys.includes(field.readKey)) {
      errors.push(`virtual read key is not writable: ${field.id}`);
    }
    for (const option of field.options ?? []) {
      if (!option.values) continue;
      const optionKeys = Object.keys(option.values);
      if (!field.writeKeys
        || optionKeys.length !== field.writeKeys.length
        || optionKeys.some(key => !field.writeKeys?.includes(key))) {
        errors.push(`invalid linked option values: ${field.id}:${option.value}`);
      }
    }
  }
  return errors;
}
