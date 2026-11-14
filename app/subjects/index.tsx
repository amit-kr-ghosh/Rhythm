import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { Button, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionHeader, Text } from '../../src/components/ui';
import { ColorPicker, Field, IconPicker, NumberField } from '../../src/components/inputs';
import { Sheet, confirm } from '../../src/components/feedback';
import { archiveSubject, deleteSubject, saveSubject, subjectUsage } from '../../src/state/actions';
import { minLabel, useSubjectStats } from '../../src/state/extra-focus';
import type { Subject } from '../../src/domain/types';
import { PICKER_COLORS } from '../../src/domain/colors';
import { defaultSubjectIcon, subjectIcon } from '../../src/domain/subjectIcons';
import { safeBack } from '../../src/navigation/safeBack';

function SubjectCard({ subject, onEdit }: { subject: Subject; onEdit: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const s = useSubjectStats(subject);
  return (
    <Card onPress={() => router.push(`/subjects/${subject.id}` as never)} accessibilityLabel={`${subject.name}, ${minLabel(s.todayMin)} today, ${minLabel(s.weekMin)} this week`} style={{ gap: t.spacing.sm }}>
      <Row between>
        <Row gap={t.spacing.sm} style={{ flex: 1 }}><View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: subject.color }}><Ionicons name={subjectIcon(subject) as never} size={18} color={t.colors.bg} /></View><Text variant="bodyStrong" numberOfLines={1}>{subject.name}</Text></Row>
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
  const [icon, setIcon] = useState<string>(defaultSubjectIcon(''));
  const [daily, setDaily] = useState<number | null>(null);
  const [weekly, setWeekly] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const open = (s: Subject | 'new') => {
    setEditing(s); setErrors({}); setDeleteError(null);
    const cur = s === 'new' ? null : s;
    setName(cur?.name ?? ''); setColor(cur?.color ?? (PICKER_COLORS[subjects.length % PICKER_COLORS.length] as string));
    setIcon(cur ? subjectIcon(cur) : defaultSubjectIcon(''));
    setDaily(cur?.dailyTargetMin ?? null); setWeekly(cur?.weeklyTargetMin ?? null); setNotes(cur?.notes ?? '');
  };
  const save = async () => {
    const res = await saveSubject({ id: editing && editing !== 'new' ? editing.id : undefined, name, color, icon, dailyTargetMin: daily, weeklyTargetMin: weekly, notes });
    if (res.ok) setEditing(null); else setErrors(res.errors);
  };
  const toggleArchive = async (s: Subject) => {
    if (!s.archived) {
      const ok = await confirm({ title: `Archive ${s.name}?`, message: 'It is hidden from pickers. All of its sessions and history are kept and still count in analytics.', confirmLabel: 'Archive' });
      if (!ok) return;
    }
    await archiveSubject(s.id, !s.archived); setEditing(null);
  };
  const remove = async (s: Subject) => {
    const u = subjectUsage(s.id);
    const lines: string[] = [];
    if (u.sessions) lines.push(`${u.sessions} recorded session${u.sessions === 1 ? ' is' : 's are'} kept in your history as “Unassigned”.`);
    const unlinked = [u.tasks && `${u.tasks} task${u.tasks === 1 ? '' : 's'}`, u.goals && `${u.goals} goal${u.goals === 1 ? '' : 's'}`, u.activities && `${u.activities} timetable block${u.activities === 1 ? '' : 's'}`].filter(Boolean);
    if (unlinked.length) lines.push(`${unlinked.join(', ')} will be unlinked from it.`);
    lines.push('This deletes the subject on all your devices. To just hide it, archive it instead.');
    const ok = await confirm({ title: `Delete ${s.name}?`, message: lines.join('\n\n'), confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    const res = await deleteSubject(s.id);
    if (res.ok) { setEditing(null); setDeleteError(null); } else setDeleteError(Object.values(res.errors)[0] ?? 'Could not delete the subject.');
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
      {archived.map((s) => <Card key={s.id}><Row between><Text tone="muted">{s.name}</Text><Row gap={t.spacing.xs}><Button label="Restore" compact fullWidth={false} variant="ghost" onPress={() => void toggleArchive(s)} /><IconButton icon="trash-outline" tone="danger" label={`Delete ${s.name}`} onPress={() => void remove(s)} /></Row></Row></Card>)}

      <Sheet visible={editing !== null} title={editing === 'new' ? 'New subject' : 'Edit subject'} onClose={() => setEditing(null)}
        footer={<Button label="Save" onPress={() => void save()} />}>
        <Field label="Name" value={name} onChangeText={setName} error={errors.name} maxLength={40} />
        <Text variant="label" tone="muted">Colour</Text>
        <ColorPicker value={color} onChange={setColor} />
        <Text variant="label" tone="muted">Icon</Text>
        <IconPicker value={icon} color={color} onChange={setIcon} />
        {errors.icon ? <Text variant="caption" tone="danger">{errors.icon}</Text> : null}
        <NumberField label="Daily target" suffix="min" value={daily} onChange={setDaily} error={errors.daily} hint={daily ? `${(daily / 60).toFixed(1)} hours` : 'Leave empty for no target'} />
        <NumberField label="Weekly target" suffix="min" value={weekly} onChange={setWeekly} error={errors.weekly} hint={weekly ? `${(weekly / 60).toFixed(1)} hours` : 'Leave empty for no target'} />
        <Text variant="caption" tone="muted">Changing a target only affects today onward; past days keep the target that applied then.</Text>
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        {editing && editing !== 'new' ? <Button label={editing.archived ? 'Restore subject' : 'Archive subject'} variant="secondary" onPress={() => void toggleArchive(editing)} /> : null}
        {editing && editing !== 'new' ? <Button label="Delete subject" icon="trash-outline" variant="danger" onPress={() => void remove(editing)} /> : null}
        {deleteError ? <Text variant="caption" tone="danger">{deleteError}</Text> : null}
      </Sheet>
    </Screen>
  );
}
