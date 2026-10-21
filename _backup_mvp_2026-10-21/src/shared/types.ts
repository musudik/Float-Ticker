// Shared data model for FloatTicker (used by main process and both renderers).

export type Direction = 'rtl' | 'ltr'; // rtl = content moves right → left (classic news ticker)
export type PlaybackState = 'stopped' | 'playing' | 'paused';

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
  /** Show the name next to the logo. When false and a logo exists, the entry is logo-only. */
  showName: boolean;
  enabled: boolean;
  order: number;
  style?: SponsorStyle;
}

export interface TickerSettings {
  direction: Direction;
  /** Scroll speed in pixels per second. */
  speed: number;
  /** Ticker (window) height in pixels. */
  height: number;
  fontSize: number;
  /** Gap between consecutive sponsors, px. */
  itemSpacing: number;
  /** Gap between a logo and its text, px. */
  logoTextGap: number;
  /** Logo height as a fraction of ticker height (0.3 – 1). */
  logoScale: number;
  textColor: string;
  taglineColor: string;
  backgroundColor: string;
  /** Background opacity 0 (fully transparent) – 1 (solid). */
  backgroundOpacity: number;
  fontFamily: string;
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

export interface AppData {
  version: 1;
  eventName: string;
  sponsors: Sponsor[];
  settings: TickerSettings;
  window: WindowSettings;
}

/** Runtime-only state (not persisted). */
export interface RuntimeState {
  playback: PlaybackState;
  visible: boolean;
}

export interface FullState {
  data: AppData;
  runtime: RuntimeState;
  /** Logo file names that are referenced but missing/unreadable on disk. */
  missingLogos: string[];
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
export type PositionPreset = 'bottom' | 'top' | 'center';

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

/** API exposed to renderers by the preload script as window.floatTicker. */
export interface FloatTickerApi {
  getState(): Promise<FullState>;
  onState(cb: (state: FullState) => void): () => void;
  updateData(patch: DataPatch): Promise<void>;
  playback(cmd: PlaybackCommand): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
  importLogo(): Promise<LogoImportResult>;
  /** Pick several logo files at once; each becomes a new sponsor named after its file. */
  importLogos(): Promise<Array<LogoImportResult & { fileName: string }>>;
  logoUrl(logoPath: string): string;
  getDisplays(): Promise<DisplayInfo[]>;
  moveToDisplay(displayId: number, preset: PositionPreset): Promise<void>;
  identifyDisplays(): Promise<void>;
  exportEvent(): Promise<FileOpResult>;
  importEvent(): Promise<FileOpResult>;
  newEvent(): Promise<void>;
  // ticker-window only
  setTickerBounds(bounds: Partial<WindowBounds>): void;
  isTickerWindow: boolean;
  platform: string;
}

export interface DataPatch {
  eventName?: string;
  sponsors?: Sponsor[];
  settings?: Partial<TickerSettings>;
  window?: Partial<Omit<WindowSettings, 'bounds'>>;
}

export const LOGO_PROTOCOL = 'ftlogo';
