import { create } from 'zustand';
import type {
  DisplayInfo,
  FullState,
  PlaybackCommand,
  PositionPreset,
  Sponsor,
  TickerConfig,
  TickerPatch,
  TickerRuntime,
  TickerSettings,
  TickerTarget,
  WindowSettings,
} from '../../shared/types';
import { patchTicker } from '../../shared/defaults';
import { api } from '../common/api';

export interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error' | 'success';
}

interface DashStore {
  state: FullState | null;
  selectedId: string | null;
  displays: DisplayInfo[];
  toasts: Toast[];
  init(): () => void;
  select(id: string): void;
  /** Edits the selected ticker. */
  setSettings(patch: Partial<TickerSettings>): void;
  setSponsors(list: Sponsor[]): void;
  setWindow(patch: Partial<Omit<WindowSettings, 'bounds'>>): void;
  updateTicker(id: string, patch: TickerPatch): void;
  setEventName(name: string): void;
  addTicker(copyFrom?: string): Promise<void>;
  removeTicker(id: string): void;
  playback(cmd: PlaybackCommand, target?: TickerTarget): void;
  setVisible(v: boolean, target?: TickerTarget): void;
  refreshDisplays(): Promise<void>;
  moveToDisplay(displayId: number, preset: PositionPreset): void;
  notify(msg: string, kind?: Toast['kind']): void;
}

// Local edits win over echoes from the main process for a short window, so sliders don't jitter.
let lastLocalEdit = 0;
const LOCAL_GRACE_MS = 350;
let toastId = 0;

const STOPPED: TickerRuntime = { playback: 'stopped', visible: false };

/** The ticker currently selected in the dashboard. */
export function useTicker(): TickerConfig {
  return useDash((s) => s.state!.data.tickers.find((t) => t.id === s.selectedId) ?? s.state!.data.tickers[0]);
}
export function useRuntime(): TickerRuntime {
  return useDash((s) => {
    const t = s.state!.data.tickers.find((x) => x.id === s.selectedId) ?? s.state!.data.tickers[0];
    return s.state!.runtime[t.id] ?? STOPPED;
  });
}

export const useDash = create<DashStore>((set, get) => {
  const sel = () => {
    const s = get().state;
    if (!s) return null;
    return (s.data.tickers.find((t) => t.id === get().selectedId) ?? s.data.tickers[0])?.id ?? null;
  };
  const editTicker = (id: string, patch: TickerPatch) => {
    const s = get().state;
    if (!s) return;
    lastLocalEdit = Date.now();
    set({ state: { ...s, data: patchTicker(s.data, id, patch) } });
    void api.updateTicker(id, patch);
  };
  const keepSelection = (incoming: FullState) => {
    const id = get().selectedId;
    if (!id || !incoming.data.tickers.some((t) => t.id === id)) set({ selectedId: incoming.data.tickers[0]?.id ?? null });
  };

  return {
    state: null,
    selectedId: null,
    displays: [],
    toasts: [],

    init() {
      void api.getState().then((s) => {
        set({ state: s });
        keepSelection(s);
      });
      void get().refreshDisplays();
      return api.onState((incoming) => {
        const cur = get().state;
        if (cur && Date.now() - lastLocalEdit < LOCAL_GRACE_MS && cur.data.tickers.length === incoming.data.tickers.length) {
          // Keep local settings/sponsors, take window geometry and everything else from main.
          const tickers = cur.data.tickers.map((t) => {
            const inc = incoming.data.tickers.find((x) => x.id === t.id);
            return inc ? { ...t, window: { ...t.window, bounds: inc.window.bounds, displayId: inc.window.displayId } } : t;
          });
          set({ state: { ...incoming, data: { ...incoming.data, tickers } } });
        } else set({ state: incoming });
        keepSelection(incoming);
      });
    },

    select(id) {
      set({ selectedId: id });
    },
    setSettings(patch) {
      const id = sel();
      if (id) editTicker(id, { settings: patch });
    },
    setSponsors(list) {
      const id = sel();
      if (id) editTicker(id, { sponsors: list.map((s, i) => ({ ...s, order: i })) });
    },
    setWindow(patch) {
      const id = sel();
      if (id) editTicker(id, { window: patch });
    },
    updateTicker(id, patch) {
      editTicker(id, patch);
    },
    setEventName(name) {
      const s = get().state;
      if (!s) return;
      lastLocalEdit = Date.now();
      set({ state: { ...s, data: { ...s.data, eventName: name } } });
      void api.setEventName(name);
    },
    async addTicker(copyFrom) {
      const id = await api.addTicker(copyFrom);
      if (id) {
        set({ selectedId: id });
        // Make sure the new ticker is in local state before rendering it.
        set({ state: await api.getState() });
      } else get().notify('You can run up to 8 tickers at once.', 'error');
    },
    removeTicker(id) {
      void api.removeTicker(id);
    },
    playback(cmd, target) {
      const t = target ?? sel();
      if (t) void api.playback(t, cmd);
    },
    setVisible(v, target) {
      const t = target ?? sel();
      if (t) void api.setVisible(t, v);
    },
    async refreshDisplays() {
      set({ displays: await api.getDisplays() });
    },
    moveToDisplay(displayId, preset) {
      const id = sel();
      if (id) void api.moveToDisplay(id, displayId, preset);
    },
    notify(msg, kind = 'info') {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, msg, kind }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 3000);
    },
  };
});
