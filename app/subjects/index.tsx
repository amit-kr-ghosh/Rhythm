import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { Button, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ColorPicker, Field, NumberField } from '../../src/components/inputs';
import { Sheet, confirm } from '../../src/components/feedback';
import { archiveSubject, saveSubject } from '../../src/state/actions';
import { minLabel, useSubjectStats } from '../../src/state/extra-focus';
import type { Subject } from '../../src/domain/types';
import { PICKER_COLORS } from '../../src/domain/colors';
import { safeBack } from '../../src/navigation/safeBack';

function SubjectCard({ subject, onEdit }: { subject: Subject; onEdit: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const s = useSubjectStats(subject);
  return (
    <Card onPress={() => router.push(`/subjects/${subject.id}` as never)} accessibilityLabel={`${subject.name}, ${minLabel(s.todayMin)} today, ${minLabel(s.weekMin)} this week`} style={{ gap: t.spacing.sm }}>
      <Row between>
        <Row gap={t.spacing.sm} style={{ flex: 1 }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: subject.color }} /><Text variant="bodyStrong" numberOfLines={1}>{subject.name}</Text></Row>
        <IconButton icon="create-outline" label={`Edit ${subject.name}`} onPress={onEdit} />
      </Row>
      <Row gap={t.spacing.xl}>
        <View><Text variant="caption" tone="muted">Today</Text><Text variant="bodyStrong">{minLabel(s.todayMin)}</Text></View>
        <View><Text variant="caption" tone="muted">Week</Text><Text variant="bodyStrong">{minLabel(s.weekMin)}</Text></View>
        <View><Text variant="caption" tone="muted">Month</Text><Text variant="bodyStrong">{minLabel(s.monthMin)}</Text></View>
      </Row>
      {s.dailyTargetMin ? <><ProgressBar value={s.dailyPct} color={subject.color} label={`${subject.name} daily target`} /><Text variant="caption" tone="muted">Daily target {minLabel(s.dailyTargetMin)} · {s.dailyPct === null ? '—' : `${Math.round(s.dailyPct * 10) / 10}%`}</Text></> : <Text variant="caption" tone="muted">No daily target set</Text>}
    </Card>
  );
}

export default function SubjectsScreen() {
  const t = useTheme();
  const router = useRouter();
  const subjects = useApp((s) => s.data.subjects);
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PICKER_COLORS[0] as string);
  const [daily, setDaily] = useState<number | null>(null);
  const [weekly, setWeekly] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = (s: Subject | 'new') => {
    setEditing(s); setErrors({});
    const cur = s === 'new' ? null : s;
    setName(cur?.name ?? ''); setColor(cur?.color ?? (PICKER_COLORS[subjects.length % PICKER_COLORS.length] as string));
    setDaily(cur?.dailyTargetMin ?? null); setWeekly(cur?.weeklyTargetMin ?? null); setNotes(cur?.notes ?? '');
  };
  const save = async () => {
    const res = await saveSubject({ id: editing && editing !== 'new' ? editing.id : undefined, name, color, dailyTargetMin: daily, weeklyTargetMin: weekly, notes });
    if (res.ok) setEditing(null); else setErrors(res.errors);
  };
  const toggleArchive = async (s: Subject) => {
    if (!s.archived) {
      const ok = await confirm({ title: `Archive ${s.name}?`, message: 'It is hidden from pickers. All of its sessions and history are kept and still count in analytics.', confirmLabel: 'Archive' });
      if (!ok) return;
    }
    await archiveSubject(s.id, !s.archived); setEditing(null);
  };
  const active = subjects.filter((s) => !s.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = subjects.filter((s) => s.archived);

  return (
    <Screen>
      <Row gap={t.spacing.xs} style={{ marginLeft: -t.spacing.sm }}>
        <IconButton icon="chevron-back" label="Back" onPress={() => safeBack(router)} />
        <Text variant="title" accessibilityRole="header">Subjects</Text>
      </Row>
      <Button label="Add subject" icon="add" onPress={() => open('new')} />
      {active.length === 0 ? <EmptyState icon="book-outline" title="No subjects" body="Add a subject to track focused time and targets for it." /> : active.map((s) => <SubjectCard key={s.id} subject={s} onEdit={() => open(s)} />)}
      {archived.length ? <SectionHeader title="Archived" /> : null}
      {archived.map((s) => <Card key={s.id}><Row between><Text tone="muted">{s.name}</Text><Button label="Restore" compact fullWidth={false} variant="ghost" onPress={() => void toggleArchive(s)} /></Row></Card>)}

      <Sheet visible={editing !== null} title={editing === 'new' ? 'New subject' : 'Edit subject'} onClose={() => setEditing(null)}
        footer={<Button label="Save" onPress={() => void save()} />}>
        <Field label="Name" value={name} onChangeText={setName} error={errors.name} maxLength={40} />
        <Text variant="label" tone="muted">Colour</Text>
        <ColorPicker value={color} onChange={setColor} />
        <NumberField label="Daily target" suffix="min" value={daily} onChange={setDaily} error={errors.daily} hint={daily ? `${(daily / 60).toFixed(1)} hours` : 'Leave empty for no target'} />
        <NumberField label="Weekly target" suffix="min" value={weekly} onChange={setWeekly} error={errors.weekly} hint={weekly ? `${(weekly / 60).toFixed(1)} hours` : 'Leave empty for no target'} />
        <Text variant="caption" tone="muted">Changing a target only affects today onward; past days keep the target that applied then.</Text>
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        {editing && editing !== 'new' ? <Button label={editing.archived ? 'Restore subject' : 'Archive subject'} variant="secondary" onPress={() => void toggleArchive(editing)} /> : null}
      </Sheet>
    </Screen>
  );
}
