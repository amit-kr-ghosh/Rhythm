import React, { useEffect, useState } from 'react';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { Banner, Button, Card, EmptyState, Row, Text } from '../../src/components/ui';
import { Group, Pad, SubScreen } from '../../src/components/settings/parts';
import { formatLastSync, syncStateLabel } from '../../src/state/extra-settings';
import { manualSync, retryFailedSync } from '../../src/state/actions';
import { getRepo } from '../../src/state/runtime';
import { auth } from '../../src/services/cloud';
import { useRouter } from 'expo-router';

type Conflict = { kind: string; entityId: string; at: string; winner: unknown; loser: unknown };

export default function SyncSettings() {
  const t = useTheme();
  const router = useRouter();
  const sync = useApp((s) => s.sync);
  const user = useApp((s) => s.auth);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getRepo().conflictLog(10).then(setConflicts).catch(() => setConflicts([])); }, [sync.lastSyncAt]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <SubScreen title="Sync">
      {!auth.available() ? (
        <EmptyState icon="cloud-offline-outline" title="Cloud sync is not configured" body="Your data is saved on this device. Add your Supabase URL and anon key (see README) to enable accounts and sync." />
      ) : !user ? (
        <Card style={{ gap: t.spacing.md }}>
          <Text variant="heading">Local only</Text>
          <Text tone="muted">Sign in to back up and sync across devices. Everything you have recorded so far will be uploaded.</Text>
          <Button label="Sign in" onPress={() => router.push('/auth/login' as never)} />
        </Card>
      ) : (
        <>
          <Group title="Status">
            <Pad>
              <Row between><Text>State</Text><Text tone={sync.state === 'error' ? 'danger' : 'muted'}>{syncStateLabel(sync.state)}</Text></Row>
              <Row between><Text>Waiting to upload</Text><Text tone="muted">{sync.pending}</Text></Row>
              <Row between><Text>Failed</Text><Text tone={sync.failed ? 'danger' : 'muted'}>{sync.failed}</Text></Row>
              <Row between><Text>Last sync</Text><Text tone="muted">{formatLastSync(sync.lastSyncAt)}</Text></Row>
            </Pad>
          </Group>
          {sync.lastError ? <Banner tone="danger" text={`Last error: ${sync.lastError}`} /> : null}
          {sync.failed > 0 ? <Banner tone="warning" text="Failed changes are kept on this device and never discarded. Retry once the problem is fixed." /> : null}
          <Button label="Sync now" icon="sync" loading={busy || sync.state === 'syncing'} onPress={() => void run(manualSync)} />
          {sync.failed > 0 ? <Button label="Retry failed changes" variant="secondary" loading={busy} onPress={() => void run(retryFailedSync)} /> : null}
        </>
      )}
      <Group title="Conflict history">
        <Pad>
          {conflicts.length === 0 ? <Text tone="muted">No conflicts. When the same item is edited on two devices the newest edit wins and the older version is kept here.</Text>
            : conflicts.map((c, i) => <Text key={i} variant="caption" tone="muted">{new Date(c.at).toLocaleString()} · {c.kind} · older version kept</Text>)}
        </Pad>
      </Group>
    </SubScreen>
  );
}
