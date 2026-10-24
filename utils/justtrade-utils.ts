/*
    These functions can only be applied to webtrading.justtrade.com
    as it depends on a specific HTML structure (React Native Web + MUI, hashed css-* classes,
    so every selector below keys on role / data-testid / Mui* class names instead)
*/

import { germanToNumer, sleep } from "./helper";
import { SYNC_COLOR_IDLE, SYNC_COLOR_DONE, SYNC_COLOR_ERROR, BROKER_REFRESH_MS } from "./constants";

const broker = "justTRADE";
const ISIN_CACHE_KEY = 'JUSTTRADE_ISINS';

let currentAccountId:any = null;
// Kundennummer proven on this page (/securities `user` or the profile popover); never taken from storage.
let pageAccountId:any = null;
// Depot rows the last scrape could not match to an ISIN/WKN, shown on the Sync button.
let unmatchedRows:any = [];
let syncButton:any = null;
let syncInFlight = false;
let syncResetTimer:any = null;
// Latest /securities payload forwarded by entrypoints/justtrade-main.content.ts.
let apiPositions:any = null;
let apiListening = false;
// Label list set by justtradeAddThirdRowHeader; justTRADE has no shared header, so every block carries it.
let extraRowLabels:any = null;

const EXTRA_COLUMNS = [
  "type",
  "valuation_date", "cap", "future_total_value",
  "profit_loss_target", "profit_loss_target_pa",
  "underlying_price"];

const SYNC_STYLES:any = {
  idle: { bg: SYNC_COLOR_IDLE, text: 'Sync QX+' },
  busy: { bg: SYNC_COLOR_IDLE, text: 'Syncing…' },
  done: { bg: SYNC_COLOR_DONE, text: 'Synced' },
  error: { bg: SYNC_COLOR_ERROR, text: 'Sync failed' },
};


/* ------------------------------------------------------------------------- *
 *  DOM helpers
 * ------------------------------------------------------------------------- */

async function justtradeWaitFor(fn:any, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = fn();
    if (found) return found;
    await sleep(100);
  }
  return null;
}

