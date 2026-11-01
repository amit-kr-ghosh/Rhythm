import React from 'react';
import { Animated, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { layout } from '../../theme/tokens';
import { useApp } from '../../state/store';
import { useStudyDay, useToday } from '../../state/hooks';
import { formatCompact } from '../../domain/study';
import { BrandMark, Text, focusRing } from '../ui';
import { PulseDot, useToggleAnim } from '../motion';

type RouteLike = { key: string; name: string };
type BarProps = {
  state: { index: number; routes: RouteLike[] };
  descriptors: Record<string, { options: { title?: string; tabBarAccessibilityLabel?: string }; navigation?: Nav }>;
  /** Not provided by every expo-router version; each descriptor carries its own `navigation` too. */
  navigation?: Nav;
};
type Nav = { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };

const ICONS: Record<string, [string, string]> = {
  index: ['home-outline', 'home'], timetable: ['calendar-outline', 'calendar'], focus: ['timer-outline', 'timer'],
  analytics: ['stats-chart-outline', 'stats-chart'], settings: ['settings-outline', 'settings'],
};

/**
 * Phones: a bar docked to the bottom edge (white in light mode, flush to the screen sides and bottom, not floating). The
 * active tab is a black capsule; inactive tabs are dark icons. Wide screens (tablet / desktop): a left sidebar with the brand and the same tabs.
 */
export function TabBar({ state, descriptors, navigation }: BarProps) {
  const wide = useWindowDimensions().width >= layout.sidebarBreakpoint;
  return wide ? <Sidebar state={state} descriptors={descriptors} navigation={navigation} /> : <Docked state={state} descriptors={descriptors} navigation={navigation} />;
}

function useGo({ descriptors, navigation }: BarProps) {
  const router = useRouter();
  return (route: RouteLike, focused: boolean) => {
    // Not every navigation object exposes emit(): the per-route one can be a partial object in some expo-router
    // versions (that was "nav.emit is not a function"). Use the first candidate that really has emit + navigate.
    const candidates: (Partial<Nav> | undefined)[] = [navigation, descriptors[route.key]?.navigation];
    const full = candidates.find((n): n is Nav => !!n && typeof n.emit === 'function' && typeof n.navigate === 'function');
    if (full) {
      const e = full.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !e?.defaultPrevented) full.navigate(route.name);
      return;
    }
    // Last resort: navigate through the router (also covers a navigation object that only has navigate()).
    if (!focused) router.navigate((route.name === 'index' ? '/' : `/${route.name}`) as never);
  };
}

function TabItem({ name, title, focused, onPress, running, wide }: { name: string; title: string; focused: boolean; onPress: () => void; running: boolean; wide?: boolean }) {
  const t = useTheme();
  // Five labels only fit on roomier phones; on narrow screens just the active tab shows its name (icons stay recognisable).
  const roomy = useWindowDimensions().width >= 420;
  const showLabel = wide || focused || roomy;
  const v = useToggleAnim(focused, 18);
  const [off, on] = ICONS[name] ?? ['ellipse-outline', 'ellipse'];
  // Black / white scheme: the active tab is an ink capsule with an inverted icon, the rest are plain ink-coloured icons.
  const fg = focused ? t.colors.onInk : t.colors.text;
  const icon = (
    <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
      <Ionicons name={(focused ? on : off) as never} size={wide ? 21 : 20} color={fg} />
      {running && name === 'focus' ? <View style={{ position: 'absolute', top: -2, right: -4 }}><PulseDot color={t.colors.success} size={9} /></View> : null}
    </Animated.View>
  );
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={running && name === 'focus' ? `${title}, timer running` : title} onPress={onPress}
      style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [wide ? {
        height: 48, paddingHorizontal: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch',
        backgroundColor: focused ? t.colors.ink : s.hovered ? t.colors.surfaceSunken : 'transparent', opacity: s.pressed ? 0.8 : 1,
      } : {
        // Phone: icon over label. The active tab is a black capsule.
        flex: focused ? (roomy ? 1.25 : 1.9) : 1, minWidth: 0, height: roomy || focused ? 48 : 44, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 2,
        backgroundColor: focused ? t.colors.ink : 'transparent', opacity: s.pressed ? 0.8 : 1,
      }, focusRing(t, s.focused)]}>
      {icon}
      {showLabel ? <Text variant="caption" fit numberOfLines={1} style={{ color: fg, fontSize: wide ? 14 : 10.5, lineHeight: wide ? 19 : 13, flexShrink: 1, fontWeight: focused ? '700' : '500' }}>{title}</Text> : null}
    </Pressable>
  );
}

