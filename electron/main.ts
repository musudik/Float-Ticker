import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  isVertical,
  type FileOpResult,
  type FullState,
  type LogoImportResult,
  type PlaybackCommand,
  type PositionPreset,
  type TickerConfig,
  type TickerPatch,
  type TickerRuntime,
  type TickerSettings,
  type TickerTarget,
  type WindowBounds,
} from '../src/shared/types';
import {
  addTickerTo,
  allLogoPaths,
  BUILT_IN_STYLES,
  emptyData,
  MAX_TICKERS,
  newId,
  normalizeData,
  normalizeSettings,
  patchTicker,
  STYLE_KEYS,
} from '../src/shared/defaults';
import { Store } from './store';
import {
  cleanupOrphans,
  handleLogoProtocol,
  importLogoFile,
  isSafeLogoName,
  LOGO_EXTENSIONS,
  logoExists,
  readLogo,
  registerLogoScheme,
  storeLogoBuffer,
} from './logos';
import {
  createDashboardWindow,
  createTickerWindow,
  displayIdFor,
  identifyDisplays,
  isOnScreen,
  listDisplays,
  MIN_TICKER_HEIGHT,
  MIN_TICKER_WIDTH,
  presetBounds,
} from './windows';

const EMERGENCY_HIDE_SHORTCUT = 'CommandOrControl+Shift+H';

registerLogoScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let store: Store;
let dashboard: BrowserWindow | null = null;
let quitting = false;
const windows = new Map<string, BrowserWindow>();
const runtime = new Map<string, TickerRuntime>();
const applyingBounds = new Set<string>();
/** Tickers that were on screen when the emergency hide fired, so the same shortcut can bring them back. */
let hiddenByShortcut: string[] = [];

const ticker = (id: string): TickerConfig | undefined => store.data.tickers.find((t) => t.id === id);
const win = (id: string): BrowserWindow | null => {
  const w = windows.get(id);
  return w && !w.isDestroyed() ? w : null;
};
const rt = (id: string): TickerRuntime => {
  let r = runtime.get(id);
  if (!r) runtime.set(id, (r = { playback: 'stopped', visible: false }));
  return r;
};
const thicknessOf = (b: WindowBounds, s: TickerSettings) => (isVertical(s.direction) ? b.width : b.height);

// ---------- state broadcast ----------

function missingLogos(): string[] {
  const out = new Set<string>();
  for (const p of allLogoPaths(store.data)) if (!logoExists(store.logosDir, p)) out.add(p);
  return [...out];
}

function fullState(): FullState {
  return {
    data: store.data,
    runtime: Object.fromEntries(store.data.tickers.map((t) => [t.id, { ...rt(t.id) }])),
    missingLogos: missingLogos(),
    library: {
      profiles: store.library.profiles.map(({ data: _data, ...meta }) => meta),
      stylePresets: [...BUILT_IN_STYLES, ...store.library.stylePresets],
    },
  };
}

let broadcastTimer: NodeJS.Timeout | null = null;
function broadcast(): void {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer);
    broadcastTimer = null;
  }
  const state = fullState();
  for (const w of [dashboard, ...windows.values()]) {
    if (w && !w.isDestroyed()) w.webContents.send('state:changed', state);
  }
}
/** Coalesces high-frequency changes (window drag/resize) into ~10 broadcasts per second. */
function broadcastSoon(): void {
  if (!broadcastTimer) broadcastTimer = setTimeout(broadcast, 100);
}

// ---------- ticker windows ----------

function initialBounds(t: TickerConfig): WindowBounds {
  const vertical = isVertical(t.settings.direction);
  const saved = t.window.bounds;
  if (saved && isOnScreen(saved)) {
    return vertical ? { ...saved, width: t.settings.height } : { ...saved, height: t.settings.height };
  }
  // Stack additional tickers so they don't open on top of each other.
  const idx = store.data.tickers.indexOf(t);
  const preset: PositionPreset = vertical ? (idx % 2 ? 'left' : 'right') : idx % 3 === 1 ? 'top' : idx % 3 === 2 ? 'center' : 'bottom';
  return presetBounds(t.window.displayId, preset, t.settings.height, vertical).bounds;
}

