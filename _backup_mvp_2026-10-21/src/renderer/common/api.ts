import type { FloatTickerApi, FullState, Sponsor } from '../../shared/types';
import { emptyData, normalizeData, normalizeSettings, normalizeSponsors } from '../../shared/defaults';

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
 * so the UI can be developed and tested in a normal browser.
 */
function createMockApi(): { api: FloatTickerApi; events: TickerEvents } {
  const KEY = 'floatticker-mock-state';
  const LOGOS = 'floatticker-mock-logos';
  const channel = new BroadcastChannel('floatticker-mock');
  const isTicker = location.pathname.includes('ticker');
  const load = (): FullState => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (raw) return { data: normalizeData(raw.data), runtime: raw.runtime, missingLogos: [] };
    } catch {
      /* ignore */
    }
    return { data: emptyData(), runtime: { playback: 'stopped', visible: false }, missingLogos: [] };
  };
  let state = load();
  const logos: Record<string, string> = (() => {
    try {
      return JSON.parse(localStorage.getItem(LOGOS) ?? '{}');
    } catch {
      return {};
    }
  })();
  const listeners = new Set<(s: FullState) => void>();
  const restartListeners = new Set<() => void>();
  const emit = () => {
    state = { ...state, missingLogos: state.data.sponsors.filter((s) => s.logoPath && !logos[s.logoPath]).map((s) => s.logoPath!) };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(state));
    channel.postMessage({ type: 'state' });
  };
  channel.onmessage = (e) => {
    if (e.data?.type === 'state') {
      state = load();
      listeners.forEach((l) => l(state));
    } else if (e.data?.type === 'restart') restartListeners.forEach((l) => l());
  };
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

  const api: FloatTickerApi = {
    getState: async () => state,
    onState: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    updateData: async (patch) => {
      const d = { ...state.data };
      if (patch.eventName !== undefined) d.eventName = patch.eventName;
      if (patch.sponsors) d.sponsors = normalizeSponsors(patch.sponsors);
      if (patch.settings) d.settings = normalizeSettings({ ...d.settings, ...patch.settings });
      if (patch.window) d.window = { ...d.window, ...patch.window };
      state = { ...state, data: d };
      emit();
    },
    playback: async (cmd) => {
      const r = { ...state.runtime };
      if (cmd === 'start' || cmd === 'restart') {
        r.playback = 'playing';
        r.visible = true;
        restartListeners.forEach((l) => l());
        channel.postMessage({ type: 'restart' });
      } else if (cmd === 'pause' && r.playback === 'playing') r.playback = 'paused';
      else if (cmd === 'resume' && r.playback === 'paused') r.playback = 'playing';
      else if (cmd === 'stop') {
        r.playback = 'stopped';
        r.visible = false;
      }
      state = { ...state, runtime: r };
      emit();
    },
    setVisible: async (visible) => {
      state = { ...state, runtime: { ...state.runtime, visible } };
      emit();
    },
    importLogo: async () => {
      const [f] = await pickFiles(false);
      if (!f) return { ok: false };
      return { ok: true, logoPath: await storeFile(f) };
    },
    importLogos: async () => {
      const files = await pickFiles(true);
      return Promise.all(
        files.map(async (f) => ({ ok: true, logoPath: await storeFile(f), fileName: f.name.replace(/\.[^.]+$/, '') })),
      );
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
      state = { ...state, data: { ...state.data, eventName: 'Untitled event', sponsors: [] } };
      emit();
    },
    setTickerBounds: () => {},
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
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function reorder(list: Sponsor[], from: number, to: number): Sponsor[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((s, i) => ({ ...s, order: i }));
}
