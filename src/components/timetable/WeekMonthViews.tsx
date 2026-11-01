import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, IconButton, Row, Text } from '../ui';
import { WEEKDAY_SHORT, addDays, formatDuration, parseDateKey, weekDates, weekdayOf } from '../../domain/time';
import { resolveDay } from '../../domain/schedule';
import { sumFocusMin, sessionsOn } from '../../domain/progress';
import type { DateKey } from '../../domain/types';
import { useApp } from '../../state/store';
import { monthCells, scheduledStudyMin } from '../../state/extra-timetable';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function WeekView({ date, today, onPickDay }: { date: DateKey; today: DateKey; onPickDay: (d: DateKey) => void }) {
  const t = useTheme();
  const d = useApp((s) => s.data);
  const days = weekDates(date, d.prefs.weekStart);
  const rows = useMemo(() => days.map((day) => {
    const occ = resolveDay(day, d.templates, d.exceptions);
    return {
      day, count: occ.length, studyMin: scheduledStudyMin(day, d.templates, d.exceptions),
      focusMin: Math.round(sumFocusMin(sessionsOn(d.sessions, day))), titles: occ.filter((o) => o.category === 'study').slice(0, 3).map((o) => o.title),
    };
  }), [days.join(','), d.templates, d.exceptions, d.sessions]);
  return (
    <View style={{ gap: t.spacing.sm }}>
      {rows.map((r) => (
        <Card key={r.day} onPress={() => onPickDay(r.day)} accessibilityLabel={`${WEEKDAY_SHORT[weekdayOf(r.day)]} ${r.day}: ${r.count} activities, ${formatDuration(r.studyMin)} study scheduled, ${formatDuration(r.focusMin)} focused`}
          style={{ borderColor: r.day === today ? t.colors.accent : t.colors.border, borderWidth: r.day === today ? 2 : 1, padding: t.spacing.lg }}>
          <Row between>
            <View style={{ width: 52 }}>
              <Text variant="bodyStrong" tone={r.day === today ? 'accent' : 'default'}>{WEEKDAY_SHORT[weekdayOf(r.day)]}</Text>
              <Text variant="caption" tone="muted">{parseDateKey(r.day).d}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="muted" numberOfLines={1}>{r.count === 0 ? 'Nothing scheduled' : r.titles.length ? r.titles.join(' · ') : `${r.count} activities`}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption">{r.studyMin > 0 ? `${formatDuration(r.studyMin)} planned` : 'No study planned'}</Text>
              <Text variant="caption" tone={r.focusMin > 0 ? 'success' : 'faint'}>{r.focusMin > 0 ? `${formatDuration(r.focusMin)} focused` : '—'}</Text>
            </View>
          </Row>
        </Card>
      ))}
    </View>
  );
}

export function CalendarView({ date, today, onPickDay, onMonth }: { date: DateKey; today: DateKey; onPickDay: (d: DateKey) => void; onMonth: (delta: number) => void }) {
  const t = useTheme();
  const d = useApp((s) => s.data);
  const ws = d.prefs.weekStart;
  const cells = useMemo(() => monthCells(date, ws), [date, ws]);
  const info = useMemo(() => {
    const m = new Map<DateKey, { study: boolean; focus: boolean; exc: boolean }>();
    for (const c of cells) {
      if (!c) continue;
      m.set(c, {
        study: scheduledStudyMin(c, d.templates, d.exceptions) > 0,
        focus: sessionsOn(d.sessions, c).length > 0,
        exc: d.exceptions.some((e) => !e.deletedAt && e.date === c),
      });
    }
    return m;
  }, [cells, d.templates, d.exceptions, d.sessions]);
  const { y, m } = parseDateKey(date);
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + ws) % 7);
  const rows: (DateKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return (
    <Card>
      <Row between>
        <IconButton icon="chevron-back" label="Previous month" onPress={() => onMonth(-1)} />
        <Text variant="heading" accessibilityRole="header">{MONTHS[m - 1]} {y}</Text>
        <IconButton icon="chevron-forward" label="Next month" onPress={() => onMonth(1)} />
      </Row>
      <Row gap={0} style={{ marginTop: t.spacing.sm }}>
        {order.map((w) => <View key={w} style={{ flex: 1, alignItems: 'center' }}><Text variant="label" tone="muted">{(WEEKDAY_SHORT[w] as string).slice(0, 2)}</Text></View>)}
      </Row>
      {rows.map((r, ri) => (
        <Row key={ri} gap={0}>
          {r.map((c, ci) => {
            if (!c) return <View key={ci} style={{ flex: 1, height: 52 }} />;
            const i = info.get(c);
            const isToday = c === today, isSel = c === date;
            return (
              <Pressable key={ci} accessibilityRole="button"
                accessibilityLabel={`${c}${isToday ? ', today' : ''}${i?.study ? ', study planned' : ''}${i?.focus ? ', focus recorded' : ''}${i?.exc ? ', has changes' : ''}`}
                onPress={() => onPickDay(c)} style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? t.colors.ink : 'transparent', borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: t.colors.accent }}>
                  <Text variant="caption" tone={isSel ? 'onInk' : 'default'} style={{ fontWeight: isToday ? '700' : '400' }}>{parseDateKey(c).d}</Text>
                </View>
                <Row gap={3}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i?.study ? t.colors.accent : 'transparent' }} />
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i?.focus ? t.colors.success : 'transparent' }} />
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i?.exc ? t.colors.warning : 'transparent' }} />
                </Row>
              </Pressable>
            );
          })}
        </Row>
      ))}
      <Row gap={t.spacing.md} wrap style={{ marginTop: t.spacing.sm }}>
        <Row gap={t.spacing.xs}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent }} /><Text variant="caption" tone="muted">Study planned</Text></Row>
        <Row gap={t.spacing.xs}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.success }} /><Text variant="caption" tone="muted">Focus recorded</Text></Row>
        <Row gap={t.spacing.xs}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.warning }} /><Text variant="caption" tone="muted">Changed day</Text></Row>
      </Row>
    </Card>
  );
}

export const shiftWeek = (date: DateKey, dir: number): DateKey => addDays(date, 7 * dir);
