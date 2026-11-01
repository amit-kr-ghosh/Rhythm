import React from 'react';
import { Alert, Animated, BackHandler, Easing, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Text, Row, IconButton } from './ui';
import { Pop } from './motion';
import { useApp } from '../state/store';
import { showDialog } from './dialog';

/**
 * Bottom sheet with a grab handle. Android back closes it. Content scrolls, so forms fit on small screens. Centred card on wide screens.
 *
 * The animation is done here rather than with <Modal animationType="slide">: the built-in slide moves the dimmed backdrop
 * together with the sheet (the whole screen appears to jerk up from the bottom, and on Android the sheet flashes before it is
 * laid out). Here the backdrop only fades while the sheet itself slides, and the Modal stays mounted until the close animation
 * has finished, so closing is as smooth as opening.
 */
export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 720;
  const [mounted, setMounted] = React.useState(visible);
  const p = React.useRef(new Animated.Value(0)).current;
  const { reduceMotion } = t;

  React.useEffect(() => {
    if (visible) setMounted(true);
    if (reduceMotion) {
      p.setValue(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return undefined;
    }
    const a = Animated.timing(p, { toValue: visible ? 1 : 0, duration: visible ? 280 : 200, easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: Platform.OS !== 'web' });
    // Only unmount after a *completed* close animation, so closing and quickly re-opening never tears the Modal down.
    a.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => a.stop();
  }, [visible, reduceMotion, p]);

  if (!mounted && !visible) return null;
  const travel = wide ? 28 : height;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.overlay, opacity: p }} />
        <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        <Animated.View accessibilityViewIsModal
          style={{
            width: '100%', maxWidth: 560, maxHeight: Math.round(height * 0.9), backgroundColor: t.colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32,
            ...(wide ? { borderBottomLeftRadius: 32, borderBottomRightRadius: 32 } : { paddingBottom: Math.max(insets.bottom, t.spacing.sm) }),
            opacity: wide ? p : p.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
            transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }],
          }}>
          <View style={{ alignItems: 'center', paddingTop: t.spacing.sm }}><View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: t.colors.borderStrong }} /></View>
          <Row between style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.sm }}>
            <Text variant="title" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </Row>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.md }}>{children}</ScrollView>
          {footer ? <View style={{ padding: t.spacing.xl, borderTopWidth: 1, borderTopColor: t.colors.border }}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Native confirm dialog as a promise. Destructive confirmations must spell out the consequence in `message`. */
export function confirm(opts: { title: string; message: string; confirmLabel: string; destructive?: boolean; cancelLabel?: string }): Promise<boolean> {
  if (Platform.OS === 'web') {
    return showDialog(opts.title, opts.message, [
      { label: opts.confirmLabel, value: true, style: opts.destructive ? 'destructive' : 'default' },
      { label: opts.cancelLabel ?? 'Cancel', value: false, style: 'cancel' },
    ], false) as Promise<boolean>;
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** Three-way choice (e.g. "This day only / This and following days"). Resolves with the chosen key or null. */
export function choose<T extends string>(title: string, message: string, options: { key: T; label: string }[]): Promise<T | null> {
  if (Platform.OS === 'web') {
    return showDialog(title, message, [...options.map((o) => ({ label: o.label, value: o.key as unknown })), { label: 'Cancel', value: null, style: 'cancel' as const }], null) as Promise<T | null>;
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [...options.map((o) => ({ text: o.label, onPress: () => resolve(o.key) })), { text: 'Cancel', style: 'cancel' as const, onPress: () => resolve(null) }], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

/** Mount once near the root. Announces to screen readers via accessibilityLiveRegion. Floats above the tab bar. */
export function ToastHost() {
  const t = useTheme();
  const toast = useApp((s) => s.toast);
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= 960;
  if (!toast) return null;
  const color = toast.kind === 'success' ? t.colors.lime : toast.kind === 'error' ? t.colors.danger : t.colors.accent;
  const icon = toast.kind === 'success' ? 'checkmark-circle' : toast.kind === 'error' ? 'alert-circle' : 'information-circle';
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: t.spacing.lg, right: t.spacing.lg, bottom: wide ? t.spacing.xl : 72 + insets.bottom, alignItems: 'center' }}>
      <Pop style={{ width: '100%', maxWidth: 480 }}>
        <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: t.colors.hero, borderRadius: t.radius.lg, paddingVertical: t.spacing.md, paddingHorizontal: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md, alignItems: 'center', shadowColor: t.colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 }}>
          <Ionicons name={icon} size={22} color={color} />
          <View style={{ flex: 1 }}><Text variant="caption" tone="hero" style={{ fontWeight: '600' }}>{toast.text}</Text></View>
        </View>
      </Pop>
    </View>
  );
}

/** Run `onBack` for the Android hardware back button while mounted. Return true from it to consume the event. */
export function useBackHandler(onBack: () => boolean): void {
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [onBack]);
}
