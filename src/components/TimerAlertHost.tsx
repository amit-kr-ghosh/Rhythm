import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Row, Text } from './ui';
import { Pop } from './motion';
import { useApp } from '../state/store';
import { dismissAlert } from '../state/alertRuntime';

/**
 * Mount once near the root. Shows what the timer just did, whichever screen the user is on.
 *  - A fresh alert is a centred card with a dimmed backdrop: it makes a sound, so it should also demand a glance. It stays
 *    until dismissed (dismissing also silences any repeating sound).
 *  - A late alert (the page was frozen or in the background and has only just noticed) is a quiet banner at the top that
 *    clears itself, because the system notification already did the pinging.
 */
export function TimerAlertHost() {
  const t = useTheme();
  const router = useRouter();
  const alert = useApp((s) => s.alert);
  const insets = useSafeAreaInsets();
  if (!alert) return null;
  const icon = alert.kind === 'break_done' ? 'play-circle' : alert.kind === 'test' ? 'notifications' : 'checkmark-circle';
  const openTimer = () => { dismissAlert(); router.push('/(tabs)/focus' as never); };

  if (alert.late) {
    return (
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + t.spacing.sm, left: t.spacing.lg, right: t.spacing.lg, alignItems: 'center', zIndex: 900, elevation: 900 }}>
        <Pop style={{ width: '100%', maxWidth: 520 }}>
          <Pressable accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={`${alert.title}. ${alert.body}. Tap to dismiss.`} onPress={dismissAlert}
            style={{ backgroundColor: t.colors.hero, borderRadius: t.radius.lg, paddingVertical: t.spacing.md, paddingHorizontal: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
            <Ionicons name={icon} size={22} color={t.colors.lime} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" tone="hero">{alert.title}</Text>
              <Text variant="caption" tone="heroMuted">{alert.body}</Text>
            </View>
            <Ionicons name="close" size={20} color={t.colors.heroMuted} />
          </Pressable>
        </Pop>
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900, elevation: 900, backgroundColor: 'rgba(10,8,18,0.62)', alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }]}>
      <Pop style={{ width: '100%', maxWidth: 400 }}>
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ backgroundColor: t.colors.hero, borderRadius: t.radius.xl, padding: t.spacing.xl, gap: t.spacing.lg, alignItems: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.colors.heroTrack, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={40} color={t.colors.lime} />
          </View>
          <View style={{ gap: t.spacing.xs, alignItems: 'center' }}>
            <Text variant="title" tone="hero" align="center">{alert.title}</Text>
            <Text tone="heroMuted" align="center">{alert.body}</Text>
          </View>
          <Row gap={t.spacing.md} style={{ width: '100%' }}>
            {alert.kind === 'test' ? (
              <View style={{ flex: 1 }}><Button label="Dismiss" variant="lime" onPress={dismissAlert} /></View>
            ) : (
              <>
                <View style={{ flex: 1 }}><Button label="Dismiss" variant="secondary" onPress={dismissAlert} /></View>
                <View style={{ flex: 1 }}><Button label="Open timer" variant="lime" onPress={openTimer} /></View>
              </>
            )}
          </Row>
        </View>
      </Pop>
    </View>
  );
}
