/*
    These functions can only be applied to de.scalable.capital
    as it depends on a specific HTML structure

    The broker page is read on every tick. Buy-ins live only on each security page, which
    Scalable renders client-side and refuses to frame (X-Frame-Options: deny), so Sync QX+
    opens each position in this tab and comes back; a security page the user opens is read
    too. Only text, data-testid and aria anchors are used: css-* and jss* are build hashes.
*/

import { i18n } from '~/entrypoints/home/i18n';
import { SYNC_COLOR_IDLE, SYNC_COLOR_DONE, SYNC_COLOR_ERROR } from './constants';
import { tourSyncDone } from './tour-utils';

const broker = "Scalable Capital";
const POSITIONS_KEY = 'SCALABLE_POSITIONS';
// A cached buy-in older than this is re-read once, which also catches a buy that kept the value close.
const POSITION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NAV_WAIT_MS = 15000;
// Quantity is not on the list, only value / price; value is rounded to cents, so beyond this drift it really changed.
const QTY_TOLERANCE = 0.002;

let currentAccountId:any = null;
// Set when the page has a user id but accountDetect holds it back for a pending prompt.
let accountPending = false;
let syncInFlight = false;
let syncButton:any = null;
let syncOverlay:any = null;
let syncResetTimer:any;
let syncState = 'idle';
let positionsNeedingSync = 0;
// A shorter list than stored is only trusted when two ticks in a row agree; a half-rendered list must not "sell" positions.
const shrinkSeen:any = {};
// Set by a click on the overlay; the loop stops before opening the next position.
let syncCancelled = false;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const t = (key:any, values:any = {}) => i18n.global.t(key, values);

/* ------------------------------------------------------------------------- *
 *  Parsing helpers (exported ones are covered by tests/scalable.test.ts)
 * ------------------------------------------------------------------------- */

function scalableNumber(text:any) {
  // Unicode minus and nbsp come from the formatted figures; germanToNumer only knows "-".
  const cleaned = String(text ?? '').replace(/−/g, '-').replace(/[^\d.,-]/g, '');
  return cleaned ? germanToNumer(cleaned) : 0;
}

// The session cookie is URL-encoded JSON: {"user":{"userId":"…"},"custodian":…}.
export function scalableUserIdFromCookie(cookie:any) {
  try {
    const raw = String(cookie || '').split(/;\s*/).find((part) => part.startsWith('session='));
    if (!raw) return null;
    const userId = JSON.parse(decodeURIComponent(raw.slice('session='.length)))?.user?.userId;
    return /^[A-Za-z0-9_-]{6,40}$/.test(String(userId ?? '')) ? String(userId) : null;
  } catch (err:any) {
    // Name only: a JSON.parse message quotes the cookie, which holds the user id.
    console.error('scalableUserIdFromCookie error:', err?.name);
    return null;
  }
}

function scalableUserIdFromNextData() {
  try {
    const data = JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}');
    const userId = data?.props?.pageProps?.middlewareProps?.m1?.session?.user?.userId;
    return userId ? String(userId) : null;
  } catch (err:any) {
    // Name only: the message would quote page data. No id here freezes saves rather than mis-stamping rows.
    console.error('scalableUserIdFromNextData error:', err?.name);
    return null;
  }
}

// Chrome-translate rewrites "124,66 €" into "€124.66", which germanToNumer misreads.
function scalableIsTranslated(doc:any) {
  const cls = doc.documentElement?.className || '';
  return cls.includes('translated-ltr') || cls.includes('translated-rtl');
}

function scalableOwnText(el:any) {
  return el.textContent.replace(/\s+/g, ' ').trim();
}

function scalableLinkIsin(link:any) {
  return new URL(link.getAttribute('href'), 'https://de.scalable.capital').searchParams.get('isin');
}

function scalablePositionLinks(doc:any):any[] {
  return [...doc.querySelectorAll('section[aria-label="Portfolio"] a[href*="/broker/security?isin="]')];
}

