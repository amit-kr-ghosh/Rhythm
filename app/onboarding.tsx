import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { useApp } from '../src/state/store';
import { View } from 'react-native';
import { Banner, BrandMark, Button, Card, CardTitle, IconBadge, Row, Screen, Text } from '../src/components/ui';
import { Field, NumberField } from '../src/components/inputs';
import { HoursMinutesField } from '../src/components/settings/parts';
import { completeOnboarding, enableNotifications, saveSubject, updatePrefs } from '../src/state/actions';
import { formatDuration } from '../src/domain/time';

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const prefs = useApp((s) => s.data.prefs);
  const subjects = useApp((s) => s.data.subjects).filter((s) => !s.archived);
  const [step, setStep] = useState(0);
  const [daily, setDaily] = useState(prefs.dailyStudyTargetMin);
  const [weekly, setWeekly] = useState(prefs.weeklyStudyTargetMin);
  const [targets, setTargets] = useState<Record<string, number | null>>(() => Object.fromEntries(subjects.map((s) => [s.id, s.dailyTargetMin])));
  const [why, setWhy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notifNote, setNotifNote] = useState<string | null>(null);

  const finish = async () => {
    await completeOnboarding(why.trim() ? [why] : []);
    router.replace('/(tabs)' as never);
  };
  const saveTargets = async () => {
    const res = await updatePrefs({ dailyStudyTargetMin: daily, weeklyStudyTargetMin: weekly });
    if (!res.ok) { setError(Object.values(res.errors)[0] ?? 'Check your targets.'); return; }
    for (const s of subjects) {
      const v = targets[s.id] ?? null;
      if (v !== s.dailyTargetMin) await saveSubject({ id: s.id, name: s.name, color: s.color, dailyTargetMin: v, weeklyTargetMin: s.weeklyTargetMin, notes: s.notes });
    }
    setError(null); setStep(2);
  };
  const askNotifications = async () => {
    const p = await enableNotifications();
    setNotifNote(p === 'granted' ? 'Reminders are on. You can fine-tune them in Settings.' : 'No problem — Rhythm works fine without reminders. You can enable them later in Settings.');
  };

  const STEPS = 3;
  return (
    <Screen footer={step === 0 ? <Button label="Get started" onPress={() => setStep(1)} /> : step === 1 ? <Button label="Continue" onPress={() => void saveTargets()} /> : <Button label="Start using Rhythm" variant="lime" onPress={() => void finish()} />}>
      <Row between>
        <View accessible accessibilityLabel={`Step ${step + 1} of ${STEPS}`} style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: STEPS }).map((_, i) => <View key={i} style={{ height: 6, flex: 1, maxWidth: 56, borderRadius: 3, backgroundColor: i <= step ? t.colors.ink : t.colors.track }} />)}
        </View>
        <Button label="Skip" variant="ghost" compact fullWidth={false} onPress={() => void finish()} />
      </Row>
      {step === 0 ? (
        <>
          <View style={{ marginTop: t.spacing.lg }}><BrandMark size={72} /></View>
          <Text variant="hero">Find your rhythm</Text>
          <Text variant="heading" tone="muted">Pick your subjects. Focus. See real progress.</Text>
          <Card style={{ gap: t.spacing.lg }}>
            {[
              { icon: 'library-outline', title: 'Your subjects, ready', body: 'DSA, AI/ML, RBI and Communication are set up with daily targets you can change.' },
              { icon: 'shield-checkmark-outline', title: 'Honest numbers', body: 'Every percentage comes from time you actually recorded.' },
              { icon: 'cloud-offline-outline', title: 'Works offline', body: 'Sign in later, only if you want backup and sync.' },
            ].map((x) => (
              <Row key={x.title} gap={t.spacing.md} align="flex-start">
                <IconBadge icon={x.icon as 'calendar-outline'} size={44} />
                <View style={{ flex: 1 }}><Text variant="bodyStrong">{x.title}</Text><Text variant="caption" tone="muted">{x.body}</Text></View>
              </Row>
            ))}
          </Card>
        </>
      ) : step === 1 ? (
        <>
          <Text variant="display">Set your study targets</Text>
          <Text tone="muted">Progress rings compare your focused time with these. Change them any time — past days keep the target that applied then.</Text>
          <Card style={{ gap: t.spacing.lg }}>
            <HoursMinutesField label="Daily target" minutes={daily} onChange={setDaily} />
            <HoursMinutesField label="Weekly target" minutes={weekly} onChange={setWeekly} />
          </Card>
          {subjects.length > 0 ? (
            <Card style={{ gap: t.spacing.md }}>
              <Text variant="heading">Per-subject daily targets</Text>
              {subjects.map((s) => <NumberField key={s.id} label={s.name} suffix="min" value={targets[s.id] ?? null} onChange={(v) => setTargets({ ...targets, [s.id]: v })} hint={targets[s.id] ? formatDuration(targets[s.id] as number) : 'No target'} />)}
            </Card>
          ) : null}
          {error ? <Banner tone="danger" text={error} /> : null}
        </>
      ) : (
        <>
          <Text variant="display">Why are you studying?</Text>
          <Text tone="muted">Optional. Rhythm shows it to you on hard days.</Text>
          <Field label="My reason" value={why} onChangeText={setWhy} multiline placeholder="e.g. To clear RBI Grade B and build a strong foundation in AI/ML" />
          <Card style={{ gap: t.spacing.sm }}>
            <CardTitle icon="notifications-outline" title="Reminders (optional)" />
            <Text tone="muted">Rhythm can remind you about task deadlines and goal check-ins. Reminders are sent from this device — nothing leaves it. You can say no and still use everything.</Text>
            <Button label="Turn on reminders" variant="secondary" icon="notifications-outline" onPress={() => void askNotifications()} />
            {notifNote ? <Text variant="caption" tone="muted">{notifNote}</Text> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
