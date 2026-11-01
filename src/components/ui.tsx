import React, { useMemo } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text as RNText, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import { layout, responsiveMetrics, tint, type TypeToken } from '../theme/tokens';
import { Reveal, usePressScale, useToggleAnim, useTween } from './motion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Visible keyboard-focus ring (web / hardware keyboards). Native touch UIs never report `focused`. */
export function focusRing(t: Theme, focused: boolean | undefined): ViewStyle {
  if (!focused || Platform.OS !== 'web') return {};
  return { outlineStyle: 'solid', outlineWidth: 3, outlineColor: t.colors.focusRing, outlineOffset: 2 } as unknown as ViewStyle;
}
const softShadow = (t: Theme, strength = 1): ViewStyle => ({
  shadowColor: t.colors.shadow, shadowOffset: { width: 0, height: 8 * strength }, shadowOpacity: (t.isDark ? 0.3 : 0.09) * strength, shadowRadius: 24 * strength, elevation: 3 * strength,
});

/* ---------- Text ---------- */
type TextProps = {
  variant?: TypeToken; tone?: 'default' | 'muted' | 'faint' | 'accent' | 'success' | 'warning' | 'danger' | 'onAccent' | 'hero' | 'heroMuted' | 'onInk' | 'onLime';
  style?: StyleProp<TextStyle>; children?: React.ReactNode; numberOfLines?: number; accessibilityRole?: 'header' | 'text';
  align?: 'left' | 'center' | 'right';
  /** Shrink (down to ~70%) only if the text would not fit on its line(s). Use on titles, numbers and labels in tight spots. */
  fit?: boolean;
};
export function Text({ variant = 'body', tone = 'default', style, children, numberOfLines, accessibilityRole, align, fit }: TextProps) {
  const t = useTheme();
  const c = t.colors;
  const color = { default: c.text, muted: c.textMuted, faint: c.textFaint, accent: c.accent, success: c.success, warning: c.warning, danger: c.danger, onAccent: c.onAccent, hero: c.heroText, heroMuted: c.heroMuted, onInk: c.onInk, onLime: c.onLime }[tone];
  // flexShrink lets text wrap inside rows instead of pushing past the screen edge; the multiplier cap keeps huge system fonts from breaking layouts.
  const lines = fit ? (numberOfLines ?? 1) : numberOfLines;
  return <RNText accessibilityRole={accessibilityRole} numberOfLines={lines} adjustsFontSizeToFit={fit} minimumFontScale={fit ? 0.7 : undefined} maxFontSizeMultiplier={1.25} style={[t.type[variant], { color, textAlign: align, flexShrink: 1 }, style]}>{children}</RNText>;
}

/* ---------- Layout ---------- */
type ScreenProps = { children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode; edges?: ('top' | 'bottom')[]; contentStyle?: StyleProp<ViewStyle>; refreshing?: boolean };

const hexToRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Linear interpolation across evenly spaced gradient stops. */
function sampleGradient(stops: string[], f: number): string {
  const x = Math.max(0, Math.min(1, f)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), k = x - i;
  const a = hexToRgb(stops[i]!), b = hexToRgb(stops[i + 1]!);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j]! - v) * k)).join(',')})`;
}
const BANDS = 48;

/** Web: the content column grows on big monitors so wide screens are not mostly empty gradient. */
export const webContentWidth = (winW: number) => (winW >= 1700 ? 1320 : winW >= 1440 ? 1200 : layout.contentMaxWidth);

/**
 * The reference's soft lilac → cream → peach → lilac gradient. Web uses a real CSS gradient; native stacks thin
 * interpolated bands (no extra dependency, identical look, never banded because adjacent bands differ by 1–2 levels).
 */
/** True inside a screen group that already paints one shared gradient behind all of its screens (the tabs). */
export const SharedAmbientContext = React.createContext(false);

export const Ambient = React.memo(function Ambient() {
  const t = useTheme();
  const stops = t.colors.grad;
  const bands = useMemo(() => Array.from({ length: BANDS }, (_, i) => sampleGradient(stops, (i + 0.5) / BANDS)), [stops]);
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
  if (Platform.OS === 'web') {
    const css = `linear-gradient(170deg, ${stops.map((c, i) => `${c} ${Math.round((i / (stops.length - 1)) * 100)}%`).join(', ')})`;
    return <View pointerEvents="none" style={[fill, { backgroundImage: css } as unknown as ViewStyle]} />;
  }
  return (
    <View pointerEvents="none" style={[fill, { flexDirection: 'column' }]}>
      {bands.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
    </View>
  );
});

/** Safe-area + keyboard-aware screen container. Use `scroll` for forms and long content. */
export function Screen({ children, scroll = true, padded = true, footer, edges = ['top'], contentStyle }: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const shared = React.useContext(SharedAmbientContext);
  const winW = useWindowDimensions().width;
  const metrics = responsiveMetrics(winW);
  // Web only: roomier desktop pages (extra headroom above the header, a wider column on big monitors).
  const webDesktop = Platform.OS === 'web' && metrics.desktop;
  const pad = padded ? metrics.horizontalPadding : 0;
  const content = { width: '100%' as const, maxWidth: Platform.OS === 'web' ? webContentWidth(winW) : layout.contentMaxWidth, paddingHorizontal: pad, paddingTop: padded ? (webDesktop ? t.spacing.xxl : t.spacing.md) : 0, paddingBottom: pad + t.spacing.xxl, gap: t.spacing.md + 2 };
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center', flexGrow: 1 }} showsVerticalScrollIndicator={false}>
      <View style={[content, contentStyle]}>{children}</View>
    </ScrollView>
  ) : <View style={{ flex: 1, alignItems: 'center' }}><View style={[{ flex: 1, ...content }, contentStyle]}>{children}</View></View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: shared ? 'transparent' : t.colors.bg }}>
      {shared ? null : <Ambient />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer ? (
          <View style={{ alignItems: 'center', paddingHorizontal: pad, paddingTop: t.spacing.md, paddingBottom: t.spacing.md + (edges.includes('bottom') ? 0 : Math.min(insets.bottom, 16)), backgroundColor: t.colors.bg, borderTopWidth: 1, borderTopColor: t.colors.border }}>
            <View style={{ width: '100%', maxWidth: layout.contentMaxWidth }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Page heading: a quiet lead line over a bold title, with round action buttons on the right.
 * `lead` is the small line above the title; `subtitle` the muted line below it.
 */
export function PageHeader({ title, subtitle, lead, light, action }: { title: string; subtitle?: string; lead?: string; /** Thin first line above the bold title ("Let’s make" / "Today productive"). */ light?: string; action?: React.ReactNode }) {
  const t = useTheme();
  const w = useWindowDimensions().width;
  const narrow = w < 520;
  const heading = (
    <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityRole="header" accessibilityLabel={`${light ? `${light} ` : ''}${title}`}>
      {light ? <Text variant="displayLight" fit numberOfLines={1}>{light}</Text> : null}
      <Text variant="display" fit numberOfLines={2}>{title}</Text>
      {subtitle ? <Text variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
  );
  if (narrow && action) {
    return (
      <Reveal index={0}>
        <View style={{ gap: t.spacing.md }}>
          <Row between>
            <Text variant="bodyStrong" tone="muted" numberOfLines={1} style={{ flex: 1 }}>{lead ?? ''}</Text>
            <View>{action}</View>
          </Row>
          {heading}
        </View>
      </Reveal>
    );
  }
  return (
    <Reveal index={0}>
      <Row between align="flex-end" style={{ paddingTop: t.spacing.xs }}>
        {heading}
        {action ? <View style={{ marginLeft: t.spacing.md }}>{action}</View> : null}
      </Row>
    </Reveal>
  );
}

/** The app mark (same artwork as the launcher icon): lime progress ring + white pulse line on charcoal. */
export function BrandMark({ size = 48 }: { size?: number }) {
  const t = useTheme();
  const r = 29, C = 2 * Math.PI * r;
  return (
    <View accessible accessibilityLabel="Rhythm" style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.colors.hero, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={r} stroke={t.colors.heroTrack} strokeWidth={8} fill="none" />
        <Circle cx={50} cy={50} r={r} stroke={t.colors.lime} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${C * 0.72} ${C}`} transform="rotate(-90 50 50)" />
        <Polyline points="35,52 43,52 47,40 54,62 58,50 61,52 66,52" stroke={t.colors.heroText} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

