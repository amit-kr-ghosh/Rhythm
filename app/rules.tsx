import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '../src/components/ui';
import { safeBack } from '../src/navigation/safeBack';

const RULES: { title: string; body: string }[] = [
  { title: '1. Focused time', body: 'Only recorded focus sessions count. Cancelled sessions, paused or idle timer time, and break time never count. Manual entries count only after they pass validation.' },
  { title: '2. Timetable completion', body: 'Weighted by duration, not by block count: a 2-hour block matters more than a 30-minute one. Credit for a block is the larger of your manual “done/partial” mark and the focus time from sessions linked to that block, capped at its length. Taking the larger (never the sum) prevents double counting.' },
  { title: '3. What is excluded', body: 'Cancelled blocks, blocks you skipped for a specific day, and (if you choose) sleep are left out entirely. A block you mark “skipped” stays in the plan and earns nothing.' },
  { title: '4. “So far” vs “final”', body: '“So far” divides credit by the scheduled time that has already passed, so blocks that have not started never lower it. “If the day ended now” divides by the whole day. Past days show a final result.' },
  { title: '5. Study target', body: 'Focused minutes ÷ target minutes. It can pass 100%; progress rings stop at 100%. Example: 2 h of a 3 h DSA target is 66.7%.' },
  { title: '6. Tasks and habits', body: 'Tasks: done ÷ due that day. Habits: done ÷ scheduled that day. Completing a task never adds study time.' },
  { title: '7. Productivity score', body: 'A weighted average of the parts that have data. Weights are re-balanced across the available parts, and you can change them in Settings.' },
  { title: '8. Changing targets', body: 'Targets are stored with the date they took effect, so changing one never rewrites past days.' },
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
