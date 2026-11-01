import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { tint } from '../../theme/tokens';
import { Button, Card, Pill, ProgressBar, Row, Text, focusRing } from '../ui';
import { formatClock, formatDuration } from '../../domain/time';
import type { BlockProgress, BlockState } from '../../domain/progress';
import type { Habit, HabitRecord } from '../../domain/types';

const STATE_LABEL: Record<BlockState, string> = {
  excluded: 'Not counted', upcoming: 'Upcoming', in_progress: 'Now', done: 'Done', partial: 'Partial', missed: 'Missed', skipped: 'Skipped',
};

export function stateLabel(s: BlockState): string { return STATE_LABEL[s]; }

export function StateBadge({ state }: { state: BlockState }) {
  const t = useTheme();
  const c = t.colors;
  const map: Record<BlockState, string> = { done: c.success, partial: c.warning, missed: c.danger, skipped: c.textMuted, upcoming: c.textMuted, in_progress: c.accent, excluded: c.textFaint };
  return <Pill label={STATE_LABEL[state]} color={map[state]} />;
}

/** One row of the timeline. Tapping opens the occurrence actions sheet. The block that is happening now is highlighted. */
export function TimelineRow({ block, onPress, last }: { block: BlockProgress; onPress: () => void; last: boolean }) {
  const t = useTheme();
  const o = block.occurrence;
  const color = o.color ?? t.colors.category[o.category];
  const now = block.state === 'in_progress';
  const label = `${o.title}, ${formatClock(o.startMin)} to ${formatClock(o.endMin)}, ${stateLabel(block.state)}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ flexDirection: 'row', gap: t.spacing.md, minHeight: 64, opacity: s.pressed ? 0.75 : 1, borderRadius: t.radius.md }, focusRing(t, s.focused)]}>
      <View style={{ width: 58, paddingTop: 2 }}><Text variant="caption" tone="muted">{formatClock(o.startMin)}</Text></View>
      <View style={{ alignItems: 'center', width: 14 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: block.state === 'done' ? color : 'transparent', borderWidth: 3, borderColor: color, marginTop: 2 }} />
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: t.colors.border, marginVertical: 2 }} /> : null}
      </View>
      <View style={{ flex: 1, marginBottom: t.spacing.md, padding: t.spacing.md, borderRadius: t.radius.lg, backgroundColor: now ? tint(color, t.isDark ? 0.22 : 0.14) : t.colors.surfaceSunken, opacity: block.state === 'skipped' || block.state === 'excluded' ? 0.65 : 1 }}>
        <Row between>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{o.title}</Text>
          <StateBadge state={block.state} />
        </Row>
        <Text variant="caption" tone="muted">{formatDuration(o.durationMin)}{o.rescheduled ? ' · moved' : ''}{o.crossesMidnight ? ' · ends next day' : ''}</Text>
      </View>
    </Pressable>
  );
}

export function SubjectBars({ rows }: { rows: { subjectId: string; name: string; color: string; focusMin: number; targetMin: number | null; pct: number | null }[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md }}>
      {rows.map((r) => (
        <View key={r.subjectId} style={{ gap: 6 }} accessible accessibilityLabel={`${r.name}: ${formatDuration(Math.round(r.focusMin))}${r.targetMin ? ` of ${formatDuration(r.targetMin)}, ${r.pct}%` : ', no target'}`}>
          <Row between>
            <Row gap={t.spacing.sm}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} /><Text variant="label">{r.name}</Text></Row>
            <Text variant="caption" tone="muted">{formatDuration(Math.round(r.focusMin))}{r.targetMin ? ` / ${formatDuration(r.targetMin)}` : ''}</Text>
          </Row>
          <ProgressBar value={r.targetMin ? r.pct : r.focusMin > 0 ? 100 : 0} color={r.color} height={8} />
        </View>
      ))}
    </View>
  );
}

export function HabitTicks({ habits, records, today, onToggle }: { habits: Habit[]; records: HabitRecord[]; today: string; onToggle: (id: string) => void }) {
  const t = useTheme();
  return (
    <Row wrap gap={t.spacing.sm}>
      {habits.map((h) => {
        const done = records.some((r) => r.habitId === h.id && r.date === today && r.done && !r.deletedAt);
        return (
          <Pressable key={h.id} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${h.name}, ${done ? 'done' : 'not done'} today`} onPress={() => onToggle(h.id)}
            style={(s: { pressed: boolean; focused?: boolean }) => [{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingHorizontal: t.spacing.lg, borderRadius: t.radius.pill, borderWidth: 1.5, borderColor: done ? h.color : t.colors.border, backgroundColor: done ? tint(h.color, t.isDark ? 0.22 : 0.14) : t.colors.surface, opacity: s.pressed ? 0.8 : 1 }, focusRing(t, s.focused)]}>
            <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? h.color : t.colors.textMuted} />
            <Text variant="label">{h.name}</Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

/** "Now / next" card with a one-tap path into a focus session. */
export function NowNextCard({ current, next, remainingMin, onPress, onFocus, timerRunning }: {
  current: { title: string; segEnd: number; startMin: number; endMin: number } | null; next: { title: string; startMin: number; endMin: number } | null; remainingMin: number | null;
  onPress: () => void; onFocus: () => void; timerRunning: boolean;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open timetable" onPress={onPress} style={(s: { pressed: boolean; focused?: boolean }) => [{ gap: 4, borderRadius: t.radius.md }, focusRing(t, s.focused)]}>
        <Row between>
          <Pill label={current ? 'Now' : 'Free time'} color={current ? t.colors.accent : t.colors.textMuted} />
          <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
        </Row>
        {current ? (
          <>
            <Text variant="title" style={{ marginTop: t.spacing.xs }}>{current.title}</Text>
            <Text tone="muted">{formatClock(current.startMin)} – {formatClock(current.endMin)}{remainingMin !== null ? ` · ${formatDuration(remainingMin)} left` : ''}</Text>
          </>
        ) : <Text variant="heading" tone="muted" style={{ marginTop: t.spacing.xs }}>Nothing scheduled right now</Text>}
        {next ? <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.xs }}>Next: {next.title} at {formatClock(next.startMin)}</Text> : <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.xs }}>Nothing else today</Text>}
      </Pressable>
      <Button label={timerRunning ? 'Open timer' : 'Start focus'} icon={timerRunning ? 'timer' : 'play'} variant="lime" onPress={onFocus} />
    </Card>
  );
}
