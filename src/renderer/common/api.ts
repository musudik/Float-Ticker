import type { AppData, FloatTickerApi, FullState, Sponsor, StylePreset, TickerRuntime, TickerTarget } from '../../shared/types';
import {
  addTickerTo,
  BUILT_IN_STYLES,
  emptyData,
  MAX_TICKERS,
  newId,
  normalizeData,
  normalizeSettings,
  patchTicker,
  pickStyle,
} from '../../shared/defaults';

interface TickerEvents {
  onRestart(cb: () => void): () => void;
  onDisplaysChanged(cb: () => void): () => void;
}

declare global {
  interface Window {
    floatTicker?: FloatTickerApi;
    floatTickerEvents?: TickerEvents;
  }
}

/**
 * Browser fallback used when the UI runs outside Electron (`npm run dev:web`).
 * Keeps state in localStorage and syncs dashboard ↔ ticker tabs via BroadcastChannel,
 * so the UI can be developed and tested in a normal browser. Open /ticker.html?t=<tickerId>
 * (or just /ticker.html for the first ticker) to see a display window.
 */
function createMockApi(): { api: FloatTickerApi; events: TickerEvents } {
  const KEY = 'floatticker-mock-state-v2';
  const LOGOS = 'floatticker-mock-logos';
  const channel = new BroadcastChannel('floatticker-mock');
  const isTicker = location.pathname.includes('ticker');
  interface Persisted {
    data: AppData;
    runtime: Record<string, TickerRuntime>;
    profiles: { id: string; name: string; savedAt: string; data: AppData }[];
    styles: StylePreset[];
  }
  const load = (): Persisted => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (raw) return { data: normalizeData(raw.data), runtime: raw.runtime ?? {}, profiles: raw.profiles ?? [], styles: raw.styles ?? [] };
    } catch {
      /* ignore */
    }
    return { data: emptyData(), runtime: {}, profiles: [], styles: [] };
  };
  let p = load();
  const logos: Record<string, string> = (() => {
    try {
      return JSON.parse(localStorage.getItem(LOGOS) ?? '{}');
    } catch {
      return {};
    }
  })();
  const toFull = (): FullState => ({
    data: p.data,
    runtime: Object.fromEntries(p.data.tickers.map((t) => [t.id, p.runtime[t.id] ?? { playback: 'stopped', visible: false }])),
    missingLogos: p.data.tickers.flatMap((t) => t.sponsors.filter((s) => s.logoPath && !logos[s.logoPath]).map((s) => s.logoPath!)),
    library: {
      profiles: p.profiles.map((x) => ({
        id: x.id,
        name: x.name,
        savedAt: x.savedAt,
        tickerCount: x.data.tickers.length,
        sponsorCount: x.data.tickers.reduce((n, t) => n + t.sponsors.length, 0),
      })),
      stylePresets: [...BUILT_IN_STYLES, ...p.styles],
    },
  });
  const listeners = new Set<(s: FullState) => void>();
  const restartListeners = new Set<() => void>();
  const emit = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
    const s = toFull();
    listeners.forEach((l) => l(s));
    channel.postMessage({ type: 'state' });
  };
  channel.onmessage = (e) => {
    if (e.data?.type === 'state') {
      p = load();
      const s = toFull();
      listeners.forEach((l) => l(s));
    } else if (e.data?.type === 'restart') restartListeners.forEach((l) => l());
  };
  const ids = (target: TickerTarget) => (target === 'all' ? p.data.tickers.map((t) => t.id) : [target]);
  const rt = (id: string) => (p.runtime[id] ??= { playback: 'stopped', visible: false });
  const pickFiles = (multiple: boolean) =>
    new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      input.accept = '.png,.jpg,.jpeg,.webp,.svg';
      input.onchange = () => resolve([...(input.files ?? [])]);
      input.click();
    });
  const storeFile = (f: File) =>
    new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => {
        const ext = (f.name.split('.').pop() ?? 'png').toLowerCase();
        const name = `${Math.random().toString(16).slice(2, 12)}.${ext}`;
        logos[name] = String(r.result);
        try {
          localStorage.setItem(LOGOS, JSON.stringify(logos));
        } catch {
          /* quota */
        }
        resolve(name);
      };
      r.readAsDataURL(f);
    });
  const tickerParam = new URLSearchParams(location.search).get('t');

  const api: FloatTickerApi = {
    getState: async () => toFull(),
    onState: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setEventName: async (name) => {
      p.data = { ...p.data, eventName: name };
      emit();
    },
    updateTicker: async (id, patch) => {
      p.data = patchTicker(p.data, id, patch);
      emit();
    },
    addTicker: async (copyFrom) => {
      if (p.data.tickers.length >= MAX_TICKERS) return '';
      const r = addTickerTo(p.data, copyFrom);
      p.data = r.data;
      emit();
      return r.id;
    },
    removeTicker: async (id) => {
      if (p.data.tickers.length <= 1) return;
      p.data = { ...p.data, tickers: p.data.tickers.filter((t) => t.id !== id) };
      emit();
    },
    playback: async (target, cmd) => {
      for (const id of ids(target)) {
        const r = rt(id);
        if (cmd === 'start' || cmd === 'restart') {
          r.playback = 'playing';
          r.visible = true;
        } else if (cmd === 'pause' && r.playback === 'playing') r.playback = 'paused';
        else if (cmd === 'resume' && r.playback === 'paused') r.playback = 'playing';
        else if (cmd === 'stop') {
          r.playback = 'stopped';
          r.visible = false;
        }
      }
      if (cmd === 'start' || cmd === 'restart') {
        restartListeners.forEach((l) => l());
        channel.postMessage({ type: 'restart' });
      }
      emit();
    },
    setVisible: async (target, visible) => {
      for (const id of ids(target)) rt(id).visible = visible;
      emit();
    },
    importLogo: async () => {
      const [f] = await pickFiles(false);
      if (!f) return { ok: false };
      return { ok: true, logoPath: await storeFile(f) };
    },
    importLogos: async () => {
      const files = await pickFiles(true);
      return Promise.all(files.map(async (f) => ({ ok: true, logoPath: await storeFile(f), fileName: f.name.replace(/\.[^.]+$/, '') })));
    },
    logoUrl: (name) => logos[name] ?? `missing:${name}`,
    getDisplays: async () => [
      {
        id: 1,
        index: 1,
        label: 'Browser window',
        primary: true,
        bounds: { x: 0, y: 0, width: screen.width, height: screen.height },
        workArea: { x: 0, y: 0, width: screen.availWidth, height: screen.availHeight },
        scaleFactor: devicePixelRatio,
      },
    ],
    moveToDisplay: async () => {},
    identifyDisplays: async () => {},
    exportEvent: async () => ({ ok: false, error: 'Saving event files needs the desktop app.' }),
    importEvent: async () => ({ ok: false, error: 'Opening event files needs the desktop app.' }),
    newEvent: async () => {
      p.data = { ...p.data, eventName: 'Untitled event', tickers: p.data.tickers.map((t) => ({ ...t, sponsors: [] })) };
      emit();
    },
    saveProfile: async (name, overwriteId) => {
      const snap = JSON.parse(JSON.stringify(p.data)) as AppData;
      const ex = p.profiles.find((x) => x.id === overwriteId);
      if (ex) Object.assign(ex, { name, savedAt: new Date().toISOString(), data: snap });
      else p.profiles.unshift({ id: newId('p'), name: name || p.data.eventName, savedAt: new Date().toISOString(), data: snap });
      emit();
    },
    loadProfile: async (id) => {
      const x = p.profiles.find((q) => q.id === id);
      if (!x) return { ok: false, error: 'Profile not found.' };
      p.data = normalizeData(JSON.parse(JSON.stringify(x.data)));
      p.runtime = {};
      emit();
      return { ok: true };
    },
    deleteProfile: async (id) => {
      p.profiles = p.profiles.filter((x) => x.id !== id);
      emit();
    },
    saveStylePreset: async (name, settings) => {
      p.styles.push({ id: newId('st'), name: name || 'My style', settings: pickStyle(normalizeSettings(settings)) });
      emit();
    },
    deleteStylePreset: async (id) => {
      p.styles = p.styles.filter((x) => x.id !== id);
      emit();
    },
    setTickerBounds: () => {},
    tickerId: isTicker ? tickerParam ?? p.data.tickers[0]?.id ?? null : null,
    isTickerWindow: isTicker,
    platform: 'web',
  };
  const events: TickerEvents = {
    onRestart: (cb) => {
      restartListeners.add(cb);
      return () => restartListeners.delete(cb);
    },
    onDisplaysChanged: () => () => {},
  };
  return { api, events };
}

const mock = window.floatTicker ? null : createMockApi();
export const api: FloatTickerApi = window.floatTicker ?? mock!.api;
export const tickerEvents: TickerEvents = window.floatTickerEvents ?? mock!.events;
export const isDesktop = !!window.floatTicker;

export function newSponsorId(): string {
  return newId('s');
}

export function reorder(list: Sponsor[], from: number, to: number): Sponsor[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((s, i) => ({ ...s, order: i }));
}
