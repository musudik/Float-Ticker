import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppData } from '../src/shared/types';
import { emptyData, normalizeData } from '../src/shared/defaults';

/**
 * Local JSON persistence. All data lives in the app's userData folder
 * (e.g. %APPDATA%\FloatTicker on Windows) so the app works fully offline.
 */
export class Store {
  readonly dir = app.getPath('userData');
  readonly file = path.join(this.dir, 'floatticker-data.json');
  readonly logosDir = path.join(this.dir, 'logos');
  data: AppData;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(this.logosDir, { recursive: true });
    this.data = this.load();
  }

  private load(): AppData {
    if (!fs.existsSync(this.file)) return emptyData();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return normalizeData(raw);
    } catch (err) {
      // Keep the unreadable file for recovery instead of silently overwriting it.
      const backup = this.file.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
      try {
        fs.renameSync(this.file, backup);
      } catch {
        /* ignore */
      }
      console.error('[store] could not read data file, starting fresh. Backup:', backup, err);
      return emptyData();
    }
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
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file); // atomic replace
    } catch (err) {
      console.error('[store] save failed', err);
    }
  }
}
