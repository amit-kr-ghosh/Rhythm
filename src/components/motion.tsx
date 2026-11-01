import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Small, dependency-free motion helpers built on React Native's own Animated API, so they behave the same in Expo Go,
 * on the web and in builds. Every helper switches itself off when the OS "reduce motion" setting is on.
 */
const native = Platform.OS !== 'web'; // the native driver is not available in browsers

/** Fade + slide a section into place. Stagger a list by passing increasing `index` values. */
export function Reveal({ children, index = 0, style }: { children: React.ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(t.reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (t.reduceMotion) { v.setValue(1); return undefined; }
    // Phones: a shorter, tighter stagger so a freshly opened page is readable almost at once (web keeps the longer reveal).
    const a = Animated.timing(v, { toValue: 1, duration: native ? 240 : 380, delay: Math.min(index, native ? 5 : 8) * (native ? 35 : 70), easing: Easing.out(Easing.cubic), useNativeDriver: native });
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [native ? 10 : 14, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

/** Gentle "press in" feedback. Spread `onPressIn` / `onPressOut` on the Pressable and `style` on a wrapping Animated.View. */
export function usePressScale(to = 0.97) {
  const reduce = useTheme().reduceMotion;
  const s = useRef(new Animated.Value(1)).current;
  return {
    style: { transform: [{ scale: s }] },
    onPressIn: () => { if (!reduce) Animated.spring(s, { toValue: to, speed: 50, bounciness: 0, useNativeDriver: native }).start(); },
    onPressOut: () => { if (!reduce) Animated.spring(s, { toValue: 1, speed: 24, bounciness: 7, useNativeDriver: native }).start(); },
  };
}

/** Smoothly count a number towards `target` (used to grow progress bars and rings from 0 and to animate changes). */
export function useTween(target: number, ms = 700): number {
  const reduce = useTheme().reduceMotion;
  const [val, setVal] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce || from.current === target) { from.current = target; setVal(target); return undefined; }
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * eased;
      from.current = cur;
      setVal(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return val;
}

/** A softly pulsing dot — shows that something (the focus timer) is live. */
export function PulseDot({ color, active = true, size = 10 }: { color: string; active?: boolean; size?: number }) {
  const reduce = useTheme().reduceMotion;
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduce) { v.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, v]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: v }}><View /></Animated.View>;
}

/** Spring a value between 0 and 1 (checkboxes, switches, selected indicators). Jumps instantly with reduce-motion. */
export function useToggleAnim(on: boolean, speed = 22) {
  const reduce = useTheme().reduceMotion;
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(on ? 1 : 0); return undefined; }
    const a = Animated.spring(v, { toValue: on ? 1 : 0, speed, bounciness: 9, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [on, reduce, speed, v]);
  return v;
}

/** Scale + fade a child in when it mounts (new toast, new row, a freshly revealed panel). */
export function Pop({ children, style, delay = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduce = useTheme().reduceMotion;
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const a = Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, speed: 16, bounciness: 8, useNativeDriver: native })]);
    a.start();
    return () => a.stop();
  }, [reduce, delay, v]);
  return <Animated.View style={[{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }, style]}>{children}</Animated.View>;
}
