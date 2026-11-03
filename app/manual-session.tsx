import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Button, Card, IconButton, Row, Screen, Text } from '../src/components/ui';
import { DurationStepper, Field, Select, TimeField } from '../src/components/inputs';
import { useTheme } from '../src/theme/ThemeProvider';
import { selectableSubjects } from '../src/domain/study';
import { useApp } from '../src/state/store';
import { useToday } from '../src/state/hooks';
import { addManualSession } from '../src/state/actions';
import { showToast } from '../src/state/store';
import { addDays, parseDateKey, WEEKDAY_SHORT, weekdayOf } from '../src/domain/time';
import { safeBack } from '../src/navigation/safeBack';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ManualSessionModal() {
  const t = useTheme();
  const router = useRouter();
  const today = useToday();
  const params = useLocalSearchParams() as { subjectId?: string };
  const allSubjects = useApp((s) => s.data.subjects);
  const subjects = useMemo(() => selectableSubjects(allSubjects), [allSubjects]);
  const [date, setDate] = useState(today);
  const [startMin, setStartMin] = useState(9 * 60);
  const [duration, setDuration] = useState(60);
  const [subjectId, setSubjectId] = useState<string | null>(params.subjectId ?? null);
  const chosen = subjectId ?? subjects[0]?.id ?? null;
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'date' | 'startMin' | 'durationMin' | 'overlap', string>>>({});
  const [busy, setBusy] = useState(false);

  const label = useMemo(() => { const p = parseDateKey(date); return `${WEEKDAY_SHORT[weekdayOf(date)]}, ${p.d} ${MONTHS[p.m - 1]} ${p.y}`; }, [date]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const res = await addManualSession({ date, startMin, durationMin: duration, subjectId: chosen, note: note.trim() });
    setBusy(false);
    if (!res.ok) { setErrors(res.errors); return; }
    showToast('success', 'Session added.');
    safeBack(router);
  };

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label="Save session" icon="checkmark" onPress={save} loading={busy} />}>
      <Text variant="display" accessibilityRole="header">Log study time</Text>

      <Card style={{ gap: t.spacing.lg }}>
        <Text variant="label" tone="muted">Date</Text>
        <Row between>
          <IconButton icon="chevron-back" label="Previous day" onPress={() => { setDate(addDays(date, -1)); setErrors({}); }} />
          <Text variant="bodyStrong" accessibilityRole="text">{label}</Text>
          <IconButton icon="chevron-forward" label="Next day" onPress={() => { if (date < today) { setDate(addDays(date, 1)); setErrors({}); } }} />
        </Row>
        {errors.date ? <Text variant="caption" tone="danger">{errors.date}</Text> : null}
        <TimeField label="Start time" value={startMin} onChange={(m) => { setStartMin(m); setErrors({}); }} error={errors.startMin} />
        <DurationStepper label="Duration" value={duration} onChange={(v) => { setDuration(v); setErrors({}); }} min={1} max={960} error={errors.durationMin} />
      </Card>

      {errors.overlap ? <Banner tone="warning" text={errors.overlap} /> : null}

      <Select<string | null> label="Subject" sheetTitle="Choose subject" value={chosen} onChange={(v) => setSubjectId(v)}
        options={subjects.map((x) => ({ value: x.id as string | null, label: x.name, color: x.color }))} />
      <Field label="Note" value={note} onChangeText={setNote} multiline placeholder="What did you cover?" />
    </Screen>
  );
}
