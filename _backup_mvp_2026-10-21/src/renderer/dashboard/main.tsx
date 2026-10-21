import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, isDesktop, tickerEvents } from '../common/api';
import '../common/ticker.css';
import './dashboard.css';
import { AppearancePanel, DisplayPanel, LiveControls, PreviewPanel } from './panels';
import { SponsorList } from './sponsors';
import { useDash } from './store';

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
  const sponsorCount = useDash((s) => s.state!.data.sponsors.length);

  const newEvent = async () => {
    if (sponsorCount && !confirm('Start a new event? The current sponsor list will be cleared (save it first if you need it). Display settings are kept.')) return;
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
      </div>
    </header>
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
  const ready = useDash((s) => !!s.state);
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
      <main className="layout">
        <div className="col-main">
          <PreviewPanel />
          <SponsorList />
        </div>
        <div className="col-side">
          <LiveControls />
          <DisplayPanel />
          <AppearancePanel />
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
