export type ApexLaunchToken = {
  /** Value used for matching, with surrounding quotes removed. */
  value: string;
  /** Original source slice, including quotes and punctuation. */
  raw: string;
  start: number;
  end: number;
  hasQuotes: boolean;
  closedQuote: boolean;
};

export type ApexLaunchFpsRead = {
  unlimited: boolean;
  value?: number;
};

export type ApexLaunchLetterboxRead = {
  min?: number;
  goal?: number;
  threshold?: number;
};

export type ApexLaunchRead = {
  tokens: readonly ApexLaunchToken[];
  claimedTokenIndices: ReadonlySet<number>;
  customLaunchOptions: string;
  window?: string;
  width?: number;
  height?: number;
  lobbyMaxFps?: number;
  fps?: ApexLaunchFpsRead;
  letterbox?: ApexLaunchLetterboxRead;
};

type TokenMatch = {
  index: number;
  valueIndex?: number;
  value?: string;
};

const CONTROL_CHARACTERS = /\p{Cc}/gu;
const INTEGER_PATTERN = /^\d+$/;
const NUMBER_PATTERN = /^\d+(?:\.\d*)?$/;

const MILES_LANGUAGES = new Set([
  'mandarin',
  'english',
  'japanese',
  'french',
  'german',
  'italian',
  'korean',
  'polish',
  'russian',
  'spanish',
]);

const MILES_CHANNELS = new Set(['2', '4', '6', '8']);
const WINDOW_FLAGS = new Set(['-fullscreen', '-window', '-windowed', '-noborder']);
// 已从当前游戏构建(R5pc_r5-300_J57,2026-08)实测确认失效、不再受管的 token:
// -anticheat_settings=SettingsDX11/12.json(DX11 已移除)、-freq、-forcenovsync、
// +cl_ragdoll_collide、-limitvsconst、+m_rawinput、-noforcemaccel/mspd/mparms、
// +cl_forcepreload、-preload、+mat_queue_mode、-allow_thrid_party_software。
// 它们出现在旧启动串时会留在自定义输入框,由用户自行清理。
// 核实记录见 docs/CHANGELOG.md。
const RETICLE_VALUES = new Set([
  '2147483648 2147483648 2147483648',
  '2147483648-2147483648-2147483648',
]);

/**
 * Tokenize the launcher value without using substring searches. In particular,
 * a quoted `+exec` path remains one token even when its filename contains text
 * that looks like another Apex command.
 */
export function tokenizeApexLaunchOptions(value: string): ApexLaunchToken[] {
  const tokens: ApexLaunchToken[] = [];
  let index = 0;

  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index])) index += 1;
    if (index >= value.length) break;

    const start = index;
    let quote: '"' | "'" | null = null;
    let hasQuotes = false;
    let text = '';

    while (index < value.length) {
      const character = value[index];
      if (quote) {
        if (character === quote) {
          quote = null;
          index += 1;
          continue;
        }
        // Keep escaped quote characters in the matching value while leaving
        // the original spelling available through `raw`.
        if (character === '\\' && value[index + 1] === quote) {
          text += value[index + 1];
          index += 2;
          continue;
        }
        text += character;
        index += 1;
        continue;
      }

      if (character === '"' || character === "'") {
        quote = character;
        hasQuotes = true;
        index += 1;
        continue;
      }
      if (/\s/.test(character)) break;
      text += character;
      index += 1;
    }

    tokens.push({
      value: text,
      raw: value.slice(start, index),
      start,
      end: index,
      hasQuotes,
      closedQuote: quote === null,
    });
  }

  return tokens;
}

function isInteger(value: string): boolean {
  return INTEGER_PATTERN.test(value) && Number.isFinite(Number(value));
}

function isNumber(value: string): boolean {
  return NUMBER_PATTERN.test(value) && Number.isFinite(Number(value));
}

function normalizeWhitespaceOutsideQuotes(value: string): string {
  let output = '';
  let quote: '"' | "'" | null = null;
  let pendingSpace = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      output += character;
      if (character === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      if (pendingSpace && output.length > 0) output += ' ';
      pendingSpace = false;
      quote = character;
      output += character;
      continue;
    }
    if (/\s/.test(character)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && output.length > 0) output += ' ';
    pendingSpace = false;
    output += character;
  }

  return output.trim();
}