// RN-web Pressables listen to pointer/mouse events, not just click, so send the full sequence.
function justtradePress(el:any) {
  if (!el) return;
  const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

// Site is German-formatted ("3,590 €" = 3.59); strip currency, sign padding and percent.
function justtradeNumber(text:any) {
  const cleaned = String(text || '').replace(/[€%+\s ]/g, '');
  if (!cleaned || cleaned === '-') return 0;
  const value = germanToNumer(cleaned);
  return isNaN(value) ? 0 : value;
}

function justtradeDepotTab() {
  const icon = document.querySelector('button[role="tab"] svg[data-testid="EqualizerIcon"]');
  return icon ? icon.closest<HTMLElement>('button[role="tab"]') : null;
}

function justtradeIsOnDepotPage() {
  return justtradeDepotTab()?.getAttribute('aria-selected') === 'true';
}

// Chrome-translate rewrites the numbers ("484,65 €" -> "€484.65"), which germanToNumer misreads.
function justtradeIsTranslated() {
  const cls = document.documentElement.className || '';
  return cls.includes('translated-ltr') || cls.includes('translated-rtl');
}

// The order/search column beside the depot also renders accordions, so scope to the depot's column.
function justtradeDepotRoot() {
  let node:any = justtradeDepotTab();
  while (node && node !== document.body) {
    if (node.querySelector('.MuiAccordion-root')) return node;
    node = node.parentElement;
  }
  return null;
}

// Desktop rows show 10 label/value pairs and narrow ones 5, in different orders, so match by label.
const FIELD_LABELS:any = {
  stocks_owned: /^(anzahl|number)$/i,
  bid: /^(akt\.? ?kurs|aktueller kurs|current price)$/i,
  total_value: /^(gesamtwert|total value)$/i,
  purchase_value: /^(kaufwert|purchase value)$/i,
  buy_price: /kaufkurs|purchase price/i,
  performance: /^performance$/i,
};

function justtradeRowFields(acc:any) {
  const fields:any = {};
  for (const label of Array.from(acc.querySelectorAll('.MuiAccordionSummary-content .MuiTypography-overline')) as any[]) {
    // Our injected block reuses the overline class; its labels are not the site's fields.
    if (label.closest('.qx-extra-row')) continue;
    const text = label.textContent.trim();
    for (const key of Object.keys(FIELD_LABELS)) {
      if (!fields[key] && FIELD_LABELS[key].test(text)) fields[key] = label.nextElementSibling;
    }
  }
  return fields;
}

// Market and search cards are accordions too; only depot rows carry both quantity and performance.
function justtradeDepotAccordions():any[] {
  const root = justtradeDepotRoot();
  if (!root) return [];
  return Array.from(root.querySelectorAll('.MuiAccordion-root')).filter((acc:any) => {
    const fields = justtradeRowFields(acc);
    return fields.stocks_owned && fields.performance;
  });
}

function justtradeRowName(acc:any) {
  return acc.querySelector('.MuiAccordionSummary-content p.MuiTypography-body1')?.textContent?.trim() || '';
}


/* ------------------------------------------------------------------------- *
 *  Account id (Kundennummer from the profile popover)
 * ------------------------------------------------------------------------- */

function justtradeReadAccountFromPopover() {
  const icon = document.querySelector('[role="dialog"] svg[data-testid="AccountCircleIcon"]');
  const dialog = icon?.closest('[role="dialog"]');
  if (!dialog) return null;
  const idNode:any = Array.from(dialog.querySelectorAll('p')).find((p:any) => /^\d{4,}$/.test(p.textContent.trim()));
  return idNode ? idNode.textContent.trim() : null;
}

// Only popover triggers (aria-haspopup) in the top bar: a blind right-to-left sweep could hit logout.
function justtradeHeaderTriggers() {
  const found = Array.from(document.querySelectorAll('button, [role="button"]')).filter((b:any) => {
    if (b.classList.contains('sync-qx-button')) return false;
    if (b.getAttribute('aria-haspopup') !== 'true') return false;
    if (/kontrast|contrast|abmelden|ausloggen|logout|log out/i.test(`${b.getAttribute('aria-label') || ''} ${b.textContent}`)) return false;
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.top < 80 && rect.bottom > 0;
  });
  found.sort((a:any, b:any) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
  const labelled = found.filter((b:any) => /men[uü]|konto|account|profil/i.test(b.getAttribute('aria-label') || ''));
  return [...labelled, ...found.filter((b:any) => !labelled.includes(b))];
}

function justtradeClosePopover(trigger:any) {
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  // Escape is ignored by some gluestack popovers; pressing the trigger again toggles it shut.
  setTimeout(() => {
    if (document.querySelector('[role="dialog"]')) trigger.click();
  }, 300);
}

// The trigger has no stable hook, so try header buttons until one opens the Kundennummer popover.
async function justtradeOpenPopoverForAccount() {
  console.log("justtradeOpenPopoverForAccount");
  const triggers = justtradeHeaderTriggers().slice(0, 6);
  console.log("justtradeOpenPopoverForAccount candidates", triggers.map((b:any) =>
    b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20)));
  for (const trigger of triggers) {
    // Plain click first: the full pointer sequence can open and immediately re-close a toggle.
    for (const press of [(el:any) => el.click(), justtradePress]) {
      const hadDialog = !!document.querySelector('[role="dialog"]');
      press(trigger);
      const id = await justtradeWaitFor(() => justtradeReadAccountFromPopover(), 1500);
      if (id) {
        justtradeClosePopover(trigger);
        await sleep(500);
        return id;
      }
      // Wrong button (bell, mail…) opened its own popover; shut it before trying the next.
      if (!hadDialog && document.querySelector('[role="dialog"]')) {
        justtradeClosePopover(trigger);
        await sleep(500);
        break;
      }
    }
  }
  console.log("justtradeOpenPopoverForAccount id not found");
  return null;
}

async function justtradeSyncUser(interactive = false) {
  console.log("justtradeSyncUser", interactive);
  try {
    const popoverId = justtradeReadAccountFromPopover();
    if (popoverId) pageAccountId = popoverId;
    if (!pageAccountId && interactive) pageAccountId = await justtradeOpenPopoverForAccount();

    // No stored-id fallback: a second login would otherwise be written into the last account.
    if (!pageAccountId) {
      currentAccountId = null;
      return null;
    }

    // null while a prompt is pending, which is what freezes this broker's writes.
    currentAccountId = await accountDetect(broker, String(pageAccountId));
    if (currentAccountId) await chrome.storage.local.set({ CUR_JUSTTRADEID: currentAccountId });
  } catch (err) {
    // Unknown account means no writes this tick, which is the safe side.
    console.error('justtradeSyncUser error:', err);
    currentAccountId = null;
  }
  return currentAccountId;
}


/* ------------------------------------------------------------------------- *
 *  ISIN / WKN cache (from justTRADE's own /securities API, WKN = asset.nsin)
 * ------------------------------------------------------------------------- */

// Quantity joins the key only for names held twice (e.g. two DAX knock-outs with different strikes).
function justtradeIsinKey(accountId:any, stockName:any, quantity:any = undefined) {
  return quantity === undefined ? `${accountId}|${stockName}` : `${accountId}|${stockName}|${quantity}`;
}

function justtradeLookupCache(isinCache:any, stockName:any, quantity:any) {
  return isinCache[justtradeIsinKey(currentAccountId, stockName, quantity)]
    || isinCache[justtradeIsinKey(currentAccountId, stockName)];
}

function justtradeRowQuantity(acc:any) {
  return justtradeNumber(justtradeRowFields(acc).stocks_owned?.textContent);
}

function justtradeMapType(apiType:any) {
  const type = String(apiType || '').toUpperCase();
  if (type === 'STOCK') return 'stock';
  // Same bucket flatex/SmartBroker use for everything that is not a plain share.
  return type ? 'certificate' : '';
}

function justtradeIsValidPosition(pos:any) {
  return pos && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(pos.isin || '')) && /^[A-Z0-9]{5,12}$/i.test(String(pos.wkn || ''));
}

