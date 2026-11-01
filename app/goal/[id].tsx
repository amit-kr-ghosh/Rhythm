import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { useToday } from '../../src/state/hooks';
import { Button, Card, IconButton, Row, Screen, Text } from '../../src/components/ui';
import { Field, NumberField } from '../../src/components/inputs';
import { ModalHeader } from '../../src/components/tasks/ModalHeader';
import { SubjectPicker } from '../../src/components/tasks/SubjectPicker';
import { DateStepper } from '../../src/components/tasks/DateStepper';
import { confirm } from '../../src/components/feedback';
import { addMilestone, archiveGoal, deleteGoal, removeMilestone, saveGoal, toggleMilestone } from '../../src/state/actions';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { safeBack } from '../../src/navigation/safeBack';

export default function GoalEditor() {
  const t = useTheme();
  const router = useRouter();
  const { id, subjectId: presetSubject } = useLocalSearchParams<{ id: string; subjectId?: string }>();
  const today = useToday();
  const existing = useApp((s) => s.data.goals.find((g) => g.id === id));
  const isNew = id === 'new' || !existing;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [why, setWhy] = useState(existing?.why ?? '');
  const [subjectId, setSubjectId] = useState<string | null>(existing?.subjectId ?? presetSubject ?? null);
  const [topic, setTopic] = useState(existing?.topic ?? '');
  const [deadline, setDeadline] = useState<string | null>(existing?.deadline ?? null);
  const [hours, setHours] = useState<number | null>(existing?.targetMin ? Math.round(existing.targetMin / 60) : null);
  const [ms, setMs] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const res = await saveGoal({ id: isNew ? undefined : existing?.id, title, why, subjectId, topic, deadline, targetMin: hours ? hours * 60 : null });
    if (!res.ok) { setErrors(res.errors); return; }
    if (isNew && ms.trim()) await addMilestone(res.value.id, ms);
    safeBack(router);
  };
  const remove = async () => {
    if (!existing) return;
    if (await confirm({ title: 'Delete goal?', message: 'The goal and its milestones are removed. Recorded study sessions are not affected.', confirmLabel: 'Delete', destructive: true })) { await deleteGoal(existing.id); safeBack(router); }
  };

  return (
    <Screen footer={<Button label={isNew ? 'Create goal' : 'Save'} onPress={() => void save()} />}>
      <ModalHeader title={isNew ? 'New goal' : 'Edit goal'} />
      <Field label="Goal" value={title} onChangeText={setTitle} error={errors.title} placeholder="e.g. Finish graph algorithms" />
      <Field label="Why does this matter to you?" value={why} onChangeText={setWhy} multiline />
      <SubjectPicker value={subjectId} onChange={setSubjectId} />
      <Field label="Topic (optional)" value={topic} onChangeText={setTopic} placeholder="e.g. Dynamic programming" />
      <DateStepper label="Deadline" value={deadline} onChange={setDeadline} base={today} allowClear />
      <NumberField label="Focus-hours target" suffix="hours" value={hours} onChange={setHours} error={errors.target} hint="Counts focused time on the chosen subject since the goal was created." />
      {isNew ? <Field label="First milestone (optional)" value={ms} onChangeText={setMs} /> : (
        <>
          <Text variant="heading">Milestones</Text>
          {existing!.milestones.length === 0 ? <Text tone="muted">No milestones yet.</Text> : null}
          {existing!.milestones.map((m) => (
            <Row key={m.id}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: m.done }} accessibilityLabel={m.title} onPress={() => void toggleMilestone(existing!.id, m.id)} style={{ width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={m.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={m.done ? t.colors.success : t.colors.textMuted} />
              </Pressable>
              <Text style={{ flex: 1, textDecorationLine: m.done ? 'line-through' : 'none' }} tone={m.done ? 'muted' : 'default'}>{m.title}</Text>
              <IconButton icon="trash-outline" label={`Remove milestone ${m.title}`} tone="danger" onPress={() => void removeMilestone(existing!.id, m.id)} />
            </Row>
          ))}
          <Card tone="sunken"><Row align="flex-end"><View style={{ flex: 1 }}><Field label="New milestone" value={ms} onChangeText={setMs} /></View><Button label="Add" compact fullWidth={false} disabled={!ms.trim()} onPress={() => { void addMilestone(existing!.id, ms); setMs(''); }} /></Row></Card>
          <Button label={existing!.archived ? 'Restore goal' : 'Archive goal'} variant="secondary" onPress={() => { void archiveGoal(existing!.id, !existing!.archived); safeBack(router); }} />
          <Button label="Delete goal" variant="danger" icon="trash-outline" onPress={() => void remove()} />
        </>
      )}
    </Screen>
  );
}
