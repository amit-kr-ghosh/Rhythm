import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, IconBadge, IconButton, Row, Screen, Text, focusRing, type IconName } from '../ui';
import { NumberField } from '../inputs';
import { safeBack } from '../../navigation/safeBack';

/** Sub-screen chrome: back button + title + scrolling content. */
export function SubScreen({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const router = useRouter();
  return (
    <Screen footer={footer}>
      <Row between>
        <IconButton icon="chevron-back" label="Back" solid onPress={() => safeBack(router)} />
        <Text variant="heading" fit accessibilityRole="header" numberOfLines={1} align="center" style={{ flex: 1 }}>{title}</Text>
        <View style={{ width: 52 }} />
      </Row>
      {children}
    </Screen>
  );
}

export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      {title ? <Text variant="label" tone="muted" style={{ marginLeft: t.spacing.md }}>{title}</Text> : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>{children}</Card>
    </View>
  );
}

export function NavRow({ icon, title, value, onPress, tone = 'default', last }: { icon: IconName; title: string; value?: string; onPress: () => void; tone?: 'default' | 'danger'; last?: boolean }) {
  const t = useTheme();
  const color = tone === 'danger' ? t.colors.danger : t.colors.accent;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} onPress={onPress}
      style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ minHeight: 56, paddingHorizontal: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, backgroundColor: s.pressed || s.hovered ? t.colors.surfaceSunken : 'transparent', borderBottomWidth: last ? 0 : 1, borderBottomColor: t.colors.border }, focusRing(t, s.focused)]}>
      <IconBadge icon={icon} color={color} size={34} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={tone === 'danger' ? 'danger' : 'default'}>{title}</Text>
        {value ? <Text variant="caption" tone="muted" numberOfLines={1}>{value}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
    </Pressable>
  );
}

export function Pad({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>{children}</View>;
}

/** Hours + minutes inputs backed by a single minutes value. */
export function HoursMinutesField({ label, minutes, onChange, error }: { label: string; minutes: number; onChange: (min: number) => void; error?: string }) {
  const t = useTheme();
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="label" tone="muted">{label}</Text>
      <Row align="flex-start">
        <View style={{ flex: 1 }}><NumberField label="Hours" value={h} onChange={(v) => onChange((v ?? 0) * 60 + m)} /></View>
        <View style={{ flex: 1 }}><NumberField label="Minutes" value={m} onChange={(v) => onChange(h * 60 + Math.min(59, v ?? 0))} /></View>
      </Row>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}