/** Avatar circle with the user's initial (gradient-free, ink on lilac) — used in the Today header. */
export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`Profile ${name}`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.colors.accentSoft, borderWidth: 2, borderColor: t.colors.surface, alignItems: 'center', justifyContent: 'center', ...softShadow(t, 0.4) }}>
      <RNText style={[t.type.heading, { color: t.colors.accent }]}>{(name.trim()[0] ?? 'R').toUpperCase()}</RNText>
    </View>
  );
}

type CardTone = 'surface' | 'raised' | 'sunken' | 'accent' | 'hero';
export function Card({ children, style, onPress, accessibilityLabel, tone = 'surface' }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; tone?: CardTone;
}) {
  const t = useTheme();
  const narrow = useWindowDimensions().width < 380;
  const bg = { surface: t.colors.surface, raised: t.colors.surfaceRaised, sunken: t.colors.surfaceSunken, accent: t.colors.accentSoft, hero: t.colors.hero }[tone];
  const flat = tone === 'sunken';
  const base: ViewStyle = { backgroundColor: bg, borderRadius: t.radius.xl, borderWidth: tone === 'sunken' || t.isDark ? 1 : 0, borderColor: t.colors.border, padding: narrow ? t.spacing.md : t.spacing.lg, ...(flat ? {} : softShadow(t, tone === 'hero' ? 1.2 : 0.6)) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <PressableCard base={base} style={style} onPress={onPress} accessibilityLabel={accessibilityLabel}>{children}</PressableCard>;
}

function PressableCard({ base, style, onPress, accessibilityLabel, children }: { base: ViewStyle; style?: StyleProp<ViewStyle>; onPress: () => void; accessibilityLabel?: string; children?: React.ReactNode }) {
  const t = useTheme();
  const press = usePressScale(0.985);
  return (
    <Animated.View style={press.style}>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}
        style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [base, { opacity: s.pressed ? 0.94 : 1, minHeight: t.minTouch, ...(s.hovered ? { borderColor: t.colors.borderStrong } : {}) }, focusRing(t, s.focused), style]}>{children}</Pressable>
    </Animated.View>
  );
}

export function Row({ children, style, gap, between, wrap, align = 'center' }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; between?: boolean; wrap?: boolean; align?: 'center' | 'flex-start' | 'flex-end' | 'stretch' }) {
  const t = useTheme();
  return <View style={[{ flexDirection: 'row', alignItems: align, gap: gap ?? t.spacing.md, justifyContent: between ? 'space-between' : 'flex-start', flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

/**
 * Responsive columns: 1 on phones, 2 on tablets/desktop (3 only on very wide screens when `max` allows). Children keep their own height.
 * `minCols={2}` keeps two columns even on phones (for small, compact cards such as Today's study) with equal-height cells.
 */
export function Grid({ children, max = 2, gap, basis, minCols = 1 }: { children: React.ReactNode; max?: 1 | 2 | 3; gap?: number; /** Minimum column width before wrapping (default 300 / 340). */ basis?: number; /** Never drop below this many columns (even on phones). */ minCols?: 1 | 2 }) {
  const t = useTheme();
  const m = responsiveMetrics(useWindowDimensions().width);
  const cols = Math.max(minCols, Math.min(max, m.columns));
  const items = React.Children.toArray(children).filter(Boolean);
  const g = gap ?? (minCols > 1 ? t.spacing.sm + 2 : t.spacing.md + 2);
  if (cols === 1) return <View style={{ gap: g }}>{items}</View>;
  if (minCols > 1) {
    // Fixed percentage columns so two compact cards always sit side by side, however narrow the phone is.
    const pct = cols === 3 ? '31%' : '47.5%';
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: g, alignItems: 'stretch' }}>
        {items.map((c, i) => <View key={i} style={{ flexGrow: 1, flexShrink: 1, flexBasis: pct, minWidth: 0 }}>{c}</View>)}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: g, alignItems: 'flex-start' }}>
      {items.map((c, i) => <View key={i} style={{ flexGrow: 1, flexShrink: 1, flexBasis: basis ?? (cols === 3 ? 280 : 320), minWidth: 0 }}>{c}</View>)}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <Row between style={{ marginTop: t.spacing.xs }}>
      <Text variant="heading" accessibilityRole="header">{title}</Text>
      {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={(s: { pressed: boolean; focused?: boolean }) => [{ minHeight: 40, justifyContent: 'center', borderRadius: t.radius.md }, focusRing(t, s.focused)]}><Text variant="bodyStrong" tone="accent">{action}</Text></Pressable> : null}
    </Row>
  );
}

