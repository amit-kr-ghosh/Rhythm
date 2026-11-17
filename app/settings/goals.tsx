import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { Card, Text } from '../../src/components/ui';
import { NavRow, Pad, SubScreen } from '../../src/components/settings/parts';
import { overallTargets, trackedSubjects } from '../../src/domain/study';
import { formatDuration } from '../../src/domain/time';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Targets are set per subject; the overall daily and weekly figures are their sum, the same numbers Today and Analytics use. */
export default function GoalSettings() {
  const router = useRouter();
  const t = useTheme();
  const subjects = useApp((s) => s.data.subjects);
  const tracked = trackedSubjects(subjects);
  const o = overallTargets(subjects);
  return (
    <SubScreen title="Study targets">
      <Card><Pad>
        <Text variant="heading">Overall</Text>
        <Text variant="caption" tone="muted">Added up from your subjects. Change a subject’s target to change these.</Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.xl, flexWrap: 'wrap' }}>
          <View style={{ minWidth: 0 }}><Text variant="caption" tone="muted">Per day</Text><Text variant="title">{o.dailyMin > 0 ? formatDuration(o.dailyMin) : '—'}</Text></View>
          <View style={{ minWidth: 0 }}><Text variant="caption" tone="muted">Per week</Text><Text variant="title">{o.dailyMin > 0 ? formatDuration(o.weeklyMin) : '—'}</Text></View>
        </View>
      </Pad></Card>
      <Card><Pad>
        <Text variant="heading">By subject</Text>
        {tracked.length === 0 ? <Text tone="muted">No subject has a daily target yet.</Text> : tracked.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minWidth: 0 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{s.name}</Text>
            <Text tone="muted">{formatDuration(s.dailyTargetMin ?? 0)} / day</Text>
          </View>
        ))}
        <NavRow icon="library-outline" title="Edit subject targets" value="Daily and weekly, per subject" onPress={() => router.push('/subjects' as never)} last />
      </Pad></Card>
    </SubScreen>
  );
}