// Exported for tests. A Kundennummer is a short id; anything else posted on the channel must not become an account.
export function justtradeIsValidUser(user:any) {
  return /^[A-Za-z0-9-]{3,20}$/.test(String(user ?? ''));
}

function justtradeListenForApi() {
  if (apiListening) return;
  apiListening = true;
  window.addEventListener('message', (event:any) => {
    // Only our page-world hook, only from this page; anything else on the channel is ignored.
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.source !== 'qx-justtrade' || event.data?.kind !== 'securities') return;
    apiPositions = { positions: Array.isArray(event.data.positions) ? event.data.positions : [], total: event.data.total, at: Date.now() };
    // Every depot load re-proves the account, so a login switch is caught without Sync.
    if (justtradeIsValidUser(event.data.user)) pageAccountId = String(event.data.user);
    console.log("justtradeListenForApi securities", apiPositions.positions.length);
  });
  window.postMessage({ source: 'qx-justtrade-ext', kind: 'request' }, window.location.origin);
}

async function justtradeLoadIsinCache() {
  const stored = await chrome.storage.local.get([ISIN_CACHE_KEY]);
  return stored[ISIN_CACHE_KEY] || {};
}

// Folds the latest API payload into the per-account cache, so rows keep their WKN after a reload.
async function justtradeApplyApiPositions() {
  if (!currentAccountId || !apiPositions?.positions?.length) return;
  const cache = await justtradeLoadIsinCache();
  let changed = false;
  const nameCounts:any = {};
  for (const pos of apiPositions.positions) {
    for (const name of pos.names || []) nameCounts[name] = (nameCounts[name] || 0) + 1;
  }
  for (const pos of apiPositions.positions) {
    // Any page script can post to the listener, so only well-formed identifiers reach the cache and the feed API.
    if (!justtradeIsValidPosition(pos)) continue;
    const next = { isin: pos.isin, wkn: pos.wkn, type: justtradeMapType(pos.type) };
    for (const name of pos.names || []) {
      const key = nameCounts[name] > 1
        ? justtradeIsinKey(currentAccountId, name, pos.quantity)
        : justtradeIsinKey(currentAccountId, name);
      if (cache[key]?.isin === next.isin && cache[key]?.wkn === next.wkn && cache[key]?.type === next.type) continue;
      cache[key] = next;
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [ISIN_CACHE_KEY]: cache });
}

