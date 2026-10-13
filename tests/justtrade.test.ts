import { describe, it, expect } from 'vitest';
import { justtradeIsValidUser } from '@/utils/justtrade-utils';

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
