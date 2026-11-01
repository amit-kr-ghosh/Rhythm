import React, { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useApp } from '../../src/state/store';
import { disableNotifications, enableNotifications, updateNotif } from '../../src/state/actions';
import { Banner, Button, Card, Text } from '../../src/components/ui';
import { DurationStepper, SwitchRow, TimeField } from '../../src/components/inputs';
import { Pad, SubScreen } from '../../src/components/settings/parts';
import { useTheme } from '../../src/theme/ThemeProvider';
import { validateQuietHours } from '../../src/domain/validation';
import type { NotificationSettings } from '../../src/domain/types';

type Flag = 'activities' | 'study' | 'tasks' | 'goals' | 'breaks' | 'habits' | 'summary';
const FLAGS: { key: Flag; label: string; hint: string }[] = [
  { key: 'activities', label: 'Timetable activities', hint: 'Before blocks that have a reminder set.' },
  { key: 'study', label: 'Study sessions', hint: 'Before study blocks on your timetable.' },
  { key: 'tasks', label: 'Task deadlines', hint: 'For tasks with a reminder.' },
  { key: 'goals', label: 'Daily & weekly goals', hint: 'An evening check-in on your targets.' },
  { key: 'breaks', label: 'Breaks & focus complete', hint: 'While a focus timer is running.' },
  { key: 'habits', label: 'Habit reminders', hint: 'At the time you set for each habit.' },
  { key: 'summary', label: 'Daily summary', hint: 'A nudge to review planned vs. actual.' },
];

export default function NotificationSettings() {
  const t = useTheme();
  const n = useApp((s) => s.data.notif);
  const perm = useApp((s) => s.notifPermission);
  const [busy, setBusy] = useState(false);
  const [quietErr, setQuietErr] = useState<string | undefined>();
  const set = (p: Partial<Omit<NotificationSettings, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>) => { void updateNotif(p); };
  const setQuiet = async (p: { quietStartMin?: number; quietEndMin?: number }) => {
    const v = validateQuietHours({ startMin: p.quietStartMin ?? n.quietStartMin, endMin: p.quietEndMin ?? n.quietEndMin });
    if (!v.ok) { setQuietErr(v.errors.quiet); return; }
    setQuietErr(undefined); await updateNotif(p);
  };
  const enable = async () => { setBusy(true); try { await enableNotifications(); } finally { setBusy(false); } };

  return (
    <SubScreen title="Notifications">
      {!n.enabled ? (
        <Card style={{ gap: t.spacing.md }}>
          <Text variant="heading">Why Rhythm asks for permission</Text>
          <Text tone="muted">{Platform.OS === 'web' ? 'Reminders are shown by your browser while a Rhythm tab is open — nothing is sent from a server, and nothing can appear once every Rhythm tab is closed. For reminders that arrive when the app is closed, use Rhythm on your phone. You can switch any of them off.' : 'Reminders are scheduled on your phone — nothing is sent from a server. They let you hear about the next study block, a task due soon, or the end of a focus session while the app is closed. You can switch any of them off, and the app works the same without them.'}</Text>
          <Button label="Enable reminders" icon="notifications-outline" loading={busy} onPress={() => { void enable(); }} />
        </Card>
      ) : (
        <Card><Pad>
          <SwitchRow label="Reminders on" value={n.enabled} onChange={(v) => { if (!v) void disableNotifications(); }} />
        </Pad></Card>
      )}
      {perm === 'denied' ? (
        <Banner tone="warning" text={Platform.OS === 'web' ? 'Notifications are blocked for this site in your browser. Rhythm still works without them; you can allow them from the padlock icon in the address bar.' : 'Notifications are blocked in your phone’s settings. Rhythm still works without them; you can allow them there any time.'} actionLabel={Platform.OS === 'web' ? undefined : 'Open settings'} onAction={Platform.OS === 'web' ? undefined : () => { void Linking.openSettings(); }} />
      ) : null}
      {n.enabled ? (
        <>
          <Card><Pad>
            <Text variant="heading">What to remind me about</Text>
            {FLAGS.map((f) => <SwitchRow key={f.key} label={f.label} hint={f.hint} value={n[f.key]} onChange={(v) => set({ [f.key]: v } as Partial<NotificationSettings>)} />)}
            {n.summary ? <TimeField label="Summary time" value={n.summaryMin} onChange={(v) => set({ summaryMin: v })} /> : null}
          </Pad></Card>
          <Card><Pad>
            <Text variant="heading">Lead times</Text>
            <DurationStepper label="Before activities & study" value={n.activityLeadMin} min={0} max={120} step={5} onChange={(v) => set({ activityLeadMin: v })} />
            <DurationStepper label="Before task deadlines" value={n.taskLeadMin} min={0} max={1440} step={15} onChange={(v) => set({ taskLeadMin: v })} />
          </Pad></Card>
          <Card><Pad>
            <Text variant="heading">Quiet hours</Text>
            <SwitchRow label="Enable quiet hours" hint="Time-critical reminders are skipped; others wait until quiet hours end." value={n.quietEnabled} onChange={(v) => set({ quietEnabled: v })} />
            {n.quietEnabled ? (
              <>
                <TimeField label="From" value={n.quietStartMin} onChange={(v) => { void setQuiet({ quietStartMin: v }); }} error={quietErr} />
                <TimeField label="Until" value={n.quietEndMin} onChange={(v) => { void setQuiet({ quietEndMin: v }); }} />
              </>
            ) : null}
          </Pad></Card>
        </>
      ) : null}
    </SubScreen>
  );
}
