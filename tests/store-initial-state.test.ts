import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/state/store';

test('store exposes a complete data shape before asynchronous boot finishes', () => {
  const state = store.get();
  assert.equal(state.ready, false);
  assert.ok(state.data);
  assert.deepEqual(state.data.templates, []);
  assert.deepEqual(state.data.exceptions, []);
  assert.deepEqual(state.data.subjects, []);
  assert.ok(state.data.prefs);
  assert.ok(state.data.notif);
});


test('store preserves its last valid data when an invalid undefined data patch arrives', () => {
  const before = store.get().data;
  store.set({ data: undefined } as never);
  assert.equal(store.get().data, before);
  assert.deepEqual(store.get().data.templates, []);
});

test('store repairs missing collections in a partial data update', () => {
  const before = store.get().data;
  store.set({ data: { ...before, templates: undefined } as never });
  assert.ok(Array.isArray(store.get().data.templates));
  assert.ok(store.get().data.prefs);
  assert.ok(store.get().data.notif);
});
