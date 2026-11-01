import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { useToday } from '../../src/state/hooks';
import { Banner, Button, Chip, Row, Screen, Text } from '../../src/components/ui';
import { ColorPicker, Field, SwitchRow, TimeField, WeekdayPicker } from '../../src/components/inputs';
import { ModalHeader } from '../../src/components/tasks/ModalHeader';
import { SubjectPicker } from '../../src/components/tasks/SubjectPicker';
import { choose, confirm, useBackHandler } from '../../src/components/feedback';
import { createActivity, deleteActivity, duplicateActivity, editActivity } from '../../src/state/actions';
import { CATEGORIES, type Category } from '../../src/domain/types';
import { crossesMidnight, durationMin, formatClock, formatDuration, WEEKDAY_LONG } from '../../src/domain/time';
import { conflictsForCandidate } from '../../src/domain/schedule';
import { validateActivity } from '../../src/domain/validation';
import { CATEGORY_LABEL, REMINDER_OPTIONS, nextDateOn } from '../../src/state/extra-timetable';
import { safeBack } from '../../src/navigation/safeBack';

export default function ActivityEditor() {
  const t = useTheme();
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const today = useToday();
  const from = date ?? today;
  const prefs = useApp((s) => s.data.prefs);
  const templates = useApp((s) => s.data.templates);
  const exceptions = useApp((s) => s.data.exceptions);
  const existing = templates.find((x) => x.id === id);
  const isNew = id === 'new' || !existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'study');
  const [subjectId, setSubjectId] = useState<string | null>(existing?.subjectId ?? null);
  const [color, setColor] = useState<string | null>(existing?.color ?? null);
  const [startMin, setStart] = useState(existing?.startMin ?? 9 * 60);
  const [endMin, setEnd] = useState(existing?.endMin ?? 10 * 60);
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [1, 2, 3, 4, 5]);
  const [lead, setLead] = useState<number | null>(existing?.reminderLeadMin ?? null);
  const [count, setCount] = useState(existing?.countInProgress ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const mark = <T,>(set: (v: T) => void) => (v: T) => { setDirty(true); set(v); };

  useBackHandler(React.useCallback(() => {
    if (!dirty) return false;
    void confirm({ title: 'Discard changes?', message: 'Your edits to this activity have not been saved.', confirmLabel: 'Discard', destructive: true }).then((ok) => { if (ok) safeBack(router); });
    return true;
  }, [dirty, router]));

  const live = useMemo(() => validateActivity({ title, category, startMin, endMin, weekdays, reminderLeadMin: lead }), [title, category, startMin, endMin, weekdays, lead]);
  const overlaps = useMemo(() => {
    if (startMin === endMin) return [];
    const hits = new Map<string, string>();
    for (const wd of weekdays) {
      const d = nextDateOn(wd, from);
      for (const o of conflictsForCandidate(d, { startMin, endMin, ignoreKey: existing ? `${existing.id}@${d}` : undefined }, templates, exceptions)) {
        if (existing && o.templateId === existing.id) continue;
        hits.set(`${wd}-${o.key}`, `${WEEKDAY_LONG[wd]}: ${o.title} (${formatClock(o.startMin)}–${formatClock(o.endMin)})`);
      }
    }
    return [...hits.values()];
  }, [startMin, endMin, weekdays, templates, exceptions, from, existing]);

  const save = async () => {
    const input = { title, category, subjectId, color, startMin, endMin, weekdays, reminderLeadMin: lead, countInProgress: count };
    if (isNew) {
      const res = await createActivity(input, from < today ? today : from);
      if (res.ok) safeBack(router); else setErrors(res.errors);
      return;
    }
    const scope = await choose('Apply this change', 'Earlier days keep their current version, so your history is never rewritten.', [
      { key: 'from', label: `This and following days (from ${from})` }, { key: 'today', label: `From today (${today})` },
    ]);
    if (!scope) return;
    const res = await editActivity(existing!.id, input, scope === 'from' ? from : today);
    if (res.ok) { setDirty(false); safeBack(router); } else setErrors(res.errors);
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({ title: `Delete “${existing.title}”?`, message: `It is removed from ${from} onward. Earlier days and anything recorded on them are kept.`, confirmLabel: 'Delete', destructive: true });
    if (ok) { await deleteActivity(existing.id, from); safeBack(router); }
  };

  const err = (k: string) => errors[k] ?? (dirty ? (live.errors as Record<string, string>)[k] : undefined);
  const dur = startMin === endMin ? null : durationMin(startMin, endMin);

  return (
    <Screen footer={<Button label={isNew ? 'Add activity' : 'Save changes'} onPress={() => void save()} disabled={!live.ok} />}>
      <ModalHeader title={isNew ? 'New activity' : 'Edit activity'} />
      <Field label="Name" value={title} onChangeText={mark(setTitle)} error={err('title')} maxLength={80} />
      <Text variant="label" tone="muted">Category</Text>
      <Row gap={t.spacing.sm} wrap>{CATEGORIES.map((c) => <Chip key={c} label={CATEGORY_LABEL[c] ?? c} selected={category === c} onPress={() => mark(setCategory)(c)} />)}</Row>
      {category === 'study' ? <Text variant="caption" tone="muted">Study blocks count toward study analytics. Other categories never do.</Text> : null}
      <SubjectPicker value={subjectId} onChange={mark(setSubjectId)} label={category === 'study' ? 'Subject' : 'Subject (optional)'} />
      <Row align="flex-start"><TimeField label="Start" value={startMin} onChange={mark(setStart)} error={err('time')} /></Row>
      <Row align="flex-start"><TimeField label="End" value={endMin} onChange={mark(setEnd)} /></Row>
      {dur !== null ? <Text variant="caption" tone="muted">Duration {formatDuration(dur)}{crossesMidnight(startMin, endMin) ? ' · crosses midnight (ends the next day)' : ''}</Text> : null}
      <Text variant="label" tone="muted">Repeats on</Text>
      <WeekdayPicker value={weekdays} onChange={mark(setWeekdays)} weekStart={prefs.weekStart} error={err('weekdays')} />
      {overlaps.length ? <Banner tone="warning" text={`Overlaps: ${overlaps.slice(0, 3).join('; ')}${overlaps.length > 3 ? ` and ${overlaps.length - 3} more` : ''}. You can still save.`} /> : null}
      <Text variant="label" tone="muted">Reminder before start</Text>
      <Row gap={t.spacing.sm} wrap>{REMINDER_OPTIONS.map((o) => <Chip key={String(o.value)} label={o.label} selected={lead === o.value} onPress={() => mark(setLead)(o.value)} />)}</Row>
      {err('reminder') ? <Text variant="caption" tone="danger">{err('reminder')}</Text> : null}
      <SwitchRow label="Count in daily progress" value={count} onChange={mark(setCount)} hint="Turn off for blocks like sleep that shouldn't affect your completion %." />
      <Text variant="label" tone="muted">Colour (optional)</Text>
      <ColorPicker value={color} onChange={mark(setColor)} />
      {color ? <Button label="Use default colour" variant="ghost" compact onPress={() => mark(setColor)(null)} /> : null}
      {!isNew ? (
        <>
          <Button label="Duplicate" icon="copy-outline" variant="secondary" onPress={() => { void duplicateActivity(existing!.id).then((c) => { if (c) router.replace({ pathname: '/activity/[id]', params: { id: c.id, date: today } } as never); }); }} />
          <Button label="Delete from this day on" icon="trash-outline" variant="danger" onPress={() => void remove()} />
        </>
      ) : null}
    </Screen>
  );
}
