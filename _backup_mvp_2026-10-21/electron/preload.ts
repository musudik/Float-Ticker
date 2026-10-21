// Preload runs sandboxed: only 'electron' may be required here, so shared code is imported as types only.
import { contextBridge, ipcRenderer } from 'electron';
import type { FloatTickerApi, FullState } from '../src/shared/types';

const isTicker = process.argv.includes('--ft-role=ticker');

const api: FloatTickerApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => {
    const listener = (_e: unknown, s: FullState) => cb(s);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  updateData: (patch) => ipcRenderer.invoke('data:update', patch),
  playback: (cmd) => ipcRenderer.invoke('playback', cmd),
  setVisible: (v) => ipcRenderer.invoke('visible', v),
  importLogo: () => ipcRenderer.invoke('logo:import'),
  importLogos: () => ipcRenderer.invoke('logo:import-many'),
  logoUrl: (name) => `ftlogo://logo/${encodeURIComponent(name)}`,
  getDisplays: () => ipcRenderer.invoke('displays:get'),
  moveToDisplay: (id, preset) => ipcRenderer.invoke('displays:move', id, preset),
  identifyDisplays: () => ipcRenderer.invoke('displays:identify'),
  exportEvent: () => ipcRenderer.invoke('event:export'),
  importEvent: () => ipcRenderer.invoke('event:import'),
  newEvent: () => ipcRenderer.invoke('event:new'),
  setTickerBounds: (b) => ipcRenderer.send('ticker:set-bounds', b),
  isTickerWindow: isTicker,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('floatTicker', api);

// Extra events that don't fit the request/response API.
contextBridge.exposeInMainWorld('floatTickerEvents', {
  onRestart: (cb: () => void) => {
    const l = () => cb();
    ipcRenderer.on('ticker:restart', l);
    return () => ipcRenderer.removeListener('ticker:restart', l);
  },
  onDisplaysChanged: (cb: () => void) => {
    const l = () => cb();
    ipcRenderer.on('displays:changed', l);
    return () => ipcRenderer.removeListener('displays:changed', l);
  },
});
