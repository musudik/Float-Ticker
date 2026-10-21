import { useState, type DragEvent } from 'react';
import type { NamePlacement, Sponsor, TickerSettings } from '../../shared/types';
import { LIMITS } from '../../shared/defaults';
import { api, newSponsorId, reorder } from '../common/api';
import { useDash, useTicker } from './store';
import { Card, Toggle } from './ui';

function Thumb({ s, missing }: { s: Sponsor; missing: boolean }) {
  const [broken, setBroken] = useState(false);
  if (s.logoPath && !missing && !broken)
    return (
      <div className="thumb">
        <img src={api.logoUrl(s.logoPath)} alt="" onError={() => setBroken(true)} draggable={false} />
      </div>
    );
  return <div className="thumb thumb-text">{(s.name || '?').slice(0, 2).toUpperCase()}</div>;
}

function kindOf(s: Sponsor, placement: NamePlacement): string {
  if (s.logoPath && s.showName && s.name) return placement === 'above' ? 'Name above logo' : 'Logo + name';
  if (s.logoPath && s.text) return 'Logo + tagline';
  if (s.logoPath) return 'Logo only';
  return 'Text only';
}

function CopyTo({ sponsor }: { sponsor: Sponsor }) {
  const tickers = useDash((s) => s.state!.data.tickers);
  const current = useTicker();
  const { updateTicker, notify } = useDash.getState();
  const others = tickers.filter((t) => t.id !== current.id);
  if (!others.length) return null;
  return (
    <select
      className="copy-to"
      value=""
      title="Copy this sponsor to another ticker"
      aria-label="Copy to another ticker"
      onChange={(e) => {
        const target = tickers.find((t) => t.id === e.target.value);
        if (!target) return;
        updateTicker(target.id, { sponsors: [...target.sponsors, { ...sponsor, id: newSponsorId(), order: target.sponsors.length }] });
        notify(`Copied "${sponsor.name || 'sponsor'}" to ${target.name}.`, 'success');
      }}
    >
      <option value="">Copy to…</option>
      {others.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function SponsorList() {
  const ticker = useTicker();
  const sponsors = ticker.sponsors;
  const missing = useDash((s) => s.state!.missingLogos);
  const setSponsors = useDash((s) => s.setSponsors);
  const notify = useDash((s) => s.notify);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const active = sponsors.filter((s) => s.enabled).length;
  const missingSet = new Set(missing);

  const update = (id: string, patch: Partial<Sponsor>) => setSponsors(sponsors.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j >= 0 && j < sponsors.length) setSponsors(reorder(sponsors, i, j));
  };
  const remove = (id: string) => {
    setSponsors(sponsors.filter((s) => s.id !== id));
    setConfirmDelete(null);
  };
  const save = (s: Sponsor) => {
    const exists = sponsors.some((x) => x.id === s.id);
    setSponsors(exists ? sponsors.map((x) => (x.id === s.id ? s : x)) : [...sponsors, { ...s, order: sponsors.length }]);
    setEditing(null);
  };
  const bulkAdd = async () => {
    const results = await api.importLogos();
    const ok = results.filter((r) => r.ok && r.logoPath);
    const bad = results.filter((r) => !r.ok && r.error);
    if (ok.length) {
      const added: Sponsor[] = ok.map((r, i) => ({
        id: newSponsorId(),
        name: r.fileName.replace(/[_-]+/g, ' ').trim() || 'Sponsor',
        logoPath: r.logoPath,
        showName: false,
        enabled: true,
        order: sponsors.length + i,
      }));
      setSponsors([...sponsors, ...added]);
      notify(`Added ${ok.length} sponsor${ok.length > 1 ? 's' : ''} as logo-only entries.`, 'success');
    }
    if (bad.length) notify(`${bad.length} file(s) skipped: ${bad[0].fileName} — ${bad[0].error}`, 'error');
  };

  const onDragStart = (i: number) => (e: DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };
  const onDrop = (i: number) => (e: DragEvent) => {
    e.preventDefault();
    if (dragFrom !== null && dragFrom !== i) setSponsors(reorder(sponsors, dragFrom, i));
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <Card
      title={`Sponsors · ${ticker.name} · ${active} of ${sponsors.length} showing`}
      className="sponsors-card"
      actions={
        <>
          <button className="btn ghost" onClick={() => setSponsors(sponsors.map((s) => ({ ...s, enabled: true })))} disabled={!sponsors.length}>
            Enable all
          </button>
          <button className="btn ghost" onClick={() => setSponsors(sponsors.map((s) => ({ ...s, enabled: false })))} disabled={!sponsors.length}>
            Disable all
          </button>
          <button className="btn" onClick={bulkAdd} title="Pick several logo files; each becomes a logo-only sponsor">
            Add logos…
          </button>
          <button
            className="btn primary"
            onClick={() => setEditing({ id: newSponsorId(), name: '', showName: true, enabled: true, order: sponsors.length })}
          >
            + Add sponsor
          </button>
        </>
      }
    >
      {sponsors.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No sponsors yet</p>
          <p>Add each sponsor's logo, name and an optional tagline. Use <b>Add logos…</b> to bring in many logos at once.</p>
        </div>
      ) : (
        <ol className="sponsor-list">
          {sponsors.map((s, i) => {
            const isMissing = !!s.logoPath && missingSet.has(s.logoPath);
            return (
              <li
                key={s.id}
                className={`sponsor-row ${s.enabled ? '' : 'disabled'} ${dragOver === i ? 'drag-over' : ''} ${dragFrom === i ? 'dragging' : ''}`}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== i) setDragOver(i);
                }}
                onDragLeave={() => dragOver === i && setDragOver(null)}
                onDrop={onDrop(i)}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
              >
                <span className="grip" title="Drag to reorder">⋮⋮</span>
                <span className="pos">{i + 1}</span>
                <Thumb s={s} missing={isMissing} />
                <div className="sponsor-info" onDoubleClick={() => setEditing(s)}>
                  <div className="sponsor-name">{s.name || <em>Unnamed</em>}</div>
                  <div className="sponsor-meta">
                    <span className="tag">{kindOf(s, ticker.settings.namePlacement)}</span>
                    {(s.frequency ?? 1) > 1 && <span className="tag accent">×{s.frequency} per loop</span>}
                    {ticker.settings.mode === 'spotlight' && s.durationSec !== undefined && <span className="tag">{s.durationSec}s on screen</span>}
                    {isMissing && <span className="tag warn">Logo file missing — showing name</span>}
                    {s.text && <span className="sponsor-tagline">{s.text}</span>}
                  </div>
                </div>
                <div className="row-actions">
                  <Toggle label="" checked={s.enabled} onChange={(v) => update(s.id, { enabled: v })} />
                  <CopyTo sponsor={s} />
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" aria-label="Move up">
                    ▲
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === sponsors.length - 1} title="Move down" aria-label="Move down">
                    ▼
                  </button>
                  <button className="btn small" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  {confirmDelete === s.id ? (
                    <>
                      <button className="btn small danger" onClick={() => remove(s.id)}>
                        Delete
                      </button>
                      <button className="btn small ghost" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button className="icon-btn" onClick={() => setConfirmDelete(s.id)} title="Delete sponsor" aria-label="Delete sponsor">
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {editing && (
        <SponsorEditor
          initial={editing}
          settings={ticker.settings}
          isNew={!sponsors.some((s) => s.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </Card>
  );
}

function OptionalSeconds(props: { label: string; value: number | undefined; fallback: number; min: number; max: number; onChange: (v: number | undefined) => void }) {
  const { label, value, fallback, min, max, onChange } = props;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="inline-fields">
        <input
          type="number"
          className="num-input"
          min={min}
          max={max}
          step={0.5}
          value={value ?? ''}
          placeholder={String(fallback)}
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onChange(v === undefined || Number.isNaN(v) ? undefined : Math.min(max, Math.max(min, v)));
          }}
        />
        <span className="muted small-text">{value === undefined ? `seconds · ticker default (${fallback}s)` : 'seconds'}</span>
        {value !== undefined && (
          <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>
            Use default
          </button>
        )}
      </span>
    </label>
  );
}

function SponsorEditor({
  initial,
  settings,
  isNew,
  onSave,
  onCancel,
}: {
  initial: Sponsor;
  settings: TickerSettings;
  isNew: boolean;
  onSave: (s: Sponsor) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Sponsor>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Sponsor>) => setD((x) => ({ ...x, ...p }));

  const pickLogo = async () => {
    setBusy(true);
    const r = await api.importLogo();
    setBusy(false);
    if (r.ok && r.logoPath) {
      set({ logoPath: r.logoPath });
      setError(null);
    } else if (r.error) setError(r.error);
  };

  const canSave = !!(d.name.trim() || d.logoPath || d.text?.trim());
  const submit = () => {
    if (!canSave) {
      setError('Add a name, a logo or a message.');
      return;
    }
    onSave({ ...d, name: d.name.trim(), text: d.text?.trim() || undefined });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={isNew ? 'Add sponsor' : 'Edit sponsor'} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h3>{isNew ? 'Add sponsor' : 'Edit sponsor'}</h3>
        <div className="editor-grid">
          <div className="logo-picker">
            <div className="logo-preview">{d.logoPath ? <img src={api.logoUrl(d.logoPath)} alt="Logo preview" /> : <span>No logo</span>}</div>
            <button className="btn" onClick={pickLogo} disabled={busy}>
              {d.logoPath ? 'Replace logo…' : 'Choose logo…'}
            </button>
            {d.logoPath && (
              <button className="btn ghost" onClick={() => set({ logoPath: undefined, showName: true })}>
                Remove logo
              </button>
            )}
            <small className="muted">PNG, JPG, WebP or SVG · up to 15 MB</small>
          </div>
          <div className="editor-fields">
            <label className="field">
              <span className="field-label">Sponsor name</span>
              <input autoFocus value={d.name} maxLength={200} placeholder="e.g. Starvent Healthcare" onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Tagline or message (optional)</span>
              <input value={d.text ?? ''} maxLength={500} placeholder="e.g. Official hydration partner" onChange={(e) => set({ text: e.target.value })} />
            </label>
            {d.logoPath && (
              <Toggle
                label={settings.namePlacement === 'above' ? 'Show name above logo' : 'Show name next to logo'}
                checked={d.showName}
                onChange={(v) => set({ showName: v })}
                hint="Off = logo only (plus tagline if set)"
              />
            )}
            <Toggle label="Show in ticker" checked={d.enabled} onChange={(v) => set({ enabled: v })} />
            <div className="inline-fields">
              <Toggle
                label="Custom name colour"
                checked={!!d.style?.textColor}
                onChange={(v) => set({ style: { ...d.style, textColor: v ? '#ffd166' : undefined } })}
              />
              {d.style?.textColor && (
                <input type="color" value={d.style.textColor} onChange={(e) => set({ style: { ...d.style, textColor: e.target.value } })} />
              )}
            </div>
            <Toggle label="Bold name" checked={d.style?.bold !== false} onChange={(v) => set({ style: { ...d.style, bold: v } })} />
          </div>
        </div>
        <fieldset className="timing">
          <legend>Exposure &amp; timing</legend>
          <div className="field">
            <span className="field-label">Appearances per loop</span>
            <div className="segmented" role="radiogroup">
              {Array.from({ length: LIMITS.frequency[1] }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={(d.frequency ?? 1) === n}
                  className={(d.frequency ?? 1) === n ? 'on' : ''}
                  onClick={() => set({ frequency: n === 1 ? undefined : n })}
                >
                  {n === 1 ? '1× (normal)' : `${n}×`}
                </button>
              ))}
            </div>
            <small className="muted">Headline sponsors can appear more often; repeats are spread evenly through the loop.</small>
          </div>
          <div className="grid-2">
            <OptionalSeconds
              label="On-screen time (one-at-a-time mode)"
              value={d.durationSec}
              fallback={settings.holdSec}
              min={LIMITS.holdSec[0]}
              max={LIMITS.holdSec[1]}
              onChange={(v) => set({ durationSec: v })}
            />
            <OptionalSeconds
              label="Pause after (one-at-a-time mode)"
              value={d.pauseSec}
              fallback={settings.pauseSec}
              min={LIMITS.pauseSec[0]}
              max={LIMITS.pauseSec[1]}
              onChange={(v) => set({ pauseSec: v })}
            />
          </div>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!canSave}>
            {isNew ? 'Add sponsor' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
