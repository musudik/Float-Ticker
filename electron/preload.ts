// Preload runs sandboxed: only 'electron' may be required here, so shared code is imported as types only.
import { contextBridge, ipcRenderer } from 'electron';
import type { FloatTickerApi, FullState } from '../src/shared/types';

const isTicker = process.argv.includes('--ft-role=ticker');
const idArg = process.argv.find((a) => a.startsWith('--ft-ticker='));
const tickerId = idArg ? idArg.slice('--ft-ticker='.length) : null;

const api: FloatTickerApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => {
    const listener = (_e: unknown, s: FullState) => cb(s);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  setEventName: (name) => ipcRenderer.invoke('event:name', name),
  updateTicker: (id, patch) => ipcRenderer.invoke('ticker:update', id, patch),
  addTicker: (copyFrom) => ipcRenderer.invoke('ticker:add', copyFrom),
  removeTicker: (id) => ipcRenderer.invoke('ticker:remove', id),
  playback: (target, cmd) => ipcRenderer.invoke('playback', target, cmd),
  setVisible: (target, v) => ipcRenderer.invoke('visible', target, v),
  importLogo: () => ipcRenderer.invoke('logo:import'),
  importLogos: () => ipcRenderer.invoke('logo:import-many'),
  logoUrl: (name) => `ftlogo://logo/${encodeURIComponent(name)}`,
  getDisplays: () => ipcRenderer.invoke('displays:get'),
  moveToDisplay: (id, displayId, preset) => ipcRenderer.invoke('displays:move', id, displayId, preset),
  identifyDisplays: () => ipcRenderer.invoke('displays:identify'),
  exportEvent: () => ipcRenderer.invoke('event:export'),
  importEvent: () => ipcRenderer.invoke('event:import'),
  newEvent: () => ipcRenderer.invoke('event:new'),
  saveProfile: (name, overwriteId) => ipcRenderer.invoke('profile:save', name, overwriteId),
  loadProfile: (id) => ipcRenderer.invoke('profile:load', id),
  deleteProfile: (id) => ipcRenderer.invoke('profile:delete', id),
  saveStylePreset: (name, settings) => ipcRenderer.invoke('style:save', name, settings),
  deleteStylePreset: (id) => ipcRenderer.invoke('style:delete', id),
  setTickerBounds: (b) => ipcRenderer.send('ticker:set-bounds', b),
  tickerId,
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
