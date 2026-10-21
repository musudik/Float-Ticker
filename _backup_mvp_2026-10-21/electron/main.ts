import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DataPatch,
  FileOpResult,
  FullState,
  LogoImportResult,
  PlaybackCommand,
  PositionPreset,
  RuntimeState,
  WindowBounds,
} from '../src/shared/types';
import { emptyData, normalizeData, normalizeSettings, normalizeSponsors } from '../src/shared/defaults';
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
let ticker: BrowserWindow | null = null;
let quitting = false;
let applyingBounds = false;
const runtime: RuntimeState = { playback: 'stopped', visible: false };

// ---------- state broadcast ----------

function missingLogos(): string[] {
  const out = new Set<string>();
  for (const s of store.data.sponsors) {
    if (s.logoPath && !logoExists(store.logosDir, s.logoPath)) out.add(s.logoPath);
  }
  return [...out];
}

function fullState(): FullState {
  return { data: store.data, runtime: { ...runtime }, missingLogos: missingLogos() };
}

let broadcastTimer: NodeJS.Timeout | null = null;
function broadcast(): void {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer);
    broadcastTimer = null;
  }
  const state = fullState();
  for (const w of [dashboard, ticker]) {
    if (w && !w.isDestroyed()) w.webContents.send('state:changed', state);
  }
}
/** Coalesces high-frequency changes (window drag/resize) into ~10 broadcasts per second. */
function broadcastSoon(): void {
  if (!broadcastTimer) broadcastTimer = setTimeout(broadcast, 100);
}

// ---------- ticker window ----------

function initialTickerBounds(): WindowBounds {
  const saved = store.data.window.bounds;
  if (saved && isOnScreen(saved)) return { ...saved, height: store.data.settings.height };
  return presetBounds(store.data.window.displayId, 'bottom', store.data.settings.height).bounds;
}

function applyTickerWindowFlags(): void {
  if (!ticker || ticker.isDestroyed()) return;
  const { alwaysOnTop, locked } = store.data.window;
  ticker.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
  ticker.setMovable(!locked);
  // A locked ticker is click-through so it never blocks the presentation underneath.
  ticker.setIgnoreMouseEvents(locked, { forward: true });
}

function setTickerBounds(b: WindowBounds, persist = true): void {
  if (!ticker || ticker.isDestroyed()) return;
  const bounds = {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(MIN_TICKER_WIDTH, Math.round(b.width)),
    height: Math.max(MIN_TICKER_HEIGHT, Math.round(b.height)),
  };
  applyingBounds = true;
  ticker.setBounds(bounds);
  applyingBounds = false;
  if (persist) recordTickerBounds();
}

function recordTickerBounds(): void {
  if (!ticker || ticker.isDestroyed()) return;
  const b = ticker.getBounds();
  store.data.window.bounds = b;
  store.data.window.displayId = displayIdFor(b);
  if (b.height !== store.data.settings.height) store.data.settings.height = b.height;
  store.scheduleSave();
  broadcastSoon();
}

function createTicker(): void {
  ticker = createTickerWindow(initialTickerBounds(), store.data.window.alwaysOnTop);
  applyTickerWindowFlags();
  ticker.on('moved', recordTickerBounds);
  ticker.on('resized', () => !applyingBounds && recordTickerBounds());
  ticker.on('close', (e) => {
    // Alt+F4 on the ticker just hides it; the app quits from the dashboard.
    if (!quitting) {
      e.preventDefault();
      setVisible(false);
    }
  });
  ticker.on('closed', () => (ticker = null));
}

function setVisible(visible: boolean): void {
  runtime.visible = visible;
  if (ticker && !ticker.isDestroyed()) {
    if (visible) {
      ticker.showInactive(); // never steal focus from the presentation
      applyTickerWindowFlags();
    } else ticker.hide();
  }
  broadcast();
}

function playback(cmd: PlaybackCommand): void {
  switch (cmd) {
    case 'start':
    case 'restart':
      runtime.playback = 'playing';
      // 'restart' is handled in the renderer by resetting the animation position.
      if (ticker && !ticker.isDestroyed()) ticker.webContents.send('ticker:restart');
      setVisible(true);
      return;
    case 'pause':
      if (runtime.playback === 'playing') runtime.playback = 'paused';
      break;
    case 'resume':
      if (runtime.playback === 'paused') runtime.playback = 'playing';
      break;
    case 'stop':
      runtime.playback = 'stopped';
      setVisible(false);
      return;
  }
  broadcast();
}

// ---------- data updates ----------

function applyPatch(patch: DataPatch): void {
  const d = store.data;
  if (typeof patch.eventName === 'string') d.eventName = patch.eventName.slice(0, 120);
  if (patch.sponsors) d.sponsors = normalizeSponsors(patch.sponsors);
  if (patch.settings) {
    const prevHeight = d.settings.height;
    d.settings = normalizeSettings({ ...d.settings, ...patch.settings });
    if (d.settings.height !== prevHeight && ticker && !ticker.isDestroyed()) {
      // Keep the bottom edge anchored when the height changes.
      const b = ticker.getBounds();
      setTickerBounds({ ...b, y: b.y + b.height - d.settings.height, height: d.settings.height }, false);
      d.window.bounds = ticker.getBounds();
    }
  }
  if (patch.window) {
    if (typeof patch.window.alwaysOnTop === 'boolean') d.window.alwaysOnTop = patch.window.alwaysOnTop;
    if (typeof patch.window.locked === 'boolean') d.window.locked = patch.window.locked;
    applyTickerWindowFlags();
  }
  store.scheduleSave();
  broadcast();
}

