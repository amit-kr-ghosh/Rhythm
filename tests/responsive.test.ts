import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, responsiveMetrics } from '../src/theme/tokens';

test('responsive layout: phone widths use compact spacing and one column', () => {
  for (const width of [320, 360, 375, 390, 430]) {
    const m = responsiveMetrics(width);
    assert.equal(m.compact, true);
    assert.equal(m.desktop, false);
    assert.equal(m.columns, 1);
    assert.ok(m.contentWidth > 0 && m.contentWidth <= width);
  }
});

test('responsive layout: tablet widths use two columns and remain within viewport', () => {
  for (const width of [680, 720, 768, 820, 900]) {
    const m = responsiveMetrics(width);
    assert.equal(m.tablet, true);
    assert.equal(m.desktop, false);
    assert.equal(m.columns, 2);
    assert.ok(m.contentWidth + 2 * m.horizontalPadding <= width);
  }
});

test('responsive layout: desktop widths enable sidebar and cap content width', () => {
  for (const width of [960, 1024, 1280, 1440, 1920]) {
    const m = responsiveMetrics(width);
    assert.equal(m.desktop, true);
    assert.ok(m.contentWidth <= layout.contentMaxWidth);
    assert.ok(m.contentWidth + 2 * m.horizontalPadding <= width);
  }
  assert.equal(responsiveMetrics(1440).columns, 3);
});

test('responsive layout: invalid/small widths never produce negative content widths', () => {
  for (const width of [0, 1, 240, 319]) assert.ok(responsiveMetrics(width).contentWidth > 0);
});