function applyWindowFlags(id: string): void {
  const w = win(id);
  const t = ticker(id);
  if (!w || !t) return;
  w.setAlwaysOnTop(t.window.alwaysOnTop, 'screen-saver');
  w.setMovable(!t.window.locked);
  // A locked ticker is click-through so it never blocks the presentation underneath.
  w.setIgnoreMouseEvents(t.window.locked, { forward: true });
}

function setBounds(id: string, b: WindowBounds, persist = true): void {
  const w = win(id);
  if (!w) return;
  // The long axis needs room to scroll; the short axis (thickness) can be as small as a text line.
  const vertical = isVertical(ticker(id)?.settings.direction ?? 'rtl');
  const bounds = {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(vertical ? MIN_TICKER_HEIGHT : MIN_TICKER_WIDTH, Math.round(b.width)),
    height: Math.max(vertical ? MIN_TICKER_WIDTH : MIN_TICKER_HEIGHT, Math.round(b.height)),
  };
  applyingBounds.add(id);
  w.setBounds(bounds);
  applyingBounds.delete(id);
  if (persist) recordBounds(id);
}

function recordBounds(id: string): void {
  const w = win(id);
  const t = ticker(id);
  if (!w || !t) return;
  const b = w.getBounds();
  t.window.bounds = b;
  t.window.displayId = displayIdFor(b);
  const th = thicknessOf(b, t.settings);
  if (th !== t.settings.height) t.settings = normalizeSettings({ ...t.settings, height: th });
  store.scheduleSave();
  broadcastSoon();
}

function createTicker(t: TickerConfig): void {
  const id = t.id;
  const w = createTickerWindow(initialBounds(t), t.window.alwaysOnTop, id, t.name);
  windows.set(id, w);
  applyWindowFlags(id);
  w.on('moved', () => recordBounds(id));
  w.on('resized', () => !applyingBounds.has(id) && recordBounds(id));
  w.on('close', (e) => {
    // Alt+F4 on a ticker just hides it; the app quits from the dashboard.
    if (!quitting && ticker(id)) {
      e.preventDefault();
      setVisible(id, false);
    }
  });
  w.on('closed', () => windows.delete(id));
}

/** Creates windows for new tickers and closes windows of removed ones. */
function syncWindows(): void {
  const ids = new Set(store.data.tickers.map((t) => t.id));
  for (const [id, w] of windows) {
    if (!ids.has(id)) {
      windows.delete(id);
      runtime.delete(id);
      if (!w.isDestroyed()) w.destroy();
    }
  }
  for (const t of store.data.tickers) if (!windows.has(t.id)) createTicker(t);
}

const targets = (target: TickerTarget): string[] =>
  target === 'all' ? store.data.tickers.map((t) => t.id) : ticker(target) ? [target] : [];

function setVisible(target: TickerTarget, visible: boolean): void {
  for (const id of targets(target)) {
    rt(id).visible = visible;
    const w = win(id);
    if (!w) continue;
    if (visible) {
      w.showInactive(); // never steal focus from the presentation
      applyWindowFlags(id);
    } else w.hide();
  }
  if (visible) hiddenByShortcut = [];
  broadcast();
}

function playback(target: TickerTarget, cmd: PlaybackCommand): void {
  const ids = targets(target);
  for (const id of ids) {
    const r = rt(id);
    switch (cmd) {
      case 'start':
      case 'restart':
        r.playback = 'playing';
        // 'restart' is handled in the renderer by resetting the animation position.
        win(id)?.webContents.send('ticker:restart');
        break;
      case 'pause':
        if (r.playback === 'playing') r.playback = 'paused';
        break;
      case 'resume':
        if (r.playback === 'paused') r.playback = 'playing';
        break;
      case 'stop':
        r.playback = 'stopped';
        break;
    }
  }
  if (cmd === 'start' || cmd === 'restart') return setVisible(target, true);
  if (cmd === 'stop') return setVisible(target, false);
  broadcast();
}

