import type { SoundSpec } from '../domain/sounds';

/**
 * Renders a SoundSpec with Web Audio. Pure scheduling on any BaseAudioContext, so the same code runs live in the browser and
 * (in tests) against an OfflineAudioContext. Everything is scheduled on the audio clock, which keeps ticking precisely even
 * when the page's JavaScript timers are throttled in a background tab.
 */
export function scheduleSound(ctx: BaseAudioContext, dest: AudioNode, spec: SoundSpec, when: number): void {
  for (const n of spec.notes) {
    const start = when + n.at;
    const end = start + n.dur;
    const attack = Math.min(n.attack ?? 0.01, n.dur / 2);
    const voices: [number, number][] = [[1, 1], ...(n.partials ?? [])];
    for (const [ratio, rel] of voices) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = n.wave;
      osc.frequency.setValueAtTime(n.freq * ratio, start);
      const peak = Math.max(0.0002, n.gain * rel);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(peak, start + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env); env.connect(dest);
      osc.start(start);
      osc.stop(end + 0.05);
    }
  }
}
