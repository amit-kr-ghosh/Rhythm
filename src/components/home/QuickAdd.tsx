import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { Sheet } from '../feedback';
import { IconBadge, Text, focusRing, type IconName } from '../ui';
import { useApp } from '../../state/store';

/** The "+" sheet: the four things people actually add, one tap each. */
export function QuickAdd({ visible, onClose, date }: { visible: boolean; onClose: () => void; date: string }) {
  const t = useTheme();
  const router = useRouter();
  const timer = useApp((s) => s.timer);
  const items: { icon: IconName; title: string; hint: string; color: string; go: () => void }[] = [
    { icon: timer ? 'timer' : 'play-circle', title: timer ? 'Open timer' : 'Start focus', hint: timer ? 'A session is running' : 'Time a study session', color: t.colors.accent, go: () => router.push('/focus' as never) },
    { icon: 'calendar', title: 'Timetable block', hint: 'Add an activity', color: t.colors.warning, go: () => router.push({ pathname: '/activity/[id]', params: { id: 'new', date } } as never) },
    { icon: 'create', title: 'Log study time', hint: 'Time you already studied', color: t.colors.series[3] as string, go: () => router.push('/manual-session' as never) },
  ];
  return (
    <Sheet visible={visible} title="Add" onClose={onClose}>
      {items.map((x) => (
        <Pressable key={x.title} accessibilityRole="button" accessibilityLabel={`${x.title}. ${x.hint}`} onPress={() => { onClose(); x.go(); }}
          style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.md, minHeight: 68, borderRadius: t.radius.lg, backgroundColor: s.pressed || s.hovered ? t.colors.surfaceSunken : t.colors.surface, borderWidth: 1, borderColor: t.colors.border }, focusRing(t, s.focused)]}>
          <IconBadge icon={x.icon} color={x.color} size={44} />
          <View style={{ flex: 1 }}><Text variant="bodyStrong">{x.title}</Text><Text variant="caption" tone="muted">{x.hint}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
        </Pressable>
      ))}
    </Sheet>
  );
}
