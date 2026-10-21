import type {
  AppData,
  Direction,
  Sponsor,
  StylePreset,
  TickerConfig,
  TickerPatch,
  TickerSettings,
  Transition,
  WindowSettings,
} from './types';

export const DEFAULT_SETTINGS: TickerSettings = {
  direction: 'rtl',
  mode: 'marquee',
  speed: 90,
  transition: 'slide',
  transitionMs: 600,
  holdSec: 4,
  pauseSec: 0.3,
  height: 96,
  fontSize: 26,
  itemSpacing: 64,
  logoTextGap: 14,
  logoScale: 0.8,
  namePlacement: 'above',
  labelSize: 15,
  textColor: '#ffffff',
  taglineColor: '#ffd166',
  backgroundMode: 'solid',
  backgroundColor: '#0b1020',
  backgroundColor2: '#3b1d6e',
  gradientAngle: 90,
  backgroundOpacity: 0.85,
  borderWidth: 0,
  borderColor: '#f59e0b',
  borderRadius: 0,
  shadow: 0,
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  fontWeight: 700,
  italic: false,
  uppercase: false,
  letterSpacing: 0,
  showSeparator: true,
  separatorChar: '•',
};

export const DEFAULT_WINDOW: WindowSettings = {
  alwaysOnTop: true,
  locked: false,
  bounds: null,
  displayId: null,
};

export const LIMITS = {
  speed: [10, 800],
  transitionMs: [0, 3000],
  holdSec: [0.5, 120],
  pauseSec: [0, 60],
  height: [24, 600],
  fontSize: [10, 160],
  itemSpacing: [0, 400],
  logoTextGap: [0, 120],
  logoScale: [0.3, 1],
  labelSize: [8, 80],
  gradientAngle: [0, 360],
  backgroundOpacity: [0, 1],
  borderWidth: [0, 20],
  borderRadius: [0, 200],
  shadow: [0, 20],
  fontWeight: [100, 900],
  letterSpacing: [-4, 20],
  frequency: [1, 5],
} as const;

/** Appearance-only keys — what a style preset stores (not direction, speed or timing). */
export const STYLE_KEYS = [
  'fontSize',
  'itemSpacing',
  'logoTextGap',
  'logoScale',
  'namePlacement',
  'labelSize',
  'textColor',
  'taglineColor',
  'backgroundMode',
  'backgroundColor',
  'backgroundColor2',
  'gradientAngle',
  'backgroundOpacity',
  'borderWidth',
  'borderColor',
  'borderRadius',
  'shadow',
  'fontFamily',
  'fontWeight',
  'italic',
  'uppercase',
  'letterSpacing',
  'showSeparator',
  'separatorChar',
] as const satisfies readonly (keyof TickerSettings)[];

export function pickStyle(s: TickerSettings): Partial<TickerSettings> {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) out[k] = s[k];
  return out as Partial<TickerSettings>;
}

export const DEFAULT_STYLE: Partial<TickerSettings> = pickStyle(DEFAULT_SETTINGS);