function commandTokenIsAvailable(
  tokens: readonly ApexLaunchToken[],
  index: number,
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
): boolean {
  const token = tokens[index];
  return Boolean(
    token
      && token.closedQuote
      && !token.hasQuotes
      && !claimed.has(index)
      && !protectedIndices.has(index),
  );
}

function valueTokenIsAvailable(
  tokens: readonly ApexLaunchToken[],
  index: number,
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
): boolean {
  const token = tokens[index];
  return Boolean(
    token
      && token.closedQuote
      && !claimed.has(index)
      && !protectedIndices.has(index),
  );
}

function protectExecArguments(tokens: readonly ApexLaunchToken[]): Set<number> {
  const protectedIndices = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === '+exec' && index + 1 < tokens.length) {
      protectedIndices.add(index + 1);
    }
  }
  return protectedIndices;
}

function findFlag(
  tokens: readonly ApexLaunchToken[],
  flag: string,
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
): TokenMatch | null {
  for (let index = 0; index < tokens.length; index += 1) {
    if (commandTokenIsAvailable(tokens, index, claimed, protectedIndices)
      && tokens[index].value === flag) {
      return {index};
    }
  }
  return null;
}

function findValue(
  tokens: readonly ApexLaunchToken[],
  command: string,
  accepts: (value: string) => boolean,
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
): TokenMatch | null {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!commandTokenIsAvailable(tokens, index, claimed, protectedIndices)
      || tokens[index].value !== command
      || !valueTokenIsAvailable(tokens, index + 1, claimed, protectedIndices)) {
      continue;
    }
    const nextValue = tokens[index + 1].value;
    if (accepts(nextValue)) return {index, valueIndex: index + 1, value: nextValue};
  }
  return null;
}

function claimMatch(claimed: Set<number>, match: TokenMatch | null) {
  if (!match) return;
  claimed.add(match.index);
  if (match.valueIndex !== undefined) claimed.add(match.valueIndex);
}

function takeFlag(
  tokens: readonly ApexLaunchToken[],
  flag: string,
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): boolean {
  const match = findFlag(tokens, flag, claimed, protectedIndices);
  claimMatch(claimed, match);
  return match !== null;
}

function takeFirstFlag(
  tokens: readonly ApexLaunchToken[],
  flags: ReadonlySet<string>,
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): string | undefined {
  for (let index = 0; index < tokens.length; index += 1) {
    if (!commandTokenIsAvailable(tokens, index, claimed, protectedIndices)) continue;
    const value = tokens[index].value;
    if (!flags.has(value)) continue;
    claimed.add(index);
    return value;
  }
  return undefined;
}

function takeValue(
  tokens: readonly ApexLaunchToken[],
  command: string,
  accepts: (value: string) => boolean,
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): string | undefined {
  const match = findValue(tokens, command, accepts, claimed, protectedIndices);
  claimMatch(claimed, match);
  return match?.value;
}

function renderCustomOptions(
  value: string,
  tokens: readonly ApexLaunchToken[],
  claimed: ReadonlySet<number>,
): string {
  const ranges = [...claimed]
    .sort((left, right) => left - right)
    .map(index => ({start: tokens[index].start, end: tokens[index].end}));
  let remaining = '';
  let cursor = 0;
  for (const range of ranges) {
    remaining += value.slice(cursor, range.start);
    cursor = range.end;
  }
  remaining += value.slice(cursor);
  return normalizeWhitespaceOutsideQuotes(remaining);
}

