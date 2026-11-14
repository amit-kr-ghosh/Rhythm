import React from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { Screen, PageHeader } from '../../src/components/ui';
import { Group, NavRow } from '../../src/components/settings/parts';
import { syncSummary } from '../../src/state/extra-settings';
import { formatDuration } from '../../src/domain/time';
import { selectableMode } from '../../src/domain/timer';

const THEME_LABEL = { dark: 'Dark', light: 'Light', system: 'System default' } as const;
const WEEK_LABEL = { 0: 'Sunday', 1: 'Monday', 6: 'Saturday' } as const;

export default function SettingsHome() {
  const router = useRouter();
  const prefs = useApp((s) => s.data.prefs);
  const notif = useApp((s) => s.data.notif);
  const authUser = useApp((s) => s.auth);
  const sync = useApp((s) => s.sync);
  const go = (p: string) => () => router.push(p as never);
  return (
    <Screen contentStyle={Platform.OS === 'web' ? { maxWidth: 760 } : undefined}>
      <PageHeader light="Your" title="Settings" />
      <Group title="Account">
        <NavRow icon="person-circle-outline" title={authUser ? 'Account' : 'Sign in to sync'} value={authUser?.email ?? 'Optional — the app works fully offline'} onPress={go(authUser ? '/settings/logout' : '/auth/login')} />
        <NavRow icon="sync-outline" title="Sync" value={syncSummary(sync)} onPress={go('/settings/sync')} last />
      </Group>
      <Group title="Personalise">
        <NavRow icon="contrast-outline" title="Appearance" value={`${THEME_LABEL[prefs.theme]} · week starts ${WEEK_LABEL[prefs.weekStart]}`} onPress={go('/settings/appearance')} />
        <NavRow icon="library-outline" title="Subjects" value="Add, edit or delete" onPress={go('/subjects')} />
        <NavRow icon="flag-outline" title="Study targets" value={`${formatDuration(prefs.dailyStudyTargetMin)} / day · ${formatDuration(prefs.weeklyStudyTargetMin)} / week`} onPress={go('/settings/goals')} />
        <NavRow icon="timer-outline" title="Focus timer" value={`${selectableMode(prefs.timer.mode) === 'pomodoro' ? 'Pomodoro' : 'Stopwatch'} · ${prefs.timer.focusMin}/${prefs.timer.breakMin} min`} onPress={go('/settings/timer')} />
        <NavRow icon="notifications-outline" title="Notifications" value={notif.enabled ? 'On' : 'Off'} onPress={go('/settings/notifications')} last />
      </Group>
      <Group title="Your data">
        <NavRow icon="download-outline" title="Export" value="CSV or JSON" onPress={go('/settings/data')} />
        <NavRow icon="trash-outline" title="Delete my data" tone="danger" onPress={go('/settings/delete')} last />
      </Group>
      <Group title="More">
        <NavRow icon="help-circle-outline" title="How progress is calculated" onPress={go('/rules')} />
        <NavRow icon="information-circle-outline" title="About" onPress={go('/settings/about')} last />
        {authUser ? <NavRow icon="log-out-outline" title="Log out" onPress={go('/settings/logout')} last /> : null}
      </Group>
    </Screen>
  );
}
