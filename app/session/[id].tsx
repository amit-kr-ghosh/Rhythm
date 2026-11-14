import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Button, Card, Chip, EmptyState, IconButton, Row, Screen, Text } from '../../src/components/ui';
import { DurationStepper, Field, TimeField } from '../../src/components/inputs';
import { confirm } from '../../src/components/feedback';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp, showToast } from '../../src/state/store';
import { useActiveSubjects } from '../../src/state/hooks';
import { deleteSession, editSession } from '../../src/state/actions';
import { minLabel, modeLabel, sessionStatusLabel } from '../../src/state/extra-focus';
import { addDays, formatClock, minutesOfDay, toDateKey } from '../../src/domain/time';
import { safeBack } from '../../src/navigation/safeBack';

export default function SessionDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id, reflect } = useLocalSearchParams() as { id: string; reflect?: string };
  const session = useApp((s) => s.data.sessions.find((x) => x.id === id));
  const allSubjects = useApp((s) => s.data.subjects);
  const tasks = useApp((s) => s.data.tasks);
  const subjects = useActiveSubjects();

  const [note, setNote] = useState(session?.note ?? '');
  const [reflection, setReflection] = useState(session?.reflection ?? '');
  const [subjectId, setSubjectId] = useState<string | null>(session?.subjectId ?? null);
  const [date, setDate] = useState(session?.date ?? '');
  const [startMin, setStartMin] = useState(session ? minutesOfDay(new Date(session.startedAt)) : 0);
  const [duration, setDuration] = useState(session ? Math.round(session.focusSec / 60) : 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (session && !dirty) { setNote(session.note); setReflection(session.reflection); setSubjectId(session.subjectId); } }, [session, dirty]);

  const linked = useMemo(() => ({ task: session ? tasks.find((x) => x.id === session.taskId)?.title ?? null : null }), [session, tasks]);

  if (!session) return <Screen><EmptyState icon="alert-circle-outline" title="Session not found" body="It may have been deleted." actionLabel="Go back" onAction={() => safeBack(router)} /></Screen>;

  const subject = allSubjects.find((s) => s.id === session.subjectId);
  const manual = session.source === 'manual';
  const mark = <T,>(fn: (v: T) => void) => (v: T) => { setDirty(true); fn(v); };
  const timeChanged = manual && (date !== session.date || startMin !== minutesOfDay(new Date(session.startedAt)) || duration !== Math.round(session.focusSec / 60));

  const save = async () => {
    setBusy(true); setErrors({});
    const res = await editSession(session.id, { note, reflection, subjectId, ...(timeChanged ? { time: { date, startMin, durationMin: duration } } : {}) });
    setBusy(false);
    if (!res.ok) { setErrors(res.errors); return; }
    setDirty(false);
    showToast('success', 'Session updated.');
    safeBack(router);
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Delete this session?', destructive: true, confirmLabel: 'Delete', message: `${minLabel(session.focusSec / 60)} of focus will be removed from your history and analytics. This cannot be undone.` });
    if (ok) { await deleteSession(session.id); safeBack(router); }
  };

  const row = (label: string, value: string) => (
    <Row between key={label} gap={t.spacing.md}><Text tone="muted" style={{ flexShrink: 0 }}>{label}</Text><Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Text></Row>
  );
  const start = new Date(session.startedAt), end = new Date(session.endedAt);
  const endNote = toDateKey(end) !== toDateKey(start) ? ' (next day)' : '';

  return (
    <Screen footer={<Button label="Save changes" icon="checkmark" onPress={save} loading={busy} disabled={!dirty && !timeChanged} />}>
      <Row between>
        <Text variant="title" accessibilityRole="header">Session</Text>
        <IconButton icon="trash-outline" tone="danger" label="Delete session" onPress={remove} />
      </Row>
      {reflect === '1' ? <Banner tone="success" text="Nice work. Add a quick reflection while it's fresh — what went well, what to do next?" /> : null}
      {session.status === 'cancelled' ? <Banner tone="warning" text="This session was cancelled, so it does not count toward progress or analytics." /> : null}

      <Card style={{ gap: t.spacing.md }}>
        <Row gap={t.spacing.sm}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: subject?.color ?? t.colors.textFaint }} /><Text variant="heading">{subject?.name ?? 'No subject'}</Text></Row>
        {row('Date', session.date)}
        {row('Started', formatClock(minutesOfDay(start)))}
        {row('Ended', `${formatClock(minutesOfDay(end))}${endNote}`)}
        {row('Focused', minLabel(session.focusSec / 60))}
        {row('Elapsed (running)', minLabel(session.elapsedSec / 60))}
        {row('Break', minLabel(session.breakSec / 60))}
        {session.plannedSec ? row('Planned', minLabel(session.plannedSec / 60)) : null}
        {row('Mode', modeLabel(session.mode))}
        {row('Status', sessionStatusLabel(session))}
        {row('Source', manual ? 'Manual entry' : 'Timer')}
        {linked.task ? row('Task', linked.task) : null}
      </Card>

      <Text variant="label" tone="muted">Subject</Text>
      <Row gap={t.spacing.sm} wrap>
        <Chip label="None" selected={subjectId === null} onPress={() => mark(setSubjectId)(null)} />
        {subjects.map((s) => <Chip key={s.id} label={s.name} color={s.color} selected={subjectId === s.id} onPress={() => mark(setSubjectId)(s.id)} />)}
        {subject && subject.archived ? <Chip label={`${subject.name} (archived)`} color={subject.color} selected={subjectId === subject.id} onPress={() => mark(setSubjectId)(subject.id)} /> : null}
      </Row>

      {manual ? (
        <Card style={{ gap: t.spacing.lg }}>
          <Text variant="label" tone="muted">Edit time</Text>
          <Row between>
            <IconButton icon="chevron-back" label="Previous day" onPress={() => mark(setDate)(addDays(date, -1))} />
            <Text variant="bodyStrong">{date}</Text>
            <IconButton icon="chevron-forward" label="Next day" onPress={() => { if (date < toDateKey(new Date())) mark(setDate)(addDays(date, 1)); }} />
          </Row>
          <TimeField label="Start time" value={startMin} onChange={mark(setStartMin)} error={errors.startMin} />
          <DurationStepper label="Duration" value={duration} onChange={mark(setDuration)} error={errors.durationMin} />
          {errors.date ? <Text variant="caption" tone="danger">{errors.date}</Text> : null}
          {errors.overlap ? <Banner tone="warning" text={errors.overlap} /> : null}
        </Card>
      ) : <Text variant="caption" tone="muted">Timer sessions keep their recorded times. To change them, delete this session and add a manual entry.</Text>}
      {errors.time ? <Banner tone="danger" text={errors.time} /> : null}
      {errors.general ? <Banner tone="danger" text={errors.general} /> : null}

      <Field label="Note" value={note} onChangeText={mark(setNote)} multiline placeholder="What did you work on?" />
      <Field label="Reflection" value={reflection} onChangeText={mark(setReflection)} multiline placeholder="What went well? What will you do next?" />
    </Screen>
  );
}