// Pressing the depot's own refresh makes the site re-fetch /securities, which the hook forwards.
async function justtradeRefreshApi() {
  console.log("justtradeRefreshApi");
  const before = apiPositions?.at || 0;
  const root = justtradeDepotRoot();
  const refresh = root?.querySelector('button[aria-label="Aktualisieren"], button[aria-label="Update"]');
  if (refresh) justtradePress(refresh);
  await justtradeWaitFor(() => (apiPositions?.at || 0) > before, 5000);
}


/* ------------------------------------------------------------------------- *
 *  Pagination
 * ------------------------------------------------------------------------- */

// Footer reads "Einträge 1 bis N von M"; returns M, or null when the footer is absent.
function justtradeTotalEntries() {
  const root = justtradeDepotRoot();
  if (!root) return null;
  for (const p of Array.from(root.querySelectorAll('p')) as any[]) {
    const nums = Array.from(p.querySelectorAll('b'))
      .map((b:any) => b.textContent.trim())
      .filter((t:any) => /^\d+$/.test(t));
    if (nums.length >= 3) return Number(nums[nums.length - 1]);
  }
  return null;
}

async function justtradeMaxPageSize() {
  console.log("justtradeMaxPageSize");
  const root = justtradeDepotRoot();
  const combo = root?.querySelector('[role="combobox"][aria-haspopup="listbox"]');
  if (!combo) return;
  // MUI Select opens on mousedown, not click.
  combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  const options:any = await justtradeWaitFor(() => {
    const list = document.querySelectorAll('li[role="option"]');
    return list.length ? Array.from(list) : null;
  }, 2000);
  if (!options) return;
  const largest = options.reduce((best:any, opt:any) =>
    Number(opt.getAttribute('data-value') || opt.textContent) > Number(best.getAttribute('data-value') || best.textContent) ? opt : best);
  largest.click();
  await sleep(800);
}


/* ------------------------------------------------------------------------- *
 *  Scrape + save
 * ------------------------------------------------------------------------- */

function justtradeGetAllStockData(isinCache:any) {
  const data:any = [];
  unmatchedRows = [];
  for (const acc of justtradeDepotAccordions()) {
    const stock_name = justtradeRowName(acc);
    const fields = justtradeRowFields(acc);

    const cached = justtradeLookupCache(isinCache, stock_name, justtradeNumber(fields.stocks_owned?.textContent));
    if (!cached?.isin || !cached?.wkn) {
      unmatchedRows.push(stock_name);
      continue;
    }

    // Performance renders as "+14,85 €|+2,89%" across two spans.
    const perfSpans = fields.performance ? Array.from(fields.performance.querySelectorAll('span')) : [];

    data.push({
      id: crypto.randomUUID(),
      isGroup: false,
      broker,
      account_id: currentAccountId,
      stock_name,
      isin: cached.isin,
      wkn: cached.wkn,
      type: cached.type || '',
      bid: justtradeNumber(fields.bid?.textContent),
      // Purchase cost, not Gesamtwert: price-data-utils computes P/L as value - total_entry_value.
      total_entry_value: fields.purchase_value
        ? justtradeNumber(fields.purchase_value.textContent)
        : Math.round(justtradeNumber(fields.buy_price?.textContent) * justtradeNumber(fields.stocks_owned?.textContent) * 100) / 100,
      stocks_owned: justtradeNumber(fields.stocks_owned?.textContent),
      buy_price: justtradeNumber(fields.buy_price?.textContent),
      profit_loss_price: justtradeNumber((perfSpans[0] as any)?.textContent),
      profit_loss_percentage: justtradeNumber((perfSpans[perfSpans.length - 1] as any)?.textContent),
      timestamp: Date.now(),
    });
  }
  return data;
}

