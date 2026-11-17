import type { NotificationSettings, Preferences } from './types';

/**
 * Settings that belong to one device, not to the account. A phone and a laptop differ in screen, notification support and
 * what the user wants from each, so changing one must never change the other. They live in on-device storage and are laid
 * over the synced preferences when loading; the cloud copy of these fields is never read back.
 *
 * Everything else in Preferences (targets, weights, streak rule, whys, history) is account data and keeps syncing.
 */
export const DEVICE_PREF_KEYS = ['theme', 'weekStart', 'timer', 'motivation'] as const;
export type DevicePrefKey = (typeof DEVICE_PREF_KEYS)[number];
export type DevicePrefs = Pick<Preferences, DevicePrefKey>;

export const pickDevicePrefs = (p: Preferences): DevicePrefs => ({ theme: p.theme, weekStart: p.weekStart, timer: p.timer, motivation: p.motivation });

/** Layer this device's own values over preferences that came from storage or the cloud. */
export const applyDevicePrefs = (p: Preferences, d: Partial<DevicePrefs> | null | undefined): Preferences => (d ? { ...p, ...d } : p);

/** Split an update into the part that stays on this device and the part that is saved and synced (`shared` is null when empty). */
export function splitPrefsPatch(patch: Partial<Omit<Preferences, 'id' | 'updatedAt' | 'deletedAt'>>): { device: Partial<DevicePrefs>; shared: Record<string, unknown> | null } {
  const device: Record<string, unknown> = {}, shared: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) ((DEVICE_PREF_KEYS as readonly string[]).includes(k) ? device : shared)[k] = v;
  return { device: device as Partial<DevicePrefs>, shared: Object.keys(shared).length ? shared : null };
}

/** Notification settings are entirely per-device: a phone's permission and quiet hours say nothing about the browser. */
export const applyDeviceNotif = (n: NotificationSettings, d: NotificationSettings | null | undefined): NotificationSettings => d ?? n;
