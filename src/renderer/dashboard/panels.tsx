import { useEffect, useState } from 'react';
import { isVertical, type Direction, type PositionPreset, type TickerSettings, type Transition } from '../../shared/types';
import { LIMITS, pickStyle } from '../../shared/defaults';
import { api } from '../common/api';
import { TickerStrip } from '../common/TickerStrip';
import { useDash, useRuntime, useTicker } from './store';
import { Card, ColorField, Segmented, Slider, Toggle } from './ui';

const FONTS = [
  'Segoe UI, system-ui, sans-serif',
  'Bahnschrift, Segoe UI, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Verdana, Geneva, sans-serif',
  'Trebuchet MS, sans-serif',
  'Georgia, serif',
  'Impact, Haettenschweiler, sans-serif',
  'Consolas, monospace',
];

export function PreviewPanel() {
  const t = useTicker();
  const missing = useDash((s) => s.state!.missingLogos);
  const [playing, setPlaying] = useState(true);
  const [token, setToken] = useState(0);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  useEffect(() => {
    const on = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const vertical = isVertical(t.settings.direction);
  const stageStyle = vertical ? { width: Math.min(t.settings.height, 360), height: 340 } : { height: Math.min(t.settings.height, 220) };

  return (
    <Card
      title={`Preview · ${t.name}`}
      className="preview-card"
      actions={
        <>
          <span className="muted small-text">Only you see this — the audience sees the live ticker.</span>
          <button className="btn small ghost" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause preview' : 'Play preview'}
          </button>
          <button className="btn small ghost" onClick={() => setToken((n) => n + 1)}>
            Rewind
          </button>
        </>
      }
    >
      <div className={`preview-stage ${vertical ? 'vertical' : ''}`}>
        <div className="preview-frame" style={stageStyle}>
          <TickerStrip
            sponsors={t.sponsors}
            settings={t.settings}
            playback={playing ? 'playing' : 'paused'}
            active={pageVisible}
            restartToken={token}
            logoUrl={api.logoUrl}
            missingLogos={missing}
            placeholder="Add sponsors to see the ticker preview"
          />
        </div>
      </div>
    </Card>
  );
}

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'rtl', label: '◀ Right to left' },
  { value: 'ltr', label: 'Left to right ▶' },
  { value: 'btt', label: '▲ Bottom to top' },
  { value: 'ttb', label: 'Top to bottom ▼' },
];

const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'slide', label: 'Slide' },
  { value: 'fade', label: 'Fade' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: 'Flip' },
  { value: 'none', label: 'Cut' },
];

