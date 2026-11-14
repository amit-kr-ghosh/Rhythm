import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FEATURES } from '../../src/domain/features';
import { Button, Card, Chip, IconButton, Row, Screen, Text, PageHeader } from '../../src/components/ui';
import { formatDuration } from '../../src/domain/time';
import { WeekStrip } from '../../src/components/timetable/WeekStrip';
import { Sheet, confirm } from '../../src/components/feedback';
import { DayView } from '../../src/components/timetable/DayView';
import { BlockActions } from '../../src/components/timetable/BlockActions';
import { CalendarView, WeekView, shiftWeek } from '../../src/components/timetable/WeekMonthViews';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useDayModel, useToday } from '../../src/state/hooks';
import { restoreDefaultTimetable } from '../../src/state/actions';
import { showToast, useApp } from '../../src/state/store';
import { WEEKDAY_LONG, addDays, isValidDateKey, parseDateKey, startOfMonth, endOfMonth, weekDates, weekdayOf } from '../../src/domain/time';
import type { DateKey } from '../../src/domain/types';
import type { Segment } from '../../src/domain/schedule';

type View_ = 'day' | 'week' | 'month';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Hidden while FEATURES.timetable is off: a typed or bookmarked /timetable URL goes to Today instead of the page. */
export default function TimetableRoute() {
  return FEATURES.timetable ? <TimetableScreen /> : <Redirect href="/" />;
}

function TimetableScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = useToday();
  const weekStart = useApp((s) => s.data.prefs.weekStart);
  const [view, setView] = useState<View_>('day');
  const [date, setDate] = useState<DateKey>(today);
  const [menu, setMenu] = useState(false);
  const [actionSeg, setActionSeg] = useState<Segment | null>(null);
  const model = useDayModel(date);

  useEffect(() => { if (params.date && isValidDateKey(params.date)) { setDate(params.date); setView('day'); } }, [params.date]);

  const { y, m, d: dd } = parseDateKey(date);
  const title = view === 'day'
    ? `${WEEKDAY_LONG[weekdayOf(date)]}, ${dd} ${MONTHS[m - 1]}${y !== parseDateKey(today).y ? ` ${y}` : ''}`
    : view === 'week'
      ? (() => { const w = weekDates(date, weekStart); const a = parseDateKey(w[0] as string), b = parseDateKey(w[6] as string); return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}`; })()
      : `${MONTHS[m - 1]} ${y}`;

  const step = (dir: number) => {
    if (view === 'day') setDate(addDays(date, dir));
    else if (view === 'week') setDate(shiftWeek(date, dir));
  };
  const shiftMonth = (dir: number) => setDate(dir < 0 ? startOfMonth(addDays(startOfMonth(date), -1)) : addDays(endOfMonth(date), 1));
  const pickDay = (d: DateKey) => { setDate(d); setView('day'); };
  const openDetails = (s: Segment) => router.push({ pathname: '/occurrence', params: { key: s.key, date: s.date } });
  const openEdit = (s: Segment) => router.push({ pathname: '/activity/[id]', params: { id: s.templateId ?? 'new', date: s.date } });
  const add = () => router.push({ pathname: '/activity/[id]', params: { id: 'new', date } });

  const restore = async () => {
    setMenu(false);
    const ok = await confirm({
      title: 'Restore the default timetable?', confirmLabel: 'Restore from today',
      message: 'Your history is kept. All current recurring activities end yesterday and the original default timetable starts today. Changes you made to recurring activities from today onward will be replaced; one-off changes to specific days stay.',
    });
    if (ok) { await restoreDefaultTimetable(); showToast('success', 'Default timetable restored from today.'); }
  };

  const [filter, setFilter] = useState<'all' | 'study' | 'routine'>('all');
  // Web desktop only: the day list on the left, a month calendar and a day summary on the right.
  const winW = useWindowDimensions().width;
  const split = Platform.OS === 'web' && winW >= 1280 && view === 'day';
  const studyMin = model.segments.filter((x) => x.category === 'study' && !x.spill).reduce((a, x) => a + x.durationMin, 0);
  const dayView = <DayView filter={filter} model={model} selectedKey={actionSeg?.key ?? null} onOpen={openDetails} onMore={setActionSeg} onAdd={add} />;
  return (
    <Screen>
      <Row between>
        <Pressable accessibilityRole="button" accessibilityLabel={date === today ? title : `${title}. Back to today`} onPress={() => setDate(today)} style={{ flex: 1, minHeight: t.minTouch, justifyContent: 'center' }}>
          <Text variant="bodyStrong" numberOfLines={1}>{view === 'month' ? title : title}</Text>
        </Pressable>
        <Row gap={t.spacing.sm}>
          <IconButton icon="add" label="Add activity" tone="ink" size={26} onPress={add} />
          <IconButton icon="ellipsis-horizontal" label="Timetable menu" solid onPress={() => setMenu(true)} />
        </Row>
      </Row>
      <PageHeader light="Daily" title="Timetable" action={
        <Button compact fullWidth={false} variant="secondary" icon={view === 'month' ? 'list-outline' : 'calendar-outline'} label={view === 'month' ? 'Day' : 'Calendar'} onPress={() => setView(view === 'month' ? 'day' : 'month')} />
      } />
      {view === 'day' ? (
        <WeekStrip date={date} today={today} weekStart={weekStart} onPick={setDate} onShift={(dir) => setDate(addDays(date, dir))} />
      ) : view === 'week' ? (
        <Row between>
          <IconButton icon="chevron-back" label="Previous week" solid onPress={() => step(-1)} />
          <Text variant="heading" accessibilityRole="header" align="center">{title}</Text>
          <IconButton icon="chevron-forward" label="Next week" solid onPress={() => step(1)} />
        </Row>
      ) : null}
      {view === 'day' ? (
        <Row gap={t.spacing.sm} wrap>
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Study" icon="book-outline" selected={filter === 'study'} onPress={() => setFilter('study')} />
          <Chip label="Routine" icon="person-outline" selected={filter === 'routine'} onPress={() => setFilter('routine')} />
        </Row>
      ) : null}
      {view === 'day' && split ? (
        <Row align="flex-start" gap={t.spacing.xl}>
          <View style={{ flex: 1.6, minWidth: 0 }}>{dayView}</View>
          <View style={{ flex: 1, minWidth: 0, gap: t.spacing.lg }}>
            <CalendarView date={date} today={today} onPickDay={pickDay} onMonth={shiftMonth} />
            <Card>
              <Text variant="heading">{date === today ? 'Today at a glance' : 'Day at a glance'}</Text>
              <Row between style={{ marginTop: t.spacing.md }}>
                <View><Text variant="title">{model.segments.filter((x) => !x.spill).length}</Text><Text variant="caption" tone="muted">Activities</Text></View>
                <View><Text variant="title">{formatDuration(studyMin)}</Text><Text variant="caption" tone="muted">Study planned</Text></View>
                <View><Text variant="title">{model.segments.filter((x) => x.category === 'study' && !x.spill).length}</Text><Text variant="caption" tone="muted">Study blocks</Text></View>
              </Row>
            </Card>
          </View>
        </Row>
      ) : null}
      {view === 'day' && !split ? dayView : null}
      {view === 'week' ? <WeekView date={date} today={today} onPickDay={pickDay} /> : null}
      {view === 'month' ? <CalendarView date={date} today={today} onPickDay={pickDay} onMonth={shiftMonth} /> : null}

      <BlockActions seg={actionSeg} onClose={() => setActionSeg(null)} onDetails={openDetails} onEdit={openEdit} />
      <Sheet visible={menu} title="Timetable options" onClose={() => setMenu(false)}>
        <Button label="Add an activity" icon="add" variant="primary" onPress={() => { setMenu(false); add(); }} />
        <Button label={view === 'week' ? 'Day view' : 'Week view'} icon="calendar-outline" variant="secondary" onPress={() => { setMenu(false); setView(view === 'week' ? 'day' : 'week'); }} />
        <Button label="Restore default timetable…" icon="refresh" variant="danger" onPress={() => { void restore(); }} />
        <Text variant="caption" tone="muted">Restoring never deletes history: past days keep the schedule they had.</Text>
      </Sheet>
    </Screen>
  );
}
