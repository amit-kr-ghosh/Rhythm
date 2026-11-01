import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { useApp } from '../src/state/store';
import { useDayModel } from '../src/state/hooks';
import { Button, Card, EmptyState, ProgressBar, Screen, Text } from '../src/components/ui';
import { TimeField } from '../src/components/inputs';
import { ModalHeader } from '../src/components/tasks/ModalHeader';
import { DateStepper } from '../src/components/tasks/DateStepper';
import { confirm } from '../src/components/feedback';
import { overrideOccurrence, rescheduleOccurrence, skipOccurrence } from '../src/state/actions';
import { addDays, formatClock, formatDuration } from '../src/domain/time';
import { STATE_LABEL } from '../src/state/extra-timetable';
import { safeBack } from '../src/navigation/safeBack';

export default function OccurrenceScreen() {
  const t = useTheme();
  const router = useRouter();
  const { key, date } = useLocalSearchParams<{ key: string; date: string }>();
  const model = useDayModel(date, 30_000);
  const prev = useDayModel(addDays(date, -1), 60_000);
  const subjects = useApp((s) => s.data.subjects);
  const occ = model.occurrences.find((o) => o.key === key) ?? prev.occurrences.find((o) => o.key === key);
  const block = (model.progress.timetable.blocks.find((b) => b.occurrence.key === key) ?? prev.progress.timetable.blocks.find((b) => b.occurrence.key === key));
  const [mode, setMode] = useState<null | 'reschedule' | 'today'>(null);
  const [toDate, setToDate] = useState<string | null>(date);
  const [startMin, setStart] = useState(occ?.startMin ?? 540);
  const [endMin, setEnd] = useState(occ?.endMin ?? 600);
  const [error, setError] = useState<string | null>(null);

  if (!occ) return <Screen><ModalHeader title="Activity" /><EmptyState title="This block no longer exists" body="It may have been skipped, moved or deleted." actionLabel="Close" onAction={() => safeBack(router)} /></Screen>;
  const subject = subjects.find((s) => s.id === occ.subjectId);

  const skip = async () => {
    if (await confirm({ title: 'Skip this block?', message: 'It disappears from this day only and is not counted in progress. The recurring schedule is unchanged.', confirmLabel: 'Skip' })) { await skipOccurrence(occ); safeBack(router); }
  };
  const apply = async () => {
    setError(null);
    const res = mode === 'reschedule' && toDate ? await rescheduleOccurrence(occ, { date: toDate, startMin, endMin }) : await overrideOccurrence(occ, { startMin, endMin });
    if (res.ok) safeBack(router); else setError(Object.values(res.errors)[0] ?? 'Could not save.');
  };

  return (
    <Screen>
      <ModalHeader title={occ.title} />
      <Card style={{ gap: t.spacing.xs }}>
        <Text variant="heading">{formatClock(occ.startMin)} – {formatClock(occ.endMin)}</Text>
        <Text tone="muted">{formatDuration(occ.durationMin)}{occ.crossesMidnight ? ' · crosses midnight' : ''}{subject ? ` · ${subject.name}` : ''}</Text>
        {occ.rescheduled ? <Text variant="caption" tone="accent">Moved from its usual time on this day</Text> : null}
        {block && occ.category === 'study' ? <Text variant="caption" tone="muted">Status: {STATE_LABEL[block.state]}</Text> : null}
      </Card>
      {block && occ.category === 'study' ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="label" tone="muted">Scheduled vs recorded</Text>
          <ProgressBar value={block.scheduledMin > 0 ? (block.creditMin / block.scheduledMin) * 100 : null} label="Block completion" color={t.colors.success} />
          <Text variant="caption" tone="muted">Credited {formatDuration(Math.round(block.creditMin))} of {formatDuration(block.scheduledMin)} scheduled · linked focus {formatDuration(Math.round(block.linkedFocusMin))}</Text>
          {!block.counts ? <Text variant="caption" tone="muted">This block is not counted in daily progress.</Text> : null}
        </Card>
      ) : null}
      {occ.category === 'study' ? <Button label="Start focus for this block" icon="timer-outline" onPress={() => router.replace({ pathname: '/(tabs)/focus', params: { occurrenceKey: occ.key, subjectId: occ.subjectId ?? '' } } as never)} /> : null}
      <Text variant="label" tone="muted">Change just this day</Text>
      {mode ? (
        <Card style={{ gap: t.spacing.md }}>
          {mode === 'reschedule' ? <DateStepper label="Move to date" value={toDate} onChange={setToDate} base={date} /> : null}
          <TimeField label="Start" value={startMin} onChange={setStart} />
          <TimeField label="End" value={endMin} onChange={setEnd} />
          {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          <Button label="Apply" onPress={() => void apply()} />
          <Button label="Cancel" variant="ghost" onPress={() => setMode(null)} />
        </Card>
      ) : (
        <>
          <Button label="Change time (this day only)" icon="time-outline" variant="secondary" onPress={() => setMode('today')} />
          <Button label="Reschedule to another day" icon="calendar-outline" variant="secondary" onPress={() => setMode('reschedule')} />
          <Button label="Skip this occurrence" icon="play-skip-forward-outline" variant="secondary" onPress={() => void skip()} />
          {occ.templateId ? <Button label="Edit recurring activity…" variant="ghost" onPress={() => router.replace({ pathname: '/activity/[id]', params: { id: occ.templateId as string, date: occ.date } } as never)} /> : null}
        </>
      )}
    </Screen>
  );
}
