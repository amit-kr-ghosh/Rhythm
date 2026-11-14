import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '../src/components/ui';
import { safeBack } from '../src/navigation/safeBack';

const RULES: { title: string; body: string }[] = [
  { title: '1. Focused time', body: 'Only recorded focus sessions count. Cancelled sessions, paused or idle timer time, and break time never count. Manual entries count only after they pass validation.' },
  { title: '2. Study target', body: 'Focused minutes ÷ target minutes. It can pass 100%; progress rings stop at 100%. Example: 2 h of a 3 h DSA target is 66.7%.' },
  { title: '3. Tasks and habits', body: 'Tasks: done ÷ due that day. Habits: done ÷ scheduled that day. Completing a task never adds study time.' },
  { title: '4. Productivity score', body: 'A weighted average of the parts that have data. Weights are re-balanced across the available parts, and you can change them in Settings.' },
  { title: '5. Changing targets', body: 'Targets are stored with the date they took effect, so changing one never rewrites past days.' },
  { title: 'No data?', body: 'You will see “—” rather than 0%. Nothing is invented or inflated.' },
];

export default function Rules() {
  const router = useRouter();
  return (
    <Screen footer={<Button label="Done" onPress={() => safeBack(router)} />}>
      <Stack.Screen options={{ title: 'How progress is calculated' }} />
      <Text variant="title" accessibilityRole="header">How progress is calculated</Text>
      <Text tone="muted">Every number in Rhythm comes from what you recorded. These are the rules.</Text>
      {RULES.map((r) => (
        <Card key={r.title}><Text variant="bodyStrong">{r.title}</Text><Text tone="muted">{r.body}</Text></Card>
      ))}
    </Screen>
  );
}
