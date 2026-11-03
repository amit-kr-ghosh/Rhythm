import type { SoundId, TimerEventKind } from './alerts';

/**
 * Alert sounds as data. Nothing is a binary asset: the web layer renders these with Web Audio oscillators (so there is no
 * file to host, cache or license) and a test renders them offline to prove they are audible and bounded.
 */
export type Note = {
  /** Start offset in seconds from the beginning of the sound. */
  at: number;
  /** Fundamental frequency in Hz. */
  freq: number;
  /** Length in seconds (the envelope decays to silence over this time). */
  dur: number;
  /** Peak gain 0–1 before the master volume. */
  gain: number;
  wave: 'sine' | 'triangle' | 'square';
  /** Extra overtones as [frequency ratio, relative gain]. */
  partials?: [number, number][];
  /** Attack in seconds (default 0.01). */
  attack?: number;
};
export type SoundSpec = { id: SoundId; label: string; notes: Note[] };

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

export const SOUNDS: Record<SoundId, SoundSpec> = {
  chime: {
    id: 'chime', label: 'Chime',
    notes: [C5, E5, G5, C6].map((freq, i) => ({ at: i * 0.18, freq, dur: i === 3 ? 1.1 : 0.7, gain: 0.5, wave: 'sine' as const, partials: [[2, 0.25], [3, 0.08]] as [number, number][] })),
  },
  bell: {
    id: 'bell', label: 'Bell',
    // Inharmonic partials are what make a struck bell sound like a bell rather than an organ.
    notes: [{ at: 0, freq: 660, dur: 2.2, gain: 0.55, wave: 'sine', attack: 0.004, partials: [[2.0, 0.5], [2.76, 0.35], [5.4, 0.2], [8.93, 0.1]] }],
  },
  beep: {
    id: 'beep', label: 'Beep',
    notes: [0, 0.22, 0.44].map((at) => ({ at, freq: 880, dur: 0.14, gain: 0.35, wave: 'square' as const, attack: 0.005 })),
  },
  gentle: {
    id: 'gentle', label: 'Gentle',
    notes: [{ at: 0, freq: 440, dur: 1.2, gain: 0.45, wave: 'triangle', attack: 0.06 }, { at: 0.45, freq: 554.37, dur: 1.6, gain: 0.45, wave: 'triangle', attack: 0.06 }],
  },
};

/** Total audible length of a spec in seconds. */
export const soundLength = (s: SoundSpec): number => s.notes.reduce((m, n) => Math.max(m, n.at + n.dur), 0);

/**
 * The same sound for different events: a finished focus block plays the chosen sound as written; the end of a break plays it
 * with the pitches reversed (or, for a single pitch, raised a fourth) so you can tell "rest" from "back to work"
 * without looking.
 */
export function soundForEvent(id: SoundId, kind: TimerEventKind | 'test'): SoundSpec {
  const spec = SOUNDS[id] ?? SOUNDS.chime;
  if (kind !== 'break_done') return spec;
  const freqs = spec.notes.map((n) => n.freq).reverse();
  const same = freqs.every((f, i) => f === spec.notes[i]?.freq);
  // A phrase that is its own reverse (one note, or a repeated beep) is transposed up a fourth instead.
  return { ...spec, notes: spec.notes.map((n, i) => ({ ...n, freq: same ? n.freq * 2 ** (5 / 12) : (freqs[i] ?? n.freq) })) };
}

/** Seconds between repeats of the alert sound. */
export const repeatGapSeconds = (s: SoundSpec): number => Math.max(3, soundLength(s) + 1.5);