export const BUILT_IN_STYLES: StylePreset[] = [
  { id: 'builtin-classic', name: 'Classic dark', builtIn: true, settings: DEFAULT_STYLE },
  {
    id: 'builtin-broadcast',
    name: 'Broadcast red',
    builtIn: true,
    settings: {
      ...DEFAULT_STYLE,
      backgroundMode: 'gradient',
      backgroundColor: '#7f1d1d',
      backgroundColor2: '#dc2626',
      gradientAngle: 90,
      backgroundOpacity: 0.95,
      taglineColor: '#fde68a',
      borderWidth: 3,
      borderColor: '#fbbf24',
      fontFamily: 'Bahnschrift, Segoe UI, sans-serif',
      uppercase: true,
      letterSpacing: 1,
      separatorChar: '|',
    },
  },
  {
    id: 'builtin-festival',
    name: 'Festival glow',
    builtIn: true,
    settings: {
      ...DEFAULT_STYLE,
      backgroundMode: 'gradient',
      backgroundColor: '#6d28d9',
      backgroundColor2: '#db2777',
      gradientAngle: 120,
      backgroundOpacity: 0.9,
      taglineColor: '#fef08a',
      borderRadius: 24,
      shadow: 6,
      separatorChar: '★',
    },
  },
  {
    id: 'builtin-clean',
    name: 'Clean light',
    builtIn: true,
    settings: {
      ...DEFAULT_STYLE,
      backgroundColor: '#ffffff',
      backgroundOpacity: 0.95,
      textColor: '#111827',
      taglineColor: '#b45309',
      borderWidth: 1,
      borderColor: '#d1d5db',
      borderRadius: 12,
      separatorChar: '·',
    },
  },
  {
    id: 'builtin-overlay',
    name: 'Transparent overlay',
    builtIn: true,
    settings: {
      ...DEFAULT_STYLE,
      backgroundOpacity: 0,
      shadow: 8,
      showSeparator: false,
    },
  },
];

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newTicker(name: string, overrides: Partial<TickerConfig> = {}): TickerConfig {
  return {
    id: newId('t'),
    name,
    sponsors: [],
    settings: { ...DEFAULT_SETTINGS },
    window: { ...DEFAULT_WINDOW },
    ...overrides,
  };
}

export function emptyData(): AppData {
  return { version: 2, eventName: 'Untitled event', tickers: [newTicker('Ticker 1')] };
}

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};
const optClamp = (v: unknown, range: readonly [number, number]) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, range, range[0]) : undefined;
const str = (v: unknown, fallback: string, max = 500) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;
const safeLogoName = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|svg)$/i.test(v) ? v : undefined;

const DIRECTIONS: readonly Direction[] = ['rtl', 'ltr', 'btt', 'ttb'];
const TRANSITIONS: readonly Transition[] = ['slide', 'fade', 'bounce', 'zoom', 'flip', 'none'];

export function normalizeSettings(raw: unknown): TickerSettings {
  const r = (raw ?? {}) as Partial<TickerSettings>;
  const d = DEFAULT_SETTINGS;
  return {
    direction: oneOf(r.direction, DIRECTIONS, d.direction),
    mode: oneOf(r.mode, ['marquee', 'spotlight'] as const, d.mode),
    speed: clamp(r.speed, LIMITS.speed, d.speed),
    transition: oneOf(r.transition, TRANSITIONS, d.transition),
    transitionMs: Math.round(clamp(r.transitionMs, LIMITS.transitionMs, d.transitionMs)),
    holdSec: clamp(r.holdSec, LIMITS.holdSec, d.holdSec),
    pauseSec: clamp(r.pauseSec, LIMITS.pauseSec, d.pauseSec),
    height: Math.round(clamp(r.height, LIMITS.height, d.height)),
    fontSize: clamp(r.fontSize, LIMITS.fontSize, d.fontSize),
    itemSpacing: clamp(r.itemSpacing, LIMITS.itemSpacing, d.itemSpacing),
    logoTextGap: clamp(r.logoTextGap, LIMITS.logoTextGap, d.logoTextGap),
    logoScale: clamp(r.logoScale, LIMITS.logoScale, d.logoScale),
    namePlacement: oneOf(r.namePlacement, ['above', 'side'] as const, d.namePlacement),
    labelSize: clamp(r.labelSize, LIMITS.labelSize, d.labelSize),
    textColor: color(r.textColor, d.textColor),
    taglineColor: color(r.taglineColor, d.taglineColor),
    backgroundMode: oneOf(r.backgroundMode, ['solid', 'gradient'] as const, d.backgroundMode),
    backgroundColor: color(r.backgroundColor, d.backgroundColor),
    backgroundColor2: color(r.backgroundColor2, d.backgroundColor2),
    gradientAngle: clamp(r.gradientAngle, LIMITS.gradientAngle, d.gradientAngle),
    backgroundOpacity: clamp(r.backgroundOpacity, LIMITS.backgroundOpacity, d.backgroundOpacity),
    borderWidth: clamp(r.borderWidth, LIMITS.borderWidth, d.borderWidth),
    borderColor: color(r.borderColor, d.borderColor),
    borderRadius: clamp(r.borderRadius, LIMITS.borderRadius, d.borderRadius),
    shadow: clamp(r.shadow, LIMITS.shadow, d.shadow),
    fontFamily: str(r.fontFamily, d.fontFamily, 200).replace(/[;{}<>]/g, '') || d.fontFamily,
    fontWeight: Math.round(clamp(r.fontWeight, LIMITS.fontWeight, d.fontWeight) / 100) * 100,
    italic: bool(r.italic, d.italic),
    uppercase: bool(r.uppercase, d.uppercase),
    letterSpacing: clamp(r.letterSpacing, LIMITS.letterSpacing, d.letterSpacing),
    showSeparator: bool(r.showSeparator, d.showSeparator),
    separatorChar: str(r.separatorChar, d.separatorChar, 4),
  };
}

