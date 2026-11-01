import React from 'react';
import { Sheet, choose, confirm } from '../feedback';
import { Button, Text } from '../ui';
import { formatClock } from '../../domain/time';
import type { Segment } from '../../domain/schedule';
import { deleteActivity, duplicateActivity, editActivity, overrideOccurrence, skipOccurrence } from '../../state/actions';
import { resizeTimes, shiftTimes } from '../../state/extra-timetable';
import { showToast } from '../../state/store';

type Props = {
  seg: Segment | null; onClose: () => void; onDetails: (s: Segment) => void; onEdit: (s: Segment) => void;
};

/** Quick actions for one block, including the accessible alternative to drag-and-drop (move / resize in 15-minute steps). */
export function BlockActions({ seg, onClose, onDetails, onEdit }: Props) {
  if (!seg) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  const apply = async (times: { startMin: number; endMin: number }, what: string) => {
    let scope: 'day' | 'following' | null = 'day';
    if (seg.templateId) {
      scope = await choose('Apply change', `${what} → ${formatClock(times.startMin)} – ${formatClock(times.endMin)}. Earlier days always keep their current times.`, [
        { key: 'day', label: 'This day only' }, { key: 'following', label: `This and following days (from ${seg.date})` },
      ]);
    }
    if (!scope) return;
    const res = scope === 'following' && seg.templateId
      ? await editActivity(seg.templateId, times, seg.date)
      : await overrideOccurrence(seg, { ...times });
    if (!res.ok) showToast('error', Object.values(res.errors)[0] ?? 'Could not change the time.');
    else onClose();
  };

  const remove = async () => {
    if (!seg.templateId) { await skipOccurrence(seg); onClose(); return; }
    const ok = await confirm({
      title: `Delete “${seg.title}”?`, confirmLabel: 'Delete from this day on', destructive: true,
      message: `It will be removed from ${seg.date} onward. Earlier days and anything you recorded on them are kept.`,
    });
    if (ok) { await deleteActivity(seg.templateId, seg.date); onClose(); }
  };

  return (
    <Sheet visible title={seg.title} onClose={onClose}>
      <Text variant="caption" tone="muted">{formatClock(seg.startMin)} – {formatClock(seg.endMin)} · {seg.durationMin} min</Text>
      <Button label="Details & progress" icon="information-circle-outline" variant="primary" onPress={() => { onClose(); onDetails(seg); }} />
      {seg.templateId ? <Button label="Edit recurring activity" icon="create-outline" variant="secondary" onPress={() => { onClose(); onEdit(seg); }} /> : null}
      <Text variant="label" tone="muted">Move or resize in 15-minute steps</Text>
      <Button label="Move 15 min earlier" icon="arrow-up" variant="secondary" onPress={() => { void apply(shiftTimes(seg.startMin, seg.endMin, -15), 'Move earlier'); }} />
      <Button label="Move 15 min later" icon="arrow-down" variant="secondary" onPress={() => { void apply(shiftTimes(seg.startMin, seg.endMin, 15), 'Move later'); }} />
      <Button label="Shorter by 15 min" icon="remove-circle-outline" variant="secondary" onPress={() => { void apply(resizeTimes(seg.startMin, seg.endMin, -15, seg.durationMin), 'Shorten'); }} />
      <Button label="Longer by 15 min" icon="add-circle-outline" variant="secondary" onPress={() => { void apply(resizeTimes(seg.startMin, seg.endMin, 15, seg.durationMin), 'Lengthen'); }} />
      {seg.templateId ? <Button label="Duplicate" icon="copy-outline" variant="secondary" onPress={() => { void duplicateActivity(seg.templateId as string).then((c) => { onClose(); if (c) onEdit({ ...seg, templateId: c.id }); }); }} /> : null}
      <Button label={seg.templateId ? 'Delete…' : 'Remove this one-off'} icon="trash-outline" variant="danger" onPress={() => { void remove(); }} />
    </Sheet>
  );
}
