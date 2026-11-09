import { describe, it, expect } from 'vitest';
import {
  isCashRow,
  germanToNumer,
  numberToGerman,
  unitPriceToGerman,
  productTypeFromLabel,
  isDerivativeType,
  parseGermanDateOnly,
  chunkArray,
  getComparableUnderlyingPrice,
  formatMonthYear,
  formatDateToYMD,
  currencyRateText,
  themeStored,
} from '@/utils/helper';

describe('currencyRateText', () => {
  it('hides a rate that prints as 1,00', () => {
    expect(currencyRateText(1)).toBe('');
    expect(currencyRateText('0.99999')).toBe('');
  });

  it('shows a real FX rate', () => {
    expect(currencyRateText('1.1234')).toBe('1,12');
  });

  it('stays blank without a rate', () => {
    expect(currencyRateText(null)).toBe('');
  });
});

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

  it('defaults to 2 decimals, even below 5', () => {
    expect(numberToGerman(3)).toBe('3,00');
    expect(numberToGerman(0.4321)).toBe('0,43');
    expect(numberToGerman(0.4321, false, 4)).toBe('0,4321');
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

describe('unitPriceToGerman', () => {
  it('uses 4 decimals for derivative prices below 5', () => {
    expect(unitPriceToGerman(0.4321, 'certificate')).toBe('0,4321');
    expect(unitPriceToGerman(12.5, 'certificate')).toBe('12,50');
  });

  it('uses 2 decimals for stocks, ETFs and unknown types', () => {
    expect(unitPriceToGerman(3, 'stock')).toBe('3,00');
    expect(unitPriceToGerman(4.5, 'exchangeTradedFund')).toBe('4,50');
    expect(unitPriceToGerman(3, undefined)).toBe('3,00');
  });

  it('returns an empty string for missing values', () => {
    expect(unitPriceToGerman(null, 'certificate')).toBe('');
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

describe('themeStored', () => {
  it('follows the OS when no theme is stored', () => {
    localStorage.removeItem('theme');
    expect(themeStored()).toBe('system');
  });

  it('returns a stored light or dark choice', () => {
    localStorage.setItem('theme', 'dark');
    expect(themeStored()).toBe('dark');
    localStorage.setItem('theme', 'light');
    expect(themeStored()).toBe('light');
  });

  it('treats an unknown stored value as system', () => {
    localStorage.setItem('theme', 'blue');
    expect(themeStored()).toBe('system');
    localStorage.removeItem('theme');
  });
});

describe('productTypeFromLabel', () => {
  it('maps share labels from every broker to stock', () => {
    for (const label of ['Aktie', 'Aktien', 'Aktien (12)', 'STOCK', 'Stocks', 'Shares', 'Equities']) {
      expect(productTypeFromLabel(label)).toBe('stock');
    }
  });

  it('maps exchange-traded products to exchangeTradedFund', () => {
    for (const label of ['ETF', 'ETFs', 'ETC', 'ETN', 'ETP', 'Exchange Traded Funds', 'Aktien-ETF', 'Aktien ETF']) {
      expect(productTypeFromLabel(label)).toBe('exchangeTradedFund');
    }
  });

  it('maps funds to fund, including equity funds', () => {
    for (const label of ['Fonds', 'Investmentfonds', 'Aktienfonds', 'Aktien-Fonds', 'Rentenfonds', 'FUND', 'Funds']) {
      expect(productTypeFromLabel(label)).toBe('fund');
    }
  });

  it('maps bonds to bond', () => {
    for (const label of ['Anleihe', 'Anleihen', 'BOND', 'Bonds', 'Renten', 'Schuldverschreibung']) {
      expect(productTypeFromLabel(label)).toBe('bond');
    }
  });

  it('keeps derivatives out of the share, fund and bond buckets', () => {
    expect(productTypeFromLabel('Zertifikat')).toBe('certificate');
    expect(productTypeFromLabel('Aktienanleihe')).toBe('certificate');
    expect(productTypeFromLabel('Strukturierte Produkte')).toBe('certificate');
  });

  it('returns the fallback for unknown labels and empty for none', () => {
    expect(productTypeFromLabel('Optionsschein', 'Optionsschein')).toBe('Optionsschein');
    expect(productTypeFromLabel('KNOCK_OUT')).toBe('certificate');
    expect(productTypeFromLabel('')).toBe('');
    expect(productTypeFromLabel(null)).toBe('');
  });
});

describe('isDerivativeType', () => {
  it('is false for shares, ETFs, funds, bonds and missing types', () => {
    for (const type of ['stock', 'exchangeTradedFund', 'fund', 'bond', '', undefined]) {
      expect(isDerivativeType(type)).toBe(false);
    }
  });

  it('is true for certificates and feed derivative types', () => {
    for (const type of ['certificate', 'discountCertificate', 'put', 'Optionsschein']) {
      expect(isDerivativeType(type)).toBe(true);
    }
  });
});