function justtradeReadCash() {
  const label = Array.from(document.querySelectorAll('p, span, div'))
    // Each depot row has its own "Verfügbar" (pieces available), so skip anything inside a row.
    .find((el:any) => !el.children.length && /^(verfügbar|available)$/i.test(el.textContent.trim())
      && !el.closest('.MuiAccordion-root'));
  const value = label?.nextElementSibling?.textContent;
  return value ? justtradeNumber(value) : null;
}

async function justtradeSaveCash() {
  const balance = justtradeReadCash();
  if (balance === null) return;
  const stored = await chrome.storage.local.get(['JUSTTRADE']);
  const currentData = stored.JUSTTRADE || [];
  const cashIndex = currentData.findIndex((item:any) => item.stock_name === 'Cash' && item.broker === broker
    && item.account_id === currentAccountId);
  const timestamp = new Date().toISOString();

  if (cashIndex !== -1) {
    currentData[cashIndex].total_entry_value = balance;
    currentData[cashIndex].timestamp = timestamp;
  } else {
    currentData.push({
      id: crypto.randomUUID(),
      broker,
      account_id: currentAccountId,
      stock_name: 'Cash',
      total_entry_value: balance,
      isGroup: false,
      isin: '',
      stocks_owned: 0,
      buy_price: 0,
      product_type: '',
      wkn: '',
      profit_loss_percentage: 0,
      profit_loss_price: 0,
      bid: 0,
      timestamp,
    });
  }
  await chrome.storage.local.set({ JUSTTRADE: currentData });
}

async function justtradeWriteRows(rows:any) {
  const stored = await chrome.storage.local.get(['JUSTTRADE']);
  const kept = (stored.JUSTTRADE || []).filter((item:any) =>
    item.stock_name === 'Cash' && item.broker === broker && item.account_id === currentAccountId);
  // accountReplaceRows drops this account's Cash row too, so re-add it after the replace.
  const replaced = accountReplaceRows(stored.JUSTTRADE, rows, broker, currentAccountId);
  await chrome.storage.local.set({ JUSTTRADE: [...replaced, ...kept] });
}

async function justtradeSaveDataToLocalStorage(interactive = false) {
  console.log("justtradeSaveDataToLocalStorage", interactive);
  try {
    await justtradeSyncUser(interactive);

    // Rows with no account_id would merge into the wrong account.
    if (!currentAccountId) {
      console.log("justtrade: account id unknown, press Sync QX+");
      return false;
    }

    if (justtradeIsTranslated()) {
      console.log("justtrade: page is Chrome-translated, numbers unreliable, skipping save");
      return false;
    }

    await justtradeSaveCash();

    // Cash-only depot: zero DOM rows is ambiguous, but an empty /securities response proves no positions.
    if (apiPositions && !apiPositions.positions.length && !Number(apiPositions.total) && !justtradeDepotAccordions().length) {
      await justtradeWriteRows([]);
      console.log("justtrade: empty depot, cash only");
      return true;
    }

    if (!justtradeIsOnDepotPage()) {
      console.log("justtrade: depot not visible, skipping save");
      return false;
    }

    await justtradeApplyApiPositions();
    const accordions = justtradeDepotAccordions();
    const rows = justtradeGetAllStockData(await justtradeLoadIsinCache());

    // Never persist an empty scrape: getLatestData would read every position as sold.
    if (!rows.length) {
      console.log("justtrade: no rows scraped, skipping save");
      return false;
    }
    // A replace from one page (or with WKN-less rows skipped) would delete the unseen positions.
    const total = justtradeTotalEntries();
    if ((total !== null && total > accordions.length) || rows.length !== accordions.length) {
      if (unmatchedRows.length) console.log("justtrade: no ISIN/WKN for", unmatchedRows);
      console.log("justtrade: incomplete depot, skipping save", { total, visible: accordions.length, rows: rows.length });
      return false;
    }

    await justtradeWriteRows(rows);
    console.log("justtrade: Saved Data To Local Storage!", rows.length);
    return true;
  } catch (err) {
    // The next tick retries with a fresh DOM; stored rows stay untouched.
    console.error('justtradeSaveDataToLocalStorage error:', err);
    return false;
  }
}


