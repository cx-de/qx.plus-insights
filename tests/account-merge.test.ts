import { describe, it, expect } from 'vitest';
import {
  accountCombineRows,
  accountReplaceRows,
  accountKeyOf,
  accountPositionKey,
  accountRowKey,
  accountSameDepot,
} from '@/utils/account-utils';

const flatexRow = (account_id: string, extra: any = {}) => ({
  broker: 'flatex', account_id, isin: 'DE000X', wkn: 'X', stock_name: 'Product X', ...extra,
});

describe('accountCombineRows', () => {
  it('returns [] for non-array input', () => {
    expect(accountCombineRows(null)).toEqual([]);
  });

  it('sums quantities and values of the same ISIN across accounts', () => {
    const rows = [
      flatexRow('A', { id: 1, stocks_owned: 10, buy_price: 100, total_entry_value: 1000, total_value: 1100, position_percentage: '10.00' }),
      flatexRow('B', { id: 2, stocks_owned: 30, buy_price: 120, total_entry_value: 3600, total_value: 3300, position_percentage: '30.00' }),
    ];
    const [row] = accountCombineRows(rows);

    expect(row.stocks_owned).toBe(40);
    expect(row.total_entry_value).toBe(4600);
    expect(row.total_value).toBe(4400);
    // position_percentage is stored as a toFixed string, so + would concatenate.
    expect(row.position_percentage).toBe(40);
    expect(row.profit_loss_percentage).toBeCloseTo((4400 / 4600 - 1) * 100);
    expect(row.buy_price).toBe(115);
    expect(row.id).toBeUndefined();
    expect(row.account_id).toBe('');
    expect(row.isCombined).toBe(true);
    expect(row.combined_count).toBe(2);
    expect(row.combined_accounts).toEqual(['A', 'B']);
  });

  it('takes product fields from a child that holds units', () => {
    const rows = [
      flatexRow('A', { stocks_owned: 0, sideways_return_pa: 0 }),
      flatexRow('B', { stocks_owned: 5, sideways_return_pa: 7 }),
    ];
    expect(accountCombineRows(rows)[0].sideways_return_pa).toBe(7);
  });

  it('keeps the same ISIN at two brokers as two rows', () => {
    const rows = [flatexRow('A'), { ...flatexRow('A'), broker: 'Consors Bank' }];
    expect(accountCombineRows(rows)).toEqual(rows);
  });

  it('falls back to WKN when ISIN is missing', () => {
    const rows = [flatexRow('A', { isin: '' }), flatexRow('B', { isin: '' })];
    expect(accountCombineRows(rows)).toHaveLength(1);
  });

  it('never merges rows with neither ISIN nor WKN', () => {
    const rows = [flatexRow('A', { isin: '', wkn: '' }), flatexRow('B', { isin: '', wkn: '' })];
    expect(accountCombineRows(rows)).toHaveLength(2);
  });

  it('merges cash per broker whatever its spelling', () => {
    const rows = [
      { broker: 'flatex', account_id: 'A', stock_name: 'Cash', total_value: 100 },
      { broker: 'flatex', account_id: 'B', stock_name: 'cash ', total_value: 50 },
      { broker: 'Consors Bank', account_id: 'C', stock_name: 'Cash', total_value: 10 },
    ];
    const result = accountCombineRows(rows);
    expect(result).toHaveLength(2);
    expect(result[0].total_value).toBe(150);
    expect(result[1]).toBe(rows[2]);
  });

  it('passes groups and single-account rows through untouched, in order', () => {
    const group = { isGroup: true, items: [flatexRow('A')] };
    const single = flatexRow('A', { isin: 'DE000Y', wkn: 'Y' });
    const rows = [flatexRow('A'), group, single, flatexRow('B')];
    const result = accountCombineRows(rows);

    expect(result).toHaveLength(3);
    expect(result[0].isCombined).toBe(true);
    expect(result[1]).toBe(group);
    expect(result[2]).toBe(single);
  });
});

describe('accountReplaceRows', () => {
  const stored = [
    flatexRow('A', { id: 'old-A' }),
    flatexRow('B', { id: 'B' }),
    { broker: 'Consors Bank', account_id: 'C', deposite_number: '1', id: 'C1' },
    { broker: 'Consors Bank', account_id: 'C', deposite_number: '2', id: 'C2' },
  ];

  it('replaces only the scraped account and keeps its siblings', () => {
    const result = accountReplaceRows(stored, [flatexRow('A', { id: 'new-A' })], 'flatex', 'A');
    expect(result.map((r: any) => r.id)).toEqual(['B', 'C1', 'C2', 'new-A']);
  });

  it('narrows a Consors replace to one depot', () => {
    const result = accountReplaceRows(stored, [], 'Consors Bank', 'C', '1');
    expect(result.map((r: any) => r.id)).toEqual(['old-A', 'B', 'C2']);
  });

  it('replaces every depot when no depot number is given', () => {
    const result = accountReplaceRows(stored, [], 'Consors Bank', 'C');
    expect(result.map((r: any) => r.id)).toEqual(['old-A', 'B']);
  });

  it('treats non-array input as empty', () => {
    expect(accountReplaceRows(null, [flatexRow('A')], 'flatex', 'A')).toHaveLength(1);
    expect(accountReplaceRows(stored, null, 'flatex', 'A')).toHaveLength(3);
  });
});

describe('account keys', () => {
  it('builds the account key and survives null', () => {
    expect(accountKeyOf({ broker: 'flatex', account_id: '1' })).toBe('flatex::1');
    expect(accountKeyOf(null)).toBe('::');
  });

  it('adds the depot suffix for Consors only', () => {
    expect(accountPositionKey({ broker: 'Consors Bank', account_id: '1', deposite_number: 'D1', wkn: 'X' })).toBe('X|Consors Bank::1|D1');
    expect(accountPositionKey({ broker: 'flatex', account_id: '1', deposite_number: 'D1', wkn: 'X' })).toBe('X|flatex::1');
  });

  it('puts Cash in its own namespace', () => {
    expect(accountPositionKey({ broker: 'flatex', account_id: '1', stock_name: 'Cash' })).toBe('cash|flatex::1');
  });

  it('keys List rows by ISIN', () => {
    expect(accountRowKey({ broker: 'Consors Bank', account_id: '1', deposite_number: 'D1', isin: 'DE000X' })).toBe('DE000X|Consors Bank::1|D1');
  });

  it('compares depots only where the depot is part of the key', () => {
    const consors = { broker: 'Consors Bank', deposite_number: 'D1' };
    expect(accountSameDepot(consors, { ...consors })).toBe(true);
    expect(accountSameDepot(consors, { ...consors, deposite_number: 'D2' })).toBe(false);
    expect(accountSameDepot({ broker: 'flatex', deposite_number: 'D1' }, { broker: 'flatex', deposite_number: 'D2' })).toBe(true);
  });
});
