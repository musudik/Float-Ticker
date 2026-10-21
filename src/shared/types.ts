// Shared data model for FloatTicker (used by main process and both renderers).

/** rtl/ltr = horizontal ticker, btt/ttb = vertical ticker (bottom→top / top→bottom). */
export type Direction = 'rtl' | 'ltr' | 'btt' | 'ttb';
export type PlaybackState = 'stopped' | 'playing' | 'paused';
/** marquee = continuous scroll; spotlight = one sponsor at a time with entry/exit transitions. */
export type AnimationMode = 'marquee' | 'spotlight';
export type Transition = 'slide' | 'fade' | 'bounce' | 'zoom' | 'flip' | 'none';
/** Where a sponsor's name sits relative to its logo. */
export type NamePlacement = 'above' | 'side';
export type BackgroundMode = 'solid' | 'gradient';

export const isVertical = (d: Direction) => d === 'btt' || d === 'ttb';

export interface SponsorStyle {
  /** Overrides the global text colour for this sponsor. */
  textColor?: string;
  /** Render the sponsor name in bold. */
  bold?: boolean;
}

export interface Sponsor {
  id: string;
  name: string;
  /** File name inside the app's local logo library (not an absolute path). Optional for text-only sponsors. */
  logoPath?: string;
  /** Optional tagline, offer or message. */
  text?: string;
  /** Show the name with the logo (above or beside it, per ticker setting). When false and a logo exists, the entry is logo-only. */
  showName: boolean;
  enabled: boolean;
  order: number;
  style?: SponsorStyle;
  /** Spotlight mode: seconds this sponsor stays on screen (overrides the ticker default). */
  durationSec?: number;
  /** Spotlight mode: blank pause after this sponsor, seconds (overrides the ticker default). */
  pauseSec?: number;
  /** How many times the sponsor appears per loop (1–5), spread evenly. */
  frequency?: number;
}

export interface TickerSettings {
  direction: Direction;
  mode: AnimationMode;
  /** Marquee scroll speed in pixels per second. */
  speed: number;
  /** Spotlight: entry/exit effect. */
  transition: Transition;
  /** Spotlight: entry/exit effect length, ms. */
  transitionMs: number;
  /** Spotlight: default seconds each sponsor is shown. */
  holdSec: number;
  /** Spotlight: default blank pause between sponsors, seconds. */
  pauseSec: number;
  /** Ticker thickness in px: window height for horizontal tickers, window width for vertical ones. */
  height: number;
  fontSize: number;
  /** Gap between consecutive sponsors, px. */
  itemSpacing: number;
  /** Gap between a logo and its text, px. */
  logoTextGap: number;
  /** Logo height as a fraction of ticker height (0.3 – 1). */
  logoScale: number;
  namePlacement: NamePlacement;
  /** Font size of the name when shown above the logo, px. */
  labelSize: number;
  textColor: string;
  taglineColor: string;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundColor2: string;
  gradientAngle: number;
  /** Background opacity 0 (fully transparent) – 1 (solid). */
  backgroundOpacity: number;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  /** Drop shadow strength behind text and logos, 0 = off. */
  shadow: number;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  uppercase: boolean;
  /** Letter spacing in px. */
  letterSpacing: number;
  showSeparator: boolean;
  separatorChar: string;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowSettings {
  alwaysOnTop: boolean;
  locked: boolean;
  bounds: WindowBounds | null;
  displayId: number | null;
}

export interface TickerConfig {
  id: string;
  name: string;
  sponsors: Sponsor[];
  settings: TickerSettings;
  window: WindowSettings;
}

export interface AppData {
  version: 2;
  eventName: string;
  tickers: TickerConfig[];
}

/** Runtime-only state for one ticker (not persisted). */
export interface TickerRuntime {
  playback: PlaybackState;
  visible: boolean;
}

export interface ProfileMeta {
  id: string;
  name: string;
  savedAt: string;
  tickerCount: number;
  sponsorCount: number;
}

export interface StylePreset {
  id: string;
  name: string;
  builtIn?: boolean;
  settings: Partial<TickerSettings>;
}

export interface Library {
  profiles: ProfileMeta[];
  stylePresets: StylePreset[];
}

export interface FullState {
  data: AppData;
  runtime: Record<string, TickerRuntime>;
  /** Logo file names that are referenced but missing/unreadable on disk. */
  missingLogos: string[];
  library: Library;
}

export interface DisplayInfo {
  id: number;
  label: string;
  index: number;
  primary: boolean;
  bounds: WindowBounds;
  workArea: WindowBounds;
  scaleFactor: number;
}

export type PlaybackCommand = 'start' | 'pause' | 'resume' | 'stop' | 'restart';
export type PositionPreset = 'bottom' | 'top' | 'center' | 'left' | 'right';
/** A ticker id, or 'all' for every ticker. */
export type TickerTarget = string | 'all';

export interface LogoImportResult {
  ok: boolean;
  logoPath?: string;
  error?: string;
}

export interface FileOpResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  path?: string;
}

export interface TickerPatch {
  name?: string;
  sponsors?: Sponsor[];
  settings?: Partial<TickerSettings>;
  window?: Partial<Omit<WindowSettings, 'bounds'>>;
}

/** API exposed to renderers by the preload script as window.floatTicker. */
export interface FloatTickerApi {
  getState(): Promise<FullState>;
  onState(cb: (state: FullState) => void): () => void;
  setEventName(name: string): Promise<void>;
  updateTicker(tickerId: string, patch: TickerPatch): Promise<void>;
  /** Adds a ticker (a copy of `copyFrom` if given) and returns its id. */
  addTicker(copyFrom?: string): Promise<string>;
  removeTicker(tickerId: string): Promise<void>;
  playback(target: TickerTarget, cmd: PlaybackCommand): Promise<void>;
  setVisible(target: TickerTarget, visible: boolean): Promise<void>;
  importLogo(): Promise<LogoImportResult>;
  /** Pick several logo files at once; each becomes a new sponsor named after its file. */
  importLogos(): Promise<Array<LogoImportResult & { fileName: string }>>;
  logoUrl(logoPath: string): string;
  getDisplays(): Promise<DisplayInfo[]>;
  moveToDisplay(tickerId: string, displayId: number, preset: PositionPreset): Promise<void>;
  identifyDisplays(): Promise<void>;
  exportEvent(): Promise<FileOpResult>;
  importEvent(): Promise<FileOpResult>;
  newEvent(): Promise<void>;
  // reusable profiles & presets
  saveProfile(name: string, overwriteId?: string): Promise<void>;
  loadProfile(id: string): Promise<FileOpResult>;
  deleteProfile(id: string): Promise<void>;
  saveStylePreset(name: string, settings: Partial<TickerSettings>): Promise<void>;
  deleteStylePreset(id: string): Promise<void>;
  // ticker-window only
  setTickerBounds(bounds: Partial<WindowBounds>): void;
  /** Id of the ticker this window displays (ticker windows only). */
  tickerId: string | null;
  isTickerWindow: boolean;
  platform: string;
}

export const LOGO_PROTOCOL = 'ftlogo';
