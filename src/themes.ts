export interface AccentTheme {
  id: string;
  nameKey: string;
  previewColors: string[];
  light: {
    primary: string;
    gradient: [string, string];
    shadow: string;
  };
  dark: {
    primary: string;
    gradient: [string, string];
    shadow: string;
  };
}

export const accentThemes: AccentTheme[] = [
  {
    id: 'apex-red',
    nameKey: 'settings.accentApexRed',
    previewColors: ['#4A0B0E', '#7F1418', '#B51F24', '#DA292A', '#FF7070', '#FFC4C4'],
    light: {
      primary: '#DA292A',
      gradient: ['#DA292A', '#A91D22'],
      shadow: 'rgba(218,41,42,0.27)',
    },
    dark: {
      primary: '#FF7070',
      gradient: ['#FF7070', '#E33E43'],
      shadow: 'rgba(255,112,112,0.3)',
    },
  },
  {
    id: 'blue',
    nameKey: 'settings.accentBlue',
    previewColors: ['#06375F', '#0A4E86', '#0F6CBD', '#2589D8', '#4CC2FF', '#C7EAFF'],
    light: {
      primary: '#0F6CBD',
      gradient: ['#0F6CBD', '#0099BC'],
      shadow: 'rgba(15,108,189,0.25)',
    },
    dark: {
      primary: '#4CC2FF',
      gradient: ['#4CC2FF', '#60CDFF'],
      shadow: 'rgba(76,194,255,0.28)',
    },
  },
  {
    id: 'sakura',
    nameKey: 'settings.accentSakura',
    previewColors: ['#6B0B41', '#B0175E', '#E91E8C', '#F05CA9', '#F599C6', '#FBD6E8'],
    light: {
      primary: '#E91E8C',
      gradient: ['#E91E8C', '#C850C0'],
      shadow: 'rgba(233,30,140,0.25)',
    },
    dark: {
      primary: '#FF4DA6',
      gradient: ['#FF4DA6', '#E040CF'],
      shadow: 'rgba(255,77,166,0.3)',
    },
  },
  {
    id: 'rose',
    nameKey: 'settings.accentRose',
    previewColors: ['#6B0D23', '#A81535', '#E11D48', '#EB5C75', '#F39BA3', '#FBDADE'],
    light: {
      primary: '#E11D48',
      gradient: ['#E11D48', '#DB2777'],
      shadow: 'rgba(225,29,72,0.25)',
    },
    dark: {
      primary: '#FB7185',
      gradient: ['#FB7185', '#F472B6'],
      shadow: 'rgba(251,113,133,0.3)',
    },
  },
  {
    id: 'flamingo',
    nameKey: 'settings.accentFlamingo',
    previewColors: ['#6B1B44', '#A82E6E', '#EC4899', '#F17DB5', '#F6B2D1', '#FCE7F0'],
    light: {
      primary: '#EC4899',
      gradient: ['#EC4899', '#A855F7'],
      shadow: 'rgba(236,72,153,0.25)',
    },
    dark: {
      primary: '#F472B6',
      gradient: ['#F472B6', '#C084FC'],
      shadow: 'rgba(244,114,182,0.3)',
    },
  },
  {
    id: 'lavender',
    nameKey: 'settings.accentLavender',
    previewColors: ['#3B1B70', '#5B2DA4', '#7C3AED', '#9D6EF3', '#BEA2F7', '#E0D6FC'],
    light: {
      primary: '#7C3AED',
      gradient: ['#7C3AED', '#6366F1'],
      shadow: 'rgba(124,58,237,0.25)',
    },
    dark: {
      primary: '#A78BFA',
      gradient: ['#A78BFA', '#818CF8'],
      shadow: 'rgba(167,139,250,0.3)',
    },
  },
  {
    id: 'indigo',
    nameKey: 'settings.accentIndigo',
    previewColors: ['#2A2570', '#3A35A8', '#4F46E5', '#7B74EB', '#A7A3F1', '#D3D1F8'],
    light: {
      primary: '#4F46E5',
      gradient: ['#4F46E5', '#7C3AED'],
      shadow: 'rgba(79,70,229,0.25)',
    },
    dark: {
      primary: '#818CF8',
      gradient: ['#818CF8', '#A78BFA'],
      shadow: 'rgba(129,140,248,0.3)',
    },
  },
  {
    id: 'amethyst',
    nameKey: 'settings.accentAmethyst',
    previewColors: ['#471985', '#6B25B2', '#9333EA', '#AD66F0', '#C899F5', '#E3CCFB'],
    light: {
      primary: '#9333EA',
      gradient: ['#9333EA', '#C026D3'],
      shadow: 'rgba(147,51,234,0.25)',
    },
    dark: {
      primary: '#A855F7',
      gradient: ['#A855F7', '#D946EF'],
      shadow: 'rgba(168,85,247,0.3)',
    },
  },
  {
    id: 'emerald',
    nameKey: 'settings.accentEmerald',
    previewColors: ['#024332', '#03664C', '#059669', '#3CB389', '#72D0AA', '#C5F0DE'],
    light: {
      primary: '#059669',
      gradient: ['#059669', '#0D9488'],
      shadow: 'rgba(5,150,105,0.25)',
    },
    dark: {
      primary: '#34D399',
      gradient: ['#34D399', '#2DD4BF'],
      shadow: 'rgba(52,211,153,0.3)',
    },
  },
  {
    id: 'mint',
    nameKey: 'settings.accentMint',
    previewColors: ['#064339', '#09695B', '#0D9488', '#42B0A5', '#76CCC3', '#C3EDE8'],
    light: {
      primary: '#0D9488',
      gradient: ['#0D9488', '#0891B2'],
      shadow: 'rgba(13,148,136,0.25)',
    },
    dark: {
      primary: '#2DD4BF',
      gradient: ['#2DD4BF', '#22D3EE'],
      shadow: 'rgba(45,212,191,0.3)',
    },
  },
  {
    id: 'cyan',
    nameKey: 'settings.accentCyan',
    previewColors: ['#043E52', '#066178', '#0891B2', '#3CAEC8', '#70CBDE', '#C0ECF4'],
    light: {
      primary: '#0891B2',
      gradient: ['#0891B2', '#0284C7'],
      shadow: 'rgba(8,145,178,0.25)',
    },
    dark: {
      primary: '#22D3EE',
      gradient: ['#22D3EE', '#38BDF8'],
      shadow: 'rgba(34,211,238,0.3)',
    },
  },
  {
    id: 'amber',
    nameKey: 'settings.accentAmber',
    previewColors: ['#5B3203', '#8D4E05', '#D97706', '#E49940', '#EFBB7A', '#FADEC0'],
    light: {
      primary: '#D97706',
      gradient: ['#D97706', '#EA580C'],
      shadow: 'rgba(217,119,6,0.25)',
    },
    dark: {
      primary: '#FBBF24',
      gradient: ['#FBBF24', '#FB923C'],
      shadow: 'rgba(251,191,36,0.3)',
    },
  },
  {
    id: 'coral',
    nameKey: 'settings.accentCoral',
    previewColors: ['#642605', '#9A3A08', '#EA580C', '#F08044', '#F5A97C', '#FBD2BD'],
    light: {
      primary: '#EA580C',
      gradient: ['#EA580C', '#DC2626'],
      shadow: 'rgba(234,88,12,0.25)',
    },
    dark: {
      primary: '#FB923C',
      gradient: ['#FB923C', '#F87171'],
      shadow: 'rgba(251,146,60,0.3)',
    },
  },
];