function emergencyToggle(): void {
  const onScreen = store.data.tickers.filter((t) => rt(t.id).visible).map((t) => t.id);
  if (onScreen.length) {
    for (const id of onScreen) setVisible(id, false);
    hiddenByShortcut = onScreen;
  } else if (hiddenByShortcut.length) {
    const back = hiddenByShortcut.filter((id) => ticker(id));
    for (const id of back) setVisible(id, true);
  }
}

// ---------- data updates ----------

function updateTicker(id: string, patch: TickerPatch): void {
  const before = ticker(id);
  if (!before) return;
  const prev = { ...before.settings };
  store.data = patchTicker(store.data, id, patch);
  const t = ticker(id)!;
  const w = win(id);
  if (w && patch.settings) {
    const wasV = isVertical(prev.direction);
    const nowV = isVertical(t.settings.direction);
    const b = w.getBounds();
    if (wasV !== nowV) {
      // Orientation changed: reshape the window on its current display.
      const { bounds } = presetBounds(displayIdFor(b), nowV ? 'right' : 'bottom', t.settings.height, nowV);
      setBounds(id, bounds, false);
      t.window.bounds = w.getBounds();
    } else if (t.settings.height !== prev.height) {
      // Keep the bottom (horizontal) or right (vertical) edge anchored when the thickness changes.
      const next = nowV
        ? { ...b, x: b.x + b.width - t.settings.height, width: t.settings.height }
        : { ...b, y: b.y + b.height - t.settings.height, height: t.settings.height };
      setBounds(id, next, false);
      t.window.bounds = w.getBounds();
    }
  }
  if (patch.window) applyWindowFlags(id);
  if (patch.name && w) w.setTitle(`FloatTicker — ${t.name}`);
  store.scheduleSave();
  broadcast();
}

/** Replaces the whole event (tickers + name), e.g. when opening a file or loading a profile. */
function replaceData(next: typeof store.data): void {
  for (const w of windows.values()) if (!w.isDestroyed()) w.destroy();
  windows.clear();
  runtime.clear();
  hiddenByShortcut = [];
  store.data = next;
  store.saveNow();
  syncWindows();
  broadcast();
}

function referencedLogos(): Set<string> {
  const set = new Set(allLogoPaths(store.data));
  for (const p of store.library.profiles) for (const l of allLogoPaths(p.data)) set.add(l);
  return set;
}

// ---------- event files (portable: logos embedded) ----------

interface EventFile {
  format: 'floatticker-event';
  version: 1 | 2;
  exportedAt: string;
  data: unknown;
  logos: Record<string, { mime: string; base64: string }>;
}

