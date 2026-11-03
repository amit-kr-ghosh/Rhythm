import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertPrefs, TimerEventKind } from '../domain/alerts';

/**
 * Native (Android / iOS) side of timer alerts. The sound itself comes from the OS notification (see notifications.ts: the
 * `timer` channel and the foreground handler both play the system sound), so there is nothing to synthesise here. What the app
 * adds while it is open is vibration. The web counterpart is `alerts.web.ts`; both export the same functions.
 */

export type AudioStatus = 'ready' | 'needs-tap' | 'unsupported';

export function initAlerts(): () => void { return () => undefined; }
export function unlockAudio(): void { /* only browsers gate audio behind a tap */ }
export function audioStatus(): AudioStatus { return 'ready'; }
export async function playAlertSound(_kind: TimerEventKind | 'test', _prefs: AlertPrefs): Promise<void> { /* OS notification plays it */ }
export function stopAlertSound(): void { Vibration.cancel(); }
export function vibrateAlert(prefs: AlertPrefs): void {
  if (!prefs.vibrate) return;
  try { Vibration.vibrate(Platform.OS === 'android' ? [0, 250, 120, 250, 120, 500] : 400); } catch { /* no vibrator */ }
}
/** One-time claim for an event so a sound/vibration/notification fires once. Single process on native, so always true. */
export async function claimEvent(_id: string, _channel: 'sound' | 'vibrate' | 'system'): Promise<boolean> { return true; }
/** Whether the app is in front of the user right now (web: tab visible and focused). */
export function isAppVisible(): boolean { return true; }
export function setAttention(_text: string | null): void { /* browser tab title only */ }
export function setTabTitle(_text: string | null): void { /* browser tab title only */ }
export function setKeepAwake(_on: boolean): void { /* needs expo-keep-awake; not a dependency */ }
export type Seen = { has(id: string): boolean; add(id: string): void };

const SHOWN_KEY = 'rhythm.alertShown';
const shown = new Set<string>();
/** Load the remembered ids before the first check (native keeps them across launches so a cold start does not replay old alerts). */
export async function loadShown(): Promise<void> {
  try { const raw = await AsyncStorage.getItem(SHOWN_KEY); if (raw) for (const id of JSON.parse(raw) as string[]) shown.add(id); } catch { /* start empty */ }
}
/** Memory of boundaries already shown on screen, so a restart or reload never replays them. */
export function shownEvents(): Seen {
  return {
    has: (id) => shown.has(id),
    add: (id) => {
      shown.add(id);
      const recent = [...shown].slice(-60);
      void AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(recent)).catch(() => undefined);
    },
  };
}
