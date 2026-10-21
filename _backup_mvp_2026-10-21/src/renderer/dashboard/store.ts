import { create } from 'zustand';
import type {
  DisplayInfo,
  FullState,
  PlaybackCommand,
  PositionPreset,
  Sponsor,
  TickerSettings,
  WindowSettings,
} from '../../shared/types';
import { api } from '../common/api';

export interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error' | 'success';
}

interface DashStore {
  state: FullState | null;
  displays: DisplayInfo[];
  toasts: Toast[];
  init(): () => void;
  setSettings(patch: Partial<TickerSettings>): void;
  setSponsors(list: Sponsor[]): void;
  setWindow(patch: Partial<Omit<WindowSettings, 'bounds'>>): void;
  setEventName(name: string): void;
  playback(cmd: PlaybackCommand): void;
  setVisible(v: boolean): void;
  refreshDisplays(): Promise<void>;
  moveToDisplay(id: number, preset: PositionPreset): void;
  notify(msg: string, kind?: Toast['kind']): void;
}

// Local edits win over echoes from the main process for a short window, so sliders don't jitter.
let lastLocalEdit = 0;
const LOCAL_GRACE_MS = 350;
let toastId = 0;

export const useDash = create<DashStore>((set, get) => {
  const editData = (fn: (d: FullState['data']) => FullState['data']) => {
    const s = get().state;
    if (!s) return;
    lastLocalEdit = Date.now();
    set({ state: { ...s, data: fn(s.data) } });
  };

  return {
    state: null,
    displays: [],
    toasts: [],

    init() {
      void api.getState().then((s) => set({ state: s }));
      void get().refreshDisplays();
      return api.onState((incoming) => {
        const cur = get().state;
        if (cur && Date.now() - lastLocalEdit < LOCAL_GRACE_MS) {
          set({
            state: {
              ...incoming,
              data: { ...cur.data, window: { ...cur.data.window, bounds: incoming.data.window.bounds, displayId: incoming.data.window.displayId } },
            },
          });
        } else set({ state: incoming });
      });
    },

    setSettings(patch) {
      editData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      void api.updateData({ settings: patch });
    },
    setSponsors(list) {
      const ordered = list.map((s, i) => ({ ...s, order: i }));
      editData((d) => ({ ...d, sponsors: ordered }));
      void api.updateData({ sponsors: ordered });
    },
    setWindow(patch) {
      editData((d) => ({ ...d, window: { ...d.window, ...patch } }));
      void api.updateData({ window: patch });
    },
    setEventName(name) {
      editData((d) => ({ ...d, eventName: name }));
      void api.updateData({ eventName: name });
    },
    playback(cmd) {
      void api.playback(cmd);
    },
    setVisible(v) {
      void api.setVisible(v);
    },
    async refreshDisplays() {
      set({ displays: await api.getDisplays() });
    },
    moveToDisplay(id, preset) {
      void api.moveToDisplay(id, preset);
    },
    notify(msg, kind = 'info') {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, msg, kind }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 3000);
    },
  };
});