/** Round tinted badge holding an icon. */
export function IconBadge({ icon, color, size = 40 }: { icon: IconName; color?: string; size?: number }) {
  const t = useTheme();
  const c = color ?? t.colors.accent;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: tint(c, t.isDark ? 0.2 : 0.14), alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={c} />
    </View>
  );
}

/** Card heading with a tinted icon badge — makes each block recognisable at a glance. */
export function CardTitle({ icon, title, right, color }: { icon: IconName; title: string; right?: React.ReactNode; color?: string }) {
  const t = useTheme();
  return (
    <Row between>
      <Row gap={t.spacing.sm} style={{ flex: 1 }}>
        <IconBadge icon={icon} color={color} size={32} />
        <Text variant="heading" accessibilityRole="header">{title}</Text>
      </Row>
      {right}
    </Row>
  );
}

/** Big tappable tile: icon + what it does + a one-line hint. */
export function QuickAction({ icon, label, hint, onPress, color }: { icon: IconName; label: string; hint?: string; onPress: () => void; color?: string }) {
  const t = useTheme();
  const press = usePressScale(0.96);
  return (
    <Animated.View style={[press.style, { flex: 1, minWidth: 140 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={hint ? `${label}. ${hint}` : label} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}
        style={(s: { pressed: boolean; focused?: boolean }) => [{ backgroundColor: t.colors.surface, borderRadius: t.radius.xl, borderWidth: 1, borderColor: t.colors.border, padding: t.spacing.md, gap: t.spacing.sm, minHeight: 96, opacity: s.pressed ? 0.9 : 1 }, softShadow(t, 0.5), focusRing(t, s.focused)]}>
        <IconBadge icon={icon} color={color} size={38} />
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/* ---------- Buttons ---------- */
type ButtonProps = {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'lime'; icon?: IconName; disabled?: boolean; loading?: boolean;
  compact?: boolean; fullWidth?: boolean; accessibilityHint?: string;
};
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, compact, fullWidth = true, accessibilityHint }: ButtonProps) {
  const t = useTheme();
  const c = t.colors;
  const look = {
    primary: { bg: c.ink, fg: c.onInk, border: c.ink }, lime: { bg: c.lime, fg: c.onLime, border: c.lime },
    secondary: { bg: c.surface, fg: c.text, border: t.isDark ? c.borderStrong : c.surface }, ghost: { bg: 'transparent', fg: c.accent, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
  }[variant];
  const off = disabled || loading;
  const press = usePressScale(0.97);
  return (
    <Animated.View style={[press.style, { alignSelf: fullWidth ? 'stretch' : 'flex-start' }]}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: !!off, busy: !!loading }}
        onPress={off ? undefined : onPress} onPressIn={off ? undefined : press.onPressIn} onPressOut={off ? undefined : press.onPressOut}
        style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{
          minHeight: compact ? 40 : 50, paddingHorizontal: compact ? t.spacing.md : t.spacing.xl, borderRadius: t.radius.pill, backgroundColor: look.bg, borderWidth: 1, borderColor: look.border,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm, opacity: off ? 0.45 : s.pressed ? 0.9 : s.hovered ? 0.95 : 1,
        }, variant === 'primary' ? { shadowColor: t.colors.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 5 } : variant === 'lime' ? softShadow(t, 0.5) : variant === 'secondary' ? softShadow(t, 0.25) : {}, focusRing(t, s.focused)]}
      >
        {loading ? <ActivityIndicator color={look.fg} /> : icon ? <Ionicons name={icon} size={18} color={look.fg} /> : null}
        <RNText maxFontSizeMultiplier={1.25} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[t.type.bodyStrong, { color: look.fg, flexShrink: 1, textAlign: 'center' }]}>{label}</RNText>
      </Pressable>
    </Animated.View>
  );
}

