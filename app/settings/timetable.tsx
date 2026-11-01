import React, { useState } from 'react';
import { useApp } from '../../src/state/store';
import { restoreDefaultTimetable, updatePrefs } from '../../src/state/actions';
import { Button, Card, Text } from '../../src/components/ui';
import { Segmented } from '../../src/components/inputs';
import { confirm } from '../../src/components/feedback';
import { SubScreen, Pad } from '../../src/components/settings/parts';
import { showToast } from '../../src/state/store';

export default function TimetableSettings() {
  const weekStart = useApp((s) => s.data.prefs.weekStart);
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    const ok = await confirm({
      title: 'Restore default timetable?',
      message: 'From today onward, your current timetable is replaced by the original Regular-day and College-day schedules. Past days, logs and sessions are not changed. One-off changes you made for future dates stay.',
      confirmLabel: 'Restore', destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await restoreDefaultTimetable(); showToast('success', 'Default timetable restored from today.'); }
    catch { showToast('error', 'Could not restore the timetable. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <SubScreen title="Timetable">
      <Card>
        <Pad>
          <Text variant="heading">Week starts on</Text>
          <Segmented<0 | 1 | 6> label="Week start" value={weekStart} onChange={(v) => { void updatePrefs({ weekStart: v }); }}
            options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }, { value: 6, label: 'Saturday' }]} />
          <Text variant="caption" tone="muted">Used for weekly totals, the week view and weekly goals.</Text>
        </Pad>
      </Card>
      <Card>
        <Pad>
          <Text variant="heading">Default schedule</Text>
          <Text tone="muted">Bring back the original timetable. Your history is kept: the current blocks are closed the day before today, not deleted.</Text>
          <Button label="Restore default timetable" variant="danger" icon="refresh-outline" loading={busy} onPress={() => { void restore(); }} />
        </Pad>
      </Card>
    </SubScreen>
  );
}