/* ------------------------------------------------------------------------- *
 *  QX+ extra fields per depot row (flatex addThirdRowHeader / createEmptyRowsToFill)
 * ------------------------------------------------------------------------- */

function justtradeAddThirdRowHeader(...labels:any) {
  if (extraRowLabels) return false;
  console.log("justtradeAddThirdRowHeader");
  extraRowLabels = labels;
  return true;
}

// Font and colour live in hashed css-* classes that change with Kontrast-Modus, so read them from the row.
function justtradeSiteClasses(content:any) {
  const siteLabel = Array.from(content.querySelectorAll('.MuiTypography-overline'))
    .find((el:any) => el.nextElementSibling && !el.closest('.qx-extra-row')) as any;
  const siteValue = Array.from(content.querySelectorAll('p.MuiTypography-body2'))
    .find((el:any) => !el.closest('.qx-extra-row')) as any;
  return {
    label: siteLabel?.className || 'MuiTypography-root MuiTypography-overline',
    value: siteValue?.className || 'MuiTypography-root MuiTypography-body2',
    divider: siteLabel ? getComputedStyle(siteLabel).color : 'rgba(0, 0, 0, 0.54)',
  };
}

// Re-applied every tick so a theme switch restyles blocks that already exist.
function justtradeApplyTheme(block:any, classes:any) {
  block.querySelectorAll('[data-qx="label"]').forEach((el:any) => { el.className = classes.label; });
  block.querySelectorAll('[data-qx="value"]').forEach((el:any) => { el.className = `${classes.value} ${el.dataset.col}`; });
  block.style.borderTop = '1px solid';
  // Label colour at 30% gives a divider that stays visible in both light and contrast mode.
  block.style.borderTopColor = `color-mix(in srgb, ${classes.divider} 30%, transparent)`;
}

function justtradeCreateEmptyRowsToFill(isinCache:any) {
  console.log("justtradeCreateEmptyRowsToFill");
  if (!extraRowLabels) return false;
  for (const acc of justtradeDepotAccordions()) {
    const content = acc.querySelector('.MuiAccordionSummary-content');
    if (!content) continue;
    const classes = justtradeSiteClasses(content);
    const existing = content.querySelector('.qx-extra-row');
    if (existing) {
      justtradeApplyTheme(existing, classes);
      continue;
    }

    const block = document.createElement('div');
    block.className = 'qx-extra-row';
    block.dataset.isin = justtradeLookupCache(isinCache, justtradeRowName(acc), justtradeRowQuantity(acc))?.isin || '';
    // Desktop puts the name and the figures side by side; a full-width line below keeps both layouts intact.
    block.style.width = '100%';
    block.style.display = 'grid';
    block.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    block.style.gap = '8px 16px';
    block.style.marginTop = '12px';
    block.style.paddingTop = '10px';
    // The block lives inside the accordion summary; a click on it must not toggle the row.
    block.addEventListener('click', (e) => e.stopPropagation());

    block.innerHTML = EXTRA_COLUMNS.map((col, i) => `
      <div>
        <p data-qx="label">${extraRowLabels[i] || ''}</p>
        <p data-qx="value" data-col="${col}" class="${col}">-</p>
      </div>`).join('');
    justtradeApplyTheme(block, classes);
    content.style.flexWrap = 'wrap';
    content.appendChild(block);
  }
  return true;
}

