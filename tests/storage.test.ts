import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { saveDailyTotal } from '@/utils/helper';
import { accountDetect } from '@/utils/account-utils';
import { calculateLatestMainListData } from '@/utils/price-data-utils';

const NOW = new Date('2026-09-24T12:00:00Z');
const DAY = 86_400_000;

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveDailyTotal', () => {
  const mainList = [
    { broker: 'flatex', account_id: 'A', total_value: 100 },
    { broker: 'flatex', account_id: 'A', total_value: '50' },
    { broker: 'Consorsbank', account_id: 'C', total_value: '25.5' },
    { broker: 'flatex', account_id: 'A', total_value: 'n/a' },
  ];

  it('stores the total and a per-account split, skipping NaN', async () => {
    await storage.setItem('local:MAIN_LIST', mainList);
    await saveDailyTotal();
    expect(await storage.getItem('local:DAILY_TOTAL')).toEqual([
      { date: '2026-09-24', total: 175.5, accounts: { 'flatex::A': 150, 'Consorsbank::C': 25.5 } },
    ]);
  });

  it('updates today in place and keeps earlier days', async () => {
    await storage.setItem('local:MAIN_LIST', mainList);
    await storage.setItem('local:DAILY_TOTAL', [
      { date: '2026-09-23', total: 1 },
      { date: '2026-09-24', total: 2 },
    ]);
    await saveDailyTotal();
    const days: any = await storage.getItem('local:DAILY_TOTAL');
    expect(days.map((d: any) => [d.date, d.total])).toEqual([['2026-09-23', 1], ['2026-09-24', 175.5]]);
  });

  it('writes nothing when the total is 0', async () => {
    await storage.setItem('local:MAIN_LIST', [{ broker: 'flatex', account_id: 'A', total_value: 0 }]);
    await saveDailyTotal();
    expect(await storage.getItem('local:DAILY_TOTAL')).toBeNull();
  });
});

describe('accountDetect', () => {
  it('returns null without an account id', async () => {
    expect(await accountDetect('flatex', '')).toBeNull();
  });

  it('adopts the first account of a broker silently', async () => {
    expect(await accountDetect('flatex', 'A')).toBe('A');
    const accounts: any = await storage.getItem('local:ACCOUNTS');
    expect(accounts.map((a: any) => a.account_id)).toEqual(['A']);
  });

  it('returns a known account id', async () => {
    await accountDetect('flatex', 'A');
    expect(await accountDetect('flatex', 'A')).toBe('A');
  });

  it('holds a second account as pending until the user accepts it', async () => {
    await accountDetect('flatex', 'A');
    expect(await accountDetect('flatex', 'B')).toBeNull();
    const pending: any = await storage.getItem('local:NEW_ACCOUNTS');
    expect(pending.map((p: any) => p.account_id)).toEqual(['B']);
  });

  it('folds Consors depot ids into the real customer id and adds their history', async () => {
    const broker = 'Consorsbank';
    await storage.setItem('local:ACCOUNTS', [
      { broker, account_id: 'D1', label: 'D1' },
      { broker, account_id: 'D2', label: 'D2' },
    ]);
    await storage.setItem('local:MAIN_LIST', [
      { broker, account_id: 'D1', deposite_number: 'D1', wkn: 'X' },
      { broker, account_id: 'D2', deposite_number: 'D2', wkn: 'Y' },
    ]);
    await storage.setItem('local:DAILY_TOTAL', [
      { date: '2026-09-23', total: 150, accounts: { [`${broker}::D1`]: 100, [`${broker}::D2`]: 50 } },
    ]);

    expect(await accountDetect(broker, 'CUST', 'D1')).toBe('CUST');

    const rows: any = await storage.getItem('local:MAIN_LIST');
    expect(rows.map((r: any) => r.account_id)).toEqual(['CUST', 'CUST']);
    // Several depots fold into one id, so their history must add up, not overwrite.
    const days: any = await storage.getItem('local:DAILY_TOTAL');
    expect(days[0].accounts).toEqual({ [`${broker}::CUST`]: 150 });
    const accounts: any = await storage.getItem('local:ACCOUNTS');
    expect(accounts.map((a: any) => a.account_id)).toEqual(['CUST']);
  });
});

