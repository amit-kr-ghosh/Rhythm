import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { Card, EmptyState, IconButton, PageHeader, Row, Screen, Text } from '../src/components/ui';
import { Select } from '../src/components/inputs';
import { useApp } from '../src/state/store';
import { useToday } from '../src/state/hooks';
import { isValidSession } from '../src/domain/progress';
import { formatCompact, formatExact, selectableSubjects } from '../src/domain/study';
import { formatClock, minutesOfDay, parseDateKey, WEEKDAY_SHORT, weekdayOf } from '../src/domain/time';
import { safeBack } from '../src/navigation/safeBack';
import { Pressable } from 'react-native';

const clock = (iso: string) => formatClock(minutesOfDay(new Date(iso)));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Full session history (start, end, exact duration) grouped by day, newest first. Tap a session to edit or delete it. */
export default function History() {
  const t = useTheme();
  const router = useRouter();
  const today = useToday();
  const d = useApp((s) => s.data);
  const [subject, setSubject] = useState<string | null>(null);
  const tracked = useMemo(() => selectableSubjects(d.subjects), [d.subjects]);
  const byId = useMemo(() => new Map(d.subjects.map((s) => [s.id, s])), [d.subjects]);
  const groups = useMemo(() => {
    const live = d.sessions.filter((s) => isValidSession(s) && (subject === null || s.subjectId === subject)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const m = new Map<string, typeof live>();
    for (const s of live) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m.entries()];
  }, [d.sessions, subject]);

  return (
    <Screen>
      <Row between>
        <IconButton icon="chevron-back" label="Back" solid onPress={() => safeBack(router)} />
      </Row>
      <PageHeader light="Session" title="History" />
      <Select<string | null> label="Subject" sheetTitle="Filter by subject" value={subject} onChange={setSubject}
        options={[{ value: null, label: 'All subjects' }, ...tracked.map((x) => ({ value: x.id as string | null, label: x.name, color: x.color }))]} />
      {groups.length === 0 ? <EmptyState icon="time-outline" title="No sessions yet" body="Sessions you record appear here." /> : groups.map(([date, list]) => {
        const p = parseDateKey(date);
        return (
          <View key={date} style={{ gap: t.spacing.sm }}>
            <Row between>
              <Text variant="heading">{date === today ? 'Today' : `${WEEKDAY_SHORT[weekdayOf(date)]}, ${p.d} ${MONTHS[p.m - 1]}`}</Text>
              <Text variant="caption" tone="muted">{formatCompact(list.reduce((a, s) => a + s.focusSec, 0))} · {list.length} session{list.length === 1 ? '' : 's'}</Text>
            </Row>
            <Card style={{ paddingVertical: t.spacing.xs, paddingHorizontal: t.spacing.lg }}>
              {list.map((s, i) => {
                const sub = byId.get(s.subjectId ?? '');
                return (
                  <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${sub?.name ?? 'No subject'}, ${clock(s.startedAt)} to ${clock(s.endedAt)}, ${formatExact(s.focusSec)}`} onPress={() => router.push(`/session/${s.id}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 60, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: t.colors.border }}>
                    <View style={{ width: 8, height: 36, borderRadius: 4, backgroundColor: sub?.color ?? t.colors.textFaint }} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{sub?.name ?? 'No subject'}{s.source === 'manual' ? ' · manual' : ''}</Text>
                      <Text variant="caption" tone="muted">{clock(s.startedAt)} – {clock(s.endedAt)}</Text>
                    </View>
                    <Text variant="bodyStrong">{formatExact(s.focusSec)}</Text>
                  </Pressable>
                );
              })}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}
