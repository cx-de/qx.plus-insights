// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { scalableUserIdFromCookie, scalableReadList, scalableReadPosition, scalableReadCash } from '@/utils/scalable-utils';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const position = `
  <div>
    <div><h2>Ihre Position</h2></div>
    <div>
      <div><div><span>124,76 €</span></div><div><span><span>123,50 €</span></span> bei Kauf</div></div>
      <div><div><span>24</span></div><div>Stück</div></div>
      <div><div><span>5,19 €</span></div><div><span>∅ <span>5,15 €</span></span> bei Kauf</div></div>
    </div>
  </div>
  <div data-testid="fund-details">
    <table data-testid="security-details-table"><tbody>
      <tr><th><div>ISIN</div></th><td>DE0009000001</td></tr>
      <tr><th><div>Anlageklasse</div></th><td>Aktien</td></tr>
      <tr><th><div>WKN</div></th><td>900001</td></tr>
    </tbody></table>
  </div>
  <button data-testid="SETTLED-transaction-1" aria-labelledby="2026-10-28T00:00:00.000Z: transaction 1"><div>Ausschüttung</div></button>
  <button data-testid="SETTLED-transaction-1" aria-labelledby="2026-09-29T12:39:22.329Z: transaction 1"><div>Kauf</div><div>24 Stk.</div></button>`;

const list = `
  <section aria-label="Portfolio"><ul>
    <li><a href="/broker/security?isin=DE0009000001&amp;portfolioId=sc90000002">
      <div data-testid="text"><span>Product A</span></div>
      <div data-testid="badgePositionValueTooltip"><span>1.124,66 €</span></div>
      <span>5.194 EUR</span><div aria-hidden="true">5<span>19</span></div>
    </a></li>
  </ul></section>`;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scalableUserIdFromCookie', () => {
  it('reads the user id from the encoded session cookie', () => {
    const session = encodeURIComponent(JSON.stringify({ user: { userId: 'sc90000001' }, currency: 'EUR' }));
    expect(scalableUserIdFromCookie(`other=1; session=${session}; x=y`)).toBe('sc90000001');
  });

  it('returns null for a missing or broken cookie', () => {
    expect(scalableUserIdFromCookie('other=1')).toBeNull();
    expect(scalableUserIdFromCookie('session=%7Bbroken')).toBeNull();
  });
});

describe('scalableReadPosition', () => {
  it('divides the exact buy-in total, never the rounded average', () => {
    const read = scalableReadPosition(parse(position))!;
    expect(read).toMatchObject({ stocks_owned: 24, total_entry_value: 123.5, wkn: '900001', type: 'certificate' });
    expect(read.total_entry_value / read.stocks_owned).toBeCloseTo(5.1458, 4);
  });

  it('takes Kaufdaten from buys only', () => {
    expect(scalableReadPosition(parse(position))).toMatchObject({ purchase_date: '2026-09-29T00:00:00', dates: ['2026-09-29T00:00:00'] });
  });

  it('returns null before the position block has rendered', () => {
    expect(scalableReadPosition(parse('<h2>Übersicht</h2>'))).toBeNull();
  });
});

describe('scalableReadList', () => {
  it('reads isin, depot, value and the full-precision price', () => {
    expect(scalableReadList(parse(list))).toEqual([
      { isin: 'DE0009000001', portfolioId: 'sc90000002', stock_name: 'Product A', value: 1124.66, bid: 5.194 },
    ]);
  });
});

describe('scalableReadCash', () => {
  it('reads the balance from the Guthaben card, not the heading alone', () => {
    const card = '<section><a href="/broker/cash?portfolioId=sc90000002"><header><div><div><h2>Guthaben</h2></div>'
      + '<div><span>7,43 €</span><div>0,00% p.a.</div></div></div></header></a></section>';
    expect(scalableReadCash(parse(card))).toBe(7.43);
  });

  it('returns null when the card is not rendered yet', () => {
    expect(scalableReadCash(parse('<h2>Portfolio</h2>'))).toBeNull();
  });
});

describe('scalableReadCash sign', () => {
  it('keeps a negative balance written with the Unicode minus', () => {
    const card = '<a href="/broker/cash?portfolioId=sc90000002"><header><h2>Guthaben</h2><span>−7,43 €</span></header></a>';
    expect(scalableReadCash(parse(card))).toBe(-7.43);
  });
});

describe('mainScalable save', () => {
  const nextData = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { middlewareProps: { m1: { session: { user: { userId: 'sc90000001' } } } } } } })}</script>`;
  const cash = '<a href="/broker/cash?portfolioId=sc90000002"><header><h2>Guthaben</h2><span>7,43 €</span></header></a>';
  const row = (isin: string) => `<a href="/broker/security?isin=${isin}&amp;portfolioId=sc90000002">
    <div data-testid="text">Product ${isin}</div><div data-testid="badgePositionValueTooltip">124,76 €</div><span>5.194 EUR</span></a>`;
  const page = (isins: string[]) => `${nextData}${cash}<section aria-label="Portfolio">${isins.map(row).join('')}</section>`;
  const entry = (extra: any = {}) => ({ stocks_owned: 24, total_entry_value: 123.5, wkn: '900001', type: 'certificate',
    purchase_date: '2026-09-29T00:00:00', dates: ['2026-09-29T00:00:00'], fetched_at: new Date().toISOString(), ...extra });
  const stored = async (): Promise<any[]> => ((await fakeBrowser.storage.local.get('SCALABLE')).SCALABLE as any[]) || [];

  let mainScalable: any;
  beforeEach(async () => {
    fakeBrowser.reset();
    vi.stubGlobal('chrome', fakeBrowser);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    history.pushState({}, '', '/broker?portfolioId=sc90000002');
    document.documentElement.className = '';
    vi.resetModules();
    ({ mainScalable } = await import('@/utils/scalable-utils'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('saves the exact buy price and keeps the cash row', async () => {
    await fakeBrowser.storage.local.set({ SCALABLE_POSITIONS: { 'sc90000001|sc90000002|DE0009000001': entry() } });
    document.body.innerHTML = page(['DE0009000001']);
    await mainScalable();

    const rows = await stored();
    const position = rows.find((r: any) => r.isin === 'DE0009000001');
    expect(position).toMatchObject({ account_id: 'sc90000001', deposite_number: 'sc90000002', stocks_owned: 24, wkn: '900001', bid: 5.194 });
    expect(position.buy_price).toBeCloseTo(5.1458, 4);
    expect(position.profit_loss_price).toBe(1.26);
    expect(rows.find((r: any) => r.stock_name === 'Cash').total_entry_value).toBe(7.43);
  });

  it('never saves a position whose cached quantity is zero', async () => {
    await fakeBrowser.storage.local.set({ SCALABLE_POSITIONS: { 'sc90000001|sc90000002|DE0009000001': entry({ stocks_owned: 0 }) } });
    document.body.innerHTML = page(['DE0009000001']);
    await mainScalable();
    expect((await stored()).map((r: any) => r.stock_name)).toEqual(['Cash']);
  });

  it('waits for a second tick before a shorter list removes positions', async () => {
    await fakeBrowser.storage.local.set({ SCALABLE_POSITIONS: {
      'sc90000001|sc90000002|DE0009000001': entry(), 'sc90000001|sc90000002|DE0009000002': entry() } });
    document.body.innerHTML = page(['DE0009000001', 'DE0009000002']);
    await mainScalable();
    expect((await stored()).filter((r: any) => r.isin).length).toBe(2);

    document.body.innerHTML = page(['DE0009000001']);
    await mainScalable();
    expect((await stored()).filter((r: any) => r.isin).length).toBe(2);
    await mainScalable();
    expect((await stored()).filter((r: any) => r.isin).length).toBe(1);
  });

  it('saves nothing on a Chrome-translated page', async () => {
    await fakeBrowser.storage.local.set({ SCALABLE_POSITIONS: { 'sc90000001|sc90000002|DE0009000001': entry() } });
    document.body.innerHTML = page(['DE0009000001']);
    document.documentElement.className = 'translated-ltr';
    await mainScalable();
    expect(await stored()).toEqual([]);
  });
});