describe('calculateLatestMainListData', () => {
  const run = async (flatex: any[], mainList: any[] = []) => {
    await storage.setItem('local:KONTO_FLATEX', flatex);
    await storage.setItem('local:MAIN_LIST', mainList);
    await calculateLatestMainListData();
    return (await storage.getItem('local:MAIN_LIST')) as any[];
  };

  it('returns false when no broker has data', async () => {
    expect(await calculateLatestMainListData()).toBe(false);
  });

  it('keeps each account its own Cash, falling back to the stored one', async () => {
    const stored = [
      { broker: 'flatex', account_id: 'A', stock_name: 'Cash', total_entry_value: 10, total_value: 10 },
      { broker: 'flatex', account_id: 'B', stock_name: 'Cash', total_entry_value: 20, total_value: 20 },
    ];
    const fresh = [{ broker: 'flatex', account_id: 'A', stock_name: 'Cash', total_entry_value: 99, total_value: 99 }];
    const cash = (await run(fresh, stored)).filter(r => r.stock_name === 'Cash');
    expect(cash.map(r => [r.account_id, r.total_entry_value])).toEqual([['A', 99], ['B', 20]]);
  });

  it('only overwrites the scraped fields of an existing row', async () => {
    const stored = [{ broker: 'flatex', account_id: 'A', wkn: 'X', stocks_owned: 1, notes: 'keep me', bid: 5 }];
    const fresh = [{ broker: 'flatex', account_id: 'A', wkn: 'X', stocks_owned: 3, notes: 'scraped', bid: 7 }];
    const [row] = await run(fresh, stored);
    expect(row.stocks_owned).toBe(3);
    expect(row.notes).toBe('keep me');
    expect(row.bid).toBe(5);
  });

  it('computes days since purchase and only annualises after 30 days', async () => {
    const base = { broker: 'flatex', account_id: 'A', type: 'stock', stocks_owned: 10, bid: 110, total_entry_value: 1000 };
    const [held, fresh] = await run([
      { ...base, wkn: 'OLD', purchase_date: new Date(NOW.getTime() - 60 * DAY).toISOString() },
      { ...base, wkn: 'NEW', purchase_date: new Date(NOW.getTime() - 10 * DAY).toISOString() },
    ]);
    expect(held.days_since_purchase).toBe(60);
    expect(held.yield_pa_since_purchase).toBeCloseTo((Math.pow(1.1, 365 / 60) - 1) * 100);
    expect(fresh.days_since_purchase).toBe(10);
    expect(fresh.yield_pa_since_purchase).toBeUndefined();
  });

  it('gives a discountCall the call-side cap_strike', async () => {
    const [row] = await run([{ broker: 'flatex', account_id: 'A', wkn: 'C', type: 'discountCall', currency: 'EUR', underlying_currency: 'EUR', strike: '100', cap: '120', underlying_price: '110', bid: '9', stocks_owned: 1 }]);
    expect(row.cap_strike).toBe(10);
  });

  // Guards the old shared discountCall branch, which gave cap - strike = -20 here.
  it.each([
    ['90', 10],
    ['50', 20],
    ['110', 0],
  ])('gives a discountPut at underlying %s the put-side cap_strike %d', async (underlying_price, expected) => {
    const [row] = await run([{ broker: 'flatex', account_id: 'A', wkn: 'P', type: 'discountPut', currency: 'EUR', underlying_currency: 'EUR', strike: '100', cap: '80', underlying_price, bid: '9', stocks_owned: 1 }]);
    expect(row.cap_strike).toBe(expected);
  });
});