// One entry per position link on the broker page; quantity is not shown there.
export function scalableReadList(doc:any) {
  const rows:any[] = [];
  for (const link of scalablePositionLinks(doc)) {
    const url = new URL(link.getAttribute('href'), 'https://de.scalable.capital');
    const isin = url.searchParams.get('isin');
    if (!ISIN_RE.test(isin || '')) continue;
    // The visually hidden "5.194 EUR" (English format) carries the full precision the visible "5,19" drops.
    const hiddenPrice = [...link.querySelectorAll('span')].find((s:any) => /^[\d.,]+ EUR$/.test(s.textContent.trim()));
    rows.push({
      isin,
      portfolioId: url.searchParams.get('portfolioId'),
      stock_name: link.querySelector('[data-testid="text"]')?.textContent.trim() || '',
      value: scalableNumber(link.querySelector('[data-testid="badgePositionValueTooltip"]')?.textContent),
      bid: hiddenPrice ? parseFloat(hiddenPrice.textContent.replace(/,/g, '')) : 0,
    });
  }
  return rows;
}

// The Guthaben card links to /broker/cash; its header holds the heading and the balance.
export function scalableReadCash(doc:any) {
  const label = [...doc.querySelectorAll('h2')].find((h:any) => /^(Guthaben|Cash balance|Balance)$/i.test(h.textContent.trim()));
  const card = doc.querySelector('a[href*="/broker/cash?"]') || label?.closest('header');
  const match = card?.textContent.match(/[-−]?[\d.]+,\d{2}\s*€/);
  return match ? scalableNumber(match[0]) : null;
}

function scalableDetailCell(doc:any, label:string) {
  const head = [...doc.querySelectorAll('[data-testid="security-details-table"] th')]
    .find((th:any) => th.textContent.trim() === label);
  return head?.nextElementSibling?.textContent.trim() || '';
}

// The id embeds an ISO timestamp ("2026-09-29T12:39:22.329Z: transaction 1"); the date is taken in local time.
function scalableTransactionDate(labelledBy:any) {
  const date = new Date(String(labelledBy || '').split(': ')[0] || '');
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n:number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
}

// Quantity and buy-in from the "Ihre Position" block, WKN/ISIN from the details table, Kaufdaten from the transactions.
export function scalableReadPosition(doc:any) {
  const heading = [...doc.querySelectorAll('h2')].find((h:any) => /^(Ihre Position|Your position)$/i.test(h.textContent.trim()));
  const section = heading?.parentElement?.parentElement;
  if (!section) return null;

  // Last match is the innermost: wrappers share the same text and come first in document order.
  const cells = [...section.querySelectorAll('div')];
  const qtyLabel = cells.filter((el:any) => /^(Stück|Shares|Pieces)$/i.test(scalableOwnText(el))).pop();
  // Never the "∅ 5,15 € bei Kauf" average: the total divides exactly.
  const buyIn = cells.filter((el:any) => /^[\d.,]+ ?€ (bei Kauf|at purchase)$/i.test(scalableOwnText(el))).pop();
  const stocks_owned = scalableNumber(qtyLabel?.previousElementSibling?.textContent);
  const total_entry_value = scalableNumber(buyIn?.textContent.split('€')[0]);
  if (!(stocks_owned > 0) || !(total_entry_value > 0)) return null;

  const dates = [...doc.querySelectorAll('[data-testid^="SETTLED-transaction"]')]
    .filter((btn:any) => [...btn.querySelectorAll('div')].some((d:any) => /^(Kauf|Buy)$/i.test(d.textContent.trim())))
    .map((btn:any) => scalableTransactionDate(btn.getAttribute('aria-labelledby')))
    .filter(Boolean);
  const sortedDates = [...new Set(dates)].sort().reverse();

  const assetClass = scalableDetailCell(doc, 'Anlageklasse') || scalableDetailCell(doc, 'Asset class');
  // Funds report "Aktien" as asset class too; only a plain share is priced by ISIN as 'stock'.
  const isFund = !!doc.querySelector('[data-testid="fund-details"]');
  return {
    isin: scalableDetailCell(doc, 'ISIN') || null,
    stocks_owned,
    total_entry_value,
    wkn: scalableDetailCell(doc, 'WKN') || null,
    type: !isFund && /^(Aktien|Stocks|Equities)$/i.test(assetClass) ? 'stock' : 'certificate',
    purchase_date: sortedDates[0] || null,
    dates: sortedDates,
  };
}

