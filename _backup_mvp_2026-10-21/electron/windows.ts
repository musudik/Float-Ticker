import { BrowserWindow, screen, type Rectangle } from 'electron';
import path from 'node:path';
import type { DisplayInfo, PositionPreset, WindowBounds } from '../src/shared/types';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const PRELOAD = path.join(__dirname, 'preload.js');
const RENDERER_DIR = path.join(__dirname, '..', '..', 'dist', 'renderer');

export const MIN_TICKER_WIDTH = 160;
export const MIN_TICKER_HEIGHT = 24;

function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
}

export function loadPage(win: BrowserWindow, page: 'dashboard' | 'ticker'): void {
  if (DEV_URL) void win.loadURL(`${DEV_URL}/${page}.html`);
  else void win.loadFile(path.join(RENDERER_DIR, `${page}.html`));
}

export function createDashboardWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1020,
    minHeight: 680,
    title: 'FloatTicker — Control Dashboard',
    backgroundColor: '#0f1320',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: ['--ft-role=dashboard'],
    },
  });
  hardenWindow(win);
  win.once('ready-to-show', () => win.show());
  loadPage(win, 'dashboard');
  return win;
}

export function createTickerWindow(bounds: WindowBounds, alwaysOnTop: boolean): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false, // Windows can't natively resize transparent frameless windows; we use custom handles.
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: 'FloatTicker Display',
    alwaysOnTop,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep motion smooth while another app has focus
      additionalArguments: ['--ft-role=ticker'],
    },
  });
  if (alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  hardenWindow(win);
  loadPage(win, 'ticker');
  return win;
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .slice()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      index: i + 1,
      label: d.label || `Display ${i + 1}`,
      primary: d.id === primaryId,
      bounds: { ...d.bounds },
      workArea: { ...d.workArea },
      scaleFactor: d.scaleFactor,
    }));
}

/** Rectangle to place the ticker in on a given display. Primary uses the work area (avoids the taskbar). */
function usableArea(displayId: number | null): { area: Rectangle; id: number } {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const d = displays.find((x) => x.id === displayId) ?? primary;
  return { area: d.id === primary.id ? d.workArea : d.bounds, id: d.id };
}

export function presetBounds(displayId: number | null, preset: PositionPreset, height: number): {
  bounds: WindowBounds;
  displayId: number;
} {
  const { area, id } = usableArea(displayId);
  const h = Math.min(height, area.height);
  const y =
    preset === 'top' ? area.y : preset === 'center' ? Math.round(area.y + (area.height - h) / 2) : area.y + area.height - h;
  return { bounds: { x: area.x, y, width: area.width, height: h }, displayId: id };
}

/** True when at least 40×20 px of the rectangle is visible on some display. */
export function isOnScreen(b: WindowBounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const r = d.bounds;
    const w = Math.min(b.x + b.width, r.x + r.width) - Math.max(b.x, r.x);
    const h = Math.min(b.y + b.height, r.y + r.height) - Math.max(b.y, r.y);
    return w >= 40 && h >= 20;
  });
}

export function displayIdFor(b: WindowBounds): number {
  return screen.getDisplayMatching(b).id;
}

/** Shows a large number on every display for a few seconds so the operator can tell them apart. */
export function identifyDisplays(): void {
  for (const d of listDisplays()) {
    const w = 460;
    const h = 260;
    const win = new BrowserWindow({
      x: Math.round(d.bounds.x + (d.bounds.width - w) / 2),
      y: Math.round(d.bounds.y + (d.bounds.height - h) / 2),
      width: w,
      height: h,
      frame: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#111827',
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const html = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#111827;color:#fff;font-family:Segoe UI,system-ui,sans-serif;border:6px solid #f59e0b;box-sizing:border-box">
      <div style="font-size:120px;font-weight:800;line-height:1">${d.index}</div>
      <div style="font-size:22px;margin-top:8px">${esc(d.label)}${d.primary ? ' · Primary' : ''}</div>
      <div style="font-size:16px;opacity:.7;margin-top:4px">${d.bounds.width} × ${d.bounds.height}</div></body></html>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.once('ready-to-show', () => win.showInactive());
    setTimeout(() => !win.isDestroyed() && win.close(), 3500);
  }
}
