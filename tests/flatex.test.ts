import { describe, it, expect } from 'vitest';
import { flatexProbeBackedOff } from '@/utils/kontoFlatex-utils';

describe('flatexProbeBackedOff', () => {
  const now = 1_000_000_000;
  const failed = { flatexProbedTokenHash: 'hash-a', flatexProbedAccount: null, flatexProbeFailedAt: now - 60_000 };

  it('waits after a recent failed probe of the same session', () => {
    expect(flatexProbeBackedOff(failed, 'hash-a', now)).toBe(true);
  });

  it.each([
    ['a new session token', failed, 'hash-b'],
    ['no token', failed, null],
    ['the backoff expired', { ...failed, flatexProbeFailedAt: now - 11 * 60_000 }, 'hash-a'],
    ['the last probe succeeded', { ...failed, flatexProbedAccount: '90000001' }, 'hash-a'],
  ])('probes again after %s', (_label, session, hash) => {
    expect(flatexProbeBackedOff(session, hash, now)).toBe(false);
  });
});
