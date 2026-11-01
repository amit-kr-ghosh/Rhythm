import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { Button, Card, IconButton, ProgressBar, ProgressRing, Row, Text, focusRing } from '../ui';
import { Sheet } from '../feedback';
import { formatClock, minutesOfDay } from '../../domain/time';
import { formatCompact, formatExact, type SubjectDay } from '../../domain/study';

const clock = (iso: string) => formatClock(minutesOfDay(new Date(iso)));

/**
 * One tracked subject as a compact card that sits two-per-row on phones: dot + name on top, big % with a round play
 * button, a thin progress bar, then one short "actual / target · left" line. Every text shrinks to fit (never clipped
 * with "…"). Tap the card body for sessions; tap the play button to start focus (two sibling buttons, never nested).
 */
export function SubjectCard({ row, onOpen, onStart }: { row: SubjectDay; onOpen: () => void; onStart: () => void }) {
  const t = useTheme();
  const pct = Math.round(row.pct);
  const label = `${row.name}: ${formatCompact(row.actualSec)} of ${formatCompact(row.targetSec)}, ${pct}%. Open sessions`;
  const left = row.remainingSec > 0 ? `${formatCompact(row.remainingSec)} left` : 'Target reached';
  const ring = (s: { pressed: boolean; focused?: boolean }) => [{ borderRadius: t.radius.lg, opacity: s.pressed ? 0.85 : 1 }, focusRing(t, s.focused)];
  return (
    <Card style={{ gap: t.spacing.sm, padding: t.spacing.md, borderRadius: t.radius.lg }}>
      <Row between gap={t.spacing.sm}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen} style={(s: { pressed: boolean; focused?: boolean }) => [{ flex: 1, minWidth: 0, gap: 2 }, ...ring(s)]}>
          <Row gap={6} style={{ minWidth: 0 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
            <Text variant="label" fit numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18 }}>{row.name}</Text>
          </Row>
          <Text variant="title" fit numberOfLines={1} style={{ color: row.color, fontSize: 24, lineHeight: 30 }}>{pct}%</Text>
        </Pressable>
        <IconButton icon="play" label={`Start focus for ${row.name}`} tone="ink" size={16} onPress={onStart} />
      </Row>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen} style={(s: { pressed: boolean; focused?: boolean }) => [{ gap: 6 }, ...ring(s)]}>
        <ProgressBar value={Math.min(100, row.pct)} color={row.color} height={6} label={`${row.name} progress`} />
        <Text variant="caption" tone="muted" fit numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>{formatCompact(row.actualSec)} / {formatCompact(row.targetSec)} · {left}</Text>
      </Pressable>
    </Card>
  );
}

/** Subject ring used on Analytics: ring + name + "actual / target". */
export function SubjectRing({ name, color, pct, actualSec, targetSec, size = 84 }: { name: string; color: string; pct: number; actualSec: number; targetSec: number; size?: number }) {
  return (
    <View accessible accessibilityLabel={`${name}: ${formatCompact(actualSec)} of ${formatCompact(targetSec)}, ${Math.round(pct)}%`} style={{ alignItems: 'center', gap: 8, flex: 1, minWidth: 88 }}>
      <ProgressRing value={Math.min(100, pct)} size={size} stroke={9} color={color} label={`${name} progress`} display={`${Math.round(pct)}%`} />
      <View style={{ alignItems: 'center' }}>
        <Row gap={6}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /><Text variant="bodyStrong" fit numberOfLines={1}>{name}</Text></Row>
        <Text variant="caption" fit numberOfLines={1} tone="muted">{formatCompact(actualSec)} / {formatCompact(targetSec)}</Text>
      </View>
    </View>
  );
}

/** The day's sessions for one subject (start, end, exact duration) plus the manual status override. */
export function SubjectSheet({ row, onClose, onStart, onLog }: { row: SubjectDay | null; onClose: () => void; onStart: (subjectId: string) => void; onLog: (subjectId: string) => void }) {
  const t = useTheme();
  if (!row) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  return (
    <Sheet visible title={row.name} onClose={onClose}>
      <Row gap={t.spacing.lg}>
        {[['Studied', formatExact(row.actualSec)], ['Target', formatCompact(row.targetSec)], ['Left', row.remainingSec > 0 ? formatCompact(row.remainingSec) : '—']].map(([k, v]) => (
          <View key={k} style={{ flex: 1 }}><Text variant="caption" tone="muted">{k}</Text><Text variant="heading">{v}</Text></View>
        ))}
      </Row>
      <ProgressBar value={Math.min(100, row.pct)} color={row.color} height={12} label={`${row.name} progress`} />
      <Text variant="caption" tone="muted">{Math.round(row.pct)}% · {row.sessionCount} session{row.sessionCount === 1 ? '' : 's'}</Text>

      <View style={{ gap: t.spacing.xs }}>
        <Text variant="label" tone="muted">Sessions</Text>
        {row.sessions.length === 0 ? <Text variant="caption" tone="muted">No sessions recorded yet.</Text> : row.sessions.map((s) => (
          <Row key={s.id} between style={{ minHeight: 44, borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
            <Text variant="body">{clock(s.startedAt)} – {clock(s.endedAt)}</Text>
            <Text variant="bodyStrong">{formatExact(s.focusSec)}{s.source === 'manual' ? ' ✎' : ''}</Text>
          </Row>
        ))}
      </View>

      <Button label="Start focus" icon="play" variant="lime" onPress={() => { onClose(); onStart(row.subjectId); }} />
      <Button label="Log study time" icon="create-outline" variant="secondary" onPress={() => { onClose(); onLog(row.subjectId); }} />
    </Sheet>
  );
}