export function normalizeSponsors(raw: unknown): Sponsor[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s, i) => {
      let id = str(s.id, '', 64);
      if (!id || seen.has(id)) id = `s_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 7)}`;
      seen.add(id);
      const style = (s.style ?? {}) as Record<string, unknown>;
      const freq = optClamp(s.frequency, LIMITS.frequency);
      const sponsor: Sponsor = {
        id,
        name: str(s.name, 'Sponsor', 200),
        logoPath: safeLogoName(s.logoPath),
        text: str(s.text, '', 500) || undefined,
        showName: bool(s.showName, true),
        enabled: bool(s.enabled, true),
        order: typeof s.order === 'number' ? s.order : i,
        style: {
          textColor: typeof style.textColor === 'string' ? color(style.textColor, '#ffffff') : undefined,
          bold: typeof style.bold === 'boolean' ? style.bold : undefined,
        },
        durationSec: optClamp(s.durationSec, LIMITS.holdSec),
        pauseSec: optClamp(s.pauseSec, LIMITS.pauseSec),
        frequency: freq === undefined ? undefined : Math.round(freq),
      };
      return sponsor;
    })
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }));
}

function normalizeWindow(raw: unknown): WindowSettings {
  const w = (raw ?? {}) as Partial<WindowSettings>;
  const b = w.bounds;
  const validBounds = b && [b.x, b.y, b.width, b.height].every((n) => typeof n === 'number' && Number.isFinite(n));
  return {
    alwaysOnTop: bool(w.alwaysOnTop, true),
    locked: bool(w.locked, false),
    bounds: validBounds ? { x: b!.x, y: b!.y, width: b!.width, height: b!.height } : null,
    displayId: typeof w.displayId === 'number' ? w.displayId : null,
  };
}

export function normalizeTicker(raw: unknown, i: number, seen: Set<string>): TickerConfig {
  const t = (raw ?? {}) as Record<string, unknown>;
  let id = str(t.id, '', 64);
  if (!id || seen.has(id)) id = newId('t');
  seen.add(id);
  return {
    id,
    name: str(t.name, `Ticker ${i + 1}`, 60) || `Ticker ${i + 1}`,
    sponsors: normalizeSponsors(t.sponsors),
    settings: normalizeSettings(t.settings),
    window: normalizeWindow(t.window),
  };
}

export const MAX_TICKERS = 8;

/** Accepts version 2 data and migrates version 1 (single ticker) data. */
export function normalizeData(raw: unknown): AppData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const eventName = str(r.eventName, 'Untitled event', 120);
  if (Array.isArray(r.tickers) && r.tickers.length) {
    const seen = new Set<string>();
    return { version: 2, eventName, tickers: r.tickers.slice(0, MAX_TICKERS).map((t, i) => normalizeTicker(t, i, seen)) };
  }
  // v1: { sponsors, settings, window } at the top level
  const t = normalizeTicker({ name: 'Ticker 1', sponsors: r.sponsors, settings: r.settings, window: r.window }, 0, new Set());
  return { version: 2, eventName, tickers: [t] };
}

