import React from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { safeBack } from '../navigation/safeBack';

/**
 * Web desktop only: shows a modal route as a centred dialog over a dimmed backdrop instead of a full-window page.
 * Everywhere else (phones, tablets, native apps, narrow browser windows) the screen is returned untouched.
 */
export function WebModalFrame({ children, isModal }: { children: React.ReactElement; isModal: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || !isModal || width < 760) return children;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: t.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(24,18,38,0.42)' }}>
      <Pressable accessibilityLabel="Close dialog" tabIndex={-1} onPress={() => safeBack(router)} style={[StyleSheet.absoluteFill, { cursor: 'default' } as never]} />
      <View style={{
        width: '100%', maxWidth: 640, height: Math.min(height - 48, 700), borderRadius: 28, overflow: 'hidden', backgroundColor: t.colors.bg,
        borderWidth: t.isDark ? 1 : 0, borderColor: t.colors.border, boxShadow: '0 30px 80px rgba(20, 12, 40, 0.35)',
      } as never}>
        {children}
      </View>
    </View>
  );
}
