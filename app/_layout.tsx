import React, { useEffect } from 'react';
import '../src/services/webScreens';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { boot, resolveAccountDecision } from '../src/state/runtime';
import { keepRecoveredTimer, stopRecoveredTimer } from '../src/state/actions';
import { store, useApp } from '../src/state/store';
import { Button, LoadingView, Screen, Text } from '../src/components/ui';
import { ToastHost, choose } from '../src/components/feedback';
import { DialogHost } from '../src/components/dialog';
import { WebModalFrame } from '../src/components/WebModalFrame';
import { formatDuration } from '../src/domain/time';

void SplashScreen.preventAutoHideAsync();

/** Phones keep the native modal. In a browser the modal is a transparent route that WebModalFrame turns into a centred dialog. */
const MODAL = (Platform.OS === 'web'
  ? { presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }
  : { presentation: 'modal' }) as { presentation: 'modal' };

function Gate() {
  const t = useTheme();
  const ready = useApp((s) => s.ready);
  const bootError = useApp((s) => s.bootError);
  const onboarded = useApp((s) => (s.ready ? s.data.prefs.onboarded : true));
  const timerPrompt = useApp((s) => s.timerPrompt);
  const decision = useApp((s) => s.pendingAccountDecision);
  const segments = useSegments();
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => { void boot(); }, []);
  useEffect(() => { if (ready || bootError) void SplashScreen.hideAsync(); }, [ready, bootError]);

  // A timer left running while the app was closed for a long time: ask rather than guess.
  useEffect(() => {
    if (!timerPrompt) return;
    const gap = formatDuration(Math.round(timerPrompt.gapMs / 60_000));
    void choose('Timer still running', `Your focus timer was last active ${gap} ago. Keep counting, or stop it at the last moment the app was open?`, [
      { key: 'keep', label: 'Keep counting' }, { key: 'stop', label: 'Stop at last active time' },
    ]).then((c) => { if (c === 'stop') void stopRecoveredTimer(); else void keepRecoveredTimer(); });
  }, [timerPrompt]);

  // Different account on a device that already has data: never discard silently.
  useEffect(() => {
    if (!decision) return;
    void choose('Switch account?', `This device already has data from a different account. Merge it into ${decision.email ?? 'this account'}, or replace it with that account's cloud data? Replacing needs everything to be synced first.`, [
      { key: 'merge', label: 'Merge into this account' }, { key: 'replace', label: 'Replace with cloud data' },
    ]).then((c) => { if (c) void resolveAccountDecision(c); else { void import('../src/state/actions').then((a) => a.signOut()); } });
  }, [decision]);

  // First launch: send the user through onboarding once the navigator exists (a <Redirect> before mount would crash).
  const first = segments[0] as string | undefined;
  useEffect(() => {
    if (ready && navReady && !onboarded && first !== 'onboarding' && first !== 'auth') router.replace('/onboarding' as never);
  }, [ready, navReady, onboarded, first, router]);

  return (
    <View style={{ flex:  1 }}>
      {/* Keep the root navigator mounted from the first render. Expo Router needs it
          to initialize Linking even while local storage and Supabase are booting. */}
      <Stack screenLayout={({ children, options }) => <WebModalFrame isModal={options.presentation === 'transparentModal'}>{children}</WebModalFrame>} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg }, animation: t.reduceMotion ? 'none' : 'default', freezeOnBlur: Platform.OS !== 'web' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="activity/[id]" options={MODAL} />
        <Stack.Screen name="manual-session" options={MODAL} />
        <Stack.Screen name="occurrence" options={MODAL} />
        <Stack.Screen name="task/[id]" options={MODAL} />
        <Stack.Screen name="goal/[id]" options={MODAL} />
        <Stack.Screen name="habit/[id]" options={MODAL} />
      </Stack>
      {bootError ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, backgroundColor: t.colors.bg }]}>
          <Screen>
            <Text variant="title">Something went wrong</Text>
            <Text tone="muted">{bootError}</Text>
            <Button label="Try again" onPress={() => { store.set({ bootError: null }); void boot(); }} />
          </Screen>
        </View>
      ) : !ready ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, backgroundColor: t.colors.bg }]}>
          <LoadingView label="Starting Rhythm" />
        </View>
      ) : null}
      <ToastHost />
      <DialogHost />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Gate />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
