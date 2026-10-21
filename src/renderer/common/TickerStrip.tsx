import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { isVertical, type Direction, type PlaybackState, type Sponsor, type TickerSettings } from '../../shared/types';
import { playlist } from '../../shared/defaults';

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

export function backgroundCss(s: TickerSettings): string {
  if (s.backgroundMode === 'gradient')
    return `linear-gradient(${s.gradientAngle}deg, ${hexToRgba(s.backgroundColor, s.backgroundOpacity)}, ${hexToRgba(
      s.backgroundColor2,
      s.backgroundOpacity,
    )})`;
  return hexToRgba(s.backgroundColor, s.backgroundOpacity);
}

/** Sizes shared by every item so logos line up. */
interface Metrics {
  vertical: boolean;
  /** Logo box height (horizontal: exact height; vertical: box height). */
  logoH: number;
  /** Logo max width (horizontal) / box width (vertical). */
  logoW: number;
  /** Max text width in vertical tickers. */
  textW: number;
}

function computeMetrics(settings: TickerSettings, items: Sponsor[], hasLogo: (s: Sponsor) => boolean): Metrics {
  const vertical = isVertical(settings.direction);
  const T = Math.max(16, settings.height - settings.borderWidth * 2);
  const labelAbove =
    settings.namePlacement === 'above' && items.some((s) => hasLogo(s) && s.showName && s.name.trim());
  const labelSpace = labelAbove ? settings.labelSize * 1.25 + 4 : 0;
  if (vertical) {
    const logoW = Math.max(12, Math.round((T - 12) * settings.logoScale));
    return { vertical, logoW, logoH: Math.round(logoW * 0.62), textW: Math.max(20, T - 12) };
  }
  const logoH = Math.max(8, Math.round(Math.min(T * settings.logoScale, T - labelSpace - 2)));
  return { vertical, logoH, logoW: logoH * 5, textW: 0 };
}

interface ItemProps {
  sponsor: Sponsor;
  settings: TickerSettings;
  metrics: Metrics;
  logoSrc: string | null;
  onLogoError: (logoPath: string) => void;
  /** Gap after the item along the scroll axis (0 in spotlight mode). */
  spacing: number;
}

