/**
 * The v1 default timetable and subjects, kept ONLY as a test fixture: the schedule/progress/analytics engines are
 * tested against a realistic 24-hour timetable (sleep across midnight, naps, etc.) independent of today's defaults,
 * and the v2 upgrade tests need the exact data an existing install holds.
 */
import { PLAN_COLLEGE, PLAN_REGULAR, buildRows, subjectId, type Row } from '../src/domain/defaults';
import type { ActivityTemplate, DateKey, Subject } from '../src/domain/types';

export const REGULAR_V1: Row[] = [
  ['6:00 AM', '7:00 AM', 'Exercise'], ['7:00 AM', '8:00 AM', 'DSA'], ['8:00 AM', '8:30 AM', 'Breakfast'],
  ['8:30 AM', '9:30 AM', 'DSA'], ['9:30 AM', '10:00 AM', 'Bath'], ['10:00 AM', '10:30 AM', 'AI/ML revision'],
  ['10:30 AM', '12:30 PM', 'Cooking'], ['12:30 PM', '1:00 PM', 'Break'], ['1:00 PM', '1:30 PM', 'Lunch'],
  ['1:30 PM', '2:30 PM', 'Afternoon nap'], ['2:30 PM', '3:30 PM', 'AI/ML'], ['3:30 PM', '4:30 PM', 'DSA'],
  ['4:30 PM', '5:00 PM', 'Break'], ['5:00 PM', '6:00 PM', 'English speaking'], ['6:00 PM', '7:00 PM', 'RBI aptitude'],
  ['7:00 PM', '8:00 PM', 'AI/ML'], ['8:00 PM', '8:30 PM', 'Break'], ['8:30 PM', '9:00 PM', 'Dinner'],
  ['9:00 PM', '9:30 PM', 'DSA revision'], ['9:30 PM', '10:00 PM', 'Free time'], ['10:00 PM', '11:00 PM', 'Wind down'],
  ['11:00 PM', '6:00 AM', 'Sleep'],
];
export const COLLEGE_V1: Row[] = [
  ['6:00 AM', '7:00 AM', 'Exercise'], ['7:00 AM', '8:30 AM', 'DSA'], ['8:30 AM', '9:00 AM', 'Breakfast'],
  ['9:00 AM', '9:30 AM', 'Bath'], ['9:30 AM', '10:00 AM', 'English speaking'], ['10:00 AM', '1:00 PM', 'College'],
  ['1:00 PM', '1:30 PM', 'Lunch'], ['1:30 PM', '3:30 PM', 'Afternoon nap'], ['3:30 PM', '4:30 PM', 'AI/ML'],
  ['4:30 PM', '6:00 PM', 'DSA'], ['6:00 PM', '6:30 PM', 'RBI aptitude'], ['6:30 PM', '8:30 PM', 'Cooking'],
  ['8:30 PM', '9:00 PM', 'Dinner'], ['9:00 PM', '10:00 PM', 'AI/ML'], ['10:00 PM', '11:00 PM', 'Wind down'],
  ['11:00 PM', '6:00 AM', 'Sleep'],
];

export function legacyTemplates(from: DateKey, now: string): ActivityTemplate[] {
  return [
    ...buildRows(REGULAR_V1, 'regular', PLAN_REGULAR, [1, 2, 5, 6, 0], from, now, 'v1'),
    ...buildRows(COLLEGE_V1, 'college', PLAN_COLLEGE, [3, 4], from, now, 'v1'),
  ];
}

export function legacySubjects(now: string): Subject[] {
  const rows: [string, string, string, number, number][] = [
    ['dsa', 'DSA', '#6C8CFF', 180, 1260], ['backend', 'Backend Development', '#2DD4BF', 0, 0], ['aiml', 'AI/ML', '#C26BFF', 120, 840],
    ['rbi', 'RBI Grade B Preparation', '#F59E0B', 60, 420], ['english', 'English Speaking', '#34D399', 60, 420],
  ];
  return rows.map(([key, name, color, daily, weekly], i) => ({
    id: subjectId(key), name, color, archived: false, sortOrder: i, dailyTargetMin: daily > 0 ? daily : null, weeklyTargetMin: weekly > 0 ? weekly : null,
    notes: '', isDefault: true, createdAt: now, updatedAt: now, deletedAt: null,
  }));
}
