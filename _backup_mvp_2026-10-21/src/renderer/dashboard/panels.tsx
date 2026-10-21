import { useEffect, useState } from 'react';
import type { PositionPreset } from '../../shared/types';
import { DEFAULT_SETTINGS, LIMITS } from '../../shared/defaults';
import { api } from '../common/api';
import { TickerStrip } from '../common/TickerStrip';
import { useDash } from './store';
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
  const data = useDash((s) => s.state!.data);
  const missing = useDash((s) => s.state!.missingLogos);
  const [playing, setPlaying] = useState(true);
  const [token, setToken] = useState(0);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  useEffect(() => {
    const on = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const h = Math.min(data.settings.height, 220);

  return (
    <Card
      title="Preview"
      className="preview-card"
      actions={
        <>
          <span className="muted small-text">Only you see this — the audience sees the live ticker.</span>
          <button className="btn small ghost" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause preview' : 'Play preview'}
          </button>
          <button className="btn small ghost" onClick={() => setToken((t) => t + 1)}>
            Rewind
          </button>
        </>
      }
    >
      <div className="preview-stage" style={{ height: h }}>
        <TickerStrip
          sponsors={data.sponsors}
          settings={data.settings}
          playback={playing ? 'playing' : 'paused'}
          active={pageVisible}
          restartToken={token}
          logoUrl={api.logoUrl}
          missingLogos={missing}
          placeholder="Add sponsors to see the ticker preview"
        />
      </div>
    </Card>
  );
}

export function LiveControls() {
  const runtime = useDash((s) => s.state!.runtime);
  const settings = useDash((s) => s.state!.data.settings);
  const { playback, setVisible, setSettings } = useDash.getState();
  const pb = runtime.playback;

  const status = pb === 'playing' ? 'Scrolling' : pb === 'paused' ? 'Paused' : 'Stopped';
  return (
    <Card title="Live control" className="live-card">
      <div className="status-row">
        <span className={`status-pill ${pb}`}>{status}</span>
        <span className={`status-pill ${runtime.visible ? 'onscreen' : 'hidden'}`}>{runtime.visible ? 'On screen' : 'Hidden'}</span>
      </div>

      <button className={`hide-btn ${runtime.visible ? 'is-visible' : ''}`} onClick={() => setVisible(!runtime.visible)}>
        {runtime.visible ? 'HIDE TICKER' : 'SHOW TICKER'}
        <small>Ctrl + Shift + H works from any app</small>
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
        <button className="btn big" onClick={() => playback('stop')} disabled={pb === 'stopped'} title="Stop scrolling and hide the ticker">
          ■ Stop
        </button>
      </div>

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
      <div className="field">
        <span className="field-label">Direction</span>
        <Segmented
          value={settings.direction}
          onChange={(v) => setSettings({ direction: v })}
          options={[
            { value: 'rtl', label: '◀ Right to left' },
            { value: 'ltr', label: 'Left to right ▶' },
          ]}
        />
      </div>
    </Card>
  );
}

export function DisplayPanel() {
  const displays = useDash((s) => s.displays);
  const win = useDash((s) => s.state!.data.window);
  const { setWindow, moveToDisplay, refreshDisplays } = useDash.getState();
  const [target, setTarget] = useState<number | null>(null);
  const selected = target ?? win.displayId ?? displays.find((d) => d.primary)?.id ?? displays[0]?.id ?? null;
  const current = displays.find((d) => d.id === win.displayId);

  const place = (preset: PositionPreset) => selected !== null && moveToDisplay(selected, preset);

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
        <button className="btn" onClick={() => place('bottom')}>
          Place at bottom
        </button>
        <button className="btn" onClick={() => place('top')}>
          Top
        </button>
        <button className="btn" onClick={() => place('center')}>
          Middle
        </button>
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

export function AppearancePanel() {
  const s = useDash((st) => st.state!.data.settings);
  const set = useDash((st) => st.setSettings);
  return (
    <Card
      title="Appearance"
      actions={
        <button
          className="btn small ghost"
          onClick={() => {
            const { direction, speed, ...rest } = DEFAULT_SETTINGS;
            void direction;
            void speed;
            set(rest);
          }}
        >
          Reset style
        </button>
      }
    >
      <div className="grid-2">
        <Slider label="Ticker height" value={s.height} min={LIMITS.height[0]} max={LIMITS.height[1]} unit=" px" onChange={(v) => set({ height: v })} />
        <Slider label="Font size" value={s.fontSize} min={LIMITS.fontSize[0]} max={LIMITS.fontSize[1]} unit=" px" onChange={(v) => set({ fontSize: v })} />
        <Slider
          label="Logo size"
          value={s.logoScale}
          min={LIMITS.logoScale[0]}
          max={LIMITS.logoScale[1]}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}% of height`}
          onChange={(v) => set({ logoScale: v })}
        />
        <Slider label="Space between sponsors" value={s.itemSpacing} min={LIMITS.itemSpacing[0]} max={LIMITS.itemSpacing[1]} unit=" px" onChange={(v) => set({ itemSpacing: v })} />
        <Slider label="Logo-to-text gap" value={s.logoTextGap} min={LIMITS.logoTextGap[0]} max={LIMITS.logoTextGap[1]} unit=" px" onChange={(v) => set({ logoTextGap: v })} />
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
        <ColorField label="Background" value={s.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
      </div>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Font</span>
          <select value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {(FONTS.includes(s.fontFamily) ? FONTS : [s.fontFamily, ...FONTS]).map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f.split(',')[0]}
              </option>
            ))}
          </select>
        </label>
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
      </div>
    </Card>
  );
}
