import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppData, ProfileMeta, StylePreset, TickerSettings } from '../src/shared/types';
import { emptyData, normalizeData, normalizeSettings, STYLE_KEYS } from '../src/shared/defaults';

interface StoredProfile extends ProfileMeta {
  data: AppData;
}

interface LibraryFile {
  version: 1;
  profiles: StoredProfile[];
  stylePresets: StylePreset[];
}

function readJson(file: string): { ok: true; value: unknown } | { ok: false; missing: boolean } {
  if (!fs.existsSync(file)) return { ok: false, missing: true };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    // Keep the unreadable file for recovery instead of silently overwriting it.
    const backup = file.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
    try {
      fs.renameSync(file, backup);
    } catch {
      /* ignore */
    }
    console.error('[store] could not read', file, '— backup:', backup, err);
    return { ok: false, missing: false };
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[store] save failed', file, err);
  }
}

function normalizeStylePreset(raw: unknown): StylePreset | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
  const full = normalizeSettings(p.settings);
  const given = (p.settings ?? {}) as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (k in given) settings[k] = full[k];
  return { id: p.id.slice(0, 64), name: p.name.slice(0, 60), settings: settings as Partial<TickerSettings> };
}

/**
 * Local JSON persistence. All data lives in the app's userData folder
 * (e.g. %APPDATA%\FloatTicker on Windows) so the app works fully offline.
 */
export class Store {
  readonly dir = app.getPath('userData');
  readonly file = path.join(this.dir, 'floatticker-data.json');
  readonly libraryFile = path.join(this.dir, 'floatticker-library.json');
  readonly logosDir = path.join(this.dir, 'logos');
  data: AppData;
  library: LibraryFile;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(this.logosDir, { recursive: true });
    const d = readJson(this.file);
    this.data = d.ok ? normalizeData(d.value) : emptyData();
    const l = readJson(this.libraryFile);
    const raw = (l.ok ? l.value : {}) as Partial<LibraryFile>;
    this.library = {
      version: 1,
      profiles: (Array.isArray(raw.profiles) ? raw.profiles : [])
        .filter((p): p is StoredProfile => !!p && typeof p.id === 'string' && typeof p.name === 'string')
        .map((p) => ({ ...p, data: normalizeData(p.data) })),
      stylePresets: (Array.isArray(raw.stylePresets) ? raw.stylePresets : [])
        .map(normalizeStylePreset)
        .filter((p): p is StylePreset => !!p),
    };
  }

  /** Debounced save (coalesces rapid edits such as slider drags). */
  scheduleSave(delay = 300): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), delay);
  }

  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    writeJsonAtomic(this.file, this.data);
  }

  saveLibrary(): void {
    writeJsonAtomic(this.libraryFile, this.library);
  }
}