// A client-side route change updates the URL before the DOM, so only a page whose own ISIN matches is read.
function scalableReadPositionFor(doc:any, isin:any) {
  // The ISIN comes from the URL and goes into a selector; anything else would throw there.
  if (!ISIN_RE.test(String(isin || ''))) return null;
  const position = scalableReadPosition(doc);
  if (!position) return null;
  // Without an ISIN row the header logo, whose URL ends in the ISIN, identifies the page.
  const own = position.isin ? position.isin === isin : !!doc.querySelector(`img[src$="/logo/isin/${isin}"]`);
  return own ? position : null;
}

/* ------------------------------------------------------------------------- *
 *  Identity
 * ------------------------------------------------------------------------- */

async function scalableSyncUser() {
  try {
    const storedId = (await chrome.storage.local.get({ CUR_SCALABLEID: null })).CUR_SCALABLEID;
    const pageId = scalableUserIdFromCookie(document.cookie) || scalableUserIdFromNextData();

    // Only safe while this broker has one account; see accountMayFallback.
    currentAccountId = (await accountMayFallback(broker) && storedId) ? String(storedId) : null;
    accountPending = false;
    if (pageId) {
      // null while a prompt is pending, which is what freezes this broker's writes.
      currentAccountId = await accountDetect(broker, pageId);
      accountPending = !currentAccountId;
      if (currentAccountId) await chrome.storage.local.set({ CUR_SCALABLEID: currentAccountId });
    } else {
      console.log('scalableSyncUser id not found');
    }
  } catch (err) {
    // Last known id stays in the module snapshot; a parse failure must not blank it.
    console.error('scalableSyncUser error:', err);
  }
}

function scalableOnBrokerPage() {
  return window.location.pathname.replace(/\/$/, '') === '/broker';
}

/* ------------------------------------------------------------------------- *
 *  Cache: buy-in per account|portfolio|isin
 * ------------------------------------------------------------------------- */

function scalablePositionKey(portfolioId:any, isin:any) {
  return `${currentAccountId || ''}|${portfolioId || ''}|${isin}`;
}

async function scalableLoadCache() {
  try {
    return (await chrome.storage.local.get([POSITIONS_KEY]))[POSITIONS_KEY] || {};
  } catch (err) {
    // No cache only means every position is read again on the next sync.
    console.error('scalableLoadCache error:', err);
    return {};
  }
}

function scalableEntryUsable(entry:any) {
  return entry?.total_entry_value > 0 && entry?.stocks_owned > 0;
}

// Usable, read within a day, and its quantity still matches value / price.
function scalableEntryFresh(entry:any, row:any) {
  if (!scalableEntryUsable(entry)) return false;
  // Written as !(age <= max) so a missing or broken fetched_at counts as stale, not fresh forever.
  if (!(Date.now() - new Date(entry.fetched_at).getTime() <= POSITION_MAX_AGE_MS)) return false;
  if (!(row.bid > 0)) return true;
  return Math.abs(row.value / row.bid - entry.stocks_owned) / entry.stocks_owned <= QTY_TOLERANCE;
}

// fresh=false keeps the entry usable for saving but leaves it due for the next Sync.
async function scalableStorePosition(portfolioId:any, isin:any, position:any, fresh = true) {
  // Read-merge: another tab may have written positions this one never touched.
  const latest = await scalableLoadCache();
  const key = scalablePositionKey(portfolioId, isin);
  const old = latest[key];
  // A read before the transactions render must not drop the Kaufdaten a full read already stored.
  if (!fresh && scalableEntryUsable(old) && old.stocks_owned === position.stocks_owned
    && old.total_entry_value === position.total_entry_value) return;
  const { fetched_at: oldAt, ...oldData } = old || {};
  // Same figures read again within the hour: skip the write, or every 10s tick on a security page rewrites storage.
  const recent = Date.now() - new Date(oldAt).getTime() < 60 * 60 * 1000;
  if (JSON.stringify(oldData) === JSON.stringify(position) && (recent || !fresh)) return;
  latest[key] = { ...position, ...(fresh ? { fetched_at: new Date().toISOString() } : {}) };
  await chrome.storage.local.set({ [POSITIONS_KEY]: latest });
}

