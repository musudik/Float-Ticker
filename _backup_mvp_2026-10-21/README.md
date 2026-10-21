# FloatTicker

A Windows desktop app that shows sponsor logos and messages in a movable, always-on-top ticker over event
content or on a projector — controlled from a separate dashboard the audience never sees.

Built from `FloatTicker_Requirements_MVP_and_Enhancements.pdf` (MVP scope).

## Quick start (Windows)

Requires Node.js 20+ (22 LTS recommended).

```bat
npm install
npm run dev        :: run with hot reload (dashboard + ticker windows)
```

Build a Windows installer:

```bat
npm run dist       :: -> release\FloatTicker Setup 1.0.0.exe
npm run dist:dir   :: -> release\win-unpacked\FloatTicker.exe (no installer)
```

UI-only development in a normal browser (uses an in-browser mock instead of Electron):

```bat
npm run dev:web    :: open http://localhost:5173/dashboard.html and /ticker.html in two tabs
```

## Operating it at an event

1. Name the event (top bar) and add sponsors — **+ Add sponsor** for one at a time, **Add logos…** to bring in
   many logos at once (each becomes a logo-only entry you can edit later).
2. Reorder by dragging rows (or ▲▼), toggle entries on/off, double-click or **Edit** to change them.
3. Set direction, speed, height, colours and background transparency. The **Preview** shows the result.
4. **Start** shows the ticker. Drag it to move; drag its edges to resize. Or choose a display/projector and
   **Place at bottom / Top / Middle**. **Identify screens** flashes a number on each monitor.
5. **Lock position** stops accidental moves and makes the ticker click-through.
6. **HIDE TICKER** (or **Ctrl + Shift + H** from any app) removes it from view instantly.
7. Everything saves automatically. **Save event as…** writes a portable `.floatticker.json` with the logos
   embedded; **Open event…** loads one back.

## Requirements coverage (MVP)

| ID | Requirement | Where |
|----|-------------|-------|
| MVP-01 | Separate ticker window + control dashboard | `electron/windows.ts` |
| MVP-02 | Always on top, borderless | ticker `BrowserWindow` (frameless, transparent, `screen-saver` level) |
| MVP-03 | Mouse move/resize, lock | drag region + custom edge handles (`src/renderer/ticker/main.tsx`); lock = immovable + click-through |
| MVP-04 | Add / edit / reorder / enable / delete | `src/renderer/dashboard/sponsors.tsx` |
| MVP-05 | PNG, JPG, WebP, SVG upload | `electron/logos.ts` — checks real file content (magic bytes), 15 MB cap; SVG shown via `<img>` so scripts never run |
| MVP-06 | Logo-only / text-only / logo + text | "Show name next to logo" + optional tagline |
| MVP-07 | Both horizontal directions | `src/renderer/common/TickerStrip.tsx` |
| MVP-08 | Live speed changes | animation re-timed in place, position kept |
| MVP-09 | Height, font size, spacing, colours, transparency | Appearance panel |
| MVP-10 | Start / Pause / Resume / Stop / Show-Hide / Restart | Live control panel |
| MVP-11 | Local save & reload | `%APPDATA%\FloatTicker\floatticker-data.json` + `logos\` |
| MVP-12 | Preview | Preview panel (same renderer as the live ticker) |
| MVP-13 | Target monitor | Display & position panel |

Non-functional: runs fully offline; animation pauses while hidden/stopped (no CPU spent);
the ticker window renders independently of the dashboard; missing or unreadable logos fall back to the
sponsor name and are flagged in the list; a corrupt data file is backed up instead of overwritten.

## How it works

```
electron/
  main.ts      app lifecycle, IPC, playback state, event import/export, emergency-hide hotkey
  windows.ts   dashboard + ticker windows, display list/placement, "identify screens"
  store.ts     JSON persistence (debounced, atomic writes)
  logos.ts     logo validation, local logo library, ftlogo:// protocol
  preload.ts   safe API bridge (window.floatTicker) — contextIsolation + sandbox on
src/shared/    data model (Sponsor, TickerSettings, …), defaults, validation
src/renderer/
  common/TickerStrip.tsx   seamless marquee used by both the live ticker and the preview
  ticker/                  public display window
  dashboard/               operator UI (React + Zustand)
```

The main process owns the state; both windows receive updates over IPC, so live changes take effect
without restarting. The marquee repeats the sponsor sequence until one "unit" is at least as wide as the
screen, renders two units and slides by exactly one unit per loop with a compositor-driven Web Animation,
so the wrap-around is invisible and sponsor DOM isn't re-rendered per frame.

## Notes / known limits

- Overlay over exclusive-fullscreen games or protected video is not guaranteed (out of MVP scope).
- On Windows, transparent frameless windows can't use native resize borders, so the ticker has its own
  edge handles (visible on hover while unlocked).
- No app icon yet — electron-builder uses the default Electron icon until `build/icon.ico` is added.

## Next (Phase 2 candidates from the PRD)

Vertical scrolling, animation presets, per-sponsor duration/frequency, event profiles, multiple tickers,
advanced styling.
