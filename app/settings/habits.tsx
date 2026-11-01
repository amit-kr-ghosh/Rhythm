import React from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Text } from '../../src/components/ui';
import { SubScreen } from '../../src/components/settings/parts';
import { useApp } from '../../src/state/store';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function HabitSettings() {
  const t = useTheme();
  const router = useRouter();
  const count = useApp((s) => s.data.habits.filter((h) => !h.archived).length);
  return (
    <SubScreen title="Habits">
      <Card style={{ gap: t.spacing.md }}>
        <Text variant="heading">{count === 0 ? 'No habits yet' : `${count} active habit${count === 1 ? '' : 's'}`}</Text>
        <Text tone="muted">Create, edit and archive habits — including their days and reminder time — in the Habits section of the Tasks tab. Reminders are switched on or off under Notifications.</Text>
        <Button label="Open habits" icon="repeat-outline" onPress={() => router.push('/(tabs)' as never)} />
        <Button label="Habit reminders" variant="secondary" onPress={() => router.push('/settings/notifications' as never)} />
      </Card>
    </SubScreen>
  );
}
