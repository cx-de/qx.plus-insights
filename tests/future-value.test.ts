import { describe, it, expect, afterEach, vi } from 'vitest';
import { calculateFutureTotalValue, isMarketClosed, apiKey, apiAuthFailed } from '@/utils/helper';

const eur = { currency: 'EUR', underlying_currency: 'EUR', ratio: '1' };

describe('calculateFutureTotalValue', () => {
  describe('discountCall', () => {
    const item = { ...eur, type: 'discountCall', strike: '100', cap: '120', ratio: '0.1', stocks_owned: '10' };

    it('pays underlying minus strike between strike and cap', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '110' })).toBeCloseTo(10);
    });

    it('caps the payoff at cap minus strike', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '150' })).toBeCloseTo(20);
    });

    it('pays nothing below strike', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '90' })).toBe(0);
    });
  });

  describe('discountPut', () => {
    const item = { ...eur, type: 'discountPut', strike: '100', cap: '80', ratio: '0.1', stocks_owned: '10' };

    it('pays strike minus underlying between cap and strike', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '90' })).toBeCloseTo(10);
    });

    it('caps the payoff at strike minus cap', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '50' })).toBeCloseTo(20);
    });

    it('pays nothing above strike', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '110' })).toBe(0);
    });
  });

  describe('discountCertificate', () => {
    const item = { ...eur, type: 'discountCertificate', cap: '50', stocks_owned: '10' };

    it('redeems at the underlying below cap', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '40' })).toBe(400);
    });

    it('redeems at cap above cap', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '60' })).toBe(500);
    });
  });

  describe('options and turbos are floored at 0', () => {
    const base = { ...eur, strike: '100', stocks_owned: '2' };

    it.each([
      ['put', '80', 40],
      ['put', '120', 0],
      ['openEndTurboShort', '80', 40],
      ['openEndTurboShort', '120', 0],
      ['call', '120', 40],
      ['call', '80', 0],
      ['openEndTurboLong', '120', 40],
      ['openEndTurboLong', '80', 0],
    ])('%s at underlying %s gives %d', (type, underlying_price, expected) => {
      expect(calculateFutureTotalValue({ ...base, type, underlying_price })).toBe(expected);
    });
  });

  describe('reverseCappedBonusCertificate', () => {
    const item = { ...eur, type: 'reverseCappedBonusCertificate', strike: '100', cap: '80', knockout: '150', bid: '5', stocks_owned: '2' };

    it('pays the max value below the barrier', () => {
      // max_value = (2 * strike - cap) * ratio = 120
      expect(calculateFutureTotalValue({ ...item, underlying_price: '140' })).toBe(240);
    });

    it('falls back to the current value above the barrier', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '160' })).toBe(10);
    });
  });

  describe('cappedBonusCertificate', () => {
    const item = { ...eur, type: 'cappedBonusCertificate', strike: '80', cap: '120', stocks_owned: '2' };

    it('pays the bonus level while the barrier holds', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '100' })).toBe(240);
    });

    it('pays min(underlying, bonus level) once barrier_hit is set', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '100', barrier_hit: true })).toBe(200);
    });

    it('treats an underlying at or below the barrier as broken', () => {
      expect(calculateFutureTotalValue({ ...item, underlying_price: '70' })).toBe(140);
    });
  });

  it('values an index certificate at underlying points times ratio', () => {
    const item = { type: 'indexcertificate', currency: 'EUR', underlying_currency: '', underlying_price: '18000', ratio: '0.01', stocks_owned: '3' };
    expect(calculateFutureTotalValue(item)).toBeCloseTo(540);
  });

  it('falls back to bid times quantity for a plain stock', () => {
    expect(calculateFutureTotalValue({ ...eur, type: 'stock', bid: '50', stocks_owned: '4' })).toBe(200);
  });

  it('returns total_entry_value for Cash', () => {
    expect(calculateFutureTotalValue({ stock_name: 'Cash', total_entry_value: '1234.5' })).toBe(1234.5);
  });

  it('scales the underlying by the expectation multiplier', () => {
    const item = { ...eur, type: 'call', strike: '100', underlying_price: '100', stocks_owned: '1' };
    expect(calculateFutureTotalValue(item, 1.2)).toBeCloseTo(20);
  });

  describe('currency', () => {
    const call = { type: 'call', strike: '100', ratio: '1', stocks_owned: '1', currency_rate: '1.1' };

    it('converts a non-EUR product back to EUR', () => {
      expect(calculateFutureTotalValue({ ...call, currency: 'USD', underlying_currency: 'USD', underlying_price: '122' })).toBeCloseTo(20);
    });

    it('leaves a quanto product unconverted', () => {
      expect(calculateFutureTotalValue({ ...call, currency: 'USD', underlying_currency: 'USD', underlying_price: '122', quanto: true })).toBeCloseTo(22);
    });

    it('converts a EUR quote into product currency before comparing with strike', () => {
      // 100 EUR * 1.1 = 110 USD, payoff 10 USD, back to EUR = 10 / 1.1
      expect(calculateFutureTotalValue({ ...call, currency: 'USD', underlying_currency: 'EUR', underlying_price: '100' })).toBeCloseTo(10 / 1.1);
    });
  });

  it('clamps a negative result to 0', () => {
    expect(calculateFutureTotalValue({ ...eur, type: 'stock', strike: '-5', stocks_owned: '2' })).toBe(0);
  });

  it('turns a non-finite result into 0', () => {
    expect(calculateFutureTotalValue({ ...eur, type: 'put', strike: 'Infinity', underlying_price: '10', stocks_owned: '1' })).toBe(0);
  });
});

describe('isMarketClosed', () => {
  afterEach(() => {
    vi.useRealTimers();
    apiKey.value = '';
    apiAuthFailed.value = false;
  });

  const at = (date: Date) => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  };

  it('is closed without an API key', () => {
    at(new Date(2026, 8, 28, 12));
    apiKey.value = '';
    expect(isMarketClosed()).toBe(true);
  });

  it('is closed while the key is latched as rejected', () => {
    at(new Date(2026, 8, 28, 12));
    apiKey.value = 'key';
    apiAuthFailed.value = true;
    expect(isMarketClosed()).toBe(true);
  });

  it('is closed on Saturday and Sunday', () => {
    apiKey.value = 'key';
    at(new Date(2026, 8, 26, 12));
    expect(isMarketClosed()).toBe(true);
    vi.setSystemTime(new Date(2026, 8, 27, 12));
    expect(isMarketClosed()).toBe(true);
  });

  it('is open on a weekday with a valid key', () => {
    apiKey.value = 'key';
    at(new Date(2026, 8, 28, 12));
    expect(isMarketClosed()).toBe(false);
  });
});
