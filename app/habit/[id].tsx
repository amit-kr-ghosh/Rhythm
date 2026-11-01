import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { Button, Chip, Row, Screen, Text } from '../../src/components/ui';
import { ColorPicker, Field, SwitchRow, TimeField, WeekdayPicker } from '../../src/components/inputs';
import { ModalHeader } from '../../src/components/tasks/ModalHeader';
import { confirm } from '../../src/components/feedback';
import { archiveHabit, deleteHabit, saveHabit } from '../../src/state/actions';
import { CATEGORIES, type Category } from '../../src/domain/types';
import { CATEGORY_LABEL } from '../../src/state/extra-timetable';
import { PICKER_COLORS } from '../../src/domain/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { safeBack } from '../../src/navigation/safeBack';

export default function HabitEditor() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const prefs = useApp((s) => s.data.prefs);
  const existing = useApp((s) => s.data.habits.find((h) => h.id === id));
  const isNew = id === 'new' || !existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? (PICKER_COLORS[0] as string));
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [remind, setRemind] = useState(existing?.reminderMin != null);
  const [reminderMin, setReminderMin] = useState(existing?.reminderMin ?? 7 * 60);
  const [linked, setLinked] = useState<Category | null>(existing?.linkedCategory ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const res = await saveHabit({ id: isNew ? undefined : existing?.id, name, color, weekdays, reminderMin: remind ? reminderMin : null, linkedCategory: linked });
    if (res.ok) safeBack(router); else setErrors(res.errors);
  };
  const remove = async () => {
    if (!existing) return;
    if (await confirm({ title: 'Delete habit?', message: 'The habit and its check-in history are removed. Archive instead to keep the history.', confirmLabel: 'Delete', destructive: true })) { await deleteHabit(existing.id); safeBack(router); }
  };

  return (
    <Screen footer={<Button label={isNew ? 'Create habit' : 'Save'} onPress={() => void save()} />}>
      <ModalHeader title={isNew ? 'New habit' : 'Edit habit'} />
      <Field label="Name" value={name} onChangeText={setName} error={errors.name} placeholder="e.g. Exercise" />
      <Text variant="label" tone="muted">Colour</Text>
      <ColorPicker value={color} onChange={setColor} />
      <Text variant="label" tone="muted">Days</Text>
      <WeekdayPicker value={weekdays} onChange={setWeekdays} weekStart={prefs.weekStart} error={errors.weekdays} />
      <SwitchRow label="Daily reminder" value={remind} onChange={setRemind} hint="Only sent if reminders are enabled in Settings." />
      {remind ? <TimeField label="Remind at" value={reminderMin} onChange={setReminderMin} /> : null}
      <Text variant="label" tone="muted">Related timetable category (optional)</Text>
      <Row gap={t.spacing.sm} wrap>
        <Chip label="None" selected={linked === null} onPress={() => setLinked(null)} />
        {CATEGORIES.map((c) => <Chip key={c} label={CATEGORY_LABEL[c] ?? c} selected={linked === c} onPress={() => setLinked(c)} />)}
      </Row>
      {!isNew ? (
        <>
          <Button label={existing!.archived ? 'Restore habit' : 'Archive habit'} variant="secondary" onPress={() => { void archiveHabit(existing!.id, !existing!.archived); safeBack(router); }} />
          <Button label="Delete habit" variant="danger" icon="trash-outline" onPress={() => void remove()} />
        </>
      ) : null}
    </Screen>
  );
}
