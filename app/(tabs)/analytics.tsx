import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Card, CardTitle, Chip, ChipScroller, EmptyState, IconBadge, IconButton, Pill, ProgressBar, ProgressRing, Row, Screen, Text, PageHeader } from '../../src/components/ui';
import { Segmented } from '../../src/components/inputs';
import { Reveal } from '../../src/components/motion';
import { BarChart, Donut, Heatmap, Legend, LineChart, StackedBars } from '../../src/components/charts';
import { useApp } from '../../src/state/store';
import { useToday } from '../../src/state/hooks';
import { rangeSummary, formatCompact } from '../../src/domain/study';
import { addDays, endOfMonth, parseDateKey, startOfMonth, startOfWeek, WEEKDAY_SHORT, weekdayOf } from '../../src/domain/time';
import {
  avgSessionMin, compareRanges, dailyFocusBySubject, focusByHour, focusByWeekday, previousRange, streaks, subjectDistribution, subjectHeatmap,
} from '../../src/domain/analytics';
import { subjectIcon } from '../../src/domain/subjectIcons';
import type { DateKey } from '../../src/domain/types';

type Mode = 'week' | 'month' | 'custom';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: DateKey) => { const p = parseDateKey(d); return `${p.d} ${MONTHS[p.m - 1]}`; };
const mins = (m: number) => formatCompact(Math.round(m * 60));
/** Very short label for bar tops ("45m", "1.5h"): full "1h 20m" labels are wider than the bars on a phone. */
const tiny = (m: number) => (m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h`);
/** Cards inside a column grow to fill it, so side-by-side columns end at the same height. flexGrow (not flex:1) so stacked cards keep their natural height. */
const FILL = { flexGrow: 1 } as const;

/** Heatmap length follows the room available: roughly one quarter on a phone, up to a year-ish on a wide screen. */
const heatWeeks = (w: number) => (w < 520 ? 13 : w < 900 ? 22 : 34);

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

/** Change versus the previous equal-length period, as a small coloured pill. Hidden when there is nothing to compare with. */
function Delta({ pct, deltaMin }: { pct: number | null; deltaMin: number }) {
  const t = useTheme();
  if (pct === null) return deltaMin > 0 ? <Pill label="New" color={t.colors.success} icon="sparkles" /> : null;
  const up = deltaMin > 0, flat = deltaMin === 0;
  return <Pill label={flat ? 'No change' : `${up ? '+' : '−'}${Math.abs(Math.round(pct))}%`} color={flat ? t.colors.textMuted : up ? t.colors.success : t.colors.danger} icon={flat ? 'remove' : up ? 'trending-up' : 'trending-down'} />;
}

function Tile({ label, value, sub, extra, basis }: { label: string; value: string; sub?: string; extra?: React.ReactNode; basis: string }) {
  const t = useTheme();
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: basis as never, minWidth: 0 }}>
      <Card tone="sunken" style={{ gap: 2, flexGrow: 1 }}>
        <Row between gap={t.spacing.xs} style={{ minHeight: 24 }}>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</Text>
          {extra ?? null}
        </Row>
        <Text variant="title" numberOfLines={1} fit>{value}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{sub ?? ' '}</Text>
      </Card>
    </View>
  );
}

/**
 * Analytics, built from recorded study sessions only. One subject filter at the top drives every card; the layout adapts to
 * the width it actually gets (phone → one column, tablet → paired cards, desktop → two-column dashboard).
 */
export default function Analytics() {
  const t = useTheme();
  const router = useRouter();
  const today = useToday();
  const d = useApp((s) => s.data);
  const weekStart = d.prefs.weekStart;
  const win = useWindowDimensions().width;
  const [cw, setCw] = useState(win);
  const narrow = cw < 520, wide = cw >= 900;

  const [mode, setMode] = useState<Mode>('week');
  const [from, setFrom] = useState<DateKey>(addDays(today, -13));
  const [to, setTo] = useState<DateKey>(today);
  const [subject, setSubject] = useState<string | null>(null);
  const [picked, setPicked] = useState<DateKey | null>(null);

  const subjects = useMemo(() => d.subjects.filter((x) => !x.archived).sort((a, b) => a.sortOrder - b.sortOrder), [d.subjects]);
  const active = subject !== null && subjects.some((x) => x.id === subject) ? subject : null;
  const activeSubject = subjects.find((x) => x.id === active) ?? null;
  const accent = activeSubject?.color ?? t.colors.accent;

  const range = useMemo(() => {
    if (mode === 'week') { const f = startOfWeek(today, weekStart); return { from: f, to: addDays(f, 6) }; }
    if (mode === 'month') return { from: startOfMonth(today), to: endOfMonth(today) };
    return { from, to: to < from ? from : to };
  }, [mode, today, weekStart, from, to]);
  const prev = useMemo(() => previousRange(range), [range]);

  const r = useMemo(() => rangeSummary(range.from, range.to, today, d.subjects, d.sessions, d.prefs), [range, today, d.subjects, d.sessions, d.prefs]);
  const week = useMemo(() => { const f = startOfWeek(today, weekStart); return rangeSummary(f, addDays(f, 6), today, d.subjects, d.sessions, d.prefs).total; }, [today, weekStart, d.subjects, d.sessions, d.prefs]);
  const month = useMemo(() => rangeSummary(startOfMonth(today), endOfMonth(today), today, d.subjects, d.sessions, d.prefs).total, [today, d.subjects, d.sessions, d.prefs]);

  const inRange = useMemo(() => d.sessions.filter((s) => !s.deletedAt && s.date >= range.from && s.date <= range.to && (active === null || s.subjectId === active)), [d.sessions, range, active]);
  const cmp = useMemo(() => compareRanges(d.sessions, range, prev, active), [d.sessions, range, prev, active]);
  const avg = useMemo(() => avgSessionMin(d.sessions, range, active), [d.sessions, range, active]);
  const dist = useMemo(() => subjectDistribution(d.sessions, d.subjects, range), [d.sessions, d.subjects, range]);
  const perDay = useMemo(() => dailyFocusBySubject(d.sessions, range, active), [d.sessions, range, active]);
  const wdays = useMemo(() => focusByWeekday(d.sessions, range, active), [d.sessions, range, active]);
  const hours = useMemo(() => focusByHour(d.sessions, range, active), [d.sessions, range, active]);
  const streak = useMemo(() => streaks(d.sessions.filter((x) => active === null || x.subjectId === active), today, d.prefs.streakThresholdMin), [d.sessions, today, d.prefs.streakThresholdMin, active]);

  const weeks = heatWeeks(cw);
  const heat = useMemo(() => subjectHeatmap(d.sessions, d.subjects, { from: startOfWeek(addDays(today, -(weeks - 1) * 7), weekStart), to: today }, active), [d.sessions, d.subjects, today, weeks, weekStart, active]);
  const activeDays = heat.filter((c) => c.min > 0).length;
  const pickedCell = heat.find((c) => c.date === picked) ?? null;

  const colorOf = (id: string | null) => d.subjects.find((x) => x.id === id)?.color ?? t.colors.textFaint;
  const nameOf = (id: string | null) => d.subjects.find((x) => x.id === id)?.name ?? 'Unassigned';
  const label = (date: DateKey, n: number) => (n <= 8 ? (WEEKDAY_SHORT[weekdayOf(date)] as string).slice(0, 2) : String(parseDateKey(date).d));
  const title = mode === 'week' ? 'This week' : mode === 'month' ? 'This month' : `${short(range.from)} – ${short(range.to)}`;
  const empty = inRange.length === 0;
  const scope = activeSubject ? activeSubject.name : 'all subjects';

  const hourWindow = useMemo(() => {
    const used = hours.map((m, h) => (m > 0 ? h : -1)).filter((h) => h >= 0);
    if (used.length === 0) return { start: 6, end: 22 };
    return { start: Math.max(0, Math.min(6, Math.min(...used))), end: Math.min(23, Math.max(22, Math.max(...used))) };
  }, [hours]);
  const hourData = useMemo(() => hours.slice(hourWindow.start, hourWindow.end + 1).map((m, i) => ({ label: String(hourWindow.start + i), value: m })), [hours, hourWindow]);
  const bestHour = hours.some((m) => m > 0) ? hours.indexOf(Math.max(...hours)) : null;
  const bestDay = wdays.some((m) => m > 0) ? wdays.indexOf(Math.max(...wdays)) : null;

  const tileBasis = narrow || wide ? '47%' : '23%';
  const pointsPct = r.daily.map((x) => (x.pct === null ? null : Math.round(x.pct)));
  const yMax = Math.max(100, ...pointsPct.map((p) => p ?? 0));

  /* ---- sections ---- */
  // With a subject selected the progress card shows that subject's actual vs target, not the overall total.
  const focusRow = active === null ? null : r.subjects.find((x) => x.subjectId === active) ?? null;
  const totals = focusRow ? { actualSec: focusRow.actualSec, targetSec: focusRow.targetSec, pct: focusRow.pct } : r.total;
  const hero = (
    <Card tone="hero" style={{ flex: wide ? 1 : undefined }}>
      <Row gap={narrow ? t.spacing.lg : t.spacing.xl}>
        <ProgressRing onHero value={Math.min(100, totals.pct)} size={narrow ? 88 : 112} label={focusRow ? `${focusRow.name} study progress` : 'Overall study progress'} display={`${Math.round(totals.pct)}%`} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="caption" tone="heroMuted" numberOfLines={1}>{focusRow ? `${focusRow.name} · ${title}` : title}</Text>
          <Text variant="title" tone="hero">{formatCompact(totals.actualSec)}</Text>
          <Text variant="caption" tone="heroMuted">of {formatCompact(totals.targetSec)} target · {r.days} day{r.days === 1 ? '' : 's'}</Text>
        </View>
      </Row>
    </Card>
  );

  const tiles = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm + 2, flex: wide ? 1.4 : undefined }}>
      <Tile basis={tileBasis} label="Focus time" value={mins(cmp.current)} sub={`before: ${mins(cmp.previous)}`} extra={<Delta pct={cmp.deltaPct} deltaMin={cmp.deltaMin} />} />
      <Tile basis={tileBasis} label="Sessions" value={String(inRange.length)} sub={inRange.length ? `${activeDays} active day${activeDays === 1 ? '' : 's'}` : undefined} />
      <Tile basis={tileBasis} label="Avg session" value={avg === null ? '—' : mins(avg)} sub={bestHour === null ? undefined : `best hour ${bestHour}:00`} />
      <Tile basis={tileBasis} label="Streak" value={`${streak.current} day${streak.current === 1 ? '' : 's'}`} sub={`longest ${streak.longest}`} />
    </View>
  );

  const stacked = (
    <Card style={[{ gap: t.spacing.md }, FILL]}>
      <CardTitle icon="bar-chart-outline" title="Daily focus" color={accent} />
      {empty ? <EmptyState icon="stats-chart-outline" title="No sessions in this range" body="Record study time with the timer or a manual entry and it will appear here." /> : (
        <>
          <StackedBars
            days={perDay.map((x) => ({ label: label(x.date, perDay.length), segments: x.parts.map((p) => ({ value: p.min, color: colorOf(p.subjectId), name: nameOf(p.subjectId) })) }))}
            format={tiny} height={narrow ? 180 : 210}
            summary={`Daily focus by subject, ${title}: ${perDay.map((x) => `${x.date} ${mins(x.totalMin)}`).join(', ')}.`}
          />
          <Legend items={dist.filter((x) => active === null || x.subjectId === active).map((x) => ({ label: x.name, color: x.color ?? t.colors.textFaint, value: mins(x.min) }))} />
        </>
      )}
    </Card>
  );

  const share = (
    <Card style={[{ gap: t.spacing.md }, FILL]}>
      <CardTitle icon="pie-chart-outline" title="Where the time goes" />
      {dist.length === 0 ? <EmptyState icon="pie-chart-outline" title="Nothing yet" body="Your split by subject shows up after your first session." /> : (
        <View style={{ flexDirection: narrow ? 'column' : 'row', alignItems: 'center', gap: narrow ? t.spacing.lg : t.spacing.xl }}>
          <Donut size={narrow ? 140 : 150} thickness={narrow ? 22 : 24} centerLabel={mins(dist.reduce((a, x) => a + x.min, 0))} centerSub="total"
            slices={dist.map((x) => ({ label: x.name, value: x.min, color: x.color ?? t.colors.textFaint }))}
            summary={`Time by subject: ${dist.map((x) => `${x.name} ${Math.round(x.share)}%`).join(', ')}.`} />
          <View style={narrow ? { alignSelf: 'stretch' } : { flex: 1, minWidth: 0 }}>
            <Legend items={dist.map((x) => ({ label: x.name, color: x.color ?? t.colors.textFaint, value: `${Math.round(x.share)}% · ${mins(x.min)}` }))} />
          </View>
        </View>
      )}
    </Card>
  );

  const consistency = (
    <Card style={{ gap: t.spacing.md }}>
      <CardTitle icon="flame-outline" title="Consistency" color={accent} right={<Text variant="caption" tone="muted">{activeDays} active day{activeDays === 1 ? '' : 's'} · {weeks} wk</Text>} />
      <Heatmap cells={heat} weekStart={weekStart} selected={picked} onSelect={(date) => setPicked((p) => (p === date ? null : date))}
        summary={`Focus heatmap for the last ${weeks} weeks, ${scope}: ${activeDays} active days, current streak ${streak.current}, longest ${streak.longest}.`} />
      <View style={{ minHeight: 44, justifyContent: 'center', gap: 4 }}>
        {pickedCell ? (
          <>
            <Text variant="bodyStrong">{short(pickedCell.date)} · {pickedCell.min > 0 ? mins(pickedCell.min) : 'no focus'}</Text>
            {pickedCell.parts.length > 0 ? (
              <Row gap={t.spacing.md} wrap>
                {pickedCell.parts.map((p) => (
                  <Row key={String(p.subjectId)} gap={t.spacing.xs}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorOf(p.subjectId) }} /><Text variant="caption">{nameOf(p.subjectId)} {mins(p.min)}</Text></Row>
                ))}
              </Row>
            ) : null}
          </>
        ) : <Text variant="caption" tone="muted">Tap a day to see what you studied. Each day takes the colour of the subject you focused on most; a stronger colour means more time. A streak day needs at least {formatCompact(d.prefs.streakThresholdMin * 60)}.</Text>}
      </View>
      {active === null && subjects.length > 0 ? <Legend items={subjects.map((x) => ({ label: x.name, color: x.color }))} /> : null}
    </Card>
  );

  const patterns = (
    <>
      <Card style={[{ gap: t.spacing.md }, FILL]}>
        <CardTitle icon="calendar-number-outline" title="Best days" color={accent} right={bestDay !== null ? <Pill label={WEEKDAY_SHORT[bestDay] as string} color={accent} /> : undefined} />
        {wdays.every((m) => m === 0) ? <Text variant="caption" tone="muted">Not enough data in this range yet.</Text> : (
          <BarChart color={accent} height={150} format={tiny}
            data={Array.from({ length: 7 }, (_, i) => { const dow = (weekStart + i) % 7; return { label: (WEEKDAY_SHORT[dow] as string).slice(0, 2), value: wdays[dow]!, color: dow === bestDay ? accent : undefined }; })}
            summary={`Focus by weekday, ${scope}: ${wdays.map((m, i) => `${WEEKDAY_SHORT[i]} ${mins(m)}`).join(', ')}.`} />
        )}
      </Card>
      <Card style={[{ gap: t.spacing.md }, FILL]}>
        <CardTitle icon="time-outline" title="Best hours" color={accent} right={bestHour !== null ? <Pill label={`${bestHour}:00`} color={accent} /> : undefined} />
        {hours.every((m) => m === 0) ? <Text variant="caption" tone="muted">Not enough data in this range yet.</Text> : (
          <BarChart color={accent} height={150} format={tiny} data={hourData.map((x) => ({ ...x, color: Number(x.label) === bestHour ? accent : undefined }))}
            summary={`Focus by hour of day, ${scope}: busiest at ${bestHour}:00.`} />
        )}
      </Card>
    </>
  );

  const subjectCards = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
      {r.subjects.filter((s) => active === null || s.subjectId === active).map((s) => {
        const sub = d.subjects.find((x) => x.id === s.subjectId);
        const c = compareRanges(d.sessions, range, prev, s.subjectId);
        const count = d.sessions.filter((x) => !x.deletedAt && x.subjectId === s.subjectId && x.date >= range.from && x.date <= range.to).length;
        return (
          <View key={s.subjectId} style={{ flexGrow: 1, flexShrink: 1, flexBasis: narrow ? '100%' : wide ? '31%' : '47%', minWidth: 0 }}>
            <Card style={{ gap: t.spacing.sm }} onPress={() => setSubject((cur) => (cur === s.subjectId ? null : s.subjectId))} accessibilityLabel={`${s.name}: ${Math.round(s.pct)}% of target. Tap to ${active === s.subjectId ? 'show all subjects' : 'focus on this subject'}.`}>
              <Row between gap={t.spacing.sm}>
                <Row gap={t.spacing.sm} style={{ flex: 1, minWidth: 0 }}>
                  <IconBadge icon={sub ? subjectIcon(sub) as never : 'book-outline'} color={s.color} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>{s.name}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>{count} session{count === 1 ? '' : 's'}</Text>
                  </View>
                </Row>
                <Delta pct={c.deltaPct} deltaMin={c.deltaMin} />
              </Row>
              <ProgressBar value={Math.min(100, s.pct)} color={s.color} height={10} label={`${s.name} actual versus target`} />
              <Row between><Text variant="caption" tone="muted">{formatCompact(s.actualSec)} of {formatCompact(s.targetSec)}</Text><Text variant="bodyStrong">{Math.round(s.pct)}%</Text></Row>
            </Card>
          </View>
        );
      })}
    </View>
  );

  const targets = (
    <>
      <Card style={[{ gap: t.spacing.md }, FILL]}>
        <CardTitle icon="trending-up-outline" title="Target reached per day" />
        {r.sessionCount === 0 ? <EmptyState icon="stats-chart-outline" title="No sessions in this range" body="Record study time and your daily progress appears here." /> : (
          <LineChart points={pointsPct} labels={r.daily.map((x) => label(x.date, r.daily.length))} height={190} yMax={yMax} color={accent}
            summary={`Daily share of the study target reached, ${title}: ${r.daily.map((x) => `${x.date} ${x.pct === null ? 'no data' : `${Math.round(x.pct)}%`}`).join(', ')}.`} />
        )}
      </Card>
      <Card style={[{ gap: t.spacing.md }, FILL]}>
        <CardTitle icon="calendar-outline" title="Week and month" />
        {[['This week', week], ['This month', month]].map(([name, tot]) => {
          const x = tot as typeof week;
          return (
            <View key={name as string} style={{ gap: 6 }}>
              <Row between gap={t.spacing.sm}><Text variant="bodyStrong" style={{ flexShrink: 0 }}>{name as string}</Text><Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>{formatCompact(x.actualSec)} / {formatCompact(x.targetSec)} · {Math.round(x.pct)}%</Text></Row>
              <ProgressBar value={Math.min(100, x.pct)} height={10} label={`${name as string} actual versus target`} />
            </View>
          );
        })}
      </Card>
    </>
  );

  /**
   * Two blocks side by side when there is room, stacked otherwise. `flex` is only set when they sit side by side: in a stacked
   * (auto-height) column a flex-basis of 0 lets the web build shrink the block below its content, and the next section then
   * paints over it.
   */
  const two = (a: React.ReactNode, b: React.ReactNode, ratio: [number, number] = [1, 1]) => {
    const side = wide || (!narrow && cw >= 680);
    return (
      <View style={{ flexDirection: side ? 'row' : 'column', gap: t.spacing.md, alignItems: 'stretch' }}>
        <View style={side ? { flex: ratio[0], minWidth: 0, gap: t.spacing.md } : { gap: t.spacing.md }}>{a}</View>
        <View style={side ? { flex: ratio[1], minWidth: 0, gap: t.spacing.md } : { gap: t.spacing.md }}>{b}</View>
      </View>
    );
  };

  return (
    <Screen>
      <View onLayout={(e) => setCw(e.nativeEvent.layout.width)} style={{ gap: t.spacing.lg }}>
        <PageHeader light="Study" title="Analytics" lead={`${title} · ${scope}`} action={<IconButton icon="list" label="Session history" solid onPress={() => router.push('/history')} />} />

        <Segmented<Mode> label="Range" value={mode} onChange={setMode} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'custom', label: 'Custom' }]} />
        {mode === 'custom' ? (
          <Card style={{ padding: t.spacing.md }}>
            <View style={{ flexDirection: narrow ? 'column' : 'row', gap: t.spacing.md }}>
              <DatePick label="From" value={from} max={today} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} />
              <DatePick label="To" value={to} max={today} onChange={(v) => setTo(v < from ? from : v)} />
            </View>
          </Card>
        ) : null}

        {subjects.length > 0 ? (
          <ChipScroller label="Filter by subject">
            <Chip label="All subjects" selected={active === null} onPress={() => setSubject(null)} />
            {subjects.map((x) => <Chip key={x.id} label={x.name} color={x.color} selected={active === x.id} onPress={() => setSubject(x.id)} />)}
          </ChipScroller>
        ) : null}

        <Reveal index={1}>
          {wide ? <Row gap={t.spacing.md} align="stretch">{hero}{tiles}</Row> : <View style={{ gap: t.spacing.md }}>{hero}{tiles}</View>}
        </Reveal>

        <Reveal index={2}>{two(stacked, share, wide ? [1.5, 1] : [1, 1])}</Reveal>
        <Reveal index={3}>{consistency}</Reveal>
        <Reveal index={4}>{two(<>{patterns}</>, <>{targets}</>)}</Reveal>
        <Reveal index={5}>
          <View style={{ gap: t.spacing.md }}>
            <Text variant="heading" accessibilityRole="header">Subjects</Text>
            {subjectCards}
          </View>
        </Reveal>
      </View>
    </Screen>
  );
}
