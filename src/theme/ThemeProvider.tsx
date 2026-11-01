import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance, Platform, useColorScheme, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MIN_TOUCH, motion, palettes, radius, resolveScheme, scaleType, spacing, type, typeScaleFor, type Palette, type ThemeName, type ThemePreference } from './tokens';
import { store, useApp } from '../state/store';

export type Theme = {
  name: ThemeName; isDark: boolean; preference: ThemePreference; colors: Palette;
  spacing: typeof spacing; radius: typeof radius; type: typeof type; motion: typeof motion; minTouch: number; reduceMotion: boolean;
};

const Ctx = createContext<Theme | null>(null);

/**
 * Dark is the initial experience. Before the database loads we read the last-used preference from AsyncStorage so the
 * first frame already has the right theme; afterwards the synced preference in the store is the source of truth.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const ready = useApp((s) => s.ready);
  const stored = useApp((s) => (s.ready ? s.data.prefs.theme : null));
  const [cached, setCached] = useState<ThemePreference>('light');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('rhythm.theme').then((v) => { if (v === 'dark' || v === 'light' || v === 'system') setCached(v); }).catch(() => undefined);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => { store.set({ systemScheme: system === 'light' ? 'light' : system === 'dark' ? 'dark' : null }); }, [system]);

  const preference: ThemePreference = (ready ? stored : null) ?? cached;
  const name = resolveScheme(preference, system === 'light' ? 'light' : system === 'dark' ? 'dark' : null);
  const scale = typeScaleFor(useWindowDimensions().width);
  const scaledType = useMemo(() => scaleType(type, scale), [scale]);
  const value = useMemo<Theme>(() => ({
    name, isDark: name === 'dark', preference, colors: palettes[name], spacing, radius, type: scaledType, motion, minTouch: MIN_TOUCH, reduceMotion,
  }), [name, preference, reduceMotion, scaledType]);

  // Native dialogs follow the chosen theme; 'system' hands control back to the OS.
  useEffect(() => {
    if (Platform.OS === 'web') return; // react-native-web has no Appearance.setColorScheme; the page itself is themed below
    try { Appearance.setColorScheme?.(preference === 'system' ? 'unspecified' : preference); } catch { /* older runtimes */ }
  }, [preference]);

  // Web: theme the page behind the app (overscroll, address-bar colour, form controls) and declare the language.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const c = palettes[name];
    document.documentElement.lang = 'en';
    document.documentElement.style.colorScheme = name;
    document.documentElement.style.backgroundColor = c.bg;
    document.body.style.backgroundColor = c.bg;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = c.bg;
  }, [name]);

  return (
    <Ctx.Provider value={value}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): Theme {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
}

/** Memoised per-theme styles: `const styles = useStyles((t) => ({ card: { backgroundColor: t.colors.surface } }))`. */
export function useStyles<T extends Record<string, unknown>>(factory: (t: Theme) => T): T {
  const t = useTheme();
  return useMemo(() => factory(t), [t]);
}