/**
 * Phone navigation: a bar docked to the bottom edge. It spans the full width, has rounded top corners and paints its own
 * (white) background all the way through the system navigation / gesture area, so Android's back-home-recents buttons sit
 * on it instead of over the page and nothing floats. A crisp hairline (no shadow or blur) separates it from the page.
 */
function Docked(props: BarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const go = useGo(props);
  const running = useApp((s) => s.timer !== null);
  const { state, descriptors } = props;
  return (
    <View style={{ alignSelf: 'stretch', backgroundColor: t.colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 6, paddingHorizontal: t.spacing.md, paddingBottom: Math.max(insets.bottom, 0) + 4, alignItems: 'center', borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.colors.border }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 560, gap: 2 }}>
        {state.routes.map((r, i) => (
          <TabItem key={r.key} name={r.name} title={descriptors[r.key]?.options.title ?? r.name} focused={state.index === i} running={running} onPress={() => go(r, state.index === i)} />
        ))}
      </View>
    </View>
  );
}

function Sidebar(props: BarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const go = useGo(props);
  const running = useApp((s) => s.timer !== null);
  const { state, descriptors } = props;
  return (
    <View style={{ width: 248, paddingTop: Math.max(insets.top, 0) + t.spacing.xxl, paddingBottom: t.spacing.xl, paddingHorizontal: t.spacing.lg, backgroundColor: t.colors.surface, borderRightWidth: 1, borderRightColor: t.colors.border, justifyContent: 'space-between' }}>
      <View style={{ gap: t.spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingLeft: t.spacing.sm }}>
          <BrandMark size={44} />
          <Text variant="title">Rhythm</Text>
        </View>
        <View accessibilityRole="tablist" style={{ gap: t.spacing.xs }}>
          {state.routes.map((r, i) => (
            <TabItem key={r.key} wide name={r.name} title={descriptors[r.key]?.options.title ?? r.name} focused={state.index === i} running={running} onPress={() => go(r, state.index === i)} />
          ))}
        </View>
      </View>
      {Platform.OS === 'web' ? <SidebarFooter /> : null}
    </View>
  );
}

/** Web sidebar only: today's progress at a glance, with a one-click way into the focus timer. */
function SidebarFooter() {
  const t = useTheme();
  const router = useRouter();
  const total = useStudyDay(useToday()).total;
  const pct = Math.max(0, Math.min(100, total.pct));
  return (
    <View style={{ backgroundColor: t.colors.hero, borderRadius: t.radius.xl, padding: t.spacing.lg, gap: t.spacing.md }}>
      <View style={{ gap: 2 }}>
        <Text variant="caption" tone="heroMuted">Today</Text>
        <Text variant="title" tone="hero">{Math.round(pct)}% done</Text>
        <Text variant="caption" tone="heroMuted">{formatCompact(total.actualSec)} of {formatCompact(total.targetSec)}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.heroTrack, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: t.colors.lime }} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Start focus" onPress={() => router.navigate('/focus' as never)}
        style={(s: { pressed: boolean; focused?: boolean }) => [{ height: 44, borderRadius: 22, backgroundColor: t.colors.lime, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: s.pressed ? 0.85 : 1 }, focusRing(t, s.focused)]}>
        <Ionicons name="play" size={16} color={t.colors.onLime} />
        <Text variant="bodyStrong" tone="onLime">Start focus</Text>
      </Pressable>
    </View>
  );
}
