import type { Subject } from './types';

/** Icons offered when customising a subject. Values are Ionicons names, stored as data on the subject. */
export const SUBJECT_ICONS = [
  'git-network-outline', 'hardware-chip-outline', 'business-outline', 'chatbubbles-outline',
  'code-slash-outline', 'terminal-outline', 'analytics-outline', 'calculator-outline',
  'book-outline', 'library-outline', 'flask-outline', 'bulb-outline',
  'language-outline', 'newspaper-outline', 'cash-outline', 'rocket-outline',
] as const;

export type SubjectIconName = (typeof SUBJECT_ICONS)[number];
export const FALLBACK_SUBJECT_ICON: SubjectIconName = 'book-outline';

/** Icons for the shipped subjects, so they look right before the user customises anything. */
const DEFAULT_BY_NAME: Record<string, SubjectIconName> = {
  'dsa': 'git-network-outline',
  'ai/ml': 'hardware-chip-outline',
  'rbi preparation': 'business-outline',
  'communication': 'chatbubbles-outline',
};

export const isSubjectIcon = (v: unknown): v is SubjectIconName => typeof v === 'string' && (SUBJECT_ICONS as readonly string[]).includes(v);

export const defaultSubjectIcon = (name: string): SubjectIconName => DEFAULT_BY_NAME[name.trim().toLowerCase()] ?? FALLBACK_SUBJECT_ICON;

/** The icon to draw for a subject: the user's choice if it is a known icon, else the default for its name. */
export const subjectIcon = (s: Pick<Subject, 'name' | 'icon'>): SubjectIconName => (isSubjectIcon(s.icon) ? s.icon : defaultSubjectIcon(s.name));
