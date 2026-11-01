import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/state/store';
import { Banner, Button, Card, Text } from '../../src/components/ui';
import { SubScreen } from '../../src/components/settings/parts';
import { confirm } from '../../src/components/feedback';
import { manualSync, signOut } from '../../src/state/actions';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function Account() {
  const t = useTheme();
  const router = useRouter();
  const user = useApp((s) => s.auth);
  const sync = useApp((s) => s.sync);
  const [busy, setBusy] = useState(false);
  const unsynced = sync.pending + sync.failed;

  const logout = async () => {
    const ok = await confirm({
      title: 'Log out?',
      message: unsynced > 0
        ? `${unsynced} change${unsynced === 1 ? ' is' : 's are'} not synced yet. They stay safely on this device and upload next time you sign in, but they won't reach other devices until then.`
        : 'Your data stays on this device. You can keep using Rhythm offline and sign in again any time.',
      confirmLabel: 'Log out',
    });
    if (!ok) return;
    setBusy(true);
    await signOut();
    setBusy(false);
    router.replace('/(tabs)' as never);
  };

  return (
    <SubScreen title="Account">
      <Card style={{ gap: t.spacing.xs }}>
        <Text variant="label" tone="muted">Signed in as</Text>
        <Text variant="heading">{user?.email ?? 'Not signed in'}</Text>
      </Card>
      {unsynced > 0 ? <Banner tone="warning" text={`${unsynced} change${unsynced === 1 ? '' : 's'} waiting to sync.`} actionLabel="Sync first" onAction={() => void manualSync()} /> : null}
      {user ? <Button label="Log out" variant="secondary" icon="log-out-outline" loading={busy} onPress={() => void logout()} /> : <Button label="Sign in" onPress={() => router.push('/auth/login' as never)} />}
    </SubScreen>
  );
}
