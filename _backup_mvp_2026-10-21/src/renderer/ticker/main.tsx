import { StrictMode, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { FullState, WindowBounds } from '../../shared/types';
import { api, tickerEvents } from '../common/api';
import { TickerStrip } from '../common/TickerStrip';
import '../common/ticker.css';
import './ticker-window.css';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN_W = 160;
const MIN_H = 24;

/** Edge/corner handles that resize the frameless, transparent window (native resize isn't available for it on Windows). */
function ResizeHandles() {
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
  const locked = data.window.locked;

  return (
    <div className={`ticker-root ${locked ? 'locked' : 'editable'}`}>
      <TickerStrip
        sponsors={data.sponsors}
        settings={data.settings}
        playback={runtime.playback}
        active={runtime.visible}
        restartToken={restartToken}
        logoUrl={api.logoUrl}
        missingLogos={missingLogos}
      />
      {!locked && (
        <>
          <div className="drag-surface" title="Drag to move · drag edges to resize · lock it from the dashboard" />
          <ResizeHandles />
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