/* ------------------------------------------------------------------------- *
 *  Save
 * ------------------------------------------------------------------------- */

function scalableCashRow(old:any, portfolioId:any, cash:any) {
  return {
    id: crypto.randomUUID(),
    broker,
    account_id: currentAccountId,
    deposite_number: portfolioId,
    stock_name: 'Cash',
    isGroup: false,
    isin: '',
    stocks_owned: 0,
    buy_price: 0,
    product_type: '',
    wkn: '',
    profit_loss_percentage: 0,
    profit_loss_price: 0,
    bid: 0,
    ...(old || {}),
    total_entry_value: cash,
    timestamp: new Date().toISOString(),
  };
}

function scalableIsOwnCash(row:any, portfolioId:any) {
  return row.stock_name === 'Cash' && row.broker === broker && row.account_id === currentAccountId && row.deposite_number === portfolioId;
}

// Step 2 of a sync, before positions: a position waiting for its buy-in must never hold the balance back.
async function scalableSaveCash(cash:any, portfolioId:any) {
  console.log('scalableSaveCash', cash !== null ? 'found' : 'not found');
  if (!currentAccountId || cash === null) return false;
  const stored = (await chrome.storage.local.get(['SCALABLE'])).SCALABLE || [];
  const oldCash = stored.find((r:any) => scalableIsOwnCash(r, portfolioId));
  if (oldCash?.total_entry_value === cash) return true;
  await chrome.storage.local.set({ SCALABLE: [...stored.filter((r:any) => r !== oldCash), scalableCashRow(oldCash, portfolioId, cash)] });
  return true;
}

// Step 3: positions only. Returns the number saved, or null when nothing was written.
// trusted: the caller has seen this list settle, so a shorter list really means a sale.
async function scalableSaveRows(list:any[], portfolioId:any, trusted = false) {
  console.log('scalableSaveRows', list.length);
  // An empty list may just be a slow render, so it never wipes positions.
  if (!currentAccountId || !list.length) return null;
  const stored = (await chrome.storage.local.get(['SCALABLE'])).SCALABLE || [];
  const own = stored.filter((r:any) => r.broker === broker && r.account_id === currentAccountId && r.deposite_number === portfolioId);
  const storedPositions = own.filter((r:any) => r.stock_name !== 'Cash').length;

  if (!trusted && list.length < storedPositions) {
    if (shrinkSeen[portfolioId] !== list.length) {
      shrinkSeen[portfolioId] = list.length;
      console.log('scalable: shorter list, waiting for the next tick to confirm', list.length, storedPositions);
      return null;
    }
  }
  delete shrinkSeen[portfolioId];

  const cashRow = own.find((r:any) => r.stock_name === 'Cash');
  const cache = await scalableLoadCache();
  const rows:any[] = [];
  let missing = 0;
  for (const item of list) {
    const entry = cache[scalablePositionKey(portfolioId, item.isin)];
    if (!scalableEntryUsable(entry)) {
      // Never guess a buy-in; keep the last good row so the position does not read as sold.
      const previous = own.find((r:any) => r.isin === item.isin && r.stock_name !== 'Cash');
      if (previous) rows.push({ ...previous, bid: item.bid || previous.bid, timestamp: Date.now() });
      missing++;
      continue;
    }
    const value = item.value || entry.total_entry_value;
    rows.push({
      id: crypto.randomUUID(),
      broker,
      account_id: currentAccountId,
      isGroup: false,
      deposite_number: portfolioId,
      isin: item.isin,
      stock_name: item.stock_name,
      type: entry.type,
      wkn: entry.wkn || item.isin,
      bid: item.bid,
      // Unrounded on purpose: 123,50 € / 24 is 5,1458, the shown "∅ 5,15 €" would add up to 123,60.
      buy_price: entry.total_entry_value / entry.stocks_owned,
      stocks_owned: entry.stocks_owned,
      total_entry_value: entry.total_entry_value,
      profit_loss_price: Math.round((value - entry.total_entry_value) * 100) / 100,
      profit_loss_percentage: Math.round((value - entry.total_entry_value) / entry.total_entry_value * 10000) / 100,
      timestamp: Date.now(),
      // Spread conditionally: the merges overwrite, so a null here would erase a good value.
      ...(entry.purchase_date ? { purchase_date: entry.purchase_date, purchase_dates: entry.dates } : {}),
    });
  }
  if (!rows.length) {
    console.log('scalable: no position has a buy-in yet, skipping positions', missing);
    return null;
  }

  // The depot-scoped replace drops the Cash row too, so the one step 2 just wrote goes back in.
  const fresh = cashRow ? [...rows, cashRow] : rows;
  // ids and timestamps change every tick; only a change in figures is worth a storage write.
  const figures = (list:any[]) => JSON.stringify(list.map((r:any) =>
    [r.isin, r.stock_name, r.stocks_owned, r.total_entry_value, r.bid, r.purchase_date]).sort());
  if (figures(fresh) === figures(own)) return rows.length;
  await chrome.storage.local.set({ SCALABLE: accountReplaceRows(stored, fresh, broker, currentAccountId, portfolioId) });
  console.log('scalable: Saved Data To Local Storage!', rows.length, missing);
  return rows.length;
}