export const DEFAULT_ACCENT = 'apex-red';

export function findAccent(id: string): AccentTheme {
  return accentThemes.find(t => t.id === id)
    ?? accentThemes.find(t => t.id === DEFAULT_ACCENT)
    ?? accentThemes[0];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('');
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(background: string, foreground: string): number {
  const lighter = Math.max(relativeLuminance(background), relativeLuminance(foreground));
  const darker = Math.min(relativeLuminance(background), relativeLuminance(foreground));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Keep the accent readable when it is used as text on a theme surface. */
function ensurePrimaryContrast(primary: string, isDark: boolean): string {
  const surface = isDark ? '#30353c' : '#ffffff';
  if (contrastRatio(surface, primary) >= 4.5) return primary;

  for (let step = 1; step <= 20; step += 1) {
    const amount = step / 20;
    const candidate = isDark ? lighten(primary, amount) : darken(primary, amount);
    if (contrastRatio(surface, candidate) >= 4.5) return candidate;
  }
  return isDark ? '#ffffff' : '#111820';
}

function contrastingText(background: string): string {
  const light = '#ffffff';
  const dark = '#111820';
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

export function deriveThemeColors(primary: string, isDark: boolean) {
  const accessiblePrimary = ensurePrimaryContrast(primary, isDark);
  if (isDark) {
    return {
      primary: accessiblePrimary,
      'on-primary': contrastingText(accessiblePrimary),
      info: accessiblePrimary,
      'primary-container': darken(accessiblePrimary, 0.65),
      'on-primary-container': lighten(accessiblePrimary, 0.55),
    };
  }
  return {
    primary: accessiblePrimary,
    'on-primary': contrastingText(accessiblePrimary),
    info: accessiblePrimary,
    'primary-container': lighten(accessiblePrimary, 0.78),
    'on-primary-container': darken(accessiblePrimary, 0.45),
  };
}

export function applySplashTheme(accent: AccentTheme, isDark: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
  const mode = isDark ? accent.dark : accent.light;
  const style = document.documentElement.style;
  style.setProperty('--splash-g1', mode.gradient[0]);
  style.setProperty('--splash-g2', mode.gradient[1]);
  style.setProperty('--splash-primary', mode.primary);
  style.setProperty('--splash-shadow', mode.shadow);
}
