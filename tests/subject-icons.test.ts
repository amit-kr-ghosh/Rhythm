import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBJECT_ICONS, defaultSubjectIcon, isSubjectIcon, subjectIcon, FALLBACK_SUBJECT_ICON } from '../src/domain/subjectIcons';
import { validateSubject } from '../src/domain/validation';

test('shipped subjects get their own default icon, unknown names fall back', () => {
  assert.equal(defaultSubjectIcon('DSA'), 'git-network-outline');
  assert.equal(defaultSubjectIcon(' ai/ml '), 'hardware-chip-outline');
  assert.equal(defaultSubjectIcon('RBI Preparation'), 'business-outline');
  assert.equal(defaultSubjectIcon('Communication'), 'chatbubbles-outline');
  assert.equal(defaultSubjectIcon('Chess'), FALLBACK_SUBJECT_ICON);
});

test('subjectIcon prefers a valid stored icon and ignores junk', () => {
  assert.equal(subjectIcon({ name: 'DSA', icon: 'rocket-outline' }), 'rocket-outline');
  assert.equal(subjectIcon({ name: 'DSA', icon: null }), 'git-network-outline');
  assert.equal(subjectIcon({ name: 'DSA' }), 'git-network-outline');
  assert.equal(subjectIcon({ name: 'DSA', icon: 'not-an-icon' }), 'git-network-outline');
});

test('every offered icon is unique and recognised', () => {
  assert.equal(new Set(SUBJECT_ICONS).size, SUBJECT_ICONS.length);
  assert.ok(SUBJECT_ICONS.every(isSubjectIcon));
});

test('validateSubject accepts null/known icons and rejects unknown ones', () => {
  const base = { name: 'Graphs', dailyTargetMin: 60, weeklyTargetMin: 420 };
  assert.equal(validateSubject({ ...base }, []).ok, true);
  assert.equal(validateSubject({ ...base, icon: null }, []).ok, true);
  assert.equal(validateSubject({ ...base, icon: 'code-slash-outline' }, []).ok, true);
  const bad = validateSubject({ ...base, icon: 'drop table' }, []);
  assert.equal(bad.ok, false);
});