// ---------- event files (portable: logos embedded) ----------

interface EventFile {
  format: 'floatticker-event';
  version: 1;
  exportedAt: string;
  data: unknown;
  logos: Record<string, { mime: string; base64: string }>;
}

async function exportEvent(): Promise<FileOpResult> {
  const parent = dashboard ?? undefined;
  const safeName = store.data.eventName.replace(/[\\/:*?"<>|]+/g, '').trim() || 'event';
  const res = await dialog.showSaveDialog(parent!, {
    title: 'Save event sponsor list',
    defaultPath: `${safeName}.floatticker.json`,
    filters: [{ name: 'FloatTicker event', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try {
    const logos: EventFile['logos'] = {};
    for (const s of store.data.sponsors) {
      if (s.logoPath && !logos[s.logoPath]) {
        const l = readLogo(store.logosDir, s.logoPath);
        if (l) logos[s.logoPath] = { mime: l.mime, base64: l.buf.toString('base64') };
      }
    }
    const file: EventFile = {
      format: 'floatticker-event',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { ...store.data, window: { ...store.data.window } },
      logos,
    };
    fs.writeFileSync(res.filePath, JSON.stringify(file), 'utf8');
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function importEvent(): Promise<FileOpResult> {
  const res = await dialog.showOpenDialog(dashboard!, {
    title: 'Open event sponsor list',
    properties: ['openFile'],
    filters: [{ name: 'FloatTicker event', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
  try {
    const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8')) as Partial<EventFile>;
    if (raw.format !== 'floatticker-event' || !raw.data) return { ok: false, error: 'This is not a FloatTicker event file.' };
    const incoming = normalizeData(raw.data);
    // Re-store embedded logos under fresh names and remap references.
    const remap = new Map<string, string>();
    for (const [oldName, l] of Object.entries(raw.logos ?? {})) {
      if (!isSafeLogoName(oldName) || typeof l?.base64 !== 'string') continue;
      const r = storeLogoBuffer(store.logosDir, Buffer.from(l.base64, 'base64'));
      if (r.ok) remap.set(oldName, r.logoPath);
    }
    incoming.sponsors = incoming.sponsors.map((s) => ({
      ...s,
      logoPath: s.logoPath ? remap.get(s.logoPath) ?? s.logoPath : undefined,
    }));
    store.data.eventName = incoming.eventName;
    store.data.sponsors = incoming.sponsors;
    applyPatch({ settings: incoming.settings });
    store.saveNow();
    broadcast();
    return { ok: true, path: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: `Could not open the file: ${(err as Error).message}` };
  }
}

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.handle('state:get', () => fullState());
  ipcMain.handle('data:update', (_e, patch: DataPatch) => applyPatch(patch ?? {}));
  ipcMain.handle('playback', (_e, cmd: PlaybackCommand) => playback(cmd));
  ipcMain.handle('visible', (_e, v: boolean) => setVisible(!!v));

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
  ipcMain.handle('displays:move', (_e, displayId: number, preset: PositionPreset) => {
    const { bounds, displayId: id } = presetBounds(displayId, preset, store.data.settings.height);
    setTickerBounds(bounds, false);
    store.data.window.bounds = ticker?.getBounds() ?? bounds;
    store.data.window.displayId = id;
    store.scheduleSave();
    broadcast();
  });
  ipcMain.handle('displays:identify', () => identifyDisplays());

  ipcMain.handle('event:export', () => exportEvent());
  ipcMain.handle('event:import', () => importEvent());
  ipcMain.handle('event:new', () => {
    const fresh = emptyData();
    store.data.eventName = fresh.eventName;
    store.data.sponsors = [];
    store.scheduleSave();
    broadcast();
  });

  // Custom resize/move from the ticker window's edge handles.
  ipcMain.on('ticker:set-bounds', (e, b: Partial<WindowBounds>) => {
    if (!ticker || e.sender !== ticker.webContents || store.data.window.locked) return;
    const cur = ticker.getBounds();
    setTickerBounds({ ...cur, ...b });
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
  const referenced = new Set(store.data.sponsors.map((s) => s.logoPath).filter((x): x is string => !!x));
  cleanupOrphans(store.logosDir, referenced);
  handleLogoProtocol(store.logosDir);
  registerIpc();

  dashboard = createDashboardWindow();
  dashboard.on('closed', () => {
    dashboard = null;
    app.quit();
  });
  createTicker();

  const ok = globalShortcut.register(EMERGENCY_HIDE_SHORTCUT, () => setVisible(!runtime.visible));
  if (!ok) console.warn(`[main] could not register ${EMERGENCY_HIDE_SHORTCUT}`);

  const onDisplaysChanged = () => {
    if (ticker && !ticker.isDestroyed() && !isOnScreen(ticker.getBounds())) {
      const { bounds, displayId } = presetBounds(null, 'bottom', store.data.settings.height);
      setTickerBounds(bounds, false);
      store.data.window.displayId = displayId;
      store.data.window.bounds = ticker.getBounds();
      store.scheduleSave();
    }
    for (const w of [dashboard]) w?.webContents.send('displays:changed');
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

