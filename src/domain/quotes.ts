/**
 * Curated quotations. Only quotes with a well-documented source (or an honest "Proverb") are included.
 * Where wording varies between translations, that is stated in `source`. Nothing here is invented.
 */
export type QuoteTopic = 'discipline' | 'consistency' | 'patience' | 'learning' | 'courage' | 'growth';
export type Quote = { id: string; text: string; author: string; source?: string; topic: QuoteTopic };

export const QUOTES: Quote[] = [
  { id: 'durant-habit', topic: 'consistency', text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant', source: 'The Story of Philosophy (1926), summarising Aristotle' },
  { id: 'clear-systems', topic: 'consistency', text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear', source: 'Atomic Habits' },
  { id: 'laozi-step', topic: 'consistency', text: 'A journey of a thousand miles begins with a single step.', author: 'Laozi', source: 'Tao Te Ching, ch. 64 (translations vary)' },
  { id: 'plato-beginning', topic: 'consistency', text: 'The beginning is the most important part of the work.', author: 'Plato', source: 'Republic, Book II' },
  { id: 'proverb-well-begun', topic: 'consistency', text: 'Well begun is half done.', author: 'Proverb' },
  { id: 'goethe-apply', topic: 'discipline', text: 'Knowing is not enough; we must apply. Being willing is not enough; we must do.', author: 'Johann Wolfgang von Goethe', source: 'Wilhelm Meister’s Apprenticeship' },
  { id: 'marshall-deeds', topic: 'discipline', text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { id: 'roosevelt-what-you-can', topic: 'discipline', text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt', source: 'Autobiography, quoting Squire Bill Widener' },
  { id: 'proverb-tomorrow', topic: 'discipline', text: 'Tomorrow is often the busiest day of the week.', author: 'Spanish proverb' },
  { id: 'edison-perspiration', topic: 'discipline', text: 'Genius is one percent inspiration and ninety-nine percent perspiration.', author: 'Thomas Edison' },
  { id: 'aesop-tortoise', topic: 'patience', text: 'Slow and steady wins the race.', author: 'Aesop', source: 'Moral of “The Hare and the Tortoise”' },
  { id: 'proverb-slow-growing', topic: 'patience', text: 'Be not afraid of growing slowly; be afraid only of standing still.', author: 'Chinese proverb' },
  { id: 'laozi-easy', topic: 'patience', text: 'Do the difficult things while they are easy and do the great things while they are small.', author: 'Laozi', source: 'Tao Te Ching (translations vary)' },
  { id: 'mandela-education', topic: 'learning', text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela', source: 'Speech, 2003' },
  { id: 'plutarch-fire', topic: 'learning', text: 'The mind is not a vessel to be filled, but a fire to be kindled.', author: 'Plutarch', source: 'Paraphrase of “On Listening to Lectures”' },
  { id: 'mandela-courage', topic: 'courage', text: 'I learned that courage was not the absence of fear, but the triumph over it.', author: 'Nelson Mandela', source: 'Long Walk to Freedom' },
  { id: 'twain-courage', topic: 'courage', text: 'Courage is resistance to fear, mastery of fear — not absence of fear.', author: 'Mark Twain', source: 'Pudd’nhead Wilson’s Calendar' },
  { id: 'proverb-fall-seven', topic: 'growth', text: 'Fall seven times, stand up eight.', author: 'Japanese proverb' },
  { id: 'nietzsche-why', topic: 'growth', text: 'He who has a why to live can bear almost any how.', author: 'Friedrich Nietzsche', source: 'Twilight of the Idols (commonly rendered)' },
  { id: 'jobs-love', topic: 'growth', text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs', source: 'Stanford commencement address, 2005' },
];

export const TOPICS: QuoteTopic[] = ['discipline', 'consistency', 'patience', 'learning', 'courage', 'growth'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Same quote all day, a different one tomorrow; optionally restricted to the user's chosen topics. */
export function quoteOfDay(dateKey: string, topics: QuoteTopic[] = []): Quote {
  const pool = topics.length ? QUOTES.filter((q) => topics.includes(q.topic)) : QUOTES;
  const list = pool.length ? pool : QUOTES;
  return list[hash(dateKey) % list.length] as Quote;
}

export const quoteById = (id: string): Quote | undefined => QUOTES.find((q) => q.id === id);

/** App-written encouragement (clearly not attributed quotes). Chosen deterministically from a seed. */
const AFTER_SESSION = [
  'Session saved. Steady work adds up.',
  'Nice focus. That time is recorded.',
  'Done. A short break will help the next session.',
  'That is real progress, logged honestly.',
];
const GOAL_REACHED = [
  'Target reached. Well earned.',
  'You hit today’s target — rest or keep going, your call.',
];
const FALLING_BEHIND = [
  'Behind pace is fine — one focused session today moves the number.',
  'Start small: even 25 minutes is a real step.',
  'The week is not over. Pick one subject and begin.',
];

export type EncouragementKind = 'session' | 'goal' | 'behind';
export function encouragement(kind: EncouragementKind, seed: string): string {
  const list = kind === 'session' ? AFTER_SESSION : kind === 'goal' ? GOAL_REACHED : FALLING_BEHIND;
  return list[hash(`${kind}:${seed}`) % list.length] as string;
}
