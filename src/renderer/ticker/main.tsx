import { StrictMode, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { isVertical, type FullState, type WindowBounds } from '../../shared/types';
import { api, tickerEvents } from '../common/api';
import { TickerStrip } from '../common/TickerStrip';
import '../common/ticker.css';
import './ticker-window.css';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN_LONG = 160; // along the scroll axis
const MIN_SHORT = 24; // thickness

/** Edge/corner handles that resize the frameless, transparent window (native resize isn't available for it on Windows). */
function ResizeHandles({ vertical }: { vertical: boolean }) {
  const MIN_W = vertical ? MIN_SHORT : MIN_LONG;
  const MIN_H = vertical ? MIN_LONG : MIN_SHORT;
  const start = useRef<{ edge: Edge; sx: number; sy: number; b: WindowBounds } | null>(null);
  const frame = useRef(0);
  const pending = useRef<Partial<WindowBounds> | null>(null);

  const flush = () => {
    frame.current = 0;
    if (pending.current) api.setTickerBounds(pending.current);
    pending.current = null;
  };

  const onDown = (edge: Edge) => (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = {
      edge,
      sx: e.screenX,
      sy: e.screenY,
      b: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
    };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.screenX - s.sx;
    const dy = e.screenY - s.sy;
    let { x, y, width, height } = s.b;
    if (s.edge.includes('e')) width = Math.max(MIN_W, s.b.width + dx);
    if (s.edge.includes('s')) height = Math.max(MIN_H, s.b.height + dy);
    if (s.edge.includes('w')) {
      width = Math.max(MIN_W, s.b.width - dx);
      x = s.b.x + s.b.width - width;
    }
    if (s.edge.includes('n')) {
      height = Math.max(MIN_H, s.b.height - dy);
      y = s.b.y + s.b.height - height;
    }
    pending.current = { x, y, width, height };
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    start.current = null;
  };

  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`rz rz-${edge}`}
          onPointerDown={onDown(edge)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      ))}
    </>
  );
}

function TickerApp() {
  const [state, setState] = useState<FullState | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  useEffect(() => {
    let alive = true;
    void api.getState().then((s) => alive && setState(s));
    const offState = api.onState(setState);
    const offRestart = tickerEvents.onRestart(() => setRestartToken((n) => n + 1));
    return () => {
      alive = false;
      offState();
      offRestart();
    };
  }, []);

  if (!state) return null;
  const { data, runtime, missingLogos } = state;
  const t = data.tickers.find((x) => x.id === api.tickerId) ?? (api.isTickerWindow && !api.tickerId ? data.tickers[0] : undefined);
  if (!t) return null;
  if (document.title !== `FloatTicker — ${t.name}`) document.title = `FloatTicker — ${t.name}`;
  const rt = runtime[t.id] ?? { playback: 'stopped', visible: false };
  const locked = t.window.locked;

  return (
    <div className={`ticker-root ${locked ? 'locked' : 'editable'}`}>
      <TickerStrip
        sponsors={t.sponsors}
        settings={t.settings}
        playback={rt.playback}
        active={rt.visible}
        restartToken={restartToken}
        logoUrl={api.logoUrl}
        missingLogos={missingLogos}
      />
      {!locked && (
        <>
          <div className="drag-surface" title={`${t.name} · drag to move · drag edges to resize · lock it from the dashboard`} />
          <ResizeHandles vertical={isVertical(t.settings.direction)} />
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TickerApp />
  </StrictMode>,
);
