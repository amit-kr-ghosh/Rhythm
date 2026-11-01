import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { Pill, Row, Text, focusRing } from '../ui';
import { formatClock, formatDuration } from '../../domain/time';
import type { BlockState } from '../../domain/progress';
import type { Segment } from '../../domain/schedule';
import { STATE_LABEL, stateTone } from '../../state/extra-timetable';

export function StateChip({ state }: { state: BlockState }) {
  const t = useTheme();
  const tone = stateTone(state);
  const fg = tone === 'muted' ? t.colors.textMuted : t.colors[tone];
  return <Pill label={STATE_LABEL[state]} color={fg} />;
}

/** One timeline block, sized by duration (clamped so tiny and huge blocks both stay readable). */
export function BlockCard({ seg, color, state, selected, subjectName, studiedMin, onPress, onMore }: {
  seg: Segment; color: string; state?: BlockState; selected?: boolean; /** study blocks only: time actually recorded against this block */ studiedMin?: number | null; subjectName?: string | null; onPress: () => void; onMore: () => void;
}) {
  const t = useTheme();
  const shown = seg.segEnd - seg.segStart;
  // Compact: longer blocks get only a little more room (a 7 h sleep block used to take ~180 px of the screen).
  const height = Math.max(64, Math.min(92, Math.round(56 + shown * 0.08)));
  const continues = !seg.spill && seg.startMin + seg.durationMin > 1440;
  const range = seg.spill
    ? `from yesterday · until ${formatClock(seg.segEnd % 1440)}`
    : `${formatClock(seg.startMin)} – ${formatClock(seg.endMin)}${continues ? ' · continues tomorrow' : ''}`;
  const label = `${seg.title}, ${range}, ${formatDuration(seg.durationMin)}${state ? `, ${STATE_LABEL[state]}` : ''}`;
  const hasStudy = studiedMin !== null && studiedMin !== undefined;
  // Filled status button at the bottom-right, like the "Meet" / "In Progress" buttons in the reference.
  const badge = state === 'in_progress' ? { bg: t.colors.violet, fg: t.colors.onAccent, text: 'In progress' }
    : state === 'done' ? { bg: t.colors.lime, fg: t.colors.onLime, text: 'Done' }
    : state === 'partial' ? { bg: t.colors.warningSoft, fg: t.colors.warning, text: 'Partial' }
    : state === 'missed' ? { bg: t.colors.dangerSoft, fg: t.colors.danger, text: 'Missed' }
    : state === 'skipped' ? { bg: t.colors.surfaceSunken, fg: t.colors.textMuted, text: 'Skipped' } : null;
  return (
    <View style={{ minHeight: height, borderRadius: t.radius.lg, backgroundColor: t.colors.surface, borderWidth: selected ? 2 : t.isDark ? 1 : 0, borderColor: selected ? t.colors.focusRing : t.colors.border, shadowColor: t.colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: t.isDark ? 0.3 : 0.08, shadowRadius: 22, elevation: 3 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens details for this block" onPress={onPress}
        style={(s: { pressed: boolean; focused?: boolean }) => [{ paddingVertical: t.spacing.md, paddingLeft: t.spacing.lg, paddingRight: t.spacing.huge + t.spacing.xs, gap: 2, justifyContent: 'center', borderRadius: t.radius.lg }, focusRing(t, s.focused)]}>
        <Row gap={t.spacing.sm}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
          <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>{seg.title}</Text>
        </Row>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {range} · {hasStudy ? `Planned ${formatDuration(seg.durationMin)}` : formatDuration(seg.durationMin)}{subjectName && !hasStudy ? ` · ${subjectName}` : ''}{seg.rescheduled ? ' · moved' : ''}
        </Text>
        {hasStudy || badge ? (
          <Row between style={{ marginTop: 2 }}>
            {hasStudy ? <Row gap={6}><Ionicons name="timer-outline" size={16} color={color} /><Text variant="caption" style={{ fontWeight: '700', color: t.colors.text }}>Studied {studiedMin! > 0 ? formatDuration(Math.round(studiedMin!)) : 'none yet'}</Text></Row> : <View />}
            {badge ? <View style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, backgroundColor: badge.bg }}><Text variant="label" style={{ color: badge.fg, fontWeight: '700' }}>{badge.text}</Text></View> : null}
          </Row>
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${seg.title}`} onPress={onMore}
        style={(s: { pressed: boolean; focused?: boolean }) => [{ position: 'absolute', top: 2, right: 4, width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: t.minTouch / 2 }, focusRing(t, s.focused)]}>
        <Ionicons name="ellipsis-horizontal" size={20} color={t.colors.textMuted} />
      </Pressable>
    </View>
  );
}
