import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { updatePrefs } from '../../src/state/actions';
import { Button, Card, Text } from '../../src/components/ui';
import { HoursMinutesField, NavRow, Pad, SubScreen } from '../../src/components/settings/parts';
import { showToast } from '../../src/state/store';

export default function GoalSettings() {
  const router = useRouter();
  const prefs = useApp((s) => s.data.prefs);
  const [daily, setDaily] = useState(prefs.dailyStudyTargetMin);
  const [weekly, setWeekly] = useState(prefs.weeklyStudyTargetMin);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveTargets = async () => {
    const res = await updatePrefs({ dailyStudyTargetMin: daily, weeklyStudyTargetMin: weekly, streakThresholdMin: prefs.streakThresholdMin });
    if (res.ok) { setErrors({}); showToast('success', 'Targets saved. Past days keep the targets that applied then.'); } else setErrors(res.errors);
  };
  return (
    <SubScreen title="Study targets">
      <Card><Pad>
        <Text variant="heading">Overall</Text>
        <HoursMinutesField label="Daily target" minutes={daily} onChange={setDaily} error={errors.daily} />
        <HoursMinutesField label="Weekly target" minutes={weekly} onChange={setWeekly} error={errors.weekly} />
        <Button label="Save targets" onPress={() => { void saveTargets(); }} />
        <NavRow icon="library-outline" title="Per-subject targets" value="DSA, AI/ML, RBI Preparation, Communication" onPress={() => router.push('/subjects' as never)} last />
      </Pad></Card>
    </SubScreen>
  );
}
