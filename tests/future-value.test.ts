import { describe, it, expect, afterEach, vi } from 'vitest';
import { calculateFutureTotalValue, isFeedBlocked, daysUntilMarketOpen, marketOpenDayName, fetchedThisClosedPeriod, apiKey, apiAuthFailed } from '@/utils/helper';

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

describe('isFeedBlocked', () => {
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
    at(new Date(Date.UTC(2026, 8, 28, 10)));
    apiKey.value = '';
    expect(isFeedBlocked()).toBe(true);
  });

  it('is closed while the key is latched as rejected', () => {
    at(new Date(Date.UTC(2026, 8, 28, 10)));
    apiKey.value = 'key';
    apiAuthFailed.value = true;
    expect(isFeedBlocked()).toBe(true);
  });

  it('is open on a weekday with a valid key', () => {
    apiKey.value = 'key';
    at(new Date(Date.UTC(2026, 8, 28, 10)));
    expect(isFeedBlocked()).toBe(false);
  });

  it('stays open at night and on weekends', () => {
    apiKey.value = 'key';
    // Saturday and Sunday
    at(new Date(Date.UTC(2026, 8, 26, 10)));
    expect(isFeedBlocked()).toBe(false);
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 27, 10)));
    expect(isFeedBlocked()).toBe(false);
    // 23:00 and 03:00 Berlin (CEST) on a weekday
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 28, 21, 0)));
    expect(isFeedBlocked()).toBe(false);
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 29, 1, 0)));
    expect(isFeedBlocked()).toBe(false);
  });
});

describe('daysUntilMarketOpen', () => {
  const berlin = (iso: string) => new Date(iso);

  it('is -1 during 08:00-22:00 Berlin on a weekday', () => {
    // CEST (UTC+2)
    expect(daysUntilMarketOpen(berlin('2026-09-28T06:00:00Z'))).toBe(-1);
    expect(daysUntilMarketOpen(berlin('2026-09-28T19:59:00Z'))).toBe(-1);
    // CET (UTC+1)
    expect(daysUntilMarketOpen(berlin('2026-11-02T07:00:00Z'))).toBe(-1);
  });

  it('counts days to the next open outside trading hours', () => {
    // Monday 07:59 Berlin: opens later today
    expect(daysUntilMarketOpen(berlin('2026-09-28T05:59:00Z'))).toBe(0);
    // Monday 22:00 Berlin: tomorrow
    expect(daysUntilMarketOpen(berlin('2026-09-28T20:00:00Z'))).toBe(1);
    // Friday 23:00, Saturday, Sunday Berlin: Monday
    expect(daysUntilMarketOpen(berlin('2026-09-25T21:00:00Z'))).toBe(3);
    expect(daysUntilMarketOpen(berlin('2026-09-26T10:00:00Z'))).toBe(2);
    expect(daysUntilMarketOpen(berlin('2026-09-27T21:30:00Z'))).toBe(1);
  });
});

describe('marketOpenDayName', () => {
  it('names today, tomorrow and Monday', () => {
    expect(marketOpenDayName(0, 'en')).toBe('today');
    expect(marketOpenDayName(1, 'de')).toBe('morgen');
    expect(marketOpenDayName(2, 'en')).toBe('Monday');
    expect(marketOpenDayName(3, 'de')).toBe('Montag');
  });
});

describe('fetchedThisClosedPeriod', () => {
  const at = (iso: string) => new Date(iso);

  it('never holds a fetch back while the market is open', () => {
    // Monday 10:00 and 10:05 Berlin (CEST)
    expect(fetchedThisClosedPeriod('2026-09-28T08:00:00Z', at('2026-09-28T08:05:00Z'))).toBe(false);
  });

  it('fetches once after close, then holds until the next open', () => {
    // Last fetch Friday 21:59 Berlin, before close: refetch at 22:30
    expect(fetchedThisClosedPeriod('2026-09-25T19:59:00Z', at('2026-09-25T20:30:00Z'))).toBe(false);
    // Fetched Friday 22:30: Saturday and Sunday reuse it
    expect(fetchedThisClosedPeriod('2026-09-25T20:30:00Z', at('2026-09-26T10:00:00Z'))).toBe(true);
    expect(fetchedThisClosedPeriod('2026-09-25T20:30:00Z', at('2026-09-28T05:59:00Z'))).toBe(true);
    // Monday 08:00: open again
    expect(fetchedThisClosedPeriod('2026-09-25T20:30:00Z', at('2026-09-28T06:00:00Z'))).toBe(false);
  });

  it('refetches when the user returns after days away', () => {
    // Fetched last Saturday, back next Saturday: different closed period
    expect(fetchedThisClosedPeriod('2026-09-19T10:00:00Z', at('2026-09-26T10:00:00Z'))).toBe(false);
    expect(fetchedThisClosedPeriod(undefined, at('2026-09-26T10:00:00Z'))).toBe(false);
  });

  it('separates weekday nights', () => {
    // Monday 23:00 and Tuesday 06:00 share a period; Tuesday 23:00 is the next one
    expect(fetchedThisClosedPeriod('2026-09-28T21:00:00Z', at('2026-09-29T04:00:00Z'))).toBe(true);
    expect(fetchedThisClosedPeriod('2026-09-28T21:00:00Z', at('2026-09-29T21:00:00Z'))).toBe(false);
  });

  it('keeps one period across the October clock change', () => {
    // Friday 23:30 CEST to Sunday 23:30 CET
    expect(fetchedThisClosedPeriod('2026-10-23T21:30:00Z', at('2026-10-25T22:30:00Z'))).toBe(true);
  });
});