async function justtradeUpdateCustomRowData(isinCache:any) {
  console.log("justtradeUpdateCustomRowData");
  try {
    const blocks = Array.from(document.querySelectorAll('.qx-extra-row')) as any[];
    if (!blocks.length) return false;

    const result = await chrome.storage.local.get(['MAIN_LIST']);
    const data = await accountOwnRows(result.MAIN_LIST || [], broker, currentAccountId);

    for (const block of blocks) {
      // ISIN may have arrived from the API after the block was built.
      if (!block.dataset.isin) {
        const acc = block.closest('.MuiAccordion-root');
        block.dataset.isin = justtradeLookupCache(isinCache, justtradeRowName(acc), justtradeRowQuantity(acc))?.isin || '';
      }
      const stock = data.find((item:any) => item.isin && item.isin === block.dataset.isin);
      updateColumns(block, stock || {});
      // Same green/red justTRADE uses on its own Performance figures; zero keeps the theme colour.
      for (const col of ['profit_loss_target', 'profit_loss_target_pa']) {
        const cell = block.querySelector(`.${col}`);
        const value = Number(stock?.[col]) || 0;
        if (cell) cell.style.color = value > 0 ? 'rgb(0, 128, 0)' : value < 0 ? 'rgb(244, 66, 66)' : '';
      }
    }
    return true;
  } catch (err) {
    // Display only; the next tick repaints from storage.
    console.error('justtradeUpdateCustomRowData error:', err);
    return false;
  }
}


/* ------------------------------------------------------------------------- *
 *  Sync QX+ button
 * ------------------------------------------------------------------------- */

function justtradeSetSync(state:any) {
  if (!syncButton) return;
  const style = SYNC_STYLES[state];
  syncButton.style.backgroundColor = style.bg;
  syncButton.style.opacity = state === 'busy' ? '0.7' : '1';
  syncButton.textContent = style.text;
  justtradeSyncTitle();
}

// Otherwise a blocked save is only visible in the console.
function justtradeSyncTitle() {
  if (!syncButton) return;
  syncButton.title = unmatchedRows.length ? `Keine ISIN/WKN für: ${unmatchedRows.join(', ')}` : '';
}

async function justtradeRunSync() {
  console.log("justtradeRunSync");
  if (syncInFlight) return;
  syncInFlight = true;
  clearTimeout(syncResetTimer);
  justtradeSetSync('busy');
  let state = 'done';
  try {
    await justtradeSyncUser(true);
    if (!currentAccountId) {
      state = 'error';
      return;
    }
    // Sync pressed on Überblick/Orderbuch: no depot rows and no /securities payload until DEPOT opens.
    if (!justtradeIsOnDepotPage()) {
      justtradeDepotTab()?.click();
      await justtradeWaitFor(() => justtradeIsOnDepotPage(), 3000);
      await sleep(800);
    }
    await justtradeMaxPageSize();
    await justtradeRefreshApi();
    // Id is already resolved above; interactive again would reopen the profile popover.
    const saved = await justtradeSaveDataToLocalStorage(false);
    if (!saved) state = 'error';
  } catch (err) {
    // Surfaced on the button; the 10s loop keeps working off the last good cache.
    console.error('justtradeRunSync error:', err);
    state = 'error';
  } finally {
    syncInFlight = false;
    justtradeSetSync(state);
    syncResetTimer = setTimeout(() => justtradeSetSync('idle'), state === 'done' ? 2000 : 4000);
  }
}