async function exportEvent(): Promise<FileOpResult> {
  const safeName = store.data.eventName.replace(/[\\/:*?"<>|]+/g, '').trim() || 'event';
  const res = await dialog.showSaveDialog(dashboard!, {
    title: 'Save event',
    defaultPath: `${safeName}.floatticker.json`,
    filters: [{ name: 'FloatTicker event', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try {
    const logos: EventFile['logos'] = {};
    for (const p of allLogoPaths(store.data)) {
      if (logos[p]) continue;
      const l = readLogo(store.logosDir, p);
      if (l) logos[p] = { mime: l.mime, base64: l.buf.toString('base64') };
    }
    const file: EventFile = { format: 'floatticker-event', version: 2, exportedAt: new Date().toISOString(), data: store.data, logos };
    fs.writeFileSync(res.filePath, JSON.stringify(file), 'utf8');
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function importEvent(): Promise<FileOpResult> {
  const res = await dialog.showOpenDialog(dashboard!, {
    title: 'Open event',
    properties: ['openFile'],
    filters: [{ name: 'FloatTicker event', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
  try {
    const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8')) as Partial<EventFile>;
    if (raw.format !== 'floatticker-event' || !raw.data) return { ok: false, error: 'This is not a FloatTicker event file.' };
    const incoming = normalizeData(raw.data); // also migrates version 1 files
    // Re-store embedded logos under fresh names and remap references.
    const remap = new Map<string, string>();
    for (const [oldName, l] of Object.entries(raw.logos ?? {})) {
      if (!isSafeLogoName(oldName) || typeof l?.base64 !== 'string') continue;
      const r = storeLogoBuffer(store.logosDir, Buffer.from(l.base64, 'base64'));
      if (r.ok) remap.set(oldName, r.logoPath);
    }
    for (const t of incoming.tickers) {
      t.sponsors = t.sponsors.map((s) => ({ ...s, logoPath: s.logoPath ? remap.get(s.logoPath) ?? s.logoPath : undefined }));
      // Positions belong to the machine that saved the file; keep this machine's layout where possible.
      const local = store.data.tickers[incoming.tickers.indexOf(t)];
      t.window = local ? { ...local.window } : { ...t.window, bounds: null, displayId: null };
    }
    replaceData(incoming);
    return { ok: true, path: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: `Could not open the file: ${(err as Error).message}` };
  }
}

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.handle('state:get', () => fullState());
  ipcMain.handle('event:name', (_e, name: string) => {
    if (typeof name !== 'string') return;
    store.data = { ...store.data, eventName: name.slice(0, 120) || 'Untitled event' };
    store.scheduleSave();
    broadcast();
  });
  ipcMain.handle('ticker:update', (_e, id: string, patch: TickerPatch) => updateTicker(id, patch ?? {}));
  ipcMain.handle('ticker:add', (_e, copyFrom?: string) => {
    if (store.data.tickers.length >= MAX_TICKERS) return null;
    const r = addTickerTo(store.data, copyFrom);
    store.data = r.data;
    store.scheduleSave();
    syncWindows();
    broadcast();
    return r.id;
  });
  ipcMain.handle('ticker:remove', (_e, id: string) => {
    if (store.data.tickers.length <= 1 || !ticker(id)) return;
    store.data = { ...store.data, tickers: store.data.tickers.filter((t) => t.id !== id) };
    store.scheduleSave();
    syncWindows();
    broadcast();
  });
  ipcMain.handle('playback', (_e, target: TickerTarget, cmd: PlaybackCommand) => playback(target, cmd));
  ipcMain.handle('visible', (_e, target: TickerTarget, v: boolean) => setVisible(target, !!v));

  ipcMain.handle('logo:import', async (): Promise<LogoImportResult> => {
    const res = await dialog.showOpenDialog(dashboard!, {
      title: 'Choose sponsor logo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: LOGO_EXTENSIONS }],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false };
    return importLogoFile(store.logosDir, res.filePaths[0]);
  });

  ipcMain.handle('logo:import-many', async () => {
    const res = await dialog.showOpenDialog(dashboard!, {
      title: 'Choose sponsor logos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: LOGO_EXTENSIONS }],
    });
    if (res.canceled) return [];
    return res.filePaths.slice(0, 200).map((f) => ({
      fileName: path.basename(f, path.extname(f)),
      ...importLogoFile(store.logosDir, f),
    }));
  });

  ipcMain.handle('displays:get', () => listDisplays());
  ipcMain.handle('displays:move', (_e, id: string, displayId: number, preset: PositionPreset) => {
    const t = ticker(id);
    if (!t) return;
    const { bounds, displayId: did } = presetBounds(displayId, preset, t.settings.height, isVertical(t.settings.direction));
    setBounds(id, bounds, false);
    t.window.bounds = win(id)?.getBounds() ?? bounds;
    t.window.displayId = did;
    store.scheduleSave();
    broadcast();
  });
  ipcMain.handle('displays:identify', () => identifyDisplays());

  ipcMain.handle('event:export', () => exportEvent());
  ipcMain.handle('event:import', () => importEvent());
  ipcMain.handle('event:new', () => {
    // Keep each ticker's style, position and timing; clear the content.
    store.data = { ...store.data, eventName: emptyData().eventName, tickers: store.data.tickers.map((t) => ({ ...t, sponsors: [] })) };
    store.scheduleSave();
    broadcast();
  });

  // ----- profiles & style presets -----
  ipcMain.handle('profile:save', (_e, name: string, overwriteId?: string) => {
    const clean = String(name ?? '').trim().slice(0, 60) || store.data.eventName;
    const snapshot = JSON.parse(JSON.stringify(store.data)) as typeof store.data;
    const meta = {
      name: clean,
      savedAt: new Date().toISOString(),
      tickerCount: snapshot.tickers.length,
      sponsorCount: snapshot.tickers.reduce((n, t) => n + t.sponsors.length, 0),
    };
    const existing = store.library.profiles.find((p) => p.id === overwriteId);
    if (existing) Object.assign(existing, meta, { data: snapshot });
    else store.library.profiles.unshift({ id: newId('p'), ...meta, data: snapshot });
    store.saveLibrary();
    broadcast();
  });
  ipcMain.handle('profile:load', (_e, id: string): FileOpResult => {
    const p = store.library.profiles.find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Profile not found.' };
    const data = normalizeData(JSON.parse(JSON.stringify(p.data)));
    replaceData(data);
    return { ok: true };
  });
  ipcMain.handle('profile:delete', (_e, id: string) => {
    store.library.profiles = store.library.profiles.filter((p) => p.id !== id);
    store.saveLibrary();
    broadcast();
  });
  ipcMain.handle('style:save', (_e, name: string, settings: Partial<TickerSettings>) => {
    const full = normalizeSettings(settings);
    const style: Record<string, unknown> = {};
    for (const k of STYLE_KEYS) style[k] = full[k];
    store.library.stylePresets.push({ id: newId('st'), name: String(name ?? '').trim().slice(0, 60) || 'My style', settings: style as Partial<TickerSettings> });
    store.saveLibrary();
    broadcast();
  });
  ipcMain.handle('style:delete', (_e, id: string) => {
    store.library.stylePresets = store.library.stylePresets.filter((p) => p.id !== id);
    store.saveLibrary();
    broadcast();
  });

  // Custom resize/move from a ticker window's edge handles.
  ipcMain.on('ticker:set-bounds', (e, b: Partial<WindowBounds>) => {
    for (const [id, w] of windows) {
      if (w.isDestroyed() || e.sender !== w.webContents) continue;
      if (ticker(id)?.window.locked) return;
      setBounds(id, { ...w.getBounds(), ...b });
      return;
    }
  });
}

// ---------- app lifecycle ----------

app.on('second-instance', () => {
  if (dashboard) {
    if (dashboard.isMinimized()) dashboard.restore();
    dashboard.focus();
  }
});

app.whenReady().then(() => {
  store = new Store();
  cleanupOrphans(store.logosDir, referencedLogos());
  handleLogoProtocol(store.logosDir);
  registerIpc();

  dashboard = createDashboardWindow();
  dashboard.on('closed', () => {
    dashboard = null;
    app.quit();
  });
  syncWindows();

  const ok = globalShortcut.register(EMERGENCY_HIDE_SHORTCUT, emergencyToggle);
  if (!ok) console.warn(`[main] could not register ${EMERGENCY_HIDE_SHORTCUT}`);

  const onDisplaysChanged = () => {
    for (const t of store.data.tickers) {
      const w = win(t.id);
      if (w && !isOnScreen(w.getBounds())) {
        const v = isVertical(t.settings.direction);
        const { bounds, displayId } = presetBounds(null, v ? 'right' : 'bottom', t.settings.height, v);
        setBounds(t.id, bounds, false);
        t.window.displayId = displayId;
        t.window.bounds = w.getBounds();
        store.scheduleSave();
      }
    }
    dashboard?.webContents.send('displays:changed');
    broadcast();
  };
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);
});

app.on('before-quit', () => {
  quitting = true;
  store?.saveNow();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
