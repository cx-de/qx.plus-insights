import { describe, it, expect } from 'vitest';
import {
  isCashRow,
  germanToNumer,
  numberToGerman,
  parseGermanDateOnly,
  chunkArray,
  getComparableUnderlyingPrice,
  formatMonthYear,
  formatDateToYMD,
} from '@/utils/helper';

describe('isCashRow', () => {
  it('matches every cash spelling the scrapers have emitted', () => {
    expect(isCashRow({ stock_name: 'Cash' })).toBe(true);
    expect(isCashRow({ stock_name: 'cash' })).toBe(true);
    expect(isCashRow({ stock_name: 'Cash ' })).toBe(true);
  });

  it('rejects non-cash rows and bad input', () => {
    expect(isCashRow(null)).toBe(false);
    expect(isCashRow({ stock_name: 42 })).toBe(false);
    expect(isCashRow({ stock_name: 'Cashflow' })).toBe(false);
  });
});

describe('germanToNumer', () => {
  it('parses German thousands and decimal separators', () => {
    expect(germanToNumer('1.234,56')).toBe(1234.56);
    expect(germanToNumer('0,5')).toBe(0.5);
  });
});

describe('numberToGerman', () => {
  it('formats with German separators', () => {
    expect(numberToGerman(1234.5)).toBe('1.234,50');
    expect(numberToGerman(-1234.5)).toBe('-1.234,50');
  });

  it('bumps to 4 decimals below 5 only when decimalPoints is omitted', () => {
    expect(numberToGerman(3)).toBe('3,0000');
    // Percent call sites pass 2 explicitly to opt out of the bump.
    expect(numberToGerman(3, false, 2)).toBe('3,00');
  });

  it('formats integers without a decimal part', () => {
    expect(numberToGerman(1234567, true)).toBe('1.234.567');
  });

  it('returns an empty string for missing values', () => {
    expect(numberToGerman(null)).toBe('');
    expect(numberToGerman(undefined)).toBe('');
    expect(numberToGerman(NaN)).toBe('');
  });
});

describe('parseGermanDateOnly', () => {
  it('parses DD.MM.YYYY to local midnight without a Z suffix', () => {
    expect(parseGermanDateOnly('03.05.2021')).toBe('2021-05-03T00:00:00');
  });

  it('pivots two-digit years at 50', () => {
    expect(parseGermanDateOnly('01.01.49')).toBe('2049-01-01T00:00:00');
    expect(parseGermanDateOnly('01.01.50')).toBe('1950-01-01T00:00:00');
  });

  it('accepts &nbsp;-padded webcore cells', () => {
    expect(parseGermanDateOnly(' 03.05.2021 ')).toBe('2021-05-03T00:00:00');
  });

  it('rejects impossible and empty dates', () => {
    expect(parseGermanDateOnly('30.02.2021')).toBeNull();
    expect(parseGermanDateOnly('-')).toBeNull();
    expect(parseGermanDateOnly('')).toBeNull();
    expect(parseGermanDateOnly(null)).toBeNull();
  });
});

describe('chunkArray', () => {
  it('splits into chunks of the given size', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    expect(chunkArray(items, 20).map(c => c.length)).toEqual([20, 20, 5]);
  });

  it('returns no chunks for an empty array', () => {
    expect(chunkArray([], 20)).toEqual([]);
  });
});

describe('getComparableUnderlyingPrice', () => {
  it('leaves the price unchanged when currencies match', () => {
    expect(getComparableUnderlyingPrice({ underlying_price: '100', underlying_currency: 'EUR', currency: 'EUR', currency_rate: '1.1' })).toBe(100);
  });

  it('converts a EUR quote into the product currency', () => {
    expect(getComparableUnderlyingPrice({ underlying_price: '100', underlying_currency: 'EUR', currency: 'USD', currency_rate: '1.1' })).toBeCloseTo(110);
  });

  it('leaves index points unchanged', () => {
    expect(getComparableUnderlyingPrice({ underlying_price: '18000', underlying_currency: '', currency: 'USD', currency_rate: '1.1' })).toBe(18000);
  });

  it('prefers an explicit price over the item price', () => {
    expect(getComparableUnderlyingPrice({ underlying_price: '100', underlying_currency: 'EUR', currency: 'USD', currency_rate: '2' }, 50)).toBe(100);
  });
});

describe('formatMonthYear', () => {
  it('formats as MM/YYYY', () => {
    expect(formatMonthYear(new Date(2026, 5, 15))).toBe('06/2026');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatMonthYear(null)).toBe('');
    expect(formatMonthYear('not a date')).toBe('');
  });
});

describe('formatDateToYMD', () => {
  it('zero-pads month and day', () => {
    expect(formatDateToYMD({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
  });

  it('returns an empty string for missing input', () => {
    expect(formatDateToYMD(null)).toBe('');
  });
});
