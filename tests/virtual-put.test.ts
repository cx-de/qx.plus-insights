import { describe, it, expect } from 'vitest';
import { BlackScholes } from '@uqee/black-scholes';
import { calculateFutureTotalValue } from '@/utils/helper';
import { virtualPutRow, virtualPutSigma, virtualPutValidate } from '@/utils/virtual-put-utils';

const today = new Date(2026, 9, 12);

const put = {
  underlying_name: 'DAX', underlying_price: 100,
  quantity: 10, strike: 100, price: 5, ratio: 1, maturity: '2027-01-12',
  implied_volatility: 25, iv_manual: false,
};

describe('virtualPutRow', () => {
  it('builds a put row worth the premium today', () => {
    const row = virtualPutRow(put, 'Virtual put DAX');
    expect(row.type).toBe('put');
    expect(row.stocks_owned).toBe(10);
    expect(row.total_value).toBe(50);
    expect(row.valuation_date).toBe('2027-01-12');
    expect(row.currency).toBe(row.underlying_currency);
    expect(row.stock_name).toBe('Virtual put DAX');
  });

  it('pays the intrinsic value after maturity', () => {
    expect(calculateFutureTotalValue(virtualPutRow(put), 0.7)).toBeCloseTo(300);
  });

  it('pays nothing out of the money', () => {
    expect(calculateFutureTotalValue(virtualPutRow(put), 1.1)).toBe(0);
  });
});

describe('virtualPutSigma', () => {
  it('recovers the volatility a price was made with', () => {
    const time = (new Date(2027, 0, 12).getTime() - today.getTime()) / 86400000 / 365;
    const price = new BlackScholes().option({ type: 'put', rate: 0.03, strike: 100, underlying: 100, sigma: 0.25, time }).price;
    expect(virtualPutSigma({ ...put, price }, today)).toBeCloseTo(25, 1);
  });

  it('honours the ratio', () => {
    const time = (new Date(2027, 0, 12).getTime() - today.getTime()) / 86400000 / 365;
    const price = new BlackScholes().option({ type: 'put', rate: 0.03, strike: 100, underlying: 100, sigma: 0.3, time }).price * 0.1;
    expect(virtualPutSigma({ ...put, ratio: 0.1, price }, today)).toBeCloseTo(30, 1);
  });

  // A typed, rounded price: the library bisection only converged on exact model prices.
  it('solves a rounded index-warrant price', () => {
    const index = { ...put, underlying_price: 24000, strike: 22000, ratio: 0.01, maturity: '2027-04-11', price: 4.4 };
    expect(virtualPutSigma(index, today)).toBeCloseTo(20, 0);
  });

  it('returns 0 for a price above the strike', () => {
    expect(virtualPutSigma({ ...put, price: 150 }, today)).toBe(0);
  });

  it('returns 0 for a price below intrinsic value', () => {
    expect(virtualPutSigma({ ...put, underlying_price: 50, price: 1 }, today)).toBe(0);
  });
});

describe('virtualPutValidate', () => {
  it('accepts a complete put', () => {
    expect(virtualPutValidate(put, today)).toBeNull();
  });

  it('rejects a maturity that is not after today', () => {
    expect(virtualPutValidate({ ...put, maturity: '2026-10-12' }, today)).toBe('scenarios.virtual_puts.maturity_past');
  });

  it('rejects zero or missing numbers', () => {
    expect(virtualPutValidate({ ...put, quantity: 0 }, today)).toBe('scenarios.virtual_puts.invalid');
    expect(virtualPutValidate({ ...put, price: undefined }, today)).toBe('scenarios.virtual_puts.invalid');
  });

  it('requires an underlying name', () => {
    expect(virtualPutValidate({ ...put, underlying_name: '  ' }, today)).toBe('scenarios.virtual_puts.invalid');
  });

  it('requires a volatility only when it is typed by hand', () => {
    expect(virtualPutValidate({ ...put, iv_manual: true, implied_volatility: 0 }, today)).toBe('scenarios.virtual_puts.invalid');
  });
});
