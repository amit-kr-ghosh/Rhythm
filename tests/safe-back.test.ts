import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeBack } from '../src/navigation/safeBack';

test('safeBack uses browser/device history when a previous route exists', () => {
  const calls: string[] = [];
  safeBack({ canGoBack: () => true, back: () => calls.push('back'), replace: (href) => calls.push(`replace:${href}`) });
  assert.deepEqual(calls, ['back']);
});

test('safeBack replaces with the fallback when a route is opened directly', () => {
  const calls: string[] = [];
  safeBack({ canGoBack: () => false, back: () => calls.push('back'), replace: (href) => calls.push(`replace:${href}`) });
  assert.deepEqual(calls, ['replace:/']);
});
