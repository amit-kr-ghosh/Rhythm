import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { useToday } from '../../src/state/hooks';
import { Button, Card, EmptyState, IconButton, ProgressBar, ProgressRing, Row, Screen, SectionHeader, Text } from '../../src/components/ui';
import { SessionRow } from '../../src/components/focus/SessionRow';
import { minLabel, useSubjectStats } from '../../src/state/extra-focus';
import { totalFocus } from '../../src/domain/analytics';
import { isValidSession } from '../../src/domain/progress';
import { toggleMilestone } from '../../src/state/actions';
import { safeBack } from '../../src/navigation/safeBack';

export default function SubjectDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const subject = useApp((s) => s.data.subjects.find((x) => x.id === id));
  const sessions = useApp((s) => s.data.sessions);
  const goals = useApp((s) => s.data.goals);
  const stats = useSubjectStats(subject);
  const mine = useMemo(() => sessions.filter((s) => s.subjectId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions, id]);
  const notes = mine.filter((s) => s.note.trim() || s.reflection.trim()).slice(0, 10);
  const myGoals = goals.filter((g) => g.subjectId === id && !g.archived);
  if (!subject) return <Screen><EmptyState title="Subject not found" actionLabel="Back" onAction={() => safeBack(router)} /></Screen>;
  const valid = mine.filter(isValidSession);

  return (
    <Screen>
      <Row gap={t.spacing.xs} style={{ marginLeft: -t.spacing.sm }}>
        <IconButton icon="chevron-back" label="Back" onPress={() => safeBack(router)} />
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: subject.color }} />
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>{subject.name}</Text>
      </Row>
      <Card>
        <Row between align="flex-start">
          {([['Today', stats.todayMin, stats.dailyPct, stats.dailyTargetMin], ['Week', stats.weekMin, stats.weeklyPct, stats.weeklyTargetMin], ['Month', stats.monthMin, stats.monthlyPct, stats.monthlyTargetMin]] as const).map(([label, min, p, target]) => (
            <View key={label} style={{ alignItems: 'center', gap: t.spacing.xs }}>
              <ProgressRing value={p} size={92} stroke={8} color={subject.color} label={`${subject.name} ${label} target`} caption={undefined} />
              <Text variant="bodyStrong">{label}</Text>
              <Text variant="caption" tone="muted">{minLabel(min)}{target ? ` / ${minLabel(target)}` : ''}</Text>
            </View>
          ))}
        </Row>
        {!stats.dailyTargetMin && !stats.weeklyTargetMin ? <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.md }}>No targets set — percentages show "—" until you add one in Subjects.</Text> : null}
      </Card>
      {subject.notes ? <Card><Text variant="label" tone="muted">Notes</Text><Text>{subject.notes}</Text></Card> : null}

      <SectionHeader title="Topic goals & milestones" action="New goal" onAction={() => router.push({ pathname: '/goal/[id]', params: { id: 'new', subjectId: subject.id } } as never)} />
      {myGoals.length === 0 ? <Text variant="caption" tone="muted">No goals for this subject yet.</Text> : myGoals.map((g) => {
        const focus = totalFocus(sessions, { from: g.startDate, to: today }, subject.id);
        const p = g.targetMin ? Math.min(100, (focus / g.targetMin) * 100) : null;
        return (
          <Card key={g.id} style={{ gap: t.spacing.sm }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit goal ${g.title}`} onPress={() => router.push(`/goal/${g.id}` as never)} style={{ minHeight: t.minTouch, justifyContent: 'center' }}>
              <Text variant="bodyStrong">{g.title}{g.topic ? ` · ${g.topic}` : ''}</Text>
              {g.targetMin ? <Text variant="caption" tone="muted">{minLabel(focus)} of {minLabel(g.targetMin)}{p !== null ? ` · ${Math.round(p * 10) / 10}%` : ''}</Text> : null}
            </Pressable>
            {g.targetMin ? <ProgressBar value={p} color={subject.color} label={`${g.title} progress`} /> : null}
            {g.milestones.map((m) => (
              <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: m.done }} accessibilityLabel={m.title} onPress={() => void toggleMilestone(g.id, m.id)} style={{ minHeight: t.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Ionicons name={m.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={m.done ? t.colors.success : t.colors.textMuted} />
                <Text tone={m.done ? 'muted' : 'default'} style={{ textDecorationLine: m.done ? 'line-through' : 'none', flex: 1 }}>{m.title}</Text>
              </Pressable>
            ))}
          </Card>
        );
      })}

      <SectionHeader title="Notes & reflections" />
      {notes.length === 0 ? <Text variant="caption" tone="muted">Notes you add to sessions appear here.</Text> : notes.map((s) => (
        <Card key={s.id} style={{ gap: t.spacing.xs }}>
          <Text variant="caption" tone="muted">{s.date}</Text>
          {s.note ? <Text>{s.note}</Text> : null}
          {s.reflection ? <Text tone="muted">{s.reflection}</Text> : null}
        </Card>
      ))}

      <SectionHeader title={`Session history${valid.length ? ` · ${valid.length}` : ''}`} />
      {mine.length === 0 ? <EmptyState icon="timer-outline" title="No sessions yet" body="Start a focus session for this subject to build its history." actionLabel="Start focus" onAction={() => router.push({ pathname: '/(tabs)/focus', params: { subjectId: subject.id } } as never)} />
        : mine.slice(0, 30).map((s) => <SessionRow key={s.id} session={s} subject={subject} showDate onPress={() => router.push(`/session/${s.id}` as never)} />)}
      {mine.length > 30 ? <Button label={`Showing 30 of ${mine.length} — export for the full list`} variant="ghost" onPress={() => router.push('/settings/data' as never)} /> : null}
    </Screen>
  );
}
