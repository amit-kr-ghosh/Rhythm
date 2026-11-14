import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { useToday } from '../../src/state/hooks';
import { Banner, Button, Chip, Row, Screen, Text } from '../../src/components/ui';
import { Field, NumberField, Segmented, WeekdayPicker, TimeField, SwitchRow } from '../../src/components/inputs';
import { ModalHeader } from '../../src/components/tasks/ModalHeader';
import { SubjectPicker } from '../../src/components/tasks/SubjectPicker';
import { DateStepper } from '../../src/components/tasks/DateStepper';
import { confirm } from '../../src/components/feedback';
import { deleteTask, saveTask } from '../../src/state/actions';
import type { Priority, Recurrence } from '../../src/domain/types';
import { formatClock } from '../../src/domain/time';
import { useTheme } from '../../src/theme/ThemeProvider';
import { safeBack } from '../../src/navigation/safeBack';

const LEADS: { value: number | null; label: string }[] = [{ value: null, label: 'None' }, { value: 15, label: '15 min' }, { value: 60, label: '1 hour' }, { value: 1440, label: '1 day' }];

export default function TaskEditor() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const prefs = useApp((s) => s.data.prefs);
  const goals = useApp((s) => s.data.goals);
  const existing = useApp((s) => s.data.tasks.find((x) => x.id === id));
  const isNew = id === 'new' || !existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [subjectId, setSubjectId] = useState<string | null>(existing?.subjectId ?? null);
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState<string | null>(existing ? existing.dueDate : today);
  const [timed, setTimed] = useState(existing?.dueMin != null);
  const [dueMin, setDueMin] = useState(existing?.dueMin ?? 18 * 60);
  const [estimate, setEstimate] = useState<number | null>(existing?.estimateMin ?? null);
  const [lead, setLead] = useState<number | null>(existing?.reminderLeadMin ?? null);
  const [recKind, setRecKind] = useState<'none' | 'daily' | 'weekly'>(existing?.recurrence?.freq ?? 'none');
  const [recDays, setRecDays] = useState<number[]>(existing?.recurrence?.weekdays ?? [1, 2, 3, 4, 5]);
  const occurrenceKey = existing?.occurrenceKey ?? null; // legacy link to a timetable block: kept as is, no longer editable
  const [goalId, setGoalId] = useState<string | null>(existing?.goalId ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const recurrence: Recurrence = recKind === 'none' ? null : { freq: recKind, weekdays: recKind === 'weekly' ? recDays : [] };
    const res = await saveTask({
      id: isNew ? undefined : existing?.id, title, description, subjectId, priority, dueDate, dueMin: timed && dueDate ? dueMin : null,
      estimateMin: estimate, reminderLeadMin: lead, recurrence, occurrenceKey, goalId,
    });
    if (res.ok) safeBack(router); else setErrors(res.errors);
  };
  const remove = async () => {
    if (!existing) return;
    if (await confirm({ title: 'Delete task?', message: `"${existing.title}" will be removed. Study time already recorded is not affected.`, confirmLabel: 'Delete', destructive: true })) { await deleteTask(existing.id); safeBack(router); }
  };

  return (
    <Screen footer={<Button label={isNew ? "Add task" : "Save"} onPress={() => void save()} />}>
      <ModalHeader title={isNew ? 'New task' : 'Edit task'} />
      <Field label="Title" value={title} onChangeText={setTitle} error={errors.title} maxLength={120} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <SubjectPicker value={subjectId} onChange={setSubjectId} />
      <Text variant="label" tone="muted">Priority</Text>
      <Segmented label="Priority" value={priority} onChange={setPriority} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
      <DateStepper label="Due date" value={dueDate} onChange={setDueDate} base={today} allowClear error={errors.due} />
      {dueDate ? <SwitchRow label="Specific time" value={timed} onChange={setTimed} /> : null}
      {dueDate && timed ? <TimeField label={`Due at ${formatClock(dueMin)}`} value={dueMin} onChange={setDueMin} /> : null}
      <NumberField label="Estimated duration" suffix="min" value={estimate} onChange={setEstimate} error={errors.estimate} />
      <Text variant="label" tone="muted">Reminder before due</Text>
      <Row gap={t.spacing.sm} wrap>{LEADS.map((l) => <Chip key={String(l.value)} label={l.label} selected={lead === l.value} onPress={() => setLead(l.value)} />)}</Row>
      {lead !== null && !dueDate ? <Banner tone="warning" text="Reminders need a due date." /> : null}
      <Text variant="label" tone="muted">Repeat</Text>
      <Segmented label="Repeat" value={recKind} onChange={setRecKind} options={[{ value: 'none', label: 'Never' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
      {recKind === 'weekly' ? <WeekdayPicker value={recDays} onChange={setRecDays} weekStart={prefs.weekStart} /> : null}
      {goals.filter((g) => !g.archived).length ? (
        <>
          <Text variant="label" tone="muted">Goal</Text>
          <Row gap={t.spacing.sm} wrap>
            <Chip label="None" selected={goalId === null} onPress={() => setGoalId(null)} />
            {goals.filter((g) => !g.archived).map((g) => <Chip key={g.id} label={g.title} selected={goalId === g.id} onPress={() => setGoalId(g.id)} />)}
          </Row>
        </>
      ) : null}
      <Banner text="Completing a task does not add study time. Record a focus session or manual entry for that." />
      {!isNew ? <Button label="Delete task" variant="danger" icon="trash-outline" onPress={() => void remove()} /> : null}
    </Screen>
  );
}