/** Round icon button. `solid` gives it a white (surface) disc with a soft shadow — used in page headers. */
export function IconButton({ icon, label, onPress, tone = 'default', size = 24, solid }: { icon: IconName; label: string; onPress: () => void; tone?: 'default' | 'accent' | 'danger' | 'ink'; size?: number; solid?: boolean }) {
  const t = useTheme();
  const color = tone === 'accent' ? t.colors.accent : tone === 'danger' ? t.colors.danger : tone === 'ink' ? t.colors.onInk : t.colors.text;
  const bg = tone === 'ink' ? t.colors.ink : solid ? t.colors.surface : 'transparent';
  const press = usePressScale(0.9);
  const small = useWindowDimensions().width < 360;
  const dim = solid || tone === 'ink' ? (small ? 40 : 44) : t.minTouch;
  return (
    <Animated.View style={press.style}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} hitSlop={4}
        style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ width: dim, height: dim, borderRadius: dim / 2, backgroundColor: s.pressed || s.hovered ? (solid || tone === 'ink' ? bg : t.colors.accentSoft) : bg, alignItems: 'center', justifyContent: 'center', opacity: s.pressed ? 0.85 : 1 }, solid || tone === 'ink' ? softShadow(t, 0.4) : {}, focusRing(t, s.focused)]}>
        <Ionicons name={icon} size={size} color={color} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Filter / choice pill. Selected = ink (black) like "All" in the reference; `lime` makes the selected pill lime with a
 * white count bubble (the "To Do" chip).
 */
export function Chip({ label, selected, onPress, color, icon, count, lime }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: IconName; count?: number; lime?: boolean }) {
  const t = useTheme();
  const press = usePressScale(0.96);
  const selBg = lime ? t.colors.lime : t.colors.ink;
  const selFg = lime ? t.colors.onLime : t.colors.onInk;
  return (
    <Animated.View style={press.style}>
      <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={{ selected: !!selected }} accessibilityLabel={count !== undefined ? `${label}, ${count}` : label} onPress={onPress} onPressIn={onPress ? press.onPressIn : undefined} onPressOut={onPress ? press.onPressOut : undefined}
        style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ maxWidth: '100%', minHeight: 40, paddingLeft: count !== undefined ? 6 : t.spacing.md + 2, paddingRight: t.spacing.lg, borderRadius: t.radius.pill, borderWidth: t.isDark && !selected ? 1 : 0, borderColor: t.colors.border, backgroundColor: selected ? selBg : t.colors.surface, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, justifyContent: 'center', opacity: s.pressed ? 0.85 : 1 }, selected ? {} : softShadow(t, 0.25), focusRing(t, s.focused)]}>
        {count !== undefined ? (
          <View style={{ minWidth: 28, height: 28, paddingHorizontal: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? (lime ? t.colors.surface : t.colors.lime) : t.colors.surfaceSunken }}>
            <RNText style={[t.type.label, { fontWeight: '800', color: selected ? t.colors.onLime : t.colors.text }]}>{count}</RNText>
          </View>
        ) : null}
        {color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null}
        {icon ? <Ionicons name={icon} size={18} color={selected ? selFg : t.colors.text} /> : null}
        <RNText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.25} style={[t.type.label, { color: selected ? selFg : t.colors.text, fontWeight: selected ? '700' : '600', flexShrink: 1 }]}>{label}</RNText>
      </Pressable>
    </Animated.View>
  );
}

/** Small status pill (priority, state, tag). */
export function Pill({ label, color, icon }: { label: string; color?: string; icon?: IconName }) {
  const t = useTheme();
  const c = color ?? t.colors.textMuted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: t.spacing.sm + 2, paddingVertical: 3, borderRadius: t.radius.pill, backgroundColor: tint(c, t.isDark ? 0.2 : 0.13) }}>
      {icon ? <Ionicons name={icon} size={12} color={c} /> : null}
      <RNText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.25} style={[t.type.caption, { color: c, fontWeight: '700', flexShrink: 1 }]}>{label}</RNText>
    </View>
  );
}

/** Animated round checkbox used for tasks and habits. */
export function Check({ checked, onPress, label, color, size = 28 }: { checked: boolean; onPress: () => void; label: string; color?: string; size?: number }) {
  const t = useTheme();
  const v = useToggleAnim(checked);
  const c = color ?? t.colors.success;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={(s: { pressed: boolean; focused?: boolean }) => [{ width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.lg }, focusRing(t, s.focused)]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: checked ? c : t.colors.borderStrong, backgroundColor: checked ? c : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <Ionicons name="checkmark" size={Math.round(size * 0.66)} color={t.colors.bg} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

/* ---------- Progress ---------- */
export function ProgressBar({ value, color, height = 10, label, onHero }: { value: number | null; color?: string; height?: number; label?: string; onHero?: boolean }) {
  const t = useTheme();
  const target = value === null ? 0 : Math.max(0, Math.min(100, value));
  const v = useTween(target);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(target) }}
      style={{ height, borderRadius: height / 2, backgroundColor: onHero ? t.colors.heroTrack : t.colors.track, overflow: 'hidden' }}>
      <View style={{ width: `${v}%`, height: '100%', borderRadius: height / 2, backgroundColor: color ?? (onHero ? t.colors.lime : t.colors.accent) }} />
    </View>
  );
}

