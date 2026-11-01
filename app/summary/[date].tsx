import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Banner, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionHeader, Stat, Text } from '../../src/components/ui';
import { StateBadge } from '../../src/components/home/parts';
import { useDayModel, useToday } from '../../src/state/hooks';
import { WEEKDAY_LONG, addDays, formatClock, formatDuration, isValidDateKey, weekdayOf } from '../../src/domain/time';

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  const t = useTheme();
  if (items.length === 0) return <Text variant="caption" tone="muted">{empty}</Text>;
  return <View style={{ gap: t.spacing.xs }}>{items.map((s, i) => <Text key={i} variant="caption">• {s}</Text>)}</View>;
}

export default function Summary() {
  const t = useTheme();
  const router = useRouter();
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && isValidDateKey(String(params.date)) ? String(params.date) : today;
  const day = useDayModel(date);
  const p = day.progress;
  const isFinal = p.timetable.isFinal;
  const noData = day.occurrences.length === 0 && p.study.focusMin === 0 && p.tasks.total === 0 && p.habits.total === 0;
  const go = (n: number) => router.replace(`/summary/${addDays(date, n)}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Daily summary' }} />
      <Row between>
        <IconButton icon="chevron-back" label="Previous day" solid onPress={() => go(-1)} />
        <View style={{ alignItems: 'center' }}>
          <Text variant="heading" accessibilityRole="header">{date === today ? 'Today' : WEEKDAY_LONG[weekdayOf(date)]}</Text>
          <Text variant="caption" tone="muted">{date}</Text>
        </View>
        <IconButton icon="chevron-forward" label="Next day" solid onPress={() => go(1)} />
      </Row>

      <Banner tone={isFinal ? 'success' : 'info'} text={isFinal ? 'Final summary for this day.' : 'Day still in progress: these are “so far” figures and will change.'} />

      {noData ? <EmptyState icon="document-text-outline" title="Nothing recorded for this day" body="Plan activities or record a focus session and the summary will appear here." /> : (
        <>
          <Card tone="hero"><Text variant="title" tone="hero">{day.summary.headline}</Text></Card>

          <SectionHeader title="Planned vs actual" />
          <Card style={{ gap: t.spacing.md }}>
            <Row gap={t.spacing.lg} wrap>
              <Stat label="Planned" value={formatDuration(Math.round(p.timetable.scheduledMin))} hint="counted blocks" />
              <Stat label="Completed" value={formatDuration(Math.round(p.timetable.creditMin))} tone="success" />
              <Stat label={isFinal ? 'Final' : 'So far'} value={p.timetable.currentPct === null ? '—' : `${p.timetable.currentPct}%`} tone="accent" />
            </Row>
            <ProgressBar value={p.timetable.currentPct} label="Timetable completion" />
            {!isFinal ? <Text variant="caption" tone="muted">If the day ended now: {p.timetable.projectedFinalPct === null ? '—' : `${p.timetable.projectedFinalPct}%`}</Text> : null}
            <View style={{ height: 1, backgroundColor: t.colors.border }} />
            <Row gap={t.spacing.lg} wrap>
              <Stat label="Study focus" value={p.study.focusMin > 0 ? formatDuration(Math.round(p.study.focusMin)) : '—'} />
              <Stat label="Target" value={formatDuration(p.study.targetMin)} />
              <Stat label="Of target" value={p.study.pct === null ? '—' : `${p.study.pct}%`} />
            </Row>
            <Row gap={t.spacing.lg} wrap>
              <Stat label="Tasks" value={p.tasks.total ? `${p.tasks.done}/${p.tasks.total}` : '—'} />
              <Stat label="Habits" value={p.habits.total ? `${p.habits.done}/${p.habits.total}` : '—'} />
              <Stat label="Score" value={p.score === null ? '—' : `${p.score}%`} />
            </Row>
          </Card>

          <SectionHeader title="Achievements" />
          <Card><Bullets items={day.summary.achievements} empty="No achievements recorded yet." /></Card>
          <SectionHeader title={isFinal ? 'Missed' : 'Behind so far'} />
          <Card><Bullets items={day.summary.missed} empty="Nothing missed." /></Card>
          <SectionHeader title="Opportunities" />
          <Card><Bullets items={day.summary.opportunities} empty="No suggestions right now." /></Card>

          {p.timetable.blocks.length > 0 ? (
            <>
              <SectionHeader title="Block by block" />
              <Card style={{ gap: t.spacing.md }}>
                {p.timetable.blocks.map((b) => (
                  <Row key={b.occurrence.key} between>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{b.occurrence.title}</Text>
                      <Text variant="caption" tone="muted">{formatClock(b.occurrence.startMin)} · planned {formatDuration(b.scheduledMin)}{b.linkedFocusMin > 0 ? ` · focused ${formatDuration(Math.round(b.linkedFocusMin))}` : ''}</Text>
                    </View>
                    <StateBadge state={b.state} />
                  </Row>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
