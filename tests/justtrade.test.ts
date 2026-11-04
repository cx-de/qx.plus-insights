import { describe, it, expect } from 'vitest';
import { justtradeIsValidUser, justtradeIsEmptyDepot } from '@/utils/justtrade-utils';

describe('justtradeIsValidUser', () => {
  it.each([
    ['1234567', true],
    ['AB-12345', true],
    [1234567, true],
    ['', false],
    [null, false],
    ['12', false],
    ['<img src=x>', false],
    ['1'.repeat(21), false],
  ])('%s -> %s', (user, expected) => {
    expect(justtradeIsValidUser(user)).toBe(expected);
  });
});

describe('justtradeIsEmptyDepot', () => {
  const now = 1_000_000_000;
  const empty = { positions: [], total: 0, at: now - 1000 };

  it('accepts a fresh empty payload with no rows on screen', () => {
    expect(justtradeIsEmptyDepot(empty, 0, now)).toBe(true);
  });

  it.each([
    ['no payload yet', null, 0],
    ['positions present', { ...empty, positions: [{ isin: 'DE0009000001' }] }, 0],
    ['total says positions exist', { ...empty, total: 3 }, 0],
    ['rows visible on screen', empty, 2],
    ['stale payload', { ...empty, at: now - 10 * 60 * 1000 }, 0],
    ['payload without timestamp', { positions: [], total: 0 }, 0],
  ])('rejects %s', (_label, api, rows) => {
    expect(justtradeIsEmptyDepot(api, rows as number, now)).toBe(false);
  });
});
