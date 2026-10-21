# FloatTicker

A Windows desktop app that shows sponsor logos and messages in a movable, always-on-top ticker over event
content or on a projector — controlled from a separate dashboard the audience never sees.

Built from `FloatTicker_Requirements_MVP_and_Enhancements.pdf` (MVP + Phase 2).

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
   The sponsor name shows **above the logo** by default (Appearance → *Sponsor name* switches to beside it);
   turn the name on or off per logo in **Edit**.
3. Pick the animation: **Continuous scroll** (marquee) or **One at a time** (spotlight with Slide / Fade /
   Bounce / Zoom / Flip / Cut). Choose any of four directions, including bottom-to-top and top-to-bottom.
4. Set size, colours and transparency, or click a **style preset**. *Advanced styling* has gradients,
   borders, rounded corners, shadow and typography. The **Preview** shows the result.
5. **Start** shows the ticker. Drag it to move; drag its edges to resize. Or choose a display/projector and
   use the placement buttons. **Identify screens** flashes a number on each monitor.
6. **Lock position** stops accidental moves and makes the ticker click-through.
7. **HIDE TICKER** hides the selected ticker; **HIDE ALL** (or **Ctrl + Shift + H** from any app) hides every
   ticker instantly. Press the shortcut again to bring them back.
8. Everything saves automatically. **Save event as…** writes a portable `.floatticker.json` with the logos
   embedded; **Open event…** loads one back (MVP event files still open).

### Several tickers at once

Use **+ Ticker** to add up to 8 independent tickers, each with its own sponsors, direction, speed, style and
position (for example a bottom sponsor strip plus a vertical strip at the side). Tabs show which tickers are
on screen (red dot). **Duplicate** copies a ticker; **Copy to…** on a sponsor row copies one sponsor to another
ticker. **Start all / Stop all** control every ticker together.

### Per-sponsor exposure

In **Edit → Exposure & timing**: *Appearances per loop* (1–5×, spread evenly) gives headline sponsors more
screen time; in one-at-a-time mode each sponsor can also have its own on-screen time and pause after it.

### Event profiles

**Event profiles → Save current setup…** stores every ticker (sponsors, style, timing, position) under a name
in the local library; **Load** restores it in one click for a recurring event. Profiles and your own style
presets are kept in `%APPDATA%\FloatTicker\floatticker-library.json`.

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
  main.ts      app lifecycle, one window per ticker, IPC, playback, profiles, event files, hide hotkey
  windows.ts   dashboard + ticker windows, display list/placement, "identify screens"
  store.ts     JSON persistence (debounced, atomic writes) + profile/style library
  logos.ts     logo validation, local logo library, ftlogo:// protocol
  preload.ts   safe API bridge (window.floatTicker) — contextIsolation + sandbox on
src/shared/    data model (Sponsor, TickerSettings, …), defaults, validation
src/renderer/
  common/TickerStrip.tsx   seamless marquee used by both the live ticker and the preview
  ticker/                  public display window
  dashboard/               operator UI (React + Zustand): ticker tabs, panels, sponsors, profiles
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

## Phase 2 coverage (from the PRD roadmap)

| Enhancement | Status | Where |
|---|---|---|
| Vertical scrolling (bottom→top, top→bottom) | Done | `TickerStrip.tsx` (Marquee), window reshape in `electron/main.ts` |
| Animation presets: fade, slide, bounce, zoom, flip, entry/exit | Done | `TickerStrip.tsx` (Spotlight) |
| Per-sponsor duration, pause time, display frequency | Done | sponsor editor; `playlist()` in `src/shared/defaults.ts` |
| Event profiles and reusable presets | Done | `dashboard/profiles.tsx`, style presets in Appearance |
| Multiple independent tickers | Done | one window per ticker (`electron/main.ts`), ticker tabs |
| Advanced styling: gradients, borders, shadows, corners, typography | Done | Appearance → Advanced styling |
| Name above logo, per-logo on/off | Done | Appearance → Sponsor name; Edit → Show name |

Data saved by the MVP (version 1) is migrated automatically into "Ticker 1".

## Next (Phase 3 candidates from the PRD)

Remote control from a phone on the same network, scheduled playlists, premium weighting, OBS output,
per-display profiles and fullscreen output, configurable hotkeys, QR codes, exposure reports.