function readApexLaunchOptionsInternal(value: string): ApexLaunchRead {
  const tokens = tokenizeApexLaunchOptions(value);
  const claimed = new Set<number>();
  const protectedIndices = protectExecArguments(tokens);

  const read: ApexLaunchRead = {
    tokens,
    claimedTokenIndices: claimed,
    customLaunchOptions: '',
  };

  const windowFlag = takeFirstFlag(tokens, WINDOW_FLAGS, claimed, protectedIndices);
  if (windowFlag) read.window = windowFlag === '-windowed' ? '-window' : windowFlag;

  const widthMatch = findValue(tokens, '-width', isInteger, claimed, protectedIndices);
  const heightMatch = findValue(tokens, '-height', isInteger, claimed, protectedIndices);
  if (widthMatch && heightMatch) {
    claimMatch(claimed, widthMatch);
    claimMatch(claimed, heightMatch);
    read.width = Number(widthMatch.value);
    read.height = Number(heightMatch.value);
  }

  takeValue(
    tokens,
    '+cl_fovScale',
    candidate => candidate === '1.7',
    claimed,
    protectedIndices,
  );
  takeValue(
    tokens,
    '+reticle_color',
    candidate => RETICLE_VALUES.has(candidate),
    claimed,
    protectedIndices,
  );

  const lobby = takeValue(tokens, '+lobby_max_fps', isInteger, claimed, protectedIndices);
  if (lobby !== undefined) read.lobbyMaxFps = Number(lobby);

  const letterbox: ApexLaunchLetterboxRead = {};
  const aspectMin = takeValue(tokens, '+mat_letterbox_aspect_min', isNumber, claimed, protectedIndices);
  const aspectGoal = takeValue(tokens, '+mat_letterbox_aspect_goal', isNumber, claimed, protectedIndices);
  const aspectThreshold = takeValue(tokens, '+mat_letterbox_aspect_threshold', isNumber, claimed, protectedIndices);
  if (aspectMin !== undefined) letterbox.min = Number(aspectMin);
  if (aspectGoal !== undefined) letterbox.goal = Number(aspectGoal);
  if (aspectThreshold !== undefined) letterbox.threshold = Number(aspectThreshold);
  if (Object.keys(letterbox).length > 0) read.letterbox = letterbox;

  const unlimited = findValue(
    tokens,
    '+fps_max',
    candidate => candidate === 'unlimited',
    claimed,
    protectedIndices,
  );
  const fpsMax = findValue(tokens, '+fps_max', isInteger, claimed, protectedIndices);
  if (unlimited) {
    claimMatch(claimed, unlimited);
    read.fps = {unlimited: true};
  } else if (fpsMax?.value !== undefined) {
    claimMatch(claimed, fpsMax);
    read.fps = {unlimited: false, value: Number(fpsMax.value)};
  }

  takeValue(
    tokens,
    '+miles_language',
    candidate => MILES_LANGUAGES.has(candidate),
    claimed,
    protectedIndices,
  );
  takeValue(
    tokens,
    '+miles_channels',
    candidate => MILES_CHANNELS.has(candidate),
    claimed,
    protectedIndices,
  );

  takeFlag(tokens, '-novid', claimed, protectedIndices);
  takeFlag(tokens, '-dev', claimed, protectedIndices);
  takeFlag(tokens, '-high', claimed, protectedIndices);
  takeValue(
    tokens,
    '+mat_minimize_on_alt_tab',
    candidate => candidate === '1',
    claimed,
    protectedIndices,
  );
  takeValue(
    tokens,
    '+cl_showfps',
    candidate => candidate === '1',
    claimed,
    protectedIndices,
  );
  takeValue(
    tokens,
    '+cl_showpos',
    candidate => candidate === '1',
    claimed,
    protectedIndices,
  );
  takeFlag(tokens, '-no_render_on_input_thread', claimed, protectedIndices);
  takeFlag(tokens, '-nojoy', claimed, protectedIndices);
  takeValue(
    tokens,
    '+cl_is_softened_locale',
    candidate => candidate === '1',
    claimed,
    protectedIndices,
  );

  read.customLaunchOptions = renderCustomOptions(value, tokens, claimed);
  return read;
}

/** Read the managed and custom portions of one launcher string together. */
export function readApexLaunchOptions(value: string): ApexLaunchRead {
  return readApexLaunchOptionsInternal(value);
}

/**
 * Match a config literal against the exact tokens claimed during the read.
 * This keeps generic/static catalog entries on the same boundary as the
 * special-case values above and prevents substring matches inside `+exec`.
 */
export function hasClaimedApexLaunchParameter(
  read: ApexLaunchRead,
  parameter: string,
): boolean {
  const wanted = tokenizeApexLaunchOptions(parameter);
  if (wanted.length === 0) return false;
  for (let start = 0; start <= read.tokens.length - wanted.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < wanted.length; offset += 1) {
      const index = start + offset;
      if (!read.claimedTokenIndices.has(index)
        || read.tokens[index].value !== wanted[offset].value) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** Normalize pasted content before it reaches the native launcher writer. */
export function normalizeApexCustomLaunchOptions(value: string): string {
  return value.replace(CONTROL_CHARACTERS, ' ');
}

/** Backwards-compatible convenience wrapper for callers that only need the remainder. */
export function extractApexCustomLaunchOptions(value: string): string {
  return readApexLaunchOptions(value).customLaunchOptions;
}
