import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import type { Direction, PlaybackState, Sponsor, TickerSettings } from '../../shared/types';
import { activeSponsors } from '../../shared/defaults';

export interface TickerStripProps {
  sponsors: Sponsor[];
  settings: TickerSettings;
  playback: PlaybackState;
  /** False when the strip is not on screen (hidden window) — the animation is paused to save CPU. */
  active: boolean;
  /** Changing this number jumps back to the start position. */
  restartToken: number;
  logoUrl: (logoPath: string) => string;
  missingLogos: string[];
  placeholder?: string;
}

export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface ItemProps {
  sponsor: Sponsor;
  settings: TickerSettings;
  logoSrc: string | null;
  onLogoError: (logoPath: string) => void;
}

function Item({ sponsor: s, settings, logoSrc, onLogoError }: ItemProps) {
  const logoH = Math.max(8, Math.round(settings.height * settings.logoScale));
  const showName = !logoSrc || s.showName;
  const hasText = (showName && s.name) || s.text;
  return (
    <div className="ft-item" style={{ marginRight: settings.itemSpacing, gap: settings.logoTextGap }}>
      {logoSrc && (
        <img
          className="ft-logo"
          src={logoSrc}
          alt={s.name}
          draggable={false}
          style={{ height: logoH, maxWidth: logoH * 5 }}
          onError={() => s.logoPath && onLogoError(s.logoPath)}
        />
      )}
      {hasText && (
        <span className="ft-text">
          {showName && s.name && (
            <span
              className="ft-name"
              style={{ color: s.style?.textColor ?? settings.textColor, fontWeight: s.style?.bold === false ? 400 : 700 }}
            >
              {s.name}
            </span>
          )}
          {s.text && (
            <span className="ft-tag" style={{ color: settings.taglineColor }}>
              {s.text}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

interface SequenceProps {
  ref?: Ref<HTMLDivElement>;
  items: Sponsor[];
  settings: TickerSettings;
  srcFor: (s: Sponsor) => string | null;
  onLogoError: (logoPath: string) => void;
  hidden?: boolean;
}

function Sequence({ ref, items, settings, srcFor, onLogoError, hidden }: SequenceProps) {
  return (
    <div className="ft-seq" ref={ref} aria-hidden={hidden || undefined}>
      {items.map((s) => (
        <Fragment key={s.id}>
          <Item sponsor={s} settings={settings} logoSrc={srcFor(s)} onLogoError={onLogoError} />
          {settings.showSeparator && settings.separatorChar && (
            <span className="ft-sep" style={{ marginRight: settings.itemSpacing, color: settings.taglineColor }}>
              {settings.separatorChar}
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

interface AnimMeta {
  anim: Animation;
  duration: number;
  direction: Direction;
}

/**
 * Seamless marquee. One "unit" contains the sponsor sequence repeated enough times to be at least
 * as wide as the viewport; the track holds two units and is translated by exactly one unit width
 * per loop, so the wrap-around is invisible. Motion runs as a compositor-driven Web Animation;
 * speed/direction changes re-time the animation while preserving the current position, without
 * re-rendering the sponsor DOM.
 */
export const TickerStrip = memo(function TickerStrip(props: TickerStripProps) {
  const { sponsors, settings, playback, active, restartToken, logoUrl, missingLogos, placeholder } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimMeta | null>(null);
  const runRef = useRef({ playback, active });
  runRef.current = { playback, active };

  const [containerW, setContainerW] = useState(0);
  const [seqW, setSeqW] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo(() => activeSponsors(sponsors), [sponsors]);
  const missing = useMemo(() => new Set([...missingLogos, ...failed]), [missingLogos, failed]);
  const srcFor = (s: Sponsor) => (s.logoPath && !missing.has(s.logoPath) ? logoUrl(s.logoPath) : null);
  const onLogoError = (p: string) => setFailed((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));

  // Forget failures when the logo set changes (e.g. a logo was replaced).
  useEffect(() => setFailed(new Set()), [sponsors]);

  useLayoutEffect(() => {
    const c = containerRef.current;
    const s = seqRef.current;
    if (!c) return;
    const measure = () => {
      setContainerW(c.getBoundingClientRect().width);
      setSeqW(s ? s.getBoundingClientRect().width : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    if (s) ro.observe(s);
    return () => ro.disconnect();
  }, [items.length > 0]);

  const repeats = seqW > 0 ? Math.max(1, Math.ceil(containerW / seqW)) : 1;
  const unitW = seqW * repeats;
  const copies = items.length ? repeats * 2 : 0;

  // (Re)build the animation when geometry, speed or direction change — keeping the visual position.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || unitW <= 0) {
      animRef.current?.anim.cancel();
      animRef.current = null;
      return;
    }
    const { speed, direction } = settings;
    const duration = (unitW / speed) * 1000;
    let progressRtl = 0; // 0..1, fraction of a unit scrolled in the right-to-left sense
    const prev = animRef.current;
    if (prev) {
      const t = Number(prev.anim.currentTime ?? 0) % prev.duration;
      const f = prev.duration > 0 ? t / prev.duration : 0;
      progressRtl = prev.direction === 'rtl' ? f : 1 - f;
      prev.anim.cancel();
    }
    const from = 'translate3d(0px,0,0)';
    const to = `translate3d(${-unitW}px,0,0)`;
    const anim = track.animate(direction === 'rtl' ? [{ transform: from }, { transform: to }] : [{ transform: to }, { transform: from }], {
      duration,
      iterations: Infinity,
      easing: 'linear',
    });
    anim.currentTime = (direction === 'rtl' ? progressRtl : 1 - progressRtl) * duration;
    const { playback: pb, active: act } = runRef.current;
    if (pb !== 'playing' || !act) anim.pause();
    animRef.current = { anim, duration, direction };
  }, [unitW, settings.speed, settings.direction]);

  // Play / pause / stop.
  useEffect(() => {
    const m = animRef.current;
    if (!m) return;
    if (playback === 'playing' && active) m.anim.play();
    else m.anim.pause();
    if (playback === 'stopped') m.anim.currentTime = 0;
  }, [playback, active, unitW]);

  // Restart from the beginning.
  useEffect(() => {
    const m = animRef.current;
    if (m && restartToken) m.anim.currentTime = 0;
  }, [restartToken]);

  useEffect(() => () => animRef.current?.anim.cancel(), []);

  return (
    <div
      ref={containerRef}
      className="ft-strip"
      style={{
        height: '100%',
        backgroundColor: hexToRgba(settings.backgroundColor, settings.backgroundOpacity),
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        color: settings.textColor,
      }}
    >
      {items.length > 0 ? (
        <div className="ft-track" ref={trackRef}>
          {Array.from({ length: copies || 1 }, (_, i) => (
            <Sequence
              key={i}
              ref={i === 0 ? seqRef : undefined}
              hidden={i > 0}
              items={items}
              settings={settings}
              srcFor={srcFor}
              onLogoError={onLogoError}
            />
          ))}
        </div>
      ) : (
        placeholder && <div className="ft-placeholder">{placeholder}</div>
      )}
    </div>
  );
});
