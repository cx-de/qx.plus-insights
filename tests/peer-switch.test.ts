import { describe, it, expect } from 'vitest';
import { peerSwitchBest } from '../utils/peer-switch-utils';

const row = { wkn: 'LB6MWK', bid: 33.36, ask: 33.37, stocks_owned: 1545, ratio: 1 };
const peers = [
  { wkn: 'DU6D28', bid: 33.27, ask: 33.28, ratio: 1 },
  { wkn: 'PK4BFZ', bid: 33.31, ask: 33.32, ratio: 1 },
  { wkn: 'LB6MWK', bid: 33.36, ask: 33.37, ratio: 1 },
];

describe('peerSwitchBest', () => {
  it('picks the peer with the lowest ask below the own bid', () => {
    const best = peerSwitchBest(row, peers);
    expect(best?.wkn).toBe('DU6D28');
    expect(best?.gainPerPiece).toBeCloseTo(0.08, 6);
    expect((best?.gainPerPiece ?? 0) * row.stocks_owned).toBeCloseTo(123.6, 6);
  });

  it('suggests nothing when every peer ask is at or above the bid', () => {
    expect(peerSwitchBest(row, [{ wkn: 'X', ask: 33.36 }, { wkn: 'Y', ask: 34 }])).toBeNull();
  });

  it('ignores the own wkn', () => {
    expect(peerSwitchBest({ ...row, bid: 40 }, [{ wkn: 'LB6MWK', ask: 33.37 }])).toBeNull();
  });

  it('skips a peer with a different ratio', () => {
    expect(peerSwitchBest(row, [{ wkn: 'Z', ask: 3.3, ratio: 0.1 }])).toBeNull();
  });

  it('accepts a peer without ratio data when the gap is small', () => {
    expect(peerSwitchBest(row, [{ wkn: 'Z', ask: 33 }])?.wkn).toBe('Z');
  });

  it('rejects a large gap when a ratio is unknown', () => {
    expect(peerSwitchBest(row, [{ wkn: 'Z', ask: 3.3 }])).toBeNull();
    expect(peerSwitchBest({ ...row, ratio: undefined }, [{ wkn: 'Z', ask: 3.3, ratio: 0.1 }])).toBeNull();
  });

  it('accepts a large gap when both ratios match', () => {
    expect(peerSwitchBest(row, [{ wkn: 'Z', ask: 30, ratio: 1 }])?.wkn).toBe('Z');
  });

  it('skips a peer in another currency', () => {
    expect(peerSwitchBest({ ...row, currency: 'EUR' }, [{ wkn: 'Z', ask: 33, currency: 'USD' }])).toBeNull();
    expect(peerSwitchBest({ ...row, currency: 'EUR' }, [{ wkn: 'Z', ask: 33, currency: 'EUR' }])?.wkn).toBe('Z');
  });

  it('skips a peer whose quote is much older than the own one', () => {
    const own = { ...row, timestamp: '2026-11-07T16:05:00Z' };
    expect(peerSwitchBest(own, [{ wkn: 'Z', ask: 33, timestamp: '2026-11-07T15:00:00Z' }])).toBeNull();
    expect(peerSwitchBest(own, [{ wkn: 'Z', ask: 33, timestamp: '2026-11-07T16:00:00Z' }])?.wkn).toBe('Z');
    expect(peerSwitchBest(own, [{ wkn: 'Z', ask: 33 }])?.wkn).toBe('Z');
  });

  it('returns null without a usable bid, ask or quantity', () => {
    expect(peerSwitchBest({ ...row, bid: 0 }, peers)).toBeNull();
    expect(peerSwitchBest({ ...row, stocks_owned: 0 }, peers)).toBeNull();
    expect(peerSwitchBest(row, [{ wkn: 'X' }, { wkn: 'Y', ask: '' }])).toBeNull();
  });
});
