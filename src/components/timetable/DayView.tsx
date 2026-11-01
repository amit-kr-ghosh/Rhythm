import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { Banner, Button, EmptyState, Row, Text } from '../ui';
import { BlockCard } from './BlockCard';
import { findConflicts, type Segment } from '../../domain/schedule';
import { formatClock, formatDuration } from '../../domain/time';
import { useApp } from '../../state/store';
import type { DayModel } from '../../state/hooks';
import { blockColor } from '../../state/extra-timetable';
import { restoreSkipped } from '../../state/actions';

/** "9:30 AM" → { t: '9:30', ap: 'AM' } for the stacked time column. */
const clockParts = (min: number) => { const [tm, ap] = formatClock(min).split(' '); return { t: tm ?? '', ap: ap ?? '' }; };

export function DayView({ model, selectedKey, onOpen, onMore, onAdd, filter = 'all' }: {
  model: DayModel; selectedKey: string | null; filter?: 'all' | 'study' | 'routine'; onOpen: (s: Segment) => void; onMore: (s: Segment) => void; onAdd: () => void;
}) {
  const t = useTheme();
  const d = useApp((s) => s.data);
  const conflicts = useMemo(() => findConflicts(model.date, d.templates, d.exceptions), [model.date, d.templates, d.exceptions]);
  const skipped = useMemo(() => d.exceptions.filter((e) => e.type === 'skip' && e.date === model.date), [d.exceptions, model.date]);
  const groups = useMemo(() => {
    const segs = model.segments.filter((x) => filter === 'all' || (filter === 'study' ? x.category === 'study' : x.category !== 'study'));
    const defs: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; from: number; to: number }[] = [
      { key: 'm', label: 'Morning', icon: 'sunny-outline', from: 0, to: 720 }, { key: 'a', label: 'Afternoon', icon: 'partly-sunny-outline', from: 720, to: 1020 }, { key: 'e', label: 'Evening', icon: 'moon-outline', from: 1020, to: 1441 },
    ];
    return defs.map((g) => ({ ...g, segs: segs.filter((x) => x.segStart >= g.from && x.segStart < g.to) })).filter((g) => g.segs.length > 0);
  }, [model.segments, filter]);
  const blockState = (key: string) => model.progress.timetable.blocks.find((b) => b.occurrence.key === key)?.state;
  const studiedMin = (key: string) => model.progress.timetable.blocks.find((b) => b.occurrence.key === key)?.linkedFocusMin ?? 0;

  if (model.segments.length === 0 && skipped.length === 0) {
    return <EmptyState icon="calendar-clear-outline" title="Nothing scheduled" body="This day has no activities. Add one, or restore the default timetable from the menu." actionLabel="Add an activity" onAction={onAdd} />;
  }
  return (
    <View style={{ gap: t.spacing.md }}>
      {conflicts.slice(0, 3).map((c, i) => (
        <Banner key={i} tone="warning" text={`${c.a.title} (${formatClock(c.a.startMin)}) and ${c.b.title} (${formatClock(c.b.startMin)}) overlap by ${formatDuration(c.overlapMin)}.`} />
      ))}
      {conflicts.length > 3 ? <Text variant="caption" tone="warning">+{conflicts.length - 3} more overlaps this day</Text> : null}
      {groups.map((g, gi) => (
        <View key={g.key} style={{ gap: t.spacing.sm }}>
          <Row between style={{ marginTop: gi === 0 ? 0 : t.spacing.sm }}>
            <Row gap={t.spacing.sm}><Ionicons name={g.icon} size={20} color={t.colors.text} /><Text variant="bodyStrong">{g.label}</Text></Row>
            {gi === 0 ? <Text variant="caption" tone="muted">{model.isToday ? 'Today' : ''}</Text> : null}
          </Row>
          {g.segs.map((seg) => (
            <Row key={`${seg.key}${seg.spill ? ':spill' : ''}`} align="stretch" gap={t.spacing.md}>
              <View style={{ width: 52, alignItems: 'center', paddingTop: t.spacing.sm }}>
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>{clockParts(seg.segStart).t}</Text>
                <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>{clockParts(seg.segStart).ap}</Text>
                <View style={{ flex: 1, width: 1.5, backgroundColor: t.colors.borderStrong, opacity: 0.5, marginTop: 6, borderRadius: 1 }} />
              </View>
              <View style={{ flex: 1 }}>
                <BlockCard
                  seg={seg} color={blockColor(t.colors, d.subjects, seg)} state={seg.spill || seg.category !== 'study' ? undefined : blockState(seg.key)}
                  studiedMin={seg.category === 'study' && !seg.spill ? studiedMin(seg.key) : null} selected={selectedKey === seg.key} subjectName={d.subjects.find((s) => s.id === seg.subjectId)?.name ?? null}
                  onPress={() => onOpen(seg)} onMore={() => onMore(seg)}
                />
              </View>
            </Row>
          ))}
        </View>
      ))}
      {skipped.length > 0 ? (
        <View style={{ gap: t.spacing.sm, marginTop: t.spacing.sm }}>
          <Text variant="label" tone="muted">Skipped this day</Text>
          {skipped.map((e) => {
            const tpl = d.templates.find((x) => x.id === e.templateId);
            return (
              <Row key={e.id} between style={{ backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.md, padding: t.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{tpl?.title ?? 'Activity'}</Text>
                  {tpl ? <Text variant="caption" tone="muted">{formatClock(tpl.startMin)} – {formatClock(tpl.endMin)}</Text> : null}
                </View>
                <Button compact fullWidth={false} variant="secondary" label="Restore" onPress={() => { void restoreSkipped(e.id); }} accessibilityHint="Puts this activity back on the day" />
              </Row>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
