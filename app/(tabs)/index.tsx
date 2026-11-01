import React, { useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { tint } from '../../src/theme/tokens';
import { BrandMark, Card, EmptyState, Grid, IconButton, ProgressRing, Row, Screen, SectionHeader, Text, PageHeader } from '../../src/components/ui';
import { PulseDot, Reveal, useTween } from '../../src/components/motion';
import { QuickAdd } from '../../src/components/home/QuickAdd';
import { SubjectCard, SubjectSheet } from '../../src/components/study/parts';
import { useApp } from '../../src/state/store';
import { useDayModel, useNow, useStudyDay, useToday } from '../../src/state/hooks';
import { WEEKDAY_LONG, formatClock, formatDuration, minutesOfDay, weekdayOf } from '../../src/domain/time';
import { formatCompact } from '../../src/domain/study';

const greeting = (h: number) => (h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night');


/** Web hero: lime "studied" fill, striped "left" remainder, and a purple cap marking the target at the right end. */
function SegmentedBar({ pct, targetText }: { pct: number; targetText: string }) {
  const t = useTheme();
  const v = useTween(Math.max(0, Math.min(100, pct)));
  const stripeA = tint(t.colors.heroLeft, 0.42), stripeB = tint(t.colors.heroLeft, 0.2);
  const stripes = { backgroundColor: stripeB, backgroundImage: `repeating-linear-gradient(90deg, ${stripeA} 0px, ${stripeA} 4px, ${stripeB} 4px, ${stripeB} 8px)` } as object;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Total study progress today" accessibilityValue={{ text: `${Math.round(pct)}%` }}>
      <View style={{ height: 14, borderRadius: 7, overflow: 'hidden', ...stripes }}>
        <View style={{ width: `${v}%`, height: '100%', backgroundColor: t.colors.lime }} />
        <View style={{ position: 'absolute', right: 0, top: 0, width: 10, height: 14, borderRadius: 7, backgroundColor: t.colors.heroTarget }} />
      </View>
      <Row between style={{ marginTop: 6 }}>
        <Text variant="caption" tone="heroMuted">0</Text>
        <Text variant="caption" style={{ color: t.colors.heroTarget, fontWeight: '600' }}>Target {targetText}</Text>
      </Row>
    </View>
  );
}

function LegendDot({ color, text }: { color: string; text: string }) {
  return (
    <Row gap={8}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text variant="bodyStrong" tone="hero" numberOfLines={1}>{text}</Text>
    </Row>
  );
}

/** Today: the four study targets (actual vs target) and a compact timetable preview. */
export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const today = useToday();
  const now = useNow(30_000);
  const day = useDayModel(today);
  const study = useStudyDay(today);
  const timer = useApp((s) => s.timer);
  const winW = useWindowDimensions().width;
  const compact = winW < 440;
  // Web only: desktop gets a horizontal stats strip in the hero card, and a two-column body on big monitors.
  const webDesktop = Platform.OS === 'web' && winW >= 960;
  const webWide = Platform.OS === 'web' && winW >= 1500;
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = study.rows.find((r) => r.subjectId === openId) ?? null;

  const nowMin = minutesOfDay(now);
  const upcoming = day.progress.timetable.blocks.filter((b) => b.occurrence.endMin > nowMin || b.occurrence.crossesMidnight).slice(0, 5);
  const dateText = `${WEEKDAY_LONG[weekdayOf(today)]}, ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
  const dateShort = `${(WEEKDAY_LONG[weekdayOf(today)] as string).slice(0, 3)}, ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  const total = study.total;
  const start = (subjectId: string) => router.push({ pathname: '/focus', params: { subjectId } } as never);
  const log = (subjectId: string) => router.push({ pathname: '/manual-session', params: { subjectId } } as never);

  const studyBlock = (
    <>
      <SectionHeader title="Today’s study" action="Analytics" onAction={() => router.push('/analytics')} />
      {study.rows.length === 0 ? (
        <Card><EmptyState icon="book-outline" title="No study subjects" body="Add daily targets in Settings → Study targets." actionLabel="Open settings" onAction={() => router.push('/settings')} /></Card>
      ) : (
        <Reveal index={2}>
          <Grid max={2} minCols={2} basis={webWide ? 280 : undefined}>
            {study.rows.map((r) => <SubjectCard key={r.subjectId} row={r} onOpen={() => setOpenId(r.subjectId)} onStart={() => start(r.subjectId)} />)}
          </Grid>
        </Reveal>
      )}
    </>
  );
  const timetableBlock = (
    <>
      <SectionHeader title="Timetable" action="Open" onAction={() => router.push('/timetable')} />
      {upcoming.length === 0 ? (
        <Card><EmptyState icon="calendar-outline" title={day.occurrences.length === 0 ? 'Nothing scheduled' : 'Done for today'} body={day.occurrences.length === 0 ? 'Add an activity to your timetable.' : undefined} actionLabel={day.occurrences.length === 0 ? 'Open timetable' : undefined} onAction={() => router.push('/timetable')} /></Card>
      ) : (
        <Card style={{ paddingVertical: t.spacing.xs, paddingHorizontal: t.spacing.md }}>
          {upcoming.map((b, i) => {
            const o = b.occurrence, c = o.color ?? t.colors.category[o.category], isStudy = o.category === 'study', current = b.state === 'in_progress';
            return (
              <Pressable key={o.key} accessibilityRole="button" accessibilityLabel={`${o.title}, ${formatClock(o.startMin)} to ${formatClock(o.endMin)}`} onPress={() => router.push(`/occurrence?key=${encodeURIComponent(o.key)}&date=${today}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 50, borderBottomWidth: i === upcoming.length - 1 ? 0 : 1, borderBottomColor: t.colors.border }}>
                <Text variant="caption" tone="muted" fit numberOfLines={1} style={{ width: 58 }}>{formatClock(o.startMin)}</Text>
                <View style={{ width: 6, alignSelf: 'stretch', marginVertical: 10, borderRadius: 3, backgroundColor: c }} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{o.title}</Text>
                  <Text variant="caption" tone="muted">{formatDuration(o.durationMin)}{isStudy ? ` planned · ${b.linkedFocusMin > 0 ? `${formatDuration(Math.round(b.linkedFocusMin))} studied` : 'none yet'}` : ''}</Text>
                </View>
                {current ? <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(c, 0.2) }}><Text variant="caption" style={{ fontWeight: '700' }}>Now</Text></View> : null}
              </Pressable>
            );
          })}
        </Card>
      )}
    </>
  );

  return (
    <Screen>
      <Row between gap={t.spacing.sm}>
        <Row gap={t.spacing.sm} style={{ flex: 1, minWidth: 0 }}>
          <BrandMark size={compact ? 38 : 46} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" fit numberOfLines={1}>{greeting(now.getHours())}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>{compact ? dateShort : dateText}</Text>
          </View>
        </Row>
        <Row gap={t.spacing.sm}>
          <IconButton icon="add" label="Add" tone="ink" size={22} onPress={() => setAddOpen(true)} />
          <IconButton icon="notifications-outline" label="Notifications" solid size={20} onPress={() => router.push('/settings/notifications' as never)} />
        </Row>
      </Row>
      <PageHeader light="Let’s make" title="Today productive" />

      {timer ? (
        <Card tone="accent" onPress={() => router.push('/focus')} accessibilityLabel="Focus timer is running. Open timer" style={{ padding: t.spacing.lg }}>
          <Row><PulseDot color={timer.status === 'running' ? t.colors.success : t.colors.warning} active={timer.status === 'running'} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>{timer.status === 'running' ? 'Timer running' : 'Timer paused'}</Text>
            <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} /></Row>
        </Card>
      ) : null}

      <Reveal index={1}>
        <Card tone="hero" style={{ padding: t.spacing.lg }}>
          {compact || Platform.OS !== 'web' ? <Text variant="heading" tone="hero" style={{ marginBottom: t.spacing.md }}>Today’s progress</Text> : null}
          {compact ? (
            // Phones: ring on the left, the three numbers stacked beside it, all allowed to shrink — nothing is clipped.
            <Row gap={t.spacing.lg} align="center">
              <ProgressRing onHero value={Math.min(100, total.pct)} size={88} stroke={11} label="Total study progress today" display={`${Math.round(total.pct)}%`} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="caption" tone="heroMuted">Studied</Text>
                <Text variant="title" tone="hero" fit numberOfLines={1}>{formatCompact(total.actualSec)}</Text>
                <Text variant="caption" tone="heroMuted" numberOfLines={1}>of {formatCompact(total.targetSec)}</Text>
                <Text variant="label" numberOfLines={1} style={{ color: t.colors.lime, marginTop: 2 }}>{total.remainingSec > 0 ? `${formatCompact(total.remainingSec)} left` : 'Target reached'}</Text>
              </View>
            </Row>
          ) : Platform.OS === 'web' ? (
            // Web only: ring on the left; title, segmented progress bar and a Studied / Target / Left legend on the right.
            <Row gap={webDesktop ? t.spacing.xxl : t.spacing.xl}>
              <ProgressRing onHero value={Math.min(100, total.pct)} size={webDesktop ? 124 : 112} stroke={webDesktop ? 15 : 13} label="Total study progress today" display={`${Math.round(total.pct)}%`} />
              <View style={{ flex: 1, minWidth: 0, gap: t.spacing.md }}>
                <Text variant="heading" tone="hero">Today’s progress</Text>
                <SegmentedBar pct={total.pct} targetText={formatCompact(total.targetSec)} />
                <Row gap={t.spacing.lg} style={{ flexWrap: 'wrap' }}>
                  <LegendDot color={t.colors.heroStudied} text={`${formatCompact(total.actualSec)} studied`} />
                  <LegendDot color={t.colors.heroTarget} text={`${formatCompact(total.targetSec)} target`} />
                  <LegendDot color={t.colors.heroLeft} text={total.remainingSec > 0 ? `${formatCompact(total.remainingSec)} left` : 'Target reached'} />
                </Row>
              </View>
            </Row>
          ) : (
            <Row gap={t.spacing.xl}>
              <ProgressRing onHero value={Math.min(100, total.pct)} size={116} stroke={14} label="Total study progress today" display={`${Math.round(total.pct)}%`} />
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: t.colors.heroTrack }} />
              <View style={{ flex: 1, minWidth: 0, gap: t.spacing.md, justifyContent: 'center' }}>
                {[
                  { icon: 'time-outline', value: formatCompact(total.actualSec), label: 'Studied' },
                  { icon: 'flag-outline', value: formatCompact(total.targetSec), label: 'Target' },
                  { icon: 'hourglass-outline', value: total.remainingSec > 0 ? formatCompact(total.remainingSec) : '—', label: 'Left' },
                ].map((x) => (
                  <Row key={x.label} gap={t.spacing.sm}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.colors.heroTrack, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={x.icon as 'time-outline'} size={17} color={t.colors.heroMuted} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}><Text variant="bodyStrong" tone="hero" fit numberOfLines={1}>{x.value}</Text><Text variant="caption" tone="heroMuted" style={{ fontSize: 11, lineHeight: 14 }}>{x.label}</Text></View>
                  </Row>
                ))}
              </View>
            </Row>
          )}
        </Card>
      </Reveal>

      {webWide ? (
        <Row align="flex-start" gap={t.spacing.xxxl}>
          <View style={{ flex: 1.45, minWidth: 0, gap: t.spacing.lg }}>{studyBlock}</View>
          <View style={{ flex: 1, minWidth: 0, gap: t.spacing.lg }}>{timetableBlock}</View>
        </Row>
      ) : (
        <>
          {studyBlock}
          {timetableBlock}
        </>
      )}

      <QuickAdd visible={addOpen} onClose={() => setAddOpen(false)} date={today} />
      <SubjectSheet row={open} onClose={() => setOpenId(null)} onStart={start} onLog={log} />
    </Screen>
  );
}
