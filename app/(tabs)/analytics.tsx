import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Card, CardTitle, EmptyState, Grid, IconButton, ProgressBar, ProgressRing, Row, Screen, Text, PageHeader } from '../../src/components/ui';
import { Segmented } from '../../src/components/inputs';
import { Reveal } from '../../src/components/motion';
import { LineChart } from '../../src/components/charts';
import { SubjectRing } from '../../src/components/study/parts';
import { useApp } from '../../src/state/store';
import { useToday } from '../../src/state/hooks';
import { rangeSummary, formatCompact } from '../../src/domain/study';
import { addDays, endOfMonth, parseDateKey, startOfMonth, startOfWeek, WEEKDAY_SHORT, weekdayOf } from '../../src/domain/time';
import type { DateKey } from '../../src/domain/types';

type Mode = 'week' | 'month' | 'custom';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: DateKey) => { const p = parseDateKey(d); return `${p.d} ${MONTHS[p.m - 1]}`; };

function DatePick({ label, value, onChange, max }: { label: string; value: DateKey; onChange: (d: DateKey) => void; max?: DateKey }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
      <Text variant="caption" tone="muted">{label}</Text>
      <Row between gap={t.spacing.xs}>
        <IconButton icon="chevron-back" label={`${label}: earlier`} onPress={() => onChange(addDays(value, -1))} />
        <Text variant="bodyStrong">{short(value)}</Text>
        <IconButton icon="chevron-forward" label={`${label}: later`} onPress={() => { if (!max || value < max) onChange(addDays(value, 1)); }} />
      </Row>
    </View>
  );
}

/** Analytics: four subject rings, one daily-consistency line chart, and actual-vs-target summaries — from recorded sessions only. */
export default function Analytics() {
  const t = useTheme();
  const router = useRouter();
  const today = useToday();
  const d = useApp((s) => s.data);
  const weekStart = d.prefs.weekStart;
  const narrow = useWindowDimensions().width < 460;
  const [mode, setMode] = useState<Mode>('week');
  const [from, setFrom] = useState<DateKey>(addDays(today, -13));
  const [to, setTo] = useState<DateKey>(today);

  const range = useMemo(() => {
    if (mode === 'week') { const f = startOfWeek(today, weekStart); return { from: f, to: addDays(f, 6) }; }
    if (mode === 'month') return { from: startOfMonth(today), to: endOfMonth(today) };
    return { from, to: to < from ? from : to };
  }, [mode, today, weekStart, from, to]);

  const r = useMemo(() => rangeSummary(range.from, range.to, today, d.subjects, d.sessions, d.prefs), [range, today, d.subjects, d.sessions, d.prefs]);
  const week = useMemo(() => { const f = startOfWeek(today, weekStart); return rangeSummary(f, addDays(f, 6), today, d.subjects, d.sessions, d.prefs).total; }, [today, weekStart, d.subjects, d.sessions, d.prefs]);
  const month = useMemo(() => rangeSummary(startOfMonth(today), endOfMonth(today), today, d.subjects, d.sessions, d.prefs).total, [today, d.subjects, d.sessions, d.prefs]);

  const labels = r.daily.map((x) => (r.daily.length <= 8 ? (WEEKDAY_SHORT[weekdayOf(x.date)] as string).slice(0, 2) : String(parseDateKey(x.date).d)));
  const points = r.daily.map((x) => (x.pct === null ? null : Math.round(x.pct)));
  const yMax = Math.max(100, ...points.map((p) => p ?? 0));
  const title = mode === 'week' ? 'This week' : mode === 'month' ? 'This month' : `${short(range.from)} – ${short(range.to)}`;
  const empty = r.sessionCount === 0;

  return (
    <Screen>
      <PageHeader light="Study" title="Analytics" lead={title} action={<IconButton icon="list" label="Session history" solid onPress={() => router.push('/history')} />} />
      <Segmented<Mode> label="Range" value={mode} onChange={setMode} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'custom', label: 'Custom' }]} />
      {mode === 'custom' ? (
        <Card style={{ padding: t.spacing.md }}>
          <View style={{ flexDirection: narrow ? 'column' : 'row', gap: t.spacing.md }}><DatePick label="From" value={from} max={today} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} /><DatePick label="To" value={to} max={today} onChange={(v) => setTo(v < from ? from : v)} /></View>
        </Card>
      ) : null}

      <Reveal index={1}>
        <Card tone="hero">
          <Row gap={narrow ? t.spacing.lg : t.spacing.xl}>
            <ProgressRing onHero value={Math.min(100, r.total.pct)} size={narrow ? 88 : 104} label="Overall study progress" display={`${Math.round(r.total.pct)}%`} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="caption" tone="heroMuted">Studied</Text>
              <Text variant="title" tone="hero">{formatCompact(r.total.actualSec)}</Text>
              <Text variant="caption" tone="heroMuted">of {formatCompact(r.total.targetSec)} target · {r.days} day{r.days === 1 ? '' : 's'}</Text>
            </View>
          </Row>
        </Card>
      </Reveal>

      <Reveal index={2}>
        <Card>
          <Row wrap align="flex-start" gap={t.spacing.lg} style={{ justifyContent: 'space-around' }}>
            {r.subjects.map((s) => <SubjectRing key={s.subjectId} size={narrow ? 76 : 88} name={s.name} color={s.color} pct={s.pct} actualSec={s.actualSec} targetSec={s.targetSec} />)}
          </Row>
        </Card>
      </Reveal>

      <Reveal index={3}>
        <Card style={{ gap: t.spacing.md }}>
          <CardTitle icon="trending-up-outline" title="Daily consistency" />
          {empty ? <EmptyState icon="stats-chart-outline" title="No sessions in this range" body="Record study time with the timer or a manual entry and it will appear here." /> : (
            <LineChart points={points} labels={labels} height={190} yMax={yMax} summary={`Daily share of the study target reached, ${title}: ${r.daily.map((x) => `${x.date} ${x.pct === null ? 'no data' : `${Math.round(x.pct)}%`}`).join(', ')}`} />
          )}
        </Card>
      </Reveal>

      <Grid max={2}>
        <Card style={{ gap: t.spacing.md }}>
          <CardTitle icon="flag-outline" title="Actual vs target" />
          {r.subjects.map((s) => (
            <View key={s.subjectId} style={{ gap: 6 }}>
              <Row between><Row gap={t.spacing.sm}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} /><Text variant="label">{s.name}</Text></Row>
                <Text variant="caption" tone="muted">{formatCompact(s.actualSec)} / {formatCompact(s.targetSec)} · {Math.round(s.pct)}%</Text></Row>
              <ProgressBar value={Math.min(100, s.pct)} color={s.color} height={8} label={`${s.name} actual versus target`} />
            </View>
          ))}
        </Card>
        <Card style={{ gap: t.spacing.md }}>
          <CardTitle icon="calendar-outline" title="Week and month" />
          {[['This week', week], ['This month', month]].map(([label, tot]) => {
            const x = tot as typeof week;
            return (
              <View key={label as string} style={{ gap: 6 }}>
                <Row between><Text variant="bodyStrong">{label as string}</Text><Text variant="caption" tone="muted">{formatCompact(x.actualSec)} / {formatCompact(x.targetSec)} · {Math.round(x.pct)}%</Text></Row>
                <ProgressBar value={Math.min(100, x.pct)} height={10} label={`${label as string} actual versus target`} />
              </View>
            );
          })}
        </Card>
      </Grid>
    </Screen>
  );
}
