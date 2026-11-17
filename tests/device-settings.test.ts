import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDeviceNotif, applyDevicePrefs, pickDevicePrefs, splitPrefsPatch } from '../src/domain/deviceSettings';
import { buildDefaultNotificationSettings, buildDefaultPreferences } from '../src/domain/defaults';

const now = '2026-01-01T00:00:00.000Z';

test('splitPrefsPatch: appearance/timer/reminders stay on the device, targets still sync', () => {
  const a = splitPrefsPatch({ theme: 'dark' });
  assert.deepEqual(a.device, { theme: 'dark' }); assert.equal(a.shared, null);
  const b = splitPrefsPatch({ weekStart: 1, dailyStudyTargetMin: 300 });
  assert.deepEqual(b.device, { weekStart: 1 }); assert.deepEqual(b.shared, { dailyStudyTargetMin: 300 });
  assert.equal(splitPrefsPatch({ timer: buildDefaultPreferences(now).timer }).shared, null);
  assert.equal(splitPrefsPatch({ whys: ['x'] }).device && Object.keys(splitPrefsPatch({ whys: ['x'] }).device).length, 0);
});

test('a preference pulled from another device keeps this device\'s own theme, week start, timer and reminders', () => {
  const mine = { ...buildDefaultPreferences(now), theme: 'light' as const, weekStart: 1 as const };
  const remote = { ...buildDefaultPreferences(now), theme: 'dark' as const, weekStart: 0 as const, dailyStudyTargetMin: 400 };
  const merged = applyDevicePrefs(remote, pickDevicePrefs(mine));
  assert.equal(merged.theme, 'light'); assert.equal(merged.weekStart, 1);
  assert.equal(merged.dailyStudyTargetMin, 400, 'shared account data still comes through');
});

test('notification settings are taken from this device only', () => {
  const local = { ...buildDefaultNotificationSettings(now), enabled: false };
  const remote = { ...buildDefaultNotificationSettings(now), enabled: true };
  assert.equal(applyDeviceNotif(remote, local).enabled, false);
  assert.equal(applyDeviceNotif(remote, null).enabled, true, 'nothing stored yet: adopt what the device already had');
});
