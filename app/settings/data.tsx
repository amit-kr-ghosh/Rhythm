import React, { useState } from 'react';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Banner, Button, Text } from '../../src/components/ui';
import { Segmented } from '../../src/components/inputs';
import { Group, Pad, SubScreen } from '../../src/components/settings/parts';
import { buildExport, shareExport } from '../../src/state/actions';
import { showToast } from '../../src/state/store';
import { addDays, toDateKey } from '../../src/domain/time';

export default function DataSettings() {
  const t = useTheme();
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [range, setRange] = useState<'all' | '30'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    setBusy(true); setError(null);
    try {
      const today = toDateKey(new Date());
      const file = buildExport(format, range === '30' ? { from: addDays(today, -29), to: today } : undefined);
      await shareExport(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
      showToast('error', 'Export failed.');
    } finally { setBusy(false); }
  };

  return (
    <SubScreen title="Export data">
      <Group title="Format">
        <Pad>
          <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }]} />
          <Text variant="caption" tone="muted">{format === 'csv' ? 'Sessions and daily totals — opens in any spreadsheet.' : 'Subjects, sessions, tasks, goals, habits and daily totals in one file.'}</Text>
        </Pad>
      </Group>
      <Group title="Period">
        <Pad><Segmented label="Period" value={range} onChange={setRange} options={[{ value: 'all', label: 'All time' }, { value: '30', label: 'Last 30 days' }]} /></Pad>
      </Group>
      {error ? <Banner tone="danger" text={error} /> : null}
      <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.xs }}>Only recorded data is exported — nothing is estimated or filled in.</Text>
      <Button label="Export & share" icon="share-outline" loading={busy} onPress={() => void doExport()} />
    </SubScreen>
  );
}
