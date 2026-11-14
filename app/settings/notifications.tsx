import React, { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useApp } from '../../src/state/store';
import { disableNotifications, enableNotifications, updateAlertPrefs, updateNotif } from '../../src/state/actions';
import { showToast, store } from '../../src/state/store';
import { testAlert } from '../../src/state/alertRuntime';
import { audioStatus, playAlertSound, unlockAudio } from '../../src/services/alerts';
import { notificationSupport, requestPermission } from '../../src/services/notifications';
import { REPEAT_OPTIONS, SOUND_IDS, VOLUME_OPTIONS } from '../../src/domain/alerts';
import { SOUNDS } from '../../src/domain/sounds';
import { Banner, Button, Card, Text } from '../../src/components/ui';
import { DurationStepper, Segmented, SwitchRow, TimeField } from '../../src/components/inputs';
import { Pad, SubScreen } from '../../src/components/settings/parts';
import { useTheme } from '../../src/theme/ThemeProvider';
import { validateQuietHours } from '../../src/domain/validation';
import type { NotificationSettings } from '../../src/domain/types';

type Flag = 'tasks' | 'goals' | 'breaks' | 'habits';
const FLAGS: { key: Flag; label: string; hint: string }[] = [
  { key: 'tasks', label: 'Task deadlines', hint: 'For tasks with a reminder.' },
  { key: 'goals', label: 'Daily & weekly goals', hint: 'An evening check-in on your targets.' },
  { key: 'breaks', label: 'Breaks & focus complete', hint: 'While a focus timer is running.' },
  { key: 'habits', label: 'Habit reminders', hint: 'At the time you set for each habit.' },
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

  const prefs = useApp((s) => s.alertPrefs);
  const [soundNote, setSoundNote] = useState<string | null>(null);
  const support = notificationSupport();
  const isWeb = Platform.OS === 'web';
  const nearestVolume = VOLUME_OPTIONS.reduce((best, v) => (Math.abs(v - prefs.volume) < Math.abs(best - prefs.volume) ? v : best), VOLUME_OPTIONS[0]);
  const preview = async () => {
    unlockAudio(); // this tap is the user gesture browsers require before any sound
    setSoundNote(null);
    await playAlertSound('test', prefs);
    if (isWeb && audioStatus() !== 'ready') setSoundNote('Your browser has not allowed sound yet. Tap anywhere on the page once, then try again.');
    else if (!prefs.sound) setSoundNote('Sound is switched off above.');
    else if (!isWeb) setSoundNote('On a phone the alert sound is your notification sound, so use “Test alert” to hear it.');
  };
  const runTest = async () => {
    unlockAudio();
    // Ask for permission (this tap is the gesture) without switching the reminder categories on as a side effect.
    if (perm === 'undetermined') store.set({ notifPermission: await requestPermission() });
    await testAlert(5);
    showToast('info', isWeb ? 'Test alert in 5 seconds. Switch to another tab to see the notification too.' : 'Test alert in 5 seconds. Lock your screen or leave the app to try it.');
  };

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
      {isWeb && support === 'ios-needs-install' ? (
        <Banner tone="warning" text="On iPhone and iPad, notifications only work for apps added to the Home Screen. In Safari tap Share → Add to Home Screen, then open Rhythm from there and come back to this screen." />
      ) : null}
      {isWeb && support === 'unsupported' ? (
        <Banner tone="warning" text="This browser does not support notifications. Sound and the on-screen alert still work while Rhythm is open." />
      ) : null}
      <Card><Pad>
        <Text variant="heading">Sound & vibration</Text>
        <Text variant="caption" tone="muted">{isWeb ? 'Plays when a focus block, break or countdown ends while Rhythm is open in a tab. Saved on this device.' : 'Used when a focus block, break or countdown ends. Saved on this device.'}</Text>
        <SwitchRow label="Play a sound" value={prefs.sound} onChange={(v) => { void updateAlertPrefs({ sound: v }); }} />
        {prefs.sound && isWeb ? (
          <>
            <Segmented label="Sound" options={SOUND_IDS.map((id) => ({ value: id, label: SOUNDS[id].label }))} value={prefs.soundId} onChange={(v) => { void updateAlertPrefs({ soundId: v }); }} />
            <Segmented<number> label="Volume" options={VOLUME_OPTIONS.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} value={nearestVolume} onChange={(v) => { void updateAlertPrefs({ volume: v }); }} />
            <Segmented<number> label="Repeat until dismissed (max)" options={REPEAT_OPTIONS.map((n) => ({ value: n, label: n === 1 ? 'Once' : `${n}×` }))} value={prefs.repeat} onChange={(v) => { void updateAlertPrefs({ repeat: v as 1 | 3 | 5 }); }} />
          </>
        ) : null}
        <SwitchRow label="Vibrate" hint={isWeb ? 'Android phones only. iPhones and computers cannot vibrate from a web page.' : undefined} value={prefs.vibrate} onChange={(v) => { void updateAlertPrefs({ vibrate: v }); }} />
        {isWeb ? <SwitchRow label="Keep the screen on while a timer runs" hint="Recommended on phones: a locked phone freezes the browser tab, and a frozen tab cannot alert you." value={prefs.keepAwake} onChange={(v) => { void updateAlertPrefs({ keepAwake: v }); }} /> : null}
        {isWeb ? <Button label="Play sound" icon="volume-high-outline" variant="secondary" onPress={() => { void preview(); }} /> : null}
        <Button label="Test alert in 5 seconds" icon="alarm-outline" variant="secondary" onPress={() => { void runTest(); }} />
        {soundNote ? <Text variant="caption" tone="muted">{soundNote}</Text> : null}
      </Pad></Card>
      {perm === 'denied' && !(isWeb && support !== 'supported') ? (
        <Banner tone="warning" text={Platform.OS === 'web' ? 'Notifications are blocked for this site in your browser. Rhythm still works without them; you can allow them from the padlock icon in the address bar.' : 'Notifications are blocked in your phone’s settings. Rhythm still works without them; you can allow them there any time.'} actionLabel={Platform.OS === 'web' ? undefined : 'Open settings'} onAction={Platform.OS === 'web' ? undefined : () => { void Linking.openSettings(); }} />
      ) : null}
      {n.enabled ? (
        <>
          <Card><Pad>
            <Text variant="heading">What to remind me about</Text>
            {FLAGS.map((f) => <SwitchRow key={f.key} label={f.label} hint={f.hint} value={n[f.key]} onChange={(v) => set({ [f.key]: v } as Partial<NotificationSettings>)} />)}
          </Pad></Card>
          <Card><Pad>
            <Text variant="heading">Lead times</Text>
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