/* ------------------------------------------------------------------------- *
 *  Sync: user id, cash, then each position opened in this tab
 * ------------------------------------------------------------------------- */

async function scalableWaitFor(check:any, timeoutMs:number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(250);
  }
  return null;
}

// The list counts as back only once it shows as many rows as before: the cash card alone renders first.
function scalableListReady(expected:number) {
  return scalableOnBrokerPage() && scalablePositionLinks(document).length >= Math.max(1, expected);
}

// Same list length twice, 1 s apart: a sync must not save a list that is still rendering.
async function scalableSettledList() {
  let previous = scalableReadList(document);
  for (let i = 0; i < 5; i++) {
    await sleep(1000);
    const current = scalableReadList(document);
    if (current.length === previous.length) return current;
    previous = current;
  }
  return previous;
}

// Opens one position like a user click (Next.js routes it, no reload), reads it, and goes back to the list.
async function scalableReadPositionByClick(isin:any, expectedRows:number) {
  const link = scalablePositionLinks(document).find((a:any) => scalableLinkIsin(a) === isin);
  if (!link) return { position: null, back: true };
  link.click();
  let position = await scalableWaitFor(() => scalableReadPositionFor(document, isin), NAV_WAIT_MS);
  // The transactions render after the figures; one more read after a settle picks up the Kaufdaten.
  if (position) {
    await sleep(800);
    position = scalableReadPositionFor(document, isin) || position;
  }
  console.log('scalableReadPositionByClick', position ? 'hit' : 'miss');
  if (window.location.pathname.startsWith('/broker/security')) history.back();
  return { position, back: !!(await scalableWaitFor(() => scalableListReady(expectedRows), NAV_WAIT_MS)) };
}

