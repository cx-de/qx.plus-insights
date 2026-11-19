// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { justtradeCryptoSymbolIn } from '@/utils/justtrade-utils';

// Made-up minimal copy of the expanded justTRADE row footer; no real account data.
const actions = (inner: string) => {
  const root = document.createElement('div');
  root.className = 'MuiAccordionActions-root';
  root.innerHTML = inner;
  return root;
};
const badgeDiv = '<div><div dir="auto">Krypto</div></div>';
const badgeP = '<p class="MuiTypography-body2">Krypto</p>';
const symbol = '<div><p class="MuiTypography-body2">BTC</p><button></button></div>';
const name = '<p class="MuiTypography-body2">Bitcoin</p>';

describe('justtradeCryptoSymbolIn', () => {
  it('reads the symbol in the current layout', () => {
    expect(justtradeCryptoSymbolIn(actions(badgeDiv + symbol + name))).toBe('BTC');
  });

  it('never takes the badge or the name as the symbol', () => {
    expect(justtradeCryptoSymbolIn(actions(badgeP + symbol + name))).toBe('BTC');
    expect(justtradeCryptoSymbolIn(actions(badgeDiv + name + symbol))).toBe('BTC');
    expect(justtradeCryptoSymbolIn(actions(badgeP + name))).toBe('');
  });

  it('ignores rows without the crypto badge', () => {
    expect(justtradeCryptoSymbolIn(actions('<div><div>Zertifikat</div></div>' + symbol))).toBe('');
    expect(justtradeCryptoSymbolIn(null)).toBe('');
  });

  it('keeps a symbol that equals the coin name', () => {
    const xrp = '<div><p class="MuiTypography-body2">XRP</p></div><p class="MuiTypography-body2">XRP</p>';
    expect(justtradeCryptoSymbolIn(actions(badgeDiv + xrp))).toBe('XRP');
  });
});
