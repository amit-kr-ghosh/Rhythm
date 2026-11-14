import React from 'react';
import Constants from 'expo-constants';
import { Card, Text } from '../../src/components/ui';
import { SubScreen } from '../../src/components/settings/parts';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function About() {
  const t = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <SubScreen title="About">
      <Card style={{ gap: t.spacing.sm }}>
        <Text variant="heading">Rhythm {version}</Text>
        <Text tone="muted">A personal focus timer and study tracker. Every number you see is calculated from what you recorded.</Text>
      </Card>
      <Card style={{ gap: t.spacing.sm }}>
        <Text variant="heading">Privacy</Text>
        <Text tone="muted">Your data lives in a database on this device. It only leaves the device if you sign in, and then only to your own Supabase project, protected by row-level security. No analytics or ads.</Text>
      </Card>
      <Card style={{ gap: t.spacing.sm }}>
        <Text variant="heading">Known limitations</Text>
        <Text tone="muted">• Reminders are local notifications; Android may delay them under aggressive battery saving.</Text>
        <Text tone="muted">• Conflicting edits on two devices resolve by newest edit; the older version is kept in the sync conflict history.</Text>
      </Card>
    </SubScreen>
  );
}
