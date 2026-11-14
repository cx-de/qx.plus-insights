import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import {
  columnLabelsNormalize, columnLabelOf, columnExportNames, columnLabelsGet, columnLabelSave, columnLabelsWatch,
} from '@/utils/column-label-utils';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('columnLabelsNormalize', () => {
  it('returns an empty map for anything that is not a plain object', () => {
    for (const raw of [null, undefined, 'x', 42, true, [], ['G/V']]) {
      expect(columnLabelsNormalize(raw)).toEqual({});
    }
  });

  it('drops non-string and blank labels', () => {
    expect(columnLabelsNormalize({ a: 5, b: null, c: {}, d: ['x'], e: '   ', f: '\n\t', g: 'ok' })).toEqual({ g: 'ok' });
  });

  it('drops ids that are not column ids', () => {
    const raw = JSON.parse('{"__proto__": "x", "Bid": "x", "has space": "x", "bid-price": "x", "": "x", "bid": "Geld"}');
    const labels = columnLabelsNormalize(raw);
    expect(labels).toEqual({ bid: 'Geld' });
    expect(Object.getPrototypeOf(labels)).toBe(Object.prototype);
  });

  it('trims, collapses whitespace and caps length', () => {
    const labels = columnLabelsNormalize({ a: '  G/V  ', b: 'G\n/V\t', c: 'x'.repeat(60), d: `${'y'.repeat(39)}  z` });
    expect(labels.a).toBe('G/V');
    expect(labels.b).toBe('G /V');
    expect(labels.c).toHaveLength(40);
    expect(labels.d).toBe('y'.repeat(39));
  });

  it('keeps umlauts, symbols, emoji and markup as plain text', () => {
    expect(columnLabelsNormalize({ a: 'Ø Gewinn ü €', b: '📈 G/V', c: '<b>x</b>' })).toEqual({ a: 'Ø Gewinn ü €', b: '📈 G/V', c: '<b>x</b>' });
  });

  it('caps the number of entries', () => {
    const raw = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`col_${i}`, 'x']));
    expect(Object.keys(columnLabelsNormalize(raw))).toHaveLength(100);
  });
});

describe('columnLabelOf', () => {
  it('returns the custom label or the fallback', () => {
    expect(columnLabelOf({ profit_loss_price: 'G/V' }, 'profit_loss_price', 'Gewinn/Verlust')).toBe('G/V');
    expect(columnLabelOf({}, 'bid', 'Geld')).toBe('Geld');
    expect(columnLabelOf(null, 'bid', 'Geld')).toBe('Geld');
  });

  it('ignores inherited keys', () => {
    expect(columnLabelOf({}, 'toString', 'Default')).toBe('Default');
    expect(columnLabelOf({}, 'constructor', 'Default')).toBe('Default');
  });
});

describe('columnExportNames', () => {
  const ids = ['stock_name', 'wkn', 'isin', 'profit_loss_price', 'profit_loss_percentage'];

  it('keeps raw ids when nothing is renamed', () => {
    expect(columnExportNames(ids, {})).toEqual(ids);
  });

  it('uses custom names', () => {
    expect(columnExportNames(ids, { profit_loss_price: 'G/V' })).toEqual(['stock_name', 'wkn', 'isin', 'G/V', 'profit_loss_percentage']);
  });

  it('makes duplicate custom names unique', () => {
    const names = columnExportNames(ids, { profit_loss_price: 'G/V', profit_loss_percentage: 'G/V' });
    expect(names.slice(3)).toEqual(['G/V (profit_loss_price)', 'G/V (profit_loss_percentage)']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('suffixes a custom name equal to another raw id, not the raw id', () => {
    const names = columnExportNames(ids, { wkn: 'isin' });
    expect(names).toEqual(['stock_name', 'isin (wkn)', 'isin', 'profit_loss_price', 'profit_loss_percentage']);
  });

  it('handles names that match Object.prototype keys', () => {
    expect(columnExportNames(['a', 'b'], { a: 'constructor', b: 'toString' })).toEqual(['constructor', 'toString']);
  });
});

describe('column label storage', () => {
  it('saves and reads back a label', async () => {
    await columnLabelSave('profit_loss_price', ' G/V ', 'Gewinn/Verlust');
    expect(await columnLabelsGet()).toEqual({ profit_loss_price: 'G/V' });
  });

  it('keeps other labels when saving one', async () => {
    await columnLabelSave('profit_loss_price', 'G/V');
    await columnLabelSave('bid', 'Geld');
    expect(await columnLabelsGet()).toEqual({ profit_loss_price: 'G/V', bid: 'Geld' });
  });

  it('removes the label on empty, blank or default text', async () => {
    await columnLabelSave('a', 'x');
    await columnLabelSave('b', 'x');
    await columnLabelSave('c', 'x');
    await columnLabelSave('a', '');
    await columnLabelSave('b', '   ');
    await columnLabelSave('c', 'Default', 'Default');
    expect(await columnLabelsGet()).toEqual({});
  });

  it('reads a corrupted stored value as empty', async () => {
    await storage.setItem('local:COLUMN_LABELS', 'broken');
    expect(await columnLabelsGet()).toEqual({});
    await columnLabelSave('bid', 'Geld');
    expect(await columnLabelsGet()).toEqual({ bid: 'Geld' });
  });

  it('notifies watchers with normalized labels', async () => {
    const seen = vi.fn();
    const unwatch = columnLabelsWatch(seen);
    await storage.setItem('local:COLUMN_LABELS', { bid: '  Geld ', __junk: 1 });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith({ bid: 'Geld' }));
    unwatch();
  });
});