/** Ring with the percentage in the middle. `value` null renders an empty ring and "—" (no data yet, never a fake 0%). */
export function ProgressRing({ value, size = 120, stroke = 12, color, label, caption, display, onHero }: { value: number | null; size?: number; stroke?: number; color?: string; label: string; caption?: string; display?: string; onHero?: boolean }) {
  const t = useTheme();
  const v = useTween(value === null ? 0 : Math.max(0, Math.min(100, value)));
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const text = display ?? (value === null ? '—' : `${Math.round(value)}%`);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ text: value === null ? 'No data yet' : text }} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={onHero ? t.colors.heroTrack : t.colors.track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? (onHero ? t.colors.lime : t.colors.accent)} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(C * v) / 100} ${C}`} />
      </Svg>
      <RNText numberOfLines={1} adjustsFontSizeToFit style={[size >= 90 ? t.type.display : t.type.bodyStrong, size >= 90 ? { fontSize: Math.round(size * 0.25), lineHeight: Math.round(size * 0.3) } : null, { color: onHero ? t.colors.heroText : t.colors.text, maxWidth: size - stroke * 2 - 6 }]}>{text}</RNText>
      {caption ? <RNText style={[t.type.caption, { color: onHero ? t.colors.heroMuted : t.colors.textMuted }]}>{caption}</RNText> : null}
    </View>
  );
}

export function Stat({ label, value, hint, tone, onHero }: { label: string; value: string; hint?: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent'; onHero?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 84 }} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <Text variant="caption" tone={onHero ? 'heroMuted' : 'muted'}>{label}</Text>
      <Text variant="title" fit tone={onHero ? 'hero' : (tone ?? 'default')}>{value}</Text>
      {hint ? <Text variant="caption" tone={onHero ? 'heroMuted' : 'muted'}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon = 'leaf-outline', title, body, actionLabel, onAction }: { icon?: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.spacing.sm, padding: t.spacing.xl }}>
      <IconBadge icon={icon} size={64} />
      <Text variant="heading" align="center" style={{ marginTop: t.spacing.sm }}>{title}</Text>
      {body ? <Text tone="muted" align="center" style={{ maxWidth: 420 }}>{body}</Text> : null}
      {actionLabel && onAction ? <View style={{ marginTop: t.spacing.md, alignSelf: 'stretch', maxWidth: 320, width: '100%', alignItems: 'stretch', marginHorizontal: 'auto' as never }}><Button label={actionLabel} onPress={onAction} variant="primary" /></View> : null}
    </View>
  );
}

export function Banner({ tone = 'info', text, actionLabel, onAction }: { tone?: 'info' | 'warning' | 'danger' | 'success'; text: string; actionLabel?: string; onAction?: () => void }) {
  const t = useTheme();
  const bg = { info: t.colors.accentSoft, warning: t.colors.warningSoft, danger: t.colors.dangerSoft, success: t.colors.successSoft }[tone];
  const icon: IconName = { info: 'information-circle', warning: 'warning', danger: 'alert-circle', success: 'checkmark-circle' }[tone] as IconName;
  const fg = { info: t.colors.accent, warning: t.colors.warning, danger: t.colors.danger, success: t.colors.success }[tone];
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: t.radius.lg, padding: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
      <Ionicons name={icon} size={22} color={fg} />
      <View style={{ flex: 1 }}><Text variant="caption" style={{ color: t.colors.text }}>{text}</Text></View>
      {actionLabel && onAction ? <Pressable onPress={onAction} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center' }}><Text variant="bodyStrong" tone="accent">{actionLabel}</Text></Pressable> : null}
    </View>
  );
}

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg, backgroundColor: t.colors.bg }}>
      <BrandMark size={84} />
      <ActivityIndicator color={t.colors.accent} />
    </View>
  );
}
