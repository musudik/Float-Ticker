import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MAX_TICKERS } from '../../shared/defaults';
import { api, isDesktop, tickerEvents } from '../common/api';
import '../common/ticker.css';
import './dashboard.css';
import { AppearancePanel, DisplayPanel, LiveControls, PreviewPanel } from './panels';
import { ProfilesPanel } from './profiles';
import { SponsorList } from './sponsors';
import { useDash, useTicker } from './store';

function EventName() {
  const name = useDash((s) => s.state!.data.eventName);
  const setEventName = useDash((s) => s.setEventName);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const v = draft.trim() || 'Untitled event';
    if (v !== name) setEventName(v);
    else setDraft(name);
  };
  return (
    <input
      className="event-name"
      value={draft}
      maxLength={120}
      aria-label="Event name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Header() {
  const notify = useDash((s) => s.notify);
  const sponsorCount = useDash((s) => s.state!.data.tickers.reduce((n, t) => n + t.sponsors.length, 0));
  const anyVisible = useDash((s) => Object.values(s.state!.runtime).some((r) => r.visible));
  const setVisible = useDash((s) => s.setVisible);

  const newEvent = async () => {
    if (
      sponsorCount &&
      !confirm('Start a new event? All sponsor lists will be cleared (save the event or a profile first if you need it). Ticker styles and positions are kept.')
    )
      return;
    await api.newEvent();
  };
  const open = async () => {
    const r = await api.importEvent();
    if (r.ok) notify('Event loaded.', 'success');
    else if (r.error) notify(r.error, 'error');
  };
  const save = async () => {
    const r = await api.exportEvent();
    if (r.ok) notify('Event saved. Logos are included in the file.', 'success');
    else if (r.error) notify(r.error, 'error');
  };

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ◧
        </span>
        <span className="brand-name">FloatTicker</span>
      </div>
      <EventName />
      <span className="autosave">Changes save automatically</span>
      <div className="header-actions">
        <button className="btn ghost" onClick={newEvent}>
          New event
        </button>
        <button className="btn ghost" onClick={open}>
          Open event…
        </button>
        <button className="btn" onClick={save}>
          Save event as…
        </button>
        <button
          className={`btn hide-all ${anyVisible ? 'live' : ''}`}
          onClick={() => setVisible(false, 'all')}
          disabled={!anyVisible}
          title="Hide every ticker now (Ctrl + Shift + H from any app; press again to bring them back)"
        >
          HIDE ALL
        </button>
      </div>
    </header>
  );
}

function TickerTabs() {
  const tickers = useDash((s) => s.state!.data.tickers);
  const runtime = useDash((s) => s.state!.runtime);
  const current = useTicker();
  const { select, addTicker, removeTicker, updateTicker } = useDash.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => setConfirmDel(false), [current.id]);

  const commitRename = () => {
    if (renaming && draft.trim()) updateTicker(renaming, { name: draft.trim() });
    setRenaming(null);
  };

  return (
    <nav className="ticker-tabs" aria-label="Tickers">
      <div className="tabs" role="tablist">
        {tickers.map((t) => {
          const r = runtime[t.id];
          const status = r?.visible ? (r.playback === 'playing' ? 'live' : 'paused') : 'off';
          return renaming === t.id ? (
            <input
              key={t.id}
              className="tab-rename"
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === current.id}
              className={`tab ${t.id === current.id ? 'on' : ''}`}
              onClick={() => select(t.id)}
              onDoubleClick={() => {
                setRenaming(t.id);
                setDraft(t.name);
              }}
              title={`${t.name} — ${status === 'live' ? 'on screen' : status === 'paused' ? 'on screen, paused' : 'hidden'} · double-click to rename`}
            >
              <span className={`dot ${status}`} aria-hidden />
              {t.name}
              <span className="tab-count">{t.sponsors.filter((s) => s.enabled).length}</span>
            </button>
          );
        })}
        <button className="tab add" onClick={() => void addTicker()} disabled={tickers.length >= MAX_TICKERS} title="Add another independent ticker">
          + Ticker
        </button>
      </div>
      <div className="tab-tools">
        <button
          className="btn small ghost"
          onClick={() => {
            setRenaming(current.id);
            setDraft(current.name);
          }}
        >
          Rename
        </button>
        <button className="btn small ghost" onClick={() => void addTicker(current.id)} disabled={tickers.length >= MAX_TICKERS} title="New ticker with the same sponsors and style">
          Duplicate
        </button>
        {tickers.length > 1 &&
          (confirmDel ? (
            <>
              <button className="btn small danger" onClick={() => removeTicker(current.id)}>
                Delete {current.name}
              </button>
              <button className="btn small ghost" onClick={() => setConfirmDel(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="btn small ghost" onClick={() => setConfirmDel(true)}>
              Delete
            </button>
          ))}
      </div>
    </nav>
  );
}

function Toasts() {
  const toasts = useDash((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function App() {
  const ready = useDash((s) => !!s.state && !!s.state.data.tickers.length);
  useEffect(() => {
    const off = useDash.getState().init();
    const offDisplays = tickerEvents.onDisplaysChanged(() => void useDash.getState().refreshDisplays());
    return () => {
      off();
      offDisplays();
    };
  }, []);

  if (!ready) return <div className="loading">Loading…</div>;
  return (
    <div className="app">
      <Header />
      {!isDesktop && (
        <div className="web-banner">
          Browser preview mode — open <code>/ticker.html</code> in another tab to see the display window. Window placement needs the desktop app.
        </div>
      )}
      <TickerTabs />
      <main className="layout">
        <div className="col-main">
          <PreviewPanel />
          <SponsorList />
        </div>
        <div className="col-side">
          <LiveControls />
          <DisplayPanel />
          <AppearancePanel />
          <ProfilesPanel />
        </div>
      </main>
      <Toasts />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
