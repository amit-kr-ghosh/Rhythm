import React from 'react';
import { Tabs } from 'expo-router';
import { Animated, Dimensions, Easing, Platform, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { layout } from '../../src/theme/tokens';
import { Ambient, SharedAmbientContext } from '../../src/components/ui';
import { TabBar } from '../../src/components/nav/TabBar';

type Progress = { current: { progress: Animated.Value } };
/**
 * progress is 0 for the tab on screen and ±distance for the others while a switch animates. Pure slide, no opacity: on
 * Android a card's elevation shadow ignores its parent's opacity, so fading a page left its shadows hanging in place
 * (the black leftovers). Sliding moves the shadows together with their cards and the old page leaves the screen whole.
 */
const slide = ({ current }: Progress) => {
  const w = Dimensions.get('window').width;
  return { sceneStyle: { transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-w, 0, w], extrapolate: 'clamp' }) }] } };
};

/** Five tabs, ordered by how often they are used: Today → Timetable → Focus → Analytics → Settings. */
export default function TabsLayout() {
  const t = useTheme();
  const wide = useWindowDimensions().width >= layout.sidebarBreakpoint;
  return (
    // One gradient behind all five tabs (instead of one per screen) and transparent scenes: switching tabs is just a swap of content.
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
    <Ambient />
    <SharedAmbientContext.Provider value>
    <Tabs
      tabBar={(p) => <TabBar {...(p as unknown as React.ComponentProps<typeof TabBar>)} />}
      screenOptions={{
        headerShown: false,
        // Phones: full-width bar docked to the bottom edge. Wide screens (tablet / desktop browser): a left sidebar.
        tabBarPosition: wide ? 'left' : 'bottom',
        // Web: instant swap (a cross-fade of two see-through scenes looks ghosted; screens fade their own content in via Reveal).
        // Phones: the pages slide like a pager (old page out, new page in), so nothing fades and no shadow is left behind.
        animation: Platform.OS === 'web' || t.reduceMotion ? 'none' : 'shift',
        transitionSpec: { animation: 'timing', config: { duration: 280, easing: Easing.inOut(Easing.cubic) } },
        sceneStyleInterpolator: slide,
        freezeOnBlur: true, // hidden tabs stop re-rendering (timer ticks, store updates)
        // Phones: mount all five tabs up front (behind the "Starting Rhythm" overlay) so the first visit to a tab is instant
        // instead of building the screen while you wait. Web keeps lazy mounting (its tabs are cheap and its load time matters).
        lazy: Platform.OS === 'web',
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="timetable" options={{ title: 'Timetable' }} />
      <Tabs.Screen name="focus" options={{ title: 'Focus' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
    </SharedAmbientContext.Provider>
    </View>
  );
}