function Item({ sponsor: s, settings, metrics, logoSrc, onLogoError, spacing }: ItemProps) {
  const showName = (!logoSrc || s.showName) && !!s.name;
  const above = !!logoSrc && settings.namePlacement === 'above';
  const nameStyle: CSSProperties = {
    color: s.style?.textColor ?? settings.textColor,
    fontWeight: s.style?.bold === false ? 400 : settings.fontWeight,
  };
  const logoStyle: CSSProperties = metrics.vertical
    ? { width: metrics.logoW, height: metrics.logoH }
    : { height: metrics.logoH, maxWidth: metrics.logoW };
  const img = logoSrc && (
    <img
      className="ft-logo"
      src={logoSrc}
      alt={s.name}
      draggable={false}
      style={logoStyle}
      onError={() => s.logoPath && onLogoError(s.logoPath)}
    />
  );
  const sideName = showName && !above;
  const hasText = sideName || !!s.text;

  return (
    <div
      className={`ft-item${metrics.vertical ? ' v' : ''}`}
      style={{
        [metrics.vertical ? 'marginBottom' : 'marginRight']: spacing,
        gap: settings.logoTextGap,
        maxWidth: metrics.vertical ? metrics.textW : undefined,
      }}
    >
      {above ? (
        <div className="ft-logo-block">
          {showName && (
            <span className="ft-label" style={{ ...nameStyle, fontSize: settings.labelSize }}>
              {s.name}
            </span>
          )}
          {img}
        </div>
      ) : (
        img
      )}
      {hasText && (
        <span className="ft-text">
          {sideName && (
            <span className="ft-name" style={nameStyle}>
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
  metrics: Metrics;
  srcFor: (s: Sponsor) => string | null;
  onLogoError: (logoPath: string) => void;
  hidden?: boolean;
}

function Sequence({ ref, items, settings, metrics, srcFor, onLogoError, hidden }: SequenceProps) {
  const sepStyle: CSSProperties = {
    [metrics.vertical ? 'marginBottom' : 'marginRight']: settings.itemSpacing,
    color: settings.taglineColor,
  };
  return (
    <div className="ft-seq" ref={ref} aria-hidden={hidden || undefined}>
      {items.map((s, i) => [
        <Item
          key={`i${i}`}
          sponsor={s}
          settings={settings}
          metrics={metrics}
          logoSrc={srcFor(s)}
          onLogoError={onLogoError}
          spacing={settings.itemSpacing}
        />,
        settings.showSeparator && settings.separatorChar ? (
          <span key={`s${i}`} className="ft-sep" style={sepStyle}>
            {settings.separatorChar}
          </span>
        ) : null,
      ])}
    </div>
  );
}

interface AnimMeta {
  anim: Animation;
  duration: number;
  direction: Direction;
}

interface ContentProps {
  items: Sponsor[];
  settings: TickerSettings;
  metrics: Metrics;
  playback: PlaybackState;
  active: boolean;
  restartToken: number;
  srcFor: (s: Sponsor) => string | null;
  onLogoError: (logoPath: string) => void;
}

/**
 * Seamless marquee. One "unit" contains the sponsor sequence repeated enough times to be at least
 * as long as the viewport; the track holds two units and is translated by exactly one unit per loop,
 * so the wrap-around is invisible. Motion runs as a compositor-driven Web Animation; speed/direction
 * changes re-time the animation while preserving the current position, without re-rendering sponsors.
 */
function Marquee({ items, settings, metrics, playback, active, restartToken, srcFor, onLogoError }: ContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimMeta | null>(null);
  const runRef = useRef({ playback, active });
  runRef.current = { playback, active };
  const vertical = metrics.vertical;

  const [containerLen, setContainerLen] = useState(0);
  const [seqLen, setSeqLen] = useState(0);

  useLayoutEffect(() => {
    const c = containerRef.current;
    const s = seqRef.current;
    if (!c) return;
    const measure = () => {
      const cr = c.getBoundingClientRect();
      const sr = s?.getBoundingClientRect();
      setContainerLen(vertical ? cr.height : cr.width);
      setSeqLen(sr ? (vertical ? sr.height : sr.width) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    if (s) ro.observe(s);
    return () => ro.disconnect();
  }, [vertical]);

  const repeats = seqLen > 0 ? Math.max(1, Math.ceil(containerLen / seqLen)) : 1;
  const unit = seqLen * repeats;
  const copies = repeats * 2;

  // (Re)build the animation when geometry, speed or direction change — keeping the visual position.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || unit <= 0) {
      animRef.current?.anim.cancel();
      animRef.current = null;
      return;
    }
    const { speed, direction } = settings;
    const duration = (unit / speed) * 1000;
    // "forward" = content moves toward the start (right→left, or bottom→top).
    const forward = direction === 'rtl' || direction === 'btt';
    let progress = 0; // 0..1 of a unit, in the forward sense
    const prev = animRef.current;
    if (prev) {
      const t = Number(prev.anim.currentTime ?? 0) % prev.duration;
      const f = prev.duration > 0 ? t / prev.duration : 0;
      const prevForward = prev.direction === 'rtl' || prev.direction === 'btt';
      progress = prevForward ? f : 1 - f;
      if (isVertical(prev.direction) !== vertical) progress = 0;
      prev.anim.cancel();
    }
    const from = 'translate3d(0px,0px,0)';
    const to = vertical ? `translate3d(0px,${-unit}px,0)` : `translate3d(${-unit}px,0px,0)`;
    const anim = track.animate(forward ? [{ transform: from }, { transform: to }] : [{ transform: to }, { transform: from }], {
      duration,
      iterations: Infinity,
      easing: 'linear',
    });
    anim.currentTime = (forward ? progress : 1 - progress) * duration;
    const { playback: pb, active: act } = runRef.current;
    if (pb !== 'playing' || !act) anim.pause();
    animRef.current = { anim, duration, direction };
  }, [unit, settings.speed, settings.direction, vertical]);

  // Play / pause / stop.
  useEffect(() => {
    const m = animRef.current;
    if (!m) return;
    if (playback === 'playing' && active) m.anim.play();
    else m.anim.pause();
    if (playback === 'stopped') m.anim.currentTime = 0;
  }, [playback, active, unit]);

  // Restart from the beginning.
  useEffect(() => {
    const m = animRef.current;
    if (m && restartToken) m.anim.currentTime = 0;
  }, [restartToken]);

  useEffect(() => () => animRef.current?.anim.cancel(), []);

  return (
    <div ref={containerRef} className="ft-viewport">
      <div className={`ft-track${vertical ? ' v' : ''}`} ref={trackRef}>
        {Array.from({ length: copies }, (_, i) => (
          <Sequence
            key={i}
            ref={i === 0 ? seqRef : undefined}
            hidden={i > 0}
            items={items}
            settings={settings}
            metrics={metrics}
            srcFor={srcFor}
            onLogoError={onLogoError}
          />
        ))}
      </div>
    </div>
  );
}

const IN = 'cubic-bezier(.2,.8,.25,1)';
const OUT = 'cubic-bezier(.6,0,.8,.3)';

/** Keyframes for one spotlight appearance: enter → hold → exit. */
function spotlightFrames(
  s: TickerSettings,
  inOff: number,
  outOff: number,
  box: { w: number; h: number },
  el: { w: number; h: number },
): Keyframe[] {
  const shown: Keyframe = { opacity: 1, transform: 'none' };
  const hold = (k: Keyframe = {}): Keyframe[] => [
    { ...shown, offset: inOff, easing: 'linear', ...k },
    { ...shown, offset: outOff, easing: OUT, ...k },
  ];
  const vertical = isVertical(s.direction);
  const forward = s.direction === 'rtl' || s.direction === 'btt';
  const dist = vertical ? (box.h + el.h) / 2 + 4 : (box.w + el.w) / 2 + 4;
  const tr = (d: number) => (vertical ? `translate3d(0,${d}px,0)` : `translate3d(${d}px,0,0)`);
  const enter = forward ? dist : -dist;
  switch (s.transition) {
    case 'none':
      return [{ ...shown, offset: 0 }, { ...shown, offset: 1 }];
    case 'fade':
      return [{ opacity: 0, transform: 'none', offset: 0, easing: IN }, ...hold(), { opacity: 0, transform: 'none', offset: 1 }];
    case 'slide':
      return [{ opacity: 1, transform: tr(enter), offset: 0, easing: IN }, ...hold(), { opacity: 1, transform: tr(-enter), offset: 1 }];
    case 'bounce': {
      const drop = vertical ? box.w : box.h;
      const y = (d: number) => (vertical ? `translate3d(${d}px,0,0)` : `translate3d(0,${d}px,0)`);
      const span = inOff;
      return [
        { opacity: 0, transform: y(-drop), offset: 0, easing: 'cubic-bezier(.5,0,1,1)' },
        { opacity: 1, transform: y(0), offset: span * 0.55, easing: 'ease-out' },
        { opacity: 1, transform: y(-drop * 0.18), offset: span * 0.75, easing: 'ease-in' },
        { opacity: 1, transform: y(0), offset: span * 0.9, easing: 'ease-out' },
        { opacity: 1, transform: y(-drop * 0.05), offset: span * 0.96, easing: 'ease-in' },
        ...hold(),
        { opacity: 0, transform: y(drop * 0.6), offset: 1 },
      ];
    }
    case 'zoom':
      return [
        { opacity: 0, transform: 'scale(0.25)', offset: 0, easing: IN },
        { opacity: 1, transform: 'scale(1.06)', offset: inOff * 0.75, easing: 'ease-in-out' },
        ...hold(),
        { opacity: 0, transform: 'scale(1.3)', offset: 1 },
      ];
    case 'flip': {
      const axis = vertical ? 'rotateY' : 'rotateX';
      return [
        { opacity: 0, transform: `perspective(600px) ${axis}(90deg)`, offset: 0, easing: IN },
        ...hold({ transform: `perspective(600px) ${axis}(0deg)` }),
        { opacity: 0, transform: `perspective(600px) ${axis}(-90deg)`, offset: 1 },
      ];
    }
  }
}

/**
 * One sponsor at a time, centred, with an entry/exit transition. Each appearance is a single Web
 * Animation (enter → hold → exit), followed by an optional blank pause; pausing playback simply
 * pauses the current animation, so timing resumes exactly where it stopped.
 */
function Spotlight({ items, settings, metrics, playback, active, restartToken, srcFor, onLogoError }: ContentProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const [step, setStep] = useState({ n: 0, gap: false, run: 0 });
  const live = useRef({ items, settings, playback, active });
  live.current = { items, settings, playback, active };

  const idx = items.length ? step.n % items.length : 0;
  const current = items[idx];

  // Jump back to the first sponsor on restart / stop.
  useEffect(() => {
    if (restartToken) setStep((p) => ({ n: 0, gap: false, run: p.run + 1 }));
  }, [restartToken]);
  useEffect(() => {
    if (playback === 'stopped') setStep((p) => ({ n: 0, gap: false, run: p.run + 1 }));
  }, [playback]);

  useLayoutEffect(() => {
    const { items: list, settings: s, playback: pb, active: act } = live.current;
    if (!list.length) return;
    const sponsor = list[step.n % list.length];
    let anim: Animation;
    if (step.gap) {
      const pauseMs = (sponsor.pauseSec ?? s.pauseSec) * 1000;
      anim = new Animation(new KeyframeEffect(null, [], { duration: Math.max(1, pauseMs) }), document.timeline);
      anim.play();
    } else {
      const el = elRef.current;
      const box = boxRef.current;
      if (!el || !box) return;
      const holdMs = (sponsor.durationSec ?? s.holdSec) * 1000;
      const tMs = s.transition === 'none' ? 0 : Math.min(s.transitionMs, 2000);
      const total = holdMs + tMs * 2;
      const inOff = tMs / total;
      const br = box.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      anim = el.animate(spotlightFrames(s, inOff, 1 - inOff, { w: br.width, h: br.height }, { w: er.width, h: er.height }), {
        duration: total,
        fill: 'both',
      });
    }
    if (pb !== 'playing' || !act) anim.pause();
    anim.onfinish = () => {
      const { items: l, settings: st } = live.current;
      const cur = l[step.n % Math.max(1, l.length)];
      const pauseSec = cur ? cur.pauseSec ?? st.pauseSec : 0;
      setStep((p) => (!p.gap && pauseSec > 0 ? { ...p, gap: true } : { ...p, n: p.n + 1, gap: false }));
    };
    animRef.current = anim;
    return () => {
      anim.onfinish = null;
      anim.cancel();
    };
  }, [step, items.length]);

  useEffect(() => {
    const a = animRef.current;
    if (!a) return;
    if (playback === 'playing' && active) a.play();
    else a.pause();
  }, [playback, active]);

  return (
    <div ref={boxRef} className="ft-viewport ft-spot">
      {current && !step.gap && (
        <div ref={elRef} className="ft-spot-item" key={`${step.run}-${step.n}`}>
          <Item sponsor={current} settings={settings} metrics={metrics} logoSrc={srcFor(current)} onLogoError={onLogoError} spacing={0} />
        </div>
      )}
    </div>
  );
}

export const TickerStrip = memo(function TickerStrip(props: TickerStripProps) {
  const { sponsors, settings, playback, active, restartToken, logoUrl, missingLogos, placeholder } = props;
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo(() => playlist(sponsors), [sponsors]);
  const missing = useMemo(() => new Set([...missingLogos, ...failed]), [missingLogos, failed]);
  const srcFor = (s: Sponsor) => (s.logoPath && !missing.has(s.logoPath) ? logoUrl(s.logoPath) : null);
  const onLogoError = (p: string) => setFailed((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));
  const metrics = useMemo(() => computeMetrics(settings, items, (s) => !!s.logoPath && !missing.has(s.logoPath)), [settings, items, missing]);

  // Forget failures when the logo set changes (e.g. a logo was replaced).
  useEffect(() => setFailed(new Set()), [sponsors]);

  const vertical = metrics.vertical;
  const shadow = settings.shadow;
  const style: CSSProperties = {
    height: '100%',
    background: backgroundCss(settings),
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    fontStyle: settings.italic ? 'italic' : undefined,
    textTransform: settings.uppercase ? 'uppercase' : undefined,
    letterSpacing: settings.letterSpacing ? `${settings.letterSpacing}px` : undefined,
    color: settings.textColor,
    border: settings.borderWidth ? `${settings.borderWidth}px solid ${settings.borderColor}` : undefined,
    borderRadius: settings.borderRadius || undefined,
    ['--ft-shadow' as string]: shadow ? `0 1px ${shadow}px rgba(0,0,0,.85)` : 'none',
    ['--ft-logo-shadow' as string]: shadow ? `drop-shadow(0 1px ${Math.max(1, shadow / 2)}px rgba(0,0,0,.75))` : 'none',
  };
  const content: ContentProps = { items, settings, metrics, playback, active, restartToken, srcFor, onLogoError };

  return (
    <div className={`ft-strip${vertical ? ' v' : ''}`} style={style}>
      {items.length === 0 ? (
        placeholder && <div className="ft-placeholder">{placeholder}</div>
      ) : settings.mode === 'spotlight' ? (
        <Spotlight {...content} />
      ) : (
        // Remount on orientation change so the measurement/animation start clean.
        <Marquee key={vertical ? 'v' : 'h'} {...content} />
      )}
    </div>
  );
});
