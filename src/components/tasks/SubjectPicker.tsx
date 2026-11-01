import React from 'react';
import { Select } from '../inputs';
import { useActiveSubjects } from '../../state/hooks';

/** Subject dropdown (with an optional "None" row). */
export function SubjectPicker({ label = 'Subject', value, onChange, noneLabel = 'None' }: { label?: string; value: string | null; onChange: (id: string | null) => void; noneLabel?: string }) {
  const subjects = useActiveSubjects();
  return (
    <Select<string | null> label={label} sheetTitle="Choose subject" value={value} onChange={onChange}
      options={[{ value: null, label: noneLabel }, ...subjects.map((s) => ({ value: s.id as string | null, label: s.name, color: s.color }))]} />
  );
}
