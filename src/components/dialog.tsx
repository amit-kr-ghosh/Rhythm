import React, { useEffect, useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Text } from './ui';

/**
 * In-app dialogs for the web build. React Native's Alert.alert is a no-op in browsers, so confirm()/choose() push a request
 * here and <DialogHost/> (mounted once in the root layout) renders it. Native platforms keep the system Alert.
 */
export type DialogButton = { label: string; value: unknown; style?: 'default' | 'destructive' | 'cancel' };
export type DialogRequest = { id: number; title: string; message: string; buttons: DialogButton[]; resolve: (v: unknown) => void };

let current: DialogRequest | null = null;
const queue: DialogRequest[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((l) => l());

export function showDialog(title: string, message: string, buttons: DialogButton[], cancelValue: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const req: DialogRequest = { id: ++seq, title, message, buttons, resolve: (v) => { resolve(v); } };
    (req as DialogRequest & { cancelValue: unknown }).cancelValue = cancelValue;
    if (current) queue.push(req); else current = req;
    emit();
  });
}

function close(value: unknown) {
  const c = current; if (!c) return;
  current = queue.shift() ?? null;
  c.resolve(value);
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function DialogHost() {
  const req = useSyncExternalStore(subscribe, () => current, () => null);
  const t = useTheme();

  // Keyboard: Escape dismisses (web only).
  useEffect(() => {
    if (Platform.OS !== 'web' || !req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close((req as DialogRequest & { cancelValue: unknown }).cancelValue); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  const cancelValue = (req as DialogRequest & { cancelValue: unknown }).cancelValue;
  return (
    <Modal visible transparent animationType={t.reduceMotion ? 'none' : 'fade'} onRequestClose={() => close(cancelValue)}>
      <View style={{ flex: 1, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: t.spacing.lg }}>
        <Pressable accessibilityLabel="Dismiss dialog" accessibilityRole="button" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => close(cancelValue)} />
        <View
          accessibilityRole={'alertdialog' as never} accessibilityLabel={req.title} accessibilityViewIsModal
          style={{ width: '100%', maxWidth: 440, backgroundColor: t.colors.surface, borderRadius: 32, borderWidth: 1, borderColor: t.colors.border, padding: t.spacing.xxl, gap: t.spacing.md }}
        >
          <Text variant="title" accessibilityRole="header">{req.title}</Text>
          <Text tone="muted">{req.message}</Text>
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.sm }}>
            {req.buttons.map((b) => (
              <Button key={b.label} label={b.label} variant={b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'ghost' : 'primary'} onPress={() => close(b.value)} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
