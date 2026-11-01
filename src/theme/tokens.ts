/**
 * Central design tokens. Every component reads colours from the active theme (useTheme()),
 * never from literals, so Dark / Light / System switch instantly everywhere — including charts.
 * This file is pure TypeScript (no react-native import) so it can be unit-tested.
 */
import type { Category } from '../domain/types';

export type ThemeName = 'dark' | 'light';
export type ThemePreference = ThemeName | 'system';

export type Palette = {
  bg: string; surface: string; surfaceRaised: string; surfaceSunken: string; border: string; borderStrong: string;
  text: string; textMuted: string; textFaint: string;
  accent: string; accentSoft: string; onAccent: string;
  success: string; successSoft: string; warning: string; warningSoft: string; danger: string; dangerSoft: string;
  overlay: string; shadow: string; track: string; focusRing: string;
  /** Primary "ink" action colour (buttons, selected pills, active tab): near-black in light mode, near-white in dark mode. */
  ink: string; onInk: string;
  /** Always-dark hero surface (progress card, running timer) with the lime highlight used on it. */
  hero: string; heroText: string; heroMuted: string; heroTrack: string; lime: string; onLime: string;
  /** Vertical background gradient stops, top → bottom (lilac → cream → peach → lilac). */
  grad: string[];
  /** Status accents used on timetable cards. */
  blue: string; violet: string;
  /** Categorical series for charts, ordered for maximum separation. */
  series: string[];
  /** Heatmap intensity 0..4. */
  heat: [string, string, string, string, string];
  category: Record<Category, string>;
};

const dark: Palette = {
  bg: '#16111F', surface: '#221C2E', surfaceRaised: '#2A2338', surfaceSunken: '#1B1626', border: '#33293F', borderStrong: '#4A3F5C',
  text: '#F7F3FB', textMuted: '#BDB5CC', textFaint: '#A29AB4',
  accent: '#BBA8FF', accentSoft: '#2F2650', onAccent: '#14101F',
  success: '#4BE0A8', successSoft: '#143329', warning: '#F7BD55', warningSoft: '#3A2D12', danger: '#FF8F99', dangerSoft: '#3C1B22',
  overlay: 'rgba(8,5,14,0.72)', shadow: '#000000', track: '#2F2740', focusRing: '#CDBFFF',
  ink: '#F7F3FB', onInk: '#16111F',
  hero: '#2B2A31', heroText: '#FFFFFF', heroMuted: '#A9A7B3', heroTrack: '#46453A', lime: '#D8E67F', onLime: '#1A2108',
  grad: ['#2D2150', '#1D1730', '#221826', '#1C1530'],
  blue: '#5B8CFF', violet: '#A98BEF',
  series: ['#BBA8FF', '#4BE0A8', '#F7BD55', '#74D6F7', '#FF8F99', '#D8E67F', '#FFA373', '#8FA8FF'],
  heat: ['#241E31', '#352C5A', '#4D3F95', '#7B5EDB', '#BBA8FF'],
  category: {
    study: '#BBA8FF', exercise: '#4BE0A8', sleep: '#6C77C2', rest: '#8E9AD6', meal: '#F7BD55', cooking: '#FFA373',
    college: '#E79BFF', personal: '#5CD3F0', break: '#9A93AE', leisure: '#B6D86B', other: '#BDB5CC',
  },
};