export function LiveControls() {
  const t = useTicker();
  const runtime = useRuntime();
  const tickerCount = useDash((s) => s.state!.data.tickers.length);
  const { playback, setVisible, setSettings } = useDash.getState();
  const settings = t.settings;
  const pb = runtime.playback;

  const status = pb === 'playing' ? 'Running' : pb === 'paused' ? 'Paused' : 'Stopped';
  return (
    <Card
      title={`Live control · ${t.name}`}
      className="live-card"
      actions={
        tickerCount > 1 ? (
          <>
            <button className="btn small ghost" onClick={() => playback('start', 'all')} title="Start every ticker">
              Start all
            </button>
            <button className="btn small ghost" onClick={() => playback('stop', 'all')} title="Stop and hide every ticker">
              Stop all
            </button>
          </>
        ) : undefined
      }
    >
      <div className="status-row">
        <span className={`status-pill ${pb}`}>{status}</span>
        <span className={`status-pill ${runtime.visible ? 'onscreen' : 'hidden'}`}>{runtime.visible ? 'On screen' : 'Hidden'}</span>
      </div>

      <button className={`hide-btn ${runtime.visible ? 'is-visible' : ''}`} onClick={() => setVisible(!runtime.visible)}>
        {runtime.visible ? 'HIDE TICKER' : 'SHOW TICKER'}
        <small>Ctrl + Shift + H hides every ticker from any app</small>
      </button>

      <div className="transport">
        {pb === 'stopped' ? (
          <button className="btn primary big" onClick={() => playback('start')}>
            ▶ Start
          </button>
        ) : pb === 'playing' ? (
          <button className="btn big" onClick={() => playback('pause')}>
            ❚❚ Pause
          </button>
        ) : (
          <button className="btn primary big" onClick={() => playback('resume')}>
            ▶ Resume
          </button>
        )}
        <button className="btn big" onClick={() => playback('restart')} title="Jump back to the first sponsor and play">
          ↺ Restart
        </button>
        <button className="btn big" onClick={() => playback('stop')} disabled={pb === 'stopped'} title="Stop and hide this ticker">
          ■ Stop
        </button>
      </div>

      <div className="field">
        <span className="field-label">Animation</span>
        <Segmented
          value={settings.mode}
          onChange={(v) => setSettings({ mode: v })}
          options={[
            { value: 'marquee', label: 'Continuous scroll' },
            { value: 'spotlight', label: 'One at a time' },
          ]}
        />
      </div>

      <div className="field">
        <span className="field-label">Direction</span>
        <div className="segmented wrap" role="radiogroup">
          {DIRECTIONS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={settings.direction === o.value} className={settings.direction === o.value ? 'on' : ''} onClick={() => setSettings({ direction: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {settings.mode === 'marquee' ? (
        <>
          <Slider label="Speed" value={settings.speed} min={LIMITS.speed[0]} max={LIMITS.speed[1]} step={5} unit=" px/s" onChange={(v) => setSettings({ speed: v })} />
          <div className="chips">
            {[
              ['Slow', 50],
              ['Normal', 90],
              ['Fast', 160],
              ['Very fast', 260],
            ].map(([label, v]) => (
              <button key={label} className={`chip ${settings.speed === v ? 'on' : ''}`} onClick={() => setSettings({ speed: v as number })}>
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <span className="field-label">Entry / exit effect</span>
            <div className="chips">
              {TRANSITIONS.map((o) => (
                <button key={o.value} className={`chip ${settings.transition === o.value ? 'on' : ''}`} onClick={() => setSettings({ transition: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <Slider label="Show each sponsor" value={settings.holdSec} min={1} max={30} step={0.5} unit=" s" onChange={(v) => setSettings({ holdSec: v })} />
            <Slider label="Pause between" value={settings.pauseSec} min={0} max={10} step={0.1} unit=" s" onChange={(v) => setSettings({ pauseSec: v })} />
          </div>
          <Slider
            label="Effect length"
            value={settings.transitionMs}
            min={100}
            max={2000}
            step={50}
            unit=" ms"
            onChange={(v) => setSettings({ transitionMs: v })}
          />
          <p className="muted small-text">Individual sponsors can override their on-screen time and pause in Edit.</p>
        </>
      )}
    </Card>
  );
}

export function DisplayPanel() {
  const displays = useDash((s) => s.displays);
  const t = useTicker();
  const win = t.window;
  const vertical = isVertical(t.settings.direction);
  const { setWindow, moveToDisplay, refreshDisplays } = useDash.getState();
  const [target, setTarget] = useState<number | null>(null);
  const selected = target ?? win.displayId ?? displays.find((d) => d.primary)?.id ?? displays[0]?.id ?? null;
  const current = displays.find((d) => d.id === win.displayId);

  const place = (preset: PositionPreset) => selected !== null && moveToDisplay(selected, preset);
  const presets: [PositionPreset, string][] = vertical
    ? [
        ['right', 'Place at right'],
        ['left', 'Left'],
        ['center', 'Middle'],
      ]
    : [
        ['bottom', 'Place at bottom'],
        ['top', 'Top'],
        ['center', 'Middle'],
      ];

  return (
    <Card
      title="Display & position"
      actions={
        <button className="btn small ghost" onClick={() => void refreshDisplays()}>
          Refresh
        </button>
      }
    >
      <label className="field">
        <span className="field-label">Target display / projector</span>
        <select value={selected ?? ''} onChange={(e) => setTarget(Number(e.target.value))}>
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.index}. {d.label} — {d.bounds.width}×{d.bounds.height}
              {d.primary ? ' (main)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        {presets.map(([p, label]) => (
          <button key={p} className="btn" onClick={() => place(p)}>
            {label}
          </button>
        ))}
        <button className="btn ghost" onClick={() => void api.identifyDisplays()} title="Shows a big number on every screen for 3 seconds">
          Identify screens
        </button>
      </div>
      <p className="muted small-text">
        {win.bounds
          ? `Now on ${current ? `display ${current.index}` : 'a display'} · ${win.bounds.width}×${win.bounds.height} px at (${win.bounds.x}, ${win.bounds.y})`
          : 'Position will be set when the ticker first appears.'}
        {!win.locked && ' · Drag the ticker to move it; drag its edges to resize.'}
      </p>
      <Toggle label="Always on top" checked={win.alwaysOnTop} onChange={(v) => setWindow({ alwaysOnTop: v })} hint="Keeps the ticker above slides, browsers and video players" />
      <Toggle label="Lock position" checked={win.locked} onChange={(v) => setWindow({ locked: v })} hint="Stops accidental moves; clicks pass through to the app underneath" />
    </Card>
  );
}

function StylePresets() {
  const presets = useDash((s) => s.state!.library.stylePresets);
  const t = useTicker();
  const notify = useDash((s) => s.notify);
  const set = useDash((s) => s.setSettings);
  const [naming, setNaming] = useState<string | null>(null);

  const save = async () => {
    if (!naming?.trim()) return setNaming(null);
    await api.saveStylePreset(naming.trim(), pickStyle(t.settings));
    notify(`Style "${naming.trim()}" saved.`, 'success');
    setNaming(null);
  };

  return (
    <div className="field">
      <span className="field-label">Style presets</span>
      <div className="chips">
        {presets.map((p) => (
          <span key={p.id} className="preset-chip">
            <button className="chip" onClick={() => set(p.settings as Partial<TickerSettings>)} title={`Apply "${p.name}" to ${t.name}`}>
              {p.name}
            </button>
            {!p.builtIn && (
              <button className="chip-x" onClick={() => void api.deleteStylePreset(p.id)} title={`Delete "${p.name}"`} aria-label={`Delete ${p.name}`}>
                ✕
              </button>
            )}
          </span>
        ))}
        {naming === null ? (
          <button className="chip dashed" onClick={() => setNaming('')}>
            + Save current style
          </button>
        ) : (
          <span className="inline-fields">
            <input
              className="mini-input"
              autoFocus
              placeholder="Style name"
              value={naming}
              maxLength={60}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') setNaming(null);
              }}
            />
            <button className="btn small primary" onClick={() => void save()}>
              Save
            </button>
            <button className="btn small ghost" onClick={() => setNaming(null)}>
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export function AppearancePanel() {
  const t = useTicker();
  const s = t.settings;
  const set = useDash((st) => st.setSettings);
  const vertical = isVertical(s.direction);
  const customFont = !FONTS.includes(s.fontFamily);
  return (
    <Card title="Appearance">
      <StylePresets />
      <div className="field">
        <span className="field-label">Sponsor name</span>
        <Segmented
          value={s.namePlacement}
          onChange={(v) => set({ namePlacement: v })}
          options={[
            { value: 'above', label: 'Above the logo' },
            { value: 'side', label: 'Beside the logo' },
          ]}
        />
        <small className="muted">Turn the name on or off for each logo in Edit.</small>
      </div>
      <div className="grid-2">
        <Slider
          label={vertical ? 'Ticker width' : 'Ticker height'}
          value={s.height}
          min={LIMITS.height[0]}
          max={LIMITS.height[1]}
          unit=" px"
          onChange={(v) => set({ height: v })}
        />
        <Slider label="Font size" value={s.fontSize} min={LIMITS.fontSize[0]} max={LIMITS.fontSize[1]} unit=" px" onChange={(v) => set({ fontSize: v })} />
        <Slider
          label="Logo size"
          value={s.logoScale}
          min={LIMITS.logoScale[0]}
          max={LIMITS.logoScale[1]}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ logoScale: v })}
        />
        {s.namePlacement === 'above' ? (
          <Slider label="Name size (above logo)" value={s.labelSize} min={LIMITS.labelSize[0]} max={LIMITS.labelSize[1]} unit=" px" onChange={(v) => set({ labelSize: v })} />
        ) : (
          <Slider label="Logo-to-text gap" value={s.logoTextGap} min={LIMITS.logoTextGap[0]} max={LIMITS.logoTextGap[1]} unit=" px" onChange={(v) => set({ logoTextGap: v })} />
        )}
        <Slider label="Space between sponsors" value={s.itemSpacing} min={LIMITS.itemSpacing[0]} max={LIMITS.itemSpacing[1]} unit=" px" onChange={(v) => set({ itemSpacing: v })} />
        <Slider
          label="Background opacity"
          value={s.backgroundOpacity}
          min={0}
          max={1}
          step={0.05}
          format={(v) => (v === 0 ? 'Transparent' : `${Math.round(v * 100)}%`)}
          onChange={(v) => set({ backgroundOpacity: v })}
        />
      </div>
      <div className="grid-3">
        <ColorField label="Name colour" value={s.textColor} onChange={(v) => set({ textColor: v })} />
        <ColorField label="Tagline colour" value={s.taglineColor} onChange={(v) => set({ taglineColor: v })} />
        <ColorField label={s.backgroundMode === 'gradient' ? 'Background from' : 'Background'} value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
      </div>
      <div className="field">
        <span className="field-label">Separator between sponsors</span>
        <div className="inline-fields">
          <Toggle label="" checked={s.showSeparator} onChange={(v) => set({ showSeparator: v })} />
          <input className="sep-input" value={s.separatorChar} maxLength={4} disabled={!s.showSeparator} onChange={(e) => set({ separatorChar: e.target.value })} />
          {['•', '|', '★', '◆'].map((c) => (
            <button key={c} className={`chip ${s.separatorChar === c ? 'on' : ''}`} disabled={!s.showSeparator} onClick={() => set({ separatorChar: c })}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <details className="advanced">
        <summary>Advanced styling — gradient, border, corners, shadow, typography</summary>
        <div className="advanced-body">
          <div className="field">
            <span className="field-label">Background</span>
            <Segmented
              value={s.backgroundMode}
              onChange={(v) => set({ backgroundMode: v })}
              options={[
                { value: 'solid', label: 'Solid colour' },
                { value: 'gradient', label: 'Gradient' },
              ]}
            />
          </div>
          {s.backgroundMode === 'gradient' && (
            <div className="grid-2">
              <ColorField label="Gradient to" value={s.backgroundColor2} onChange={(v) => set({ backgroundColor2: v })} />
              <Slider label="Gradient angle" value={s.gradientAngle} min={0} max={360} step={5} unit="°" onChange={(v) => set({ gradientAngle: v })} />
            </div>
          )}
          <div className="grid-2">
            <Slider label="Border" value={s.borderWidth} min={LIMITS.borderWidth[0]} max={LIMITS.borderWidth[1]} format={(v) => (v ? `${v} px` : 'None')} onChange={(v) => set({ borderWidth: v })} />
            <ColorField label="Border colour" value={s.borderColor} onChange={(v) => set({ borderColor: v })} />
            <Slider label="Rounded corners" value={s.borderRadius} min={LIMITS.borderRadius[0]} max={LIMITS.borderRadius[1]} unit=" px" onChange={(v) => set({ borderRadius: v })} />
            <Slider label="Shadow" value={s.shadow} min={LIMITS.shadow[0]} max={LIMITS.shadow[1]} format={(v) => (v ? String(v) : 'Off')} onChange={(v) => set({ shadow: v })} />
          </div>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Font</span>
              <select value={customFont ? '__custom' : s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value === '__custom' ? 'Calibri' : e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f.split(',')[0]}
                  </option>
                ))}
                <option value="__custom">Other installed font…</option>
              </select>
            </label>
            {customFont ? (
              <label className="field">
                <span className="field-label">Font name (as installed in Windows)</span>
                <input value={s.fontFamily} maxLength={200} onChange={(e) => set({ fontFamily: e.target.value })} placeholder="e.g. Montserrat" />
              </label>
            ) : (
              <Slider
                label="Weight"
                value={s.fontWeight}
                min={100}
                max={900}
                step={100}
                format={(v) => ({ 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' })[v] ?? String(v)}
                onChange={(v) => set({ fontWeight: v })}
              />
            )}
            {customFont && (
              <Slider label="Weight" value={s.fontWeight} min={100} max={900} step={100} onChange={(v) => set({ fontWeight: v })} />
            )}
            <Slider label="Letter spacing" value={s.letterSpacing} min={LIMITS.letterSpacing[0]} max={LIMITS.letterSpacing[1]} step={0.5} unit=" px" onChange={(v) => set({ letterSpacing: v })} />
          </div>
          <div className="inline-fields">
            <Toggle label="Italic" checked={s.italic} onChange={(v) => set({ italic: v })} />
            <Toggle label="ALL CAPS" checked={s.uppercase} onChange={(v) => set({ uppercase: v })} />
          </div>
        </div>
      </details>
    </Card>
  );
}