/** Applies a patch to one ticker (pure). Returns the new data. */
export function patchTicker(data: AppData, tickerId: string, patch: TickerPatch): AppData {
  return {
    ...data,
    tickers: data.tickers.map((t) => {
      if (t.id !== tickerId) return t;
      return {
        ...t,
        name: typeof patch.name === 'string' ? patch.name.slice(0, 60) || t.name : t.name,
        sponsors: patch.sponsors ? normalizeSponsors(patch.sponsors) : t.sponsors,
        settings: patch.settings ? normalizeSettings({ ...t.settings, ...patch.settings }) : t.settings,
        window: patch.window
          ? {
              ...t.window,
              ...(typeof patch.window.alwaysOnTop === 'boolean' ? { alwaysOnTop: patch.window.alwaysOnTop } : {}),
              ...(typeof patch.window.locked === 'boolean' ? { locked: patch.window.locked } : {}),
            }
          : t.window,
      };
    }),
  };
}

/** Next free "Ticker N" name. */
export function nextTickerName(data: AppData): string {
  const used = new Set(data.tickers.map((t) => t.name));
  let n = data.tickers.length + 1;
  while (used.has(`Ticker ${n}`)) n++;
  return `Ticker ${n}`;
}

/** Creates a ticker (optionally copying another one's content and style). Pure. */
export function addTickerTo(data: AppData, copyFrom?: string): { data: AppData; id: string } {
  const src = data.tickers.find((t) => t.id === copyFrom);
  const t = newTicker(src ? `${src.name} copy`.slice(0, 60) : nextTickerName(data));
  if (src) {
    t.settings = { ...src.settings };
    t.sponsors = src.sponsors.map((s) => ({ ...s, id: newId('s') }));
    t.window = { ...src.window, bounds: null };
  }
  return { data: { ...data, tickers: [...data.tickers, t] }, id: t.id };
}

export function allLogoPaths(data: AppData): string[] {
  return data.tickers.flatMap((t) => t.sponsors.map((s) => s.logoPath).filter((x): x is string => !!x));
}

/** Enabled sponsors in display order. */
export function activeSponsors(sponsors: Sponsor[]): Sponsor[] {
  return sponsors.filter((s) => s.enabled && (s.logoPath || s.name || s.text)).sort((a, b) => a.order - b.order);
}

/**
 * One loop of the rotation: enabled sponsors in order, with sponsors whose frequency is > 1
 * repeated and spread evenly across the loop.
 */
export function playlist(sponsors: Sponsor[]): Sponsor[] {
  const items = activeSponsors(sponsors);
  if (!items.some((s) => (s.frequency ?? 1) > 1)) return items;
  const slots: { s: Sponsor; pos: number; i: number }[] = [];
  items.forEach((s, i) => {
    const f = Math.max(1, Math.min(5, Math.round(s.frequency ?? 1)));
    for (let k = 0; k < f; k++) slots.push({ s, pos: (k + (i + 0.5) / items.length) / f, i });
  });
  slots.sort((a, b) => a.pos - b.pos || a.i - b.i);
  // Avoid showing the same sponsor twice in a row where a swap fixes it.
  for (let j = 1; j < slots.length; j++) {
    if (slots[j].s.id === slots[j - 1].s.id) {
      const k = slots.findIndex((x, n) => n > j && x.s.id !== slots[j].s.id && (n + 1 >= slots.length || slots[n + 1].s.id !== slots[j].s.id));
      if (k > 0) [slots[j], slots[k]] = [slots[k], slots[j]];
    }
  }
  return slots.map((x) => x.s);
}
