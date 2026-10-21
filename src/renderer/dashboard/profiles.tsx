import { useState } from 'react';
import { api } from '../common/api';
import { useDash } from './store';
import { Card } from './ui';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Event profiles: named snapshots of the whole setup (every ticker's sponsors, style, timing and
 * position) kept in the app's local library, for recurring events.
 */
export function ProfilesPanel() {
  const profiles = useDash((s) => s.state!.library.profiles);
  const eventName = useDash((s) => s.state!.data.eventName);
  const notify = useDash((s) => s.notify);
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'load' | 'delete' | 'overwrite' } | null>(null);

  const save = async () => {
    const n = (name ?? '').trim() || eventName;
    await api.saveProfile(n);
    notify(`Profile "${n}" saved.`, 'success');
    setName(null);
  };
  const act = async (id: string, action: 'load' | 'delete' | 'overwrite') => {
    const p = profiles.find((x) => x.id === id);
    setConfirm(null);
    if (!p) return;
    if (action === 'load') {
      const r = await api.loadProfile(id);
      if (r.ok) notify(`Loaded "${p.name}". Tickers are stopped — press Start when ready.`, 'success');
      else notify(r.error ?? 'Could not load the profile.', 'error');
    } else if (action === 'delete') {
      await api.deleteProfile(id);
    } else {
      await api.saveProfile(p.name, id);
      notify(`Profile "${p.name}" updated.`, 'success');
    }
  };

  return (
    <Card
      title="Event profiles"
      actions={
        name === null && (
          <button className="btn small" onClick={() => setName(eventName)}>
            Save current setup…
          </button>
        )
      }
    >
      <p className="muted small-text">A profile keeps every ticker's sponsors, style, timing and position, so a recurring event is set up in one click.</p>
      {name !== null && (
        <div className="inline-fields">
          <input
            className="mini-input grow"
            autoFocus
            value={name}
            maxLength={60}
            placeholder="Profile name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setName(null);
            }}
          />
          <button className="btn small primary" onClick={() => void save()}>
            Save profile
          </button>
          <button className="btn small ghost" onClick={() => setName(null)}>
            Cancel
          </button>
        </div>
      )}
      {profiles.length === 0 ? (
        <p className="muted small-text">No saved profiles yet.</p>
      ) : (
        <ul className="profile-list">
          {profiles.map((p) => (
            <li key={p.id} className="profile-row">
              <div className="profile-info">
                <div className="profile-name">{p.name}</div>
                <div className="muted small-text">
                  {p.tickerCount} ticker{p.tickerCount === 1 ? '' : 's'} · {p.sponsorCount} sponsor{p.sponsorCount === 1 ? '' : 's'} · {when(p.savedAt)}
                </div>
              </div>
              {confirm?.id === p.id ? (
                <div className="row-actions">
                  <span className="small-text">
                    {confirm.action === 'load' ? 'Replace the current setup?' : confirm.action === 'delete' ? 'Delete this profile?' : 'Overwrite with current setup?'}
                  </span>
                  <button className={`btn small ${confirm.action === 'delete' ? 'danger' : 'primary'}`} onClick={() => void act(p.id, confirm.action)}>
                    Yes
                  </button>
                  <button className="btn small ghost" onClick={() => setConfirm(null)}>
                    No
                  </button>
                </div>
              ) : (
                <div className="row-actions">
                  <button className="btn small" onClick={() => setConfirm({ id: p.id, action: 'load' })}>
                    Load
                  </button>
                  <button className="btn small ghost" onClick={() => setConfirm({ id: p.id, action: 'overwrite' })} title="Replace this profile with the current setup">
                    Update
                  </button>
                  <button className="icon-btn" onClick={() => setConfirm({ id: p.id, action: 'delete' })} title="Delete profile" aria-label="Delete profile">
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
