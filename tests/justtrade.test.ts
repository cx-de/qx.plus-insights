import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import { justtradeIsValidHash, justtradeIsEmptyDepot, justtradeResolveAccountId, justtradeApiPending } from '@/utils/justtrade-utils';
import { justtradeFingerprint } from '@/utils/hash-utils';

describe('justtradeResolveAccountId', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.setItem('local:ACCOUNTS', [
      { broker: 'justTRADE', account_id: '90000001' },
      { broker: 'justTRADE', account_id: '90000002' },
      { broker: 'flatex', account_id: '90000003' },
    ]);
  });

  it('prefers the popover id over any hash', async () => {
    expect(await justtradeResolveAccountId('90000009', '90000001', await justtradeFingerprint('90000002'))).toBe('90000009');
  });

  it('keeps the page id when no hash arrived yet', async () => {
    expect(await justtradeResolveAccountId(null, '90000001', null)).toBe('90000001');
  });

  it('keeps the page id when the hash still matches it', async () => {
    expect(await justtradeResolveAccountId(null, '90000001', await justtradeFingerprint('90000001'))).toBe('90000001');
  });

  it('switches to the known account the hash belongs to', async () => {
    expect(await justtradeResolveAccountId(null, '90000001', await justtradeFingerprint('90000002'))).toBe('90000002');
  });

  it('finds a known account after a reload', async () => {
    expect(await justtradeResolveAccountId(null, null, await justtradeFingerprint('90000002'))).toBe('90000002');
  });

  it.each([
    ['an unknown login', '90000008'],
    ['another broker\'s account', '90000003'],
  ])('returns null for %s', async (_label, id) => {
    expect(await justtradeResolveAccountId(null, '90000001', await justtradeFingerprint(id))).toBeNull();
  });
});

describe('justtradeApiPending', () => {
  const now = 1_000_000;

  it('blocks while a new response has no payload yet', () => {
    expect(justtradeApiPending(now - 1000, now - 60_000, now)).toBe(true);
  });

  it.each([
    ['payload arrived', now - 1000, now - 500],
    ['nothing pending', 0, 0],
    ['hook failed long ago', now - 6000, 0],
  ])('does not block when %s', (_label, pendingAt, payloadAt) => {
    expect(justtradeApiPending(pendingAt, payloadAt, now)).toBe(false);
  });
});

describe('justtradeIsValidHash', () => {
  it.each([
    ['a'.repeat(64), true],
    ['0123456789abcdef'.repeat(4), true],
    ['90000001', false],
    ['A'.repeat(64), false],
    ['a'.repeat(63), false],
    ['', false],
    [null, false],
    [1234567, false],
    ['<img src=x>', false],
  ])('%s -> %s', (hash, expected) => {
    expect(justtradeIsValidHash(hash)).toBe(expected);
  });
});

describe('justtradeFingerprint', () => {
  it('is a stable 64-char hex digest that never contains the input', async () => {
    const hash = await justtradeFingerprint('90000001');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('90000001');
    expect(await justtradeFingerprint('90000001')).toBe(hash);
    expect(justtradeIsValidHash(hash)).toBe(true);
  });

  it('matches quantities normalised the same way on both sides', async () => {
    const norm = (q:any) => justtradeFingerprint(String(Number(q) || 0));
    expect(await norm('100')).toBe(await norm(100));
    expect(await norm('100.0')).toBe(await norm(100));
    expect(await norm(100)).not.toBe(await norm(101));
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