// Runs from the button on /broker. Returns { saved, missing }.
async function scalableSync(onProgress:any = () => {}) {
  console.log('scalableSync 1/3 user');
  await scalableSyncUser();
  if (accountPending) throw new Error('account pending');
  if (!currentAccountId) throw new Error('account id unknown');
  if (scalableIsTranslated(document)) throw new Error('page is translated');
  const portfolioId = new URLSearchParams(window.location.search).get('portfolioId');
  if (!scalableOnBrokerPage() || !portfolioId) throw new Error('not on the broker page');

  console.log('scalableSync 2/3 cash');
  await scalableSaveCash(scalableReadCash(document), portfolioId);

  console.log('scalableSync 3/3 portfolio');
  const list = await scalableSettledList();
  const cache = await scalableLoadCache();
  const needed = list.filter((row:any) => !scalableEntryFresh(cache[scalablePositionKey(portfolioId, row.isin)], row));
  console.log('scalableSync positions', list.length, needed.length);

  let missing = 0;
  for (const [index, row] of needed.entries()) {
    if (syncCancelled) {
      console.log('scalableSync cancelled');
      missing += needed.length - index;
      break;
    }
    onProgress(`${index + 1}/${needed.length}`);
    const { position, back } = await scalableReadPositionByClick(row.isin, list.length);
    if (position) await scalableStorePosition(portfolioId, row.isin, position);
    else missing++;
    // Stranded off the list: stop opening pages, but still save what was read.
    if (!back) {
      console.log('scalableSync could not return to the list');
      missing += needed.length - index - 1;
      break;
    }
  }
  const saved = (await scalableSaveRows(list, portfolioId, true)) || 0;
  positionsNeedingSync = missing;
  return { saved, missing };
}

/* ------------------------------------------------------------------------- *
 *  Sync QX+ button and overlay
 * ------------------------------------------------------------------------- */

function scalableSetSync(state:any, detail = '') {
  syncState = state;
  if (!syncButton) return;
  // Idle shows how many positions wait for a Sync, so a stale buy-in is visible without the console.
  const idle = positionsNeedingSync ? `${t('sync_qx')} (${positionsNeedingSync})` : t('sync_qx');
  const labels:any = { idle, busy: `${t('syncing')} ${detail}`.trim(), done: t('synced'), error: t('sync_failed') };
  syncButton.textContent = labels[state];
  syncButton.style.backgroundColor = state === 'done' ? SYNC_COLOR_DONE : state === 'error' ? SYNC_COLOR_ERROR : SYNC_COLOR_IDLE;
  syncButton.style.opacity = state === 'busy' ? '0.7' : '1';
  syncButton.setAttribute('aria-busy', String(state === 'busy'));
  if (state === 'idle') syncButton.title = positionsNeedingSync ? t('scalable_sync_needed', { count: positionsNeedingSync }) : '';
  if (syncOverlay && !syncCancelled) syncOverlay.textContent = `${t('scalable_overlay')} ${detail}`.trim();
}

// Clicks while Sync walks the pages would strand it off the list; this transparent layer catches them.
function scalableShowOverlay(show:boolean) {
  if (!show) {
    syncOverlay?.parentElement?.remove();
    syncOverlay = null;
    return;
  }
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '2147483646', cursor: 'pointer', background: 'rgba(0,0,0,0.15)' });
  const badge = document.createElement('div');
  // A click anywhere cancels: the position being read finishes and returns to the list first.
  layer.addEventListener('click', () => {
    syncCancelled = true;
    badge.textContent = t('scalable_cancelling');
  });
  Object.assign(badge.style, {
    position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', padding: '8px 14px',
    borderRadius: '6px', background: SYNC_COLOR_IDLE, color: 'white', fontWeight: '600',
  });
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  layer.appendChild(badge);
  document.body.appendChild(layer);
  syncOverlay = badge;
  badge.textContent = t('scalable_overlay');
}

async function scalableRunSync() {
  if (syncInFlight) return;
  syncInFlight = true;
  syncCancelled = false;
  clearTimeout(syncResetTimer);
  scalableShowOverlay(true);
  scalableSetSync('busy');
  let state = 'done';
  let title = '';
  try {
    const { missing } = await scalableSync((detail:any) => scalableSetSync('busy', detail));
    if (syncCancelled) title = t('scalable_cancelled');
    else if (missing) title = t('scalable_not_read', { count: missing });
    // Not awaited: the guide is optional and must not delay the button.
    void tourSyncDone();
  } catch (err:any) {
    // Shown on the button; stored rows keep their last good state.
    console.error('scalableRunSync error:', err);
    state = 'error';
    const reason = String(err?.message || '');
    if (reason.includes('translated')) title = t('scalable_translate_off');
    else if (reason.includes('pending')) title = t('scalable_account_pending');
  } finally {
    syncInFlight = false;
    scalableShowOverlay(false);
  }
  scalableSetSync(state);
  if (syncButton) syncButton.title = title;
  syncResetTimer = setTimeout(() => scalableSetSync('idle'), state === 'done' ? 2000 : 4000);
}

