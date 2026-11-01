import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp, showToast } from '../../src/state/store';
import { Banner, Button, Card, Text } from '../../src/components/ui';
import { Field, SwitchRow } from '../../src/components/inputs';
import { SubScreen } from '../../src/components/settings/parts';
import { confirm } from '../../src/components/feedback';
import { deleteAllPersonalData } from '../../src/state/actions';
import { DELETE_PHRASE, isDeletePhrase } from '../../src/state/extra-settings';

export default function DeleteData() {
  const t = useTheme();
  const router = useRouter();
  const user = useApp((s) => s.auth);
  const [alsoCloud, setAlsoCloud] = useState(true);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const ok = await confirm({
      title: 'Delete all personal data?',
      message: `This permanently removes your sessions, tasks, goals, habits, notes and history from this device${user && alsoCloud ? ' and from your cloud account' : ''}. It cannot be undone.`,
      confirmLabel: 'Delete everything', destructive: true,
    });
    if (!ok) return;
    setBusy(true); setError(null);
    const res = await deleteAllPersonalData({ alsoCloud: !!user && alsoCloud });
    setBusy(false);
    if (res.ok) { showToast('success', 'Your data was deleted. Defaults were restored.'); router.replace('/(tabs)' as never); }
    else setError(res.errors.general ?? 'Could not delete data.');
  };

  return (
    <SubScreen title="Delete my data">
      <Card tone="sunken" style={{ gap: t.spacing.sm }}>
        <Text variant="heading">What will happen</Text>
        <Text tone="muted">• This device is reset: all sessions, tasks, goals, habits, notes and progress history are permanently removed.</Text>
        <Text tone="muted">• The default subjects and timetable are restored so the app stays usable.</Text>
        <Text tone="muted">• {user ? 'If you choose below, your cloud copy is deleted too, so it cannot be restored on another device.' : 'You are not signed in, so only this device is affected.'}</Text>
        <Text tone="muted">• Your sign-in account itself is not deleted. To remove it, contact the project owner or delete it from the Supabase dashboard.</Text>
        <Text tone="muted">• Consider exporting first (Settings → Export).</Text>
      </Card>
      {user ? <SwitchRow label="Also delete my cloud data" value={alsoCloud} onChange={setAlsoCloud} hint="Recommended — otherwise your cloud data would sync back." /> : null}
      <Field label={`Type ${DELETE_PHRASE} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" />
      {error ? <Banner tone="danger" text={error} /> : null}
      <Button label="Delete my data" variant="danger" icon="trash-outline" disabled={!isDeletePhrase(typed)} loading={busy} onPress={() => void run()} />
    </SubScreen>
  );
}