const light: Palette = {
  bg: '#F6EAEA', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#F4ECF2', border: '#EBDFE8', borderStrong: '#C9BBD3',
  text: '#17161C', textMuted: '#55515F', textFaint: '#6A6576',
  accent: '#6A4BE0', accentSoft: '#EEE8FF', onAccent: '#FFFFFF',
  success: '#0A7048', successSoft: '#DFF5E8', warning: '#8F5200', warningSoft: '#FFEBD2', danger: '#C0243A', dangerSoft: '#FFE2E6',
  overlay: 'rgba(23,22,28,0.46)', shadow: '#5B4570', track: '#EADFEA', focusRing: '#6A4BE0',
  ink: '#141318', onInk: '#FFFFFF',
  hero: '#26262B', heroText: '#FFFFFF', heroMuted: '#A9A7B3', heroTrack: '#46453A', lime: '#D8E67F', onLime: '#1A2108',
  grad: ['#DDBDF4', '#F4E0E6', '#F6E6DA', '#F1D2C5', '#DCC5F3'],
  blue: '#2F6BFF', violet: '#A98BEF',
  series: ['#6A4BE0', '#0A7048', '#B36B00', '#0A7EA4', '#C0243A', '#5E7D12', '#C25512', '#3550D6'],
  heat: ['#F1E8F1', '#DDD0FA', '#BCA6F5', '#8F6EEA', '#6A4BE0'],
  category: {
    study: '#6A4BE0', exercise: '#0A7048', sleep: '#4A5694', rest: '#5F72B5', meal: '#B36B00', cooking: '#C25512',
    college: '#9A3FC4', personal: '#0A7EA4', break: '#6B7488', leisure: '#5E7D12', other: '#6A6576',
  },
};

export const palettes: Record<ThemeName, Palette> = { dark, light };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 22, xl: 30, pill: 999 } as const;
/** Minimum touch target (dp) — Material/WCAG 2.5.5 guidance. */
export const MIN_TOUCH = 48;

export const type = {
  hero: { fontSize: 44, lineHeight: 50, fontWeight: '800' as const, letterSpacing: -1.4 },
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -1 },
  displayLight: { fontSize: 34, lineHeight: 40, fontWeight: '300' as const, letterSpacing: -1 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  mono: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
} as const;
/**
 * Type scale factor for a viewport width. Text keeps its normal size on every real phone, tablet and desktop; only
 * extremely narrow windows (< 340 px) get a mild reduction. Everything else shrinks locally, only where it would
 * overflow (see the `fit` prop on Text).
 */
export function typeScaleFor(width: number): number {
  return width < 340 ? 0.92 : 1;
}

/** Scales every size in the type scale, with readable floors (body ≥ 14, small text ≥ 12). Letter spacing is unchanged. */
export function scaleType<T extends Record<string, { fontSize: number; lineHeight: number }>>(base: T, factor: number): T {
  if (factor === 1) return base;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    const small = v.fontSize <= 13;
    const size = Math.max(small ? 12 : 14, Math.round(v.fontSize * factor));
    const lh = Math.round((v.lineHeight / v.fontSize) * size);
    out[k] = { ...v, fontSize: size, lineHeight: lh };
  }
  return out as T;
}

export type TypeToken = keyof typeof type;

/** Content is centred and capped on wide screens (tablets, web); at phone widths it fills the screen. */
export const layout = { contentMaxWidth: 1080, sidebarBreakpoint: 960 } as const;

/** Shared responsive measurements used by web, tablet and phone layouts. */
export function responsiveMetrics(width: number) {
  const safeWidth = Math.max(320, width || 320);
  const compact = safeWidth < 480;
  const tablet = safeWidth >= 680;
  const desktop = safeWidth >= layout.sidebarBreakpoint;
  const horizontalPadding = compact ? 16 : desktop ? 32 : 24;
  return {
    compact,
    tablet,
    desktop,
    horizontalPadding,
    contentWidth: Math.min(layout.contentMaxWidth, safeWidth - horizontalPadding * 2),
    columns: safeWidth >= 1120 ? 3 : safeWidth >= 680 ? 2 : 1,
  } as const;
}

export const motion = { fast: 120, base: 200, slow: 320 } as const;

/** Add transparency to a #rrggbb colour (used for soft category tints). Other formats are returned unchanged. */
export function tint(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${color}${a}`;
}

/** Resolve the effective scheme from the stored preference and the OS scheme. Light is the default experience (matches the design reference). */
export function resolveScheme(pref: ThemePreference | undefined, system: 'dark' | 'light' | null | undefined): ThemeName {
  if (pref === 'light' || pref === 'dark') return pref;
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return 'light';
}

/* ---- WCAG contrast helpers (used by tests to guard accessibility) ---- */
function channel(c: number): number { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
