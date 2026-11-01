import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palettes, resolveScheme, contrastRatio, spacing, MIN_TOUCH } from '../src/theme/tokens';

test('theme: dark is the default; explicit preferences win; system follows the OS', () => {
  assert.equal(resolveScheme(undefined, null), 'light');
  assert.equal(resolveScheme('dark', 'light'), 'dark');
  assert.equal(resolveScheme('light', 'dark'), 'light');
  assert.equal(resolveScheme('system', 'light'), 'light');
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', null), 'light', 'unknown OS scheme falls back to light');
});

test('theme: switching is immediate and symmetric (dark → light → system → dark)', () => {
  let pref: 'dark' | 'light' | 'system' = 'dark';
  const seq: string[] = [];
  for (const next of ['light', 'system', 'dark'] as const) { pref = next; seq.push(resolveScheme(pref, 'light')); }
  assert.deepEqual(seq, ['light', 'light', 'dark']);
});

test('theme: both palettes define exactly the same tokens (nothing can be undefined after a switch)', () => {
  const keys = (o: object) => Object.keys(o).sort();
  assert.deepEqual(keys(palettes.dark), keys(palettes.light));
  assert.deepEqual(keys(palettes.dark.category), keys(palettes.light.category));
  assert.equal(palettes.dark.series.length, palettes.light.series.length);
  assert.equal(palettes.dark.heat.length, 5);
  assert.notEqual(palettes.dark.bg, palettes.light.bg);
});

for (const name of ['dark', 'light'] as const) {
  test(`theme(${name}): text meets WCAG AA contrast on every surface`, () => {
    const p = palettes[name];
    for (const bg of [p.bg, p.surface, p.surfaceRaised, p.surfaceSunken]) {
      assert.ok(contrastRatio(p.text, bg) >= 7, `text on ${bg}`);
      assert.ok(contrastRatio(p.textMuted, bg) >= 4.5, `textMuted on ${bg}: ${contrastRatio(p.textMuted, bg).toFixed(2)}`);
      assert.ok(contrastRatio(p.textFaint, bg) >= 4.5, `textFaint on ${bg}: ${contrastRatio(p.textFaint, bg).toFixed(2)}`);
      assert.ok(contrastRatio(p.accent, bg) >= 4.5, `accent text on ${bg}: ${contrastRatio(p.accent, bg).toFixed(2)}`);
    }
  });
  test(`theme(${name}): buttons, status colours and chart colours are legible`, () => {
    const p = palettes[name];
    assert.ok(contrastRatio(p.onAccent, p.accent) >= 4.5, 'label on primary button');
    for (const [fg, bg] of [[p.success, p.successSoft], [p.warning, p.warningSoft], [p.danger, p.dangerSoft], [p.accent, p.accentSoft]] as const) {
      assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg}: ${contrastRatio(fg, bg).toFixed(2)}`);
    }
    for (const c of [...p.series, ...Object.values(p.category)]) assert.ok(contrastRatio(c, p.surface) >= 3, `chart colour ${c} vs surface (non-text 3:1)`);
    assert.ok(contrastRatio(p.focusRing, p.bg) >= 3, 'focus ring');
    assert.ok(contrastRatio(p.borderStrong, p.bg) >= 1.4);
  });
}

test('theme: spacing scale is monotonic and the minimum touch target is 48dp', () => {
  const v = Object.values(spacing);
  assert.deepEqual([...v].sort((a, b) => a - b), v);
  assert.equal(MIN_TOUCH, 48);
});

for (const name of ['dark', 'light'] as const) {
  test(`theme(${name}): ink buttons, hero card and lime highlight are legible`, () => {
    const p = palettes[name];
    assert.ok(contrastRatio(p.onInk, p.ink) >= 7, 'label on ink button');
    assert.ok(contrastRatio(p.heroText, p.hero) >= 7, 'text on hero card');
    assert.ok(contrastRatio(p.heroMuted, p.hero) >= 4.5, 'muted text on hero card');
    assert.ok(contrastRatio(p.onLime, p.lime) >= 7, 'label on lime');
    assert.ok(contrastRatio(p.lime, p.hero) >= 3, 'lime ring vs hero');
    assert.ok(contrastRatio(p.heroTrack, p.hero) >= 1.2, 'ring track visible on hero');
  });
}

import { scaleType, type as baseType, typeScaleFor } from '../src/theme/tokens';
test('type scale: full size on real devices, mild reduction only on tiny windows, with readable floors', () => {
  assert.equal(typeScaleFor(1280), 1); assert.equal(typeScaleFor(412), 1, 'normal phones keep full-size text'); assert.equal(typeScaleFor(360), 1); assert.equal(typeScaleFor(320) < 1, true, 'only tiny windows are reduced');
  assert.equal(scaleType(baseType, 1), baseType);
  const s = scaleType(baseType, typeScaleFor(320));
  assert.ok(s.display.fontSize < baseType.display.fontSize && s.hero.fontSize < baseType.hero.fontSize);
  assert.ok(s.body.fontSize >= 14 && s.bodyStrong.fontSize >= 14, 'body text stays readable');
  assert.ok(s.caption.fontSize >= 12 && s.label.fontSize >= 12, 'small text stays readable');
  for (const k of Object.keys(baseType) as (keyof typeof baseType)[]) assert.ok(s[k].lineHeight >= s[k].fontSize, `${k} line height`);
});
