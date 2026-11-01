import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Button, Card, EmptyState, IconButton, ProgressRing, Row, Screen, SectionHeader, Text, PageHeader } from '../../src/components/ui';
import { DurationStepper, Field, Segmented, Select } from '../../src/components/inputs';
import { formatClock } from '../../src/domain/time';
import { confirm } from '../../src/components/feedback';
import { formatCompact, trackedSubjects } from '../../src/domain/study';
import { PulseDot, Reveal } from '../../src/components/motion';
import { SessionRow } from '../../src/components/focus/SessionRow';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { useStudyDay, useDayModel, useNow, useToday } from '../../src/state/hooks';
import { cancelFocus, finishFocus, pauseFocus, resumeFocus, setTimerNote, startFocus, touchTimer } from '../../src/state/actions';
import { phaseAt, runningMs, selectableMode } from '../../src/domain/timer';
import { formatHMS, formatDuration } from '../../src/domain/time';
import { sessionsOn } from '../../src/domain/progress';
import type { SessionMode } from '../../src/domain/types';

const MODES: { value: SessionMode; label: string }[] = [
  { value: 'stopwatch', label: 'Stopwatch' }, { value: 'pomodoro', label: 'Pomodoro' },
];

/** 25:00 for sessions under an hour, 1:05:00 above — shorter than HH:MM:SS so it never overflows a phone. */
const shortClock = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; const p = (n: number) => String(n).padStart(2, '0'); return h > 0 ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`; };

export default function FocusScreen() {
  const timer = useApp((s) => s.timer);
  return timer ? <RunningTimer /> : <SetupTimer />;
}

/* ---------------------------- setup ---------------------------- */

function SetupTimer() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams() as { occurrenceKey?: string; subjectId?: string; taskId?: string };
  const prefs = useApp((s) => s.data.prefs);
  const allSubjectsRaw = useApp((s) => s.data.subjects);
  const subjects = useMemo(() => trackedSubjects(allSubjectsRaw), [allSubjectsRaw]);
  const today = useToday();
  const day = useDayModel(today);
  const studyToday = useStudyDay(today);

  const [mode, setMode] = useState<SessionMode>(selectableMode(prefs.timer.mode));
  const [focusMin, setFocusMin] = useState(prefs.timer.focusMin);
  const [breakMin, setBreakMin] = useState(Math.max(1, prefs.timer.breakMin));
  // Default to the subject of the block that is happening now, else the first tracked subject (set up front, so the dropdown never flashes "Select").
  const [subjectId, setSubjectId] = useState<string | null>(() => params.subjectId ?? (day.current?.subjectId && subjects.some((x) => x.id === day.current?.subjectId) ? day.current.subjectId : subjects[0]?.id ?? null));
  // Subjects can load after the first render (or the chosen one can be archived): fall back to a valid one.
  React.useEffect(() => {
    if (subjects.length === 0) return;
    if (subjectId !== null && subjects.some((x) => x.id === subjectId)) return;
    setSubjectId(day.current?.subjectId && subjects.some((x) => x.id === day.current?.subjectId) ? day.current.subjectId : subjects[0]!.id);
  }, [subjectId, subjects, day.current]);
  const [occurrenceKey, setOccurrenceKey] = useState<string | null>(params.occurrenceKey ?? null);
  const taskId: string | null = params.taskId ?? null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const studyBlocks = useMemo(() => day.occurrences.filter((o) => o.category === 'study'), [day.occurrences]);
  const todaySessions = useApp((s) => s.data.sessions);
  const todays = useMemo(() => sessionsOn(todaySessions, today).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [todaySessions, today]);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const allSubjects = useApp((s) => s.data.subjects);

  const start = useCallback(async () => {
    if (busy) return;
    if (!subjectId) { setError('Pick a subject first.'); return; }
    setBusy(true); setError(null);
    const res = await startFocus({ mode, focusMin, breakMin, subjectId, occurrenceKey, taskId });
    setBusy(false);
    if (!res.ok) setError(Object.values(res.errors)[0] ?? 'Could not start the timer.');
  }, [busy, mode, focusMin, breakMin, subjectId, occurrenceKey, taskId]);

  const winW = useWindowDimensions().width;
  const bump = (d: number) => setFocusMin(Math.max(1, Math.min(240, focusMin + d)));
  const shownSec = mode === 'stopwatch' ? 0 : focusMin * 60;
  return (
    <Screen>
      <PageHeader light="Deep" title="Focus" lead="Make time count" action={<IconButton icon="create-outline" label="Log study time" solid onPress={() => router.push('/manual-session')} />} />
      <Segmented label="Timer mode" options={MODES} value={mode} onChange={setMode} />

      <Reveal index={1}>
        <Card tone="hero" style={{ alignItems: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xxl }}>
          <Row gap={winW < 440 ? t.spacing.xs : t.spacing.xl} style={{ maxWidth: '100%' }}>
            {mode !== 'stopwatch' ? <IconButton icon="remove" label="Shorter by 5 minutes" solid onPress={() => bump(-5)} /> : null}
            <View accessible accessibilityLabel={mode === 'stopwatch' ? 'Stopwatch, counts up' : `${focusMin} minutes`} style={{ alignItems: 'center', minWidth: 0, flexShrink: 1 }}>
              <Text variant="hero" tone="hero" style={{ fontSize: winW < 360 ? 38 : winW < 440 ? 44 : 56, lineHeight: winW < 360 ? 44 : winW < 440 ? 50 : 62, fontVariant: ['tabular-nums'] }}>{shortClock(shownSec)}</Text>
              <Text variant="caption" tone="heroMuted">{mode === 'stopwatch' ? 'Counts up until you finish' : `Focus · then ${breakMin} min break`}</Text>
            </View>
            {mode !== 'stopwatch' ? <IconButton icon="add" label="Longer by 5 minutes" solid onPress={() => bump(5)} /> : null}
          </Row>
          {mode !== 'stopwatch' ? (
            <Row gap={t.spacing.sm} wrap style={{ justifyContent: 'center' }}>
              {prefs.timer.presets.map((p) => {
                const on = mode === 'pomodoro' ? focusMin === p.focusMin && breakMin === p.breakMin : focusMin === p.focusMin;
                return (
                  <Pressable key={p.name} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.name} onPress={() => { setFocusMin(p.focusMin); setBreakMin(p.breakMin); }}
                    style={{ minHeight: 40, paddingHorizontal: t.spacing.lg, borderRadius: t.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.colors.lime : t.colors.heroTrack }}>
                    <Text variant="label" style={{ color: on ? t.colors.onLime : t.colors.heroText, fontWeight: '700' }}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </Row>
          ) : null}
        </Card>
      </Reveal>
      {mode === 'pomodoro' ? <Card><DurationStepper label="Break length" value={breakMin} onChange={setBreakMin} min={1} max={60} step={1} /></Card> : null}

      <Card style={{ gap: t.spacing.lg }}>
        {subjects.length === 0 ? <Text tone="muted">No active subjects yet. Add one under Settings → Subjects.</Text> : (
          <Select<string | null> label="Subject" sheetTitle="Choose subject" value={subjectId} onChange={(v) => setSubjectId(v)}
            options={subjects.map((x) => { const r = studyToday.rows.find((y) => y.subjectId === x.id); return { value: x.id, label: x.name, color: x.color, hint: r ? `Today ${formatCompact(r.actualSec)} of ${formatCompact(r.targetSec)}` : undefined }; })} />
        )}
        {(() => { const r = studyToday.rows.find((x) => x.subjectId === subjectId); return r ? <Text variant="caption" tone="muted">Today: {formatCompact(r.actualSec)} of {formatCompact(r.targetSec)}{r.remainingSec > 0 ? ` · ${formatCompact(r.remainingSec)} left` : ' · target reached'}</Text> : null; })()}
        {studyBlocks.length > 0 ? (
          <View style={{ gap: t.spacing.sm }}>
            <Select<string | null> label="Timetable block (optional)" sheetTitle="Link to a timetable block" value={occurrenceKey} placeholder="None"
              onChange={(v) => { setOccurrenceKey(v); const o = studyBlocks.find((x) => x.key === v); if (o?.subjectId) setSubjectId(o.subjectId); }}
              options={[{ value: null, label: 'None' }, ...studyBlocks.map((o) => ({ value: o.key as string | null, label: o.title, color: o.color ?? undefined, hint: `${formatClock(o.startMin)} – ${formatClock(o.endMin)}` }))]} />
            <Text variant="caption" tone="muted">Time always counts toward the subject, even outside its block.</Text>
          </View>
        ) : null}
      </Card>

      {error ? <Banner tone="danger" text={error} /> : null}
      <Button label="Start focus" icon="play" variant="primary" onPress={start} loading={busy} />

      <SectionHeader title="Today’s sessions" action="Log time" onAction={() => router.push('/manual-session')} />
      {todays.length === 0 ? (
        <EmptyState icon="timer-outline" title="No sessions yet today" body="Start the timer above, or log time you already studied." actionLabel="Log study time" onAction={() => router.push('/manual-session')} />
      ) : (
        <View style={{ gap: t.spacing.sm }}>
          {todays.map((s) => (
            <SessionRow key={s.id} session={s} subject={subjectById.get(s.subjectId ?? '') ?? allSubjects.find((x) => x.id === s.subjectId)} onPress={() => router.push(`/session/${s.id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

/* ---------------------------- running ---------------------------- */

function RunningTimer() {
  const t = useTheme();
  const router = useRouter();
  const timer = useApp((s) => s.timer);
  const subjects = useApp((s) => s.data.subjects);
  const prefs = useApp((s) => s.data.prefs);
  const now = useNow(1000);
  const winW = useWindowDimensions().width;
  const [note, setNote] = useState(timer?.note ?? '');
  const [busy, setBusy] = useState(false);

  // Liveness stamp so a crash/kill can be reconciled on the next launch. The elapsed time itself never depends on this.
  useEffect(() => {
    const id = setInterval(() => { void touchTimer(); }, 15_000);
    const sub = AppState.addEventListener('change', (st: string) => { if (st !== 'active') void touchTimer(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  if (!timer) return null;
  const nowMs = now.getTime();
  const run = runningMs(timer, nowMs);
  const phase = phaseAt(timer, nowMs);
  const paused = timer.status === 'paused';
  const subject = subjects.find((s) => s.id === timer.subjectId);
  const shown = timer.mode === 'stopwatch' ? run : timer.mode === 'countdown' && phase.kind !== 'overtime' ? (phase.remainingMs ?? 0) : timer.mode === 'pomodoro' ? (phase.remainingMs ?? 0) : run - timer.focusMs;
  const phaseLabel = paused ? 'Paused' : timer.mode === 'stopwatch' ? 'Focusing' : phase.kind === 'break' ? `Break · round ${phase.cycle}` : phase.kind === 'overtime' ? 'Overtime — time is up' : timer.mode === 'pomodoro' ? `Focus · round ${phase.cycle}` : 'Focusing';
  const spoken = `${phaseLabel}. ${formatDuration(Math.floor(run / 60000))} recorded.`;

  const onFinish = async () => {
    setBusy(true);
    if (note !== timer.note) await setTimerNote(note);
    const s = await finishFocus(note || undefined);
    setBusy(false);
    if (s) router.push(`/session/${s.id}?reflect=1`);
  };
  const onCancel = async () => {
    const mins = Math.floor(run / 60000);
    const ok = await confirm({
      title: 'Discard this session?', destructive: true, confirmLabel: 'Discard',
      message: `${mins} minute${mins === 1 ? '' : 's'} recorded will be kept as a cancelled session and will not count toward your stats.`,
    });
    if (ok) await cancelFocus();
  };

  const ringSize = Math.max(200, Math.min(300, winW - 2 * (winW < 480 ? 16 : 24) - 2 * t.spacing.xl - 8));
  const ringPct = timer.mode === 'stopwatch' ? ((run % 3_600_000) / 3_600_000) * 100
    : timer.mode === 'countdown' ? Math.min(100, (run / Math.max(1, timer.focusMs)) * 100)
    : phase.kind === 'break' ? (1 - (phase.remainingMs ?? 0) / Math.max(1, timer.breakMs)) * 100 : (1 - (phase.remainingMs ?? 0) / Math.max(1, timer.focusMs)) * 100;
  const ringColor = paused ? t.colors.warning : phase.kind === 'break' ? t.colors.success : t.colors.lime;
  return (
    <Screen>
      <PageHeader light="Deep" title="Focus" lead={subject?.name ?? 'No subject'} />
      <Reveal index={1}>
        <Card tone="hero" style={{ alignItems: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xxl }}>
          <View accessible accessibilityLabel={spoken} accessibilityLiveRegion="none">
            <ProgressRing onHero value={ringPct} size={ringSize} stroke={14} color={ringColor} label={spoken} display={formatHMS(Math.max(0, Math.floor(shown / 1000)))} caption={phaseLabel} />
          </View>
          <Row gap={t.spacing.sm}>
            <PulseDot color={paused ? t.colors.warning : t.colors.lime} active={!paused} />
            {subject ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: subject.color }} /> : null}
            <Text variant="caption" tone="heroMuted">
              {paused ? 'Paused time isn’t counted.' : timer.mode === 'pomodoro' ? `Recorded ${formatHMS(Math.floor(run / 1000))} · breaks excluded` : `Recorded ${formatHMS(Math.floor(run / 1000))}`}
            </Text>
          </Row>
        </Card>
      </Reveal>

      <Row gap={t.spacing.md}>
        <View style={{ flex: 1 }}>
          {paused ? <Button label="Resume" icon="play" variant="lime" onPress={() => { void resumeFocus(); }} /> : <Button label="Pause" icon="pause" variant="secondary" onPress={() => { void pauseFocus(); }} />}
        </View>
        <View style={{ flex: 1 }}><Button label="Finish" icon="checkmark" onPress={onFinish} loading={busy} /></View>
      </Row>

      <Field label="Session note" value={note} onChangeText={setNote} onSubmitEditing={() => { void setTimerNote(note); }} multiline placeholder="What are you working on?" hint="Saved with the session." />
      {prefs.timer.breakReminders && timer.mode === 'pomodoro' ? <Text variant="caption" tone="muted">Break reminders are on. Change this in Settings → Focus timer.</Text> : null}
      <Button label="Discard session" variant="danger" onPress={onCancel} />
    </Screen>
  );
}