// One button only, at the end of the broker page tab bar (Überblick … Transaktionen).
function scalableButtonHost() {
  if (!scalableOnBrokerPage()) return null;
  return [...document.querySelectorAll('[role="tablist"]')]
    .find((list:any) => [...list.children].some((tab:any) => /^(Überblick|Overview)$/i.test(tab.textContent.trim()))) || null;
}

function scalableRenderSyncButton() {
  const host = scalableButtonHost();
  if (!host) return;
  if (!syncButton) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sync-qx-button";
    button.style.marginLeft = "10px";
    button.style.padding = "5px 10px";
    button.style.border = "none";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";
    button.style.color = "white";
    button.style.alignSelf = "center";
    // The tab row is a squeezing flex row; without these the label wraps onto two lines.
    button.style.whiteSpace = "nowrap";
    button.style.flexShrink = "0";
    button.setAttribute('aria-live', 'polite');
    button.addEventListener("click", () => { void scalableRunSync(); });
    syncButton = button;
    scalableSetSync('idle');
  }
  // React re-renders the tab bar and drops foreign nodes; re-attach the same element.
  if (syncButton.parentElement !== host) host.appendChild(syncButton);
}

/* ------------------------------------------------------------------------- *
 *  Loop
 * ------------------------------------------------------------------------- */

// Run `qxScalableDebug()` in the console (context: QX+ Insights) to see which selector misses.
async function scalableDebug() {
  const list = scalableOnBrokerPage() ? scalableReadList(document) : [];
  const report = {
    translated: scalableIsTranslated(document),
    userIdFound: !!(scalableUserIdFromCookie(document.cookie) || scalableUserIdFromNextData()),
    accountKnown: !!currentAccountId,
    accountPending,
    buttonHost: !!scalableButtonHost(),
    listRows: list.length,
    cashFound: scalableOnBrokerPage() ? scalableReadCash(document) !== null : 'not on /broker',
    onSecurityPage: window.location.pathname.startsWith('/broker/security'),
    positionFound: !!scalableReadPosition(document),
    needingSync: positionsNeedingSync,
    cached: Object.keys(await scalableLoadCache()).length,
    storedRows: ((await chrome.storage.local.get(['SCALABLE'])).SCALABLE || []).length,
  };
  console.log("qxScalableDebug", JSON.stringify(report, null, 2));
  return report;
}

export async function mainScalable() {
  console.log("mainScalable");
  (window as any).qxScalableDebug = scalableDebug;
  scalableRenderSyncButton();
  if (syncInFlight) return;

  // Same order as a sync: user id, then cash, then positions.
  await scalableSyncUser();
  // Re-checked after every await: a Sync started meanwhile owns the storage writes.
  if (!currentAccountId || syncInFlight) return;

  if (scalableIsTranslated(document)) return;
  const params = new URLSearchParams(window.location.search);
  const portfolioId = params.get('portfolioId');
  if (!portfolioId) return;

  if (scalableOnBrokerPage()) {
    await scalableSaveCash(scalableReadCash(document), portfolioId);
    if (syncInFlight) return;
    const list = scalableReadList(document);
    await scalableSaveRows(list, portfolioId);
    const cache = await scalableLoadCache();
    positionsNeedingSync = list.filter((row:any) => !scalableEntryFresh(cache[scalablePositionKey(portfolioId, row.isin)], row)).length;
    if (syncState === 'idle') scalableSetSync('idle');
  } else if (window.location.pathname.startsWith('/broker/security') && params.get('isin')) {
    // A position the user opened is read for free; without Kaufdaten yet it stays due, so a later read fills them.
    const position = scalableReadPositionFor(document, params.get('isin'));
    if (position && !syncInFlight) await scalableStorePosition(portfolioId, params.get('isin'), position, position.dates.length > 0);
  }
}