function justtradeRenderSyncButton() {
  const tabsRoot = justtradeDepotTab()?.closest('.MuiTabs-root');
  if (!tabsRoot?.parentElement) return;

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
    // MuiTabs-root squeezes children; without these the label wraps onto two lines.
    button.style.whiteSpace = "nowrap";
    button.style.flexShrink = "0";
    button.style.height = "fit-content";
    button.addEventListener("click", () => { void justtradeRunSync(); });
    syncButton = button;
    justtradeSetSync('idle');
  }

  // Inside MuiTabs-root (a flex row) so it sits beside DEPOT; the RN wrapper around it is a column.
  // React re-renders the tab bar and drops foreign nodes; re-attach the same element.
  if (syncButton.parentElement !== tabsRoot) {
    tabsRoot.appendChild(syncButton);
  }
}

// Run `qxJusttradeDebug()` in the console (context: QX+ Insights) to see which selector misses.
async function justtradeDebug() {
  const accs = justtradeDepotAccordions();
  const report = {
    translated: justtradeIsTranslated(),
    depotTab: !!justtradeDepotTab(),
    onDepot: justtradeIsOnDepotPage(),
    depotRoot: !!justtradeDepotRoot(),
    allAccordions: document.querySelectorAll('.MuiAccordion-root').length,
    depotAccordions: accs.length,
    overlineCounts: Array.from(document.querySelectorAll('.MuiAccordion-root')).map((a:any) =>
      a.querySelectorAll('.MuiAccordionSummary-content .MuiTypography-overline').length),
    names: accs.map((a:any) => justtradeRowName(a)),
    totalEntries: justtradeTotalEntries(),
    cash: justtradeReadCash(),
    popoverId: justtradeReadAccountFromPopover(),
    headerTriggers: justtradeHeaderTriggers().map((b:any) => b.getAttribute('aria-label') || b.textContent.trim().slice(0, 20)),
    accountId: currentAccountId,
    api: apiPositions && { count: apiPositions.positions.length, total: apiPositions.total },
    stored: await chrome.storage.local.get(['CUR_JUSTTRADEID', ISIN_CACHE_KEY, 'JUSTTRADE']),
    scraped: justtradeGetAllStockData(await justtradeLoadIsinCache()),
  };
  console.log("qxJusttradeDebug", JSON.stringify(report, null, 2));
  return report;
}

async function justtradePaintExtraRows() {
  if (syncInFlight || !justtradeIsOnDepotPage()) return;
  justtradeAddThirdRowHeader("Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)",
    "Bewertungstag", "Cap", "Zielwert",
    "G/V Ziel €", "G/V Ziel p.a. (abs.) %", "Basiswert-Kurs");
  const isinCache = await justtradeLoadIsinCache();
  justtradeCreateEmptyRowsToFill(isinCache);
  await justtradeUpdateCustomRowData(isinCache);
}

let tabClickListening = false;

// Switching tab or the split/full depot view rebuilds the list; repaint then instead of up to 10s later.
function justtradeListenForTabClicks() {
  if (tabClickListening) return;
  tabClickListening = true;
  document.addEventListener('click', (e:any) => {
    if (!e.isTrusted || !e.target?.closest?.('button[role="tab"]')) return;
    setTimeout(() => { void justtradePaintExtraRows(); }, 1200);
  }, true);
}

export async function mainJusttrade() {
  console.log("mainJusttrade");
  justtradeListenForApi();
  justtradeListenForTabClicks();
  (window as any).qxJusttradeDebug = justtradeDebug;
  justtradeRenderSyncButton();
  // A Sync run is clicking accordions open/shut; scraping mid-run would see half-expanded rows.
  await justtradePaintExtraRows();
  if (!syncInFlight) {
    await justtradeSaveDataToLocalStorage();
    justtradeSyncTitle();
  }
  setTimeout(() => mainJusttrade(), BROKER_REFRESH_MS);
}
