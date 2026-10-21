import type { AppData, Sponsor, TickerSettings, WindowSettings } from './types';

export const DEFAULT_SETTINGS: TickerSettings = {
  direction: 'rtl',
  speed: 90,
  height: 72,
  fontSize: 26,
  itemSpacing: 64,
  logoTextGap: 14,
  logoScale: 0.8,
  textColor: '#ffffff',
  taglineColor: '#ffd166',
  backgroundColor: '#0b1020',
  backgroundOpacity: 0.85,
  fontFamily: 'Segoe UI, system-ui, sans-serif',
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
  height: [24, 400],
  fontSize: [10, 160],
  itemSpacing: [0, 400],
  logoTextGap: [0, 120],
  logoScale: [0.3, 1],
  backgroundOpacity: [0, 1],
} as const;

export function emptyData(): AppData {
  return {
    version: 1,
    eventName: 'Untitled event',
    sponsors: [],
    settings: { ...DEFAULT_SETTINGS },
    window: { ...DEFAULT_WINDOW },
  };
}

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};
const str = (v: unknown, fallback: string, max = 500) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
const safeLogoName = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|svg)$/i.test(v) ? v : undefined;

export function normalizeSettings(raw: unknown): TickerSettings {
  const r = (raw ?? {}) as Partial<TickerSettings>;
  const d = DEFAULT_SETTINGS;
  return {
    direction: r.direction === 'ltr' ? 'ltr' : 'rtl',
    speed: clamp(r.speed, LIMITS.speed, d.speed),
    height: Math.round(clamp(r.height, LIMITS.height, d.height)),
    fontSize: clamp(r.fontSize, LIMITS.fontSize, d.fontSize),
    itemSpacing: clamp(r.itemSpacing, LIMITS.itemSpacing, d.itemSpacing),
    logoTextGap: clamp(r.logoTextGap, LIMITS.logoTextGap, d.logoTextGap),
    logoScale: clamp(r.logoScale, LIMITS.logoScale, d.logoScale),
    textColor: color(r.textColor, d.textColor),
    taglineColor: color(r.taglineColor, d.taglineColor),
    backgroundColor: color(r.backgroundColor, d.backgroundColor),
    backgroundOpacity: clamp(r.backgroundOpacity, LIMITS.backgroundOpacity, d.backgroundOpacity),
    fontFamily: str(r.fontFamily, d.fontFamily, 200),
    showSeparator: typeof r.showSeparator === 'boolean' ? r.showSeparator : d.showSeparator,
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
      const sponsor: Sponsor = {
        id,
        name: str(s.name, 'Sponsor', 200),
        logoPath: safeLogoName(s.logoPath),
        text: str(s.text, '', 500) || undefined,
        showName: typeof s.showName === 'boolean' ? s.showName : true,
        enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
        order: typeof s.order === 'number' ? s.order : i,
        style: {
          textColor: typeof style.textColor === 'string' ? color(style.textColor, '#ffffff') : undefined,
          bold: typeof style.bold === 'boolean' ? style.bold : undefined,
        },
      };
      return sponsor;
    })
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }));
}

export function normalizeData(raw: unknown): AppData {
  const r = (raw ?? {}) as Partial<AppData>;
  const w = (r.window ?? {}) as Partial<WindowSettings>;
  const b = w.bounds;
  const validBounds =
    b && [b.x, b.y, b.width, b.height].every((n) => typeof n === 'number' && Number.isFinite(n));
  return {
    version: 1,
    eventName: str(r.eventName, 'Untitled event', 120),
    sponsors: normalizeSponsors(r.sponsors),
    settings: normalizeSettings(r.settings),
    window: {
      alwaysOnTop: typeof w.alwaysOnTop === 'boolean' ? w.alwaysOnTop : true,
      locked: typeof w.locked === 'boolean' ? w.locked : false,
      bounds: validBounds ? { x: b!.x, y: b!.y, width: b!.width, height: b!.height } : null,
      displayId: typeof w.displayId === 'number' ? w.displayId : null,
    },
  };
}

/** Enabled sponsors in display order. */
export function activeSponsors(sponsors: Sponsor[]): Sponsor[] {
  return sponsors.filter((s) => s.enabled && (s.logoPath || s.name || s.text)).sort((a, b) => a.order - b.order);
}
