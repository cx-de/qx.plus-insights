/*
    These functions can only be applied to wikifolio website
    as it depends on a specific HTML structure
*/

import { i18n } from '~/entrypoints/home/main';
import { SYNC_COLOR_IDLE, SYNC_COLOR_DONE, SYNC_COLOR_ERROR } from './constants';

const broker = "Wikifolio";

let currentAccountId:any = null;

const PURCHASE_CACHE_KEY = 'WIKIFOLIO_PURCHASE_DATES';
const TRADES_SELECTOR = '[data-jumpmark="trades"]';
const TRADES_WAIT_MS = 8000;
const IFRAME_WAIT_MS = 20000;
// Trades are paged by date range; a cap keeps a huge history from flipping pages for minutes.
const MAX_TRADE_PAGES = 30;
const NOT_FOUND_RETRY_MS = 24 * 60 * 60 * 1000;

// Set while the button runs, so the 10s tick doesn't scrape mid page-flip.
let syncInFlight = false;

export function addSyncButtonOnWikifolio(){
  console.log("addSyncButtonOnWikifolio");
  if (document.querySelector('.sync-qx-button')) return;
  // Positions are only on the my-wikifolios trade page; the public /w/ page has just the trades.
  if (!window.location.href.includes("/trade/")) return;
  const container = document.querySelector('.c-wf-trade__header-container');
  if (!container) return;

  const button = document.createElement("button");
  button.type = "button";
  // wikifolio's own header-button classes keep it in line with "View" and "Change".
  button.className = "c-button c-wf-trade__header-button sync-qx-button";
  // wikifolio's own button gap doesn't reach an appended button; 8px matches View-Change.
  button.style.marginLeft = "8px";
  button.style.border = "none";
  button.style.cursor = "pointer";
  button.style.color = "white";
  button.setAttribute('aria-live', 'polite');
  // A <button>, not <a href="#sync">: the hash broke wikifolio's #/trades routing.
  button.addEventListener("click", () => { void wikifolioRunSync(button); });
  wikifolioSetSyncState(button, 'idle');
  container.appendChild(button);
}

function wikifolioSetSyncState(button:any, state:any, detail = '') {
  const t = (key:any) => i18n.global.t(key);
  const labels:any = {
    idle: t('sync_qx'),
    saving: t('syncing'),
    fetching: `${t('fetching_purchase_dates')} ${detail}`.trim(),
    done: t('synced'),
    error: t('sync_failed'),
  };
  const busy = state === 'saving' || state === 'fetching';
  button.textContent = labels[state];
  button.style.backgroundColor = state === 'done' ? SYNC_COLOR_DONE : state === 'error' ? SYNC_COLOR_ERROR : SYNC_COLOR_IDLE;
  button.style.opacity = busy ? '0.7' : '1';
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

// Save, fill missing Kaufdaten from the trades table, then save again so rows carry them.
async function wikifolioRunSync(button:any) {
  if (syncInFlight) return;
  syncInFlight = true;
  let state = 'done';
  try {
    wikifolioSetSyncState(button, 'saving');
    const positions = await mainWikiFolioSaveDataToLocalStorage(true);

    wikifolioSetSyncState(button, 'fetching');
    const found = await wikifolioSyncPurchaseDates(positions,
      (page:any) => wikifolioSetSyncState(button, 'fetching', `${page}`));

    if (found) {
      wikifolioSetSyncState(button, 'saving');
      await mainWikiFolioSaveDataToLocalStorage(true);
    }
  } catch (err) {
    console.error('wikifolioRunSync error:', err);
    state = 'error';
  } finally {
    syncInFlight = false;
  }
  wikifolioSetSyncState(button, state);
  setTimeout(() => wikifolioSetSyncState(button, 'idle'), state === 'done' ? 2000 : 4000);
}

export function addCustomRowHeaderWikifolio() {
  console.log("addCustomRowHeaderWikifolio");
  const table = document.querySelector(".c-r-table__tr.c-r-table__tr--head");
  if (!table) return;

  // Prevent duplicate insert
  if (document.querySelector(".custom-extra-row")) return;

  const newRow = document.createElement("tr");
  newRow.className = "custom-extra-row";   // <-- marker to detect later
  newRow.innerHTML = EXTRA_ROW_HEADERS.map((heading, index) => {
    return `<td class="c-r-table__head c-r-table__cell hidden-from-xs text-right u-min-col nowrap">
      ${heading}
    </td>`;
  }).join("");

  table.parentNode.insertBefore(newRow, table.nextSibling);
}

export async function updateCustomRowDataWikifolio(){
  console.log("updateCustomRowDataWikifolio");

  const result = await chrome.storage.local.get(['MAIN_LIST']) || [];
  if (!result.MAIN_LIST?.length) return;

  const ownRows = await accountOwnRows(result.MAIN_LIST, broker, currentAccountId);

    
  const headers  = document.querySelectorAll(".table-group-row");
  if (!headers ) return;
  
  // Only apply for first 2 headers
  const targetHeaders = Array.from(headers).slice(0, 2);
  targetHeaders.forEach(stockHeader => {
    let row = stockHeader.nextElementSibling;
    
    while (row && !row.classList.contains("table-group-row")) {
      const parentISIN = row.querySelector('.isin')?.textContent.trim();
      if (parentISIN && !row.nextElementSibling?.classList.contains("custom-extra-row")) {
        let currentRowData = ownRows.find(item => item.isin === parentISIN);
        console.log("updateCustomRowDataWikifolio parentISIN",parentISIN);

        if(currentRowData){
          const extra = document.createElement("tr");
          extra.className = "c-r-table__tr custom-extra-row";
          extra.innerHTML = EXTRA_ROW_COLUMNS.map((col, index) => {
            let colVal = updateColumnValueHtml(currentRowData, col);
            return `<td class='c-r-table__cell hidden-from-xs u-min-col nowrap ${index===0?'c-r-table__cell--first' : 'text-right'}'>${colVal}</td>`;
          }).join("");
          row.parentNode.insertBefore(extra, row.nextElementSibling);
        }
      }
      // Step over our extra row only when one exists; a blind double hop crashed on the last row and skipped positions without data.
      let next = row.nextElementSibling;
      if (next?.classList.contains("custom-extra-row")) next = next.nextElementSibling;
      row = next;
    }
  
  });
}

async function syncWikiFolioUser() {
  console.log("syncWikiFolioUser");
  
  try{
    const storedSession = await chrome.storage.local.get({ CUR_WIKIFOLIO: null });
    const storedSessionId = storedSession.CUR_WIKIFOLIO;
    
    let currentSessionId = null;
    const globalData = document.getElementById("global-data");
    if (globalData) {
      const data = JSON.parse(globalData.textContent);
      const userID =  data?.gtmData?.userId || null;
      if(userID){
        currentSessionId = userID;
      }
      
    }
    
    // Only safe while this broker has one account; see accountMayFallback. Otherwise
    // clear it, so a value left over from an earlier tick cannot stamp the wrong account.
    currentAccountId = (await accountMayFallback(broker) && storedSessionId)
      ? String(storedSessionId) : null;

    if (currentSessionId) {
      // null while a prompt is pending, which is what freezes this broker's writes.
      currentAccountId = await accountDetect(broker, String(currentSessionId));
      if (currentAccountId) await chrome.storage.local.set({ CUR_WIKIFOLIO: currentAccountId });
    } else {
      console.log('syncWikiFolioUser not found in cookies');
    }
  }catch (err) {
    console.error('syncWikiFolioUser error:', err);
  }
}

function checkIfWikiFolioStocksLoaded() {
  console.log("checkIfStocksLoaded");

  // Find all table rows that may contain positions
  const rows = document.querySelectorAll(".c-r-table tbody .c-r-table__tr");

  for (const row of rows) {
    const isinEl = row.querySelector(".isin");
    if (!isinEl) continue;

    // Trim text and normalize
    const isin = isinEl.textContent.trim();

    // ISINs are always 12 chars
    if (isin.length === 12) {
      return true;
    }
  }

  return false;
}


function loadCache() {
  return JSON.parse(localStorage.getItem("wikifolioWknCache") || "{}");
}

function saveCache(cache) {
  localStorage.setItem("wikifolioWknCache", JSON.stringify(cache));
}

async function getWKNFromDetailPage(row, type='stock') {
  let wknCache = loadCache();

  const isin = row.querySelector(".isin")?.innerText.trim();
  if (!isin) return null;

  if (wknCache[isin]) return wknCache[isin];
  
  const certificateLink = "https://markets.vontobel.com/de-de/produkte/hebel/discount-optionsscheine/"+isin;
  const link = type === 'stock' ? row.querySelector(".hbo-link.area").href : certificateLink;
  if (!link) return null;

  let wkn = '';
  try{
    const res = await fetch(link, { credentials: "include" });
    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, "text/html");
    
    if(type === 'stock'){
      const dt = [...doc.querySelectorAll("dt.c-underlying-info__label")]
        .find(el => el.innerText.trim() === "WKN");
      wkn = dt?.nextElementSibling?.innerText.trim() || null;
    }else{
      const btn = doc.querySelector('[data-testid="wkn_button"]');
      if (!btn) return null;
      const text = btn.querySelector("span")?.innerText.trim() || "";
      const parts = text.split(/\s+/).pop();
      wkn = parts.pop();
    }

  }catch(error){
    console.error("getWKNFromDetailPage == fromLink error",error);
    if(type !== 'stock'){
      wkn = isin;
    }
  }
  
  wknCache[isin] = wkn;
  saveCache(wknCache);

  return wkn;
}


//Get All Stock Data
async function getAllStockDataWikiFolio(){
    console.log("getAllStockData");
    const deposite_number = wikifolioDepotId();
    
    const rows = document.querySelectorAll(".c-r-table tbody .c-r-table__tr");
    const purchaseCache = await wikifolioLoadPurchaseCache();
    let stockData = [];
    let currentGroup = null;
    // Sequential, not forEach(async ...): that returned stockData before a single await
    // resolved, so a short or empty array was persisted and read back as "everything sold".
    for (const row of rows) {
      // Detect group row
      if (row.classList.contains("table-group-row")) {
        const text = row.innerText.trim();
        // German and International site labels.
        if (/^(Aktien|Stocks|Shares|Equities)/i.test(text)) currentGroup = "stocks";
        else if (/^(Strukturierte|Structured)/i.test(text)) currentGroup = "structuredProducts";
        continue;
      }

      // Only push real instruments (have ISIN)
      if (!row.querySelector(".isin")) continue;


      const id  = crypto.randomUUID();
      const isinEl = row.querySelector(".isin");
      const stock_name = row.querySelector("a span")?.textContent.trim() ?? "";
      
      const type = currentGroup === 'stocks' ? 'stock' : 'certificate';
      console.log("getAllStockData currentGroup",currentGroup);
      console.log("getAllStockData type",type);

      const isin = isinEl.textContent.trim();
      const wkn = await getWKNFromDetailPage(row,type);
      console.log("getAllStockData wkn",wkn);
      
      const bid = wikifolioToNumber(row.querySelector(".tick-data .nowrap")?.textContent);
      const stocks_owned = wikifolioToNumber(row.querySelector(".tick-data-quantity")?.textContent);
      const value = wikifolioToNumber(row.children[3]?.innerText);

      const perfCell = row.children[4];
      let profit_loss_price = 0;
      let profit_loss_percentage = 0;
      if (perfCell) {
        profit_loss_price = wikifolioToNumber(perfCell.querySelector(".nowrap:nth-child(1)")?.innerText);
        profit_loss_percentage = wikifolioToNumber(perfCell.querySelector(".nowrap:nth-child(2)")?.innerText?.replace('%', ''));
      }

      const total_entry_value = value - profit_loss_price;

      let buy_price = 0;
      if (stocks_owned > 0) {
        buy_price = total_entry_value / stocks_owned;
      }

      // Kaufdatum comes from the cache the Sync button fills from the trades table.
      const purchaseEntry = purchaseCache[wikifolioPurchaseKey(currentAccountId, deposite_number, isin)];

      stockData.push({
        id: id,
        broker: broker,
        account_id: currentAccountId,
        isGroup: false,
        deposite_number,
        isin : isin, 
        stock_name,
        type,
        wkn,
        bid,
        buy_price, 
        stocks_owned,
        total_entry_value,
        profit_loss_price,
        profit_loss_percentage,
        timestamp: Date.now(),
        // Spread conditionally: the merges overwrite, so a null here would erase a good value.
        ...(purchaseEntry?.purchase_date
          ? { purchase_date: purchaseEntry.purchase_date, purchase_dates: purchaseEntry.dates }
          : {})
      });

    }

    return stockData;
}

// Keeps the old Cash row when the balance isn't rendered: the replace would otherwise drop it.
function wikifolioCashRow(stored:any, depotId:any) {
  const oldCash = stored.find((item:any) => item.stock_name === 'Cash' && item.broker === broker
    && item.account_id === currentAccountId && item.deposite_number === depotId);
  const balanceText = document.querySelector('.js-cash-account-current-balance')?.textContent?.trim();
  if (!balanceText) return oldCash || null;

  return {
    id: crypto.randomUUID(),
    broker: broker,
    account_id: currentAccountId,
    deposite_number: depotId,
    stock_name: 'Cash',
    isGroup: false,
    isin : '',
    stocks_owned:0,
    buy_price:0,
    product_type: '',
    wkn: '',
    profit_loss_percentage:0,
    profit_loss_price:0,
    bid:0,
    ...(oldCash || {}),
    total_entry_value: wikifolioToNumber(balanceText.split(' ')[0]),
    timestamp: new Date().toISOString()
  };
}

//Save data on Chrome Storage for the grouped page
// strict: the Sync button needs the failure reason; the 10s tick only logs it and tries again.
export async function mainWikiFolioSaveDataToLocalStorage(strict = false){
  const skip = (reason:any) => {
    if (strict) throw new Error(reason);
    console.log(`wikifolio: ${reason}`);
    return null;
  };
  try{
    if (syncInFlight && !strict) return null;

    await syncWikiFolioUser();

    // Rows with no account_id would merge into the wrong account.
    if (!currentAccountId) return skip("account id unknown, skipping save");
    if (!checkIfWikiFolioStocksLoaded()) return skip("positions not loaded, skipping save");

    const freshWikifolio = await getAllStockDataWikiFolio();
    // Never persist an empty scrape: getLatestData would read every position as sold.
    if (!freshWikifolio.length) return skip("no rows scraped, skipping save to avoid wiping WIKIFOLIO");

    const depotId = wikifolioDepotId();
    // Pre-depot Cash rows have no deposite_number, so the depot-scoped replace would keep them as a duplicate.
    const stored = ((await chrome.storage.local.get(['WIKIFOLIO'])).WIKIFOLIO || []).filter((item:any) =>
      !(item.stock_name === 'Cash' && item.broker === broker && item.account_id === currentAccountId && !item.deposite_number));
    const cash = wikifolioCashRow(stored, depotId);
    const rows = cash ? [...freshWikifolio, cash] : freshWikifolio;
    // Depot-scoped: one user can own several wikifolios, and saving one must not wipe the others.
    await chrome.storage.local.set({ WIKIFOLIO: accountReplaceRows(stored, rows, broker, currentAccountId, depotId) });
    console.log("wikifolio: Saved Data To Local Storage!");

    updateCustomRowDataWikifolio();
    return freshWikifolio;
  }catch (err) {
    if (strict) throw err;
    console.error('mainWikiFolioSaveDataToLocalStorage error:', err);
    return null;
  }
}

/* ------------------------------------------------------------------------- *
 *  Locale: the International site uses dot decimals and MM/DD/YYYY dates
 * ------------------------------------------------------------------------- */

function wikifolioIsGerman() {
  const lang = document.documentElement.lang || window.location.pathname.split('/')[1] || '';
  return lang.toLowerCase().startsWith('de');
}

function wikifolioToNumber(text:any) {
  if (text === null || text === undefined) return 0;
  const cleaned = String(text).trim();
  if (wikifolioIsGerman()) return germanToNumer(cleaned);
  return parseFloat(cleaned.replace(/,/g, ''));
}

function wikifolioParseTradeDate(text:any) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  const us = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return parseGermanDateOnly(us ? `${us[2]}.${us[1]}.${us[3]}` : cleaned);
}

/* ------------------------------------------------------------------------- *
 *  Kaufdatum (purchase date) from the "Overview of all trades" table
 *
 *  The trades live on the public /w/<id> page (the "View" button), not on the
 *  my-wikifolios trade page that holds the positions, so they are read from a
 *  hidden same-origin iframe. content.ts skips non-top frames, so it stays inert.
 * ------------------------------------------------------------------------- */

// "Quote buy", "Limit buy", "Quote-Kauf" - but never "Verkauf".
const WIKIFOLIO_BUY_RE = /\bbuy\b|(?<!ver)kauf/i;

// The user id alone isn't enough: two wikifolios of one user can hold the same ISIN.
function wikifolioPurchaseKey(accountId:any, depotId:any, isin:any) {
  return `${accountId || ''}|${depotId || ''}|${isin}`;
}

// The wikifolio id, last segment of /my-wikifolios/trade/<id>.
function wikifolioDepotId() {
  const urlParts = window.location.pathname.split("/");
  return urlParts[urlParts.length - 1];
}

async function wikifolioLoadPurchaseCache() {
  try {
    const result = await chrome.storage.local.get([PURCHASE_CACHE_KEY]);
    return result[PURCHASE_CACHE_KEY] || {};
  } catch (err) {
    // No cache only means no purchase_date on this scrape; positions still save.
    console.error('wikifolioLoadPurchaseCache error:', err);
    return {};
  }
}

// A buy or sell changes the quantity, which is the cheapest signal that the newest buy may differ.
function wikifolioNeedsPurchaseDate(entry:any, stocks_owned:any) {
  if (!entry || entry.stocks_owned !== stocks_owned) return true;
  if (entry.purchase_date) return false;
  // Not found last time: without a delay every press would flip all MAX_TRADE_PAGES again.
  return Date.now() - new Date(entry.fetched_at).getTime() > NOT_FOUND_RETRY_MS;
}

async function wikifolioWaitFor(check:any, timeoutMs:number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(200);
  }
  return null;
}

// Only tag structure and gtm-* classes: the mui-* classes are build hashes.
function wikifolioReadTradeRows(doc:any) {
  const trades:any = [];
  for (const row of doc.querySelectorAll(`${TRADES_SELECTOR} tbody tr`)) {
    const link = row.querySelector('a.gtm-underlying-history-link');
    const isin = link?.getAttribute('href')?.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/i)?.[0]?.toUpperCase();
    const kind = link?.nextElementSibling?.querySelector('span')?.textContent?.trim() || '';
    const date = wikifolioParseTradeDate(row.querySelector('td:nth-child(2) span')?.textContent);
    if (isin && date) trades.push({ isin, kind, date });
  }
  return trades;
}

function wikifolioTradesSignature(doc:any) {
  return doc.querySelector(`${TRADES_SELECTOR} tbody`)?.textContent || '';
}

async function wikifolioOpenTradesFrame() {
  const viewHref = document.querySelector('.c-wf-trade__header-container a[href*="/w/"]')?.getAttribute('href');
  if (!viewHref) throw new Error('wikifolio View link not found');

  const frame = document.createElement('iframe');
  // Full size but transparent: a display:none frame never lazy-renders the trades section.
  Object.assign(frame.style, {
    position: 'fixed', right: '0', bottom: '0', width: '1280px', height: '900px',
    opacity: '0', pointerEvents: 'none', zIndex: '-1', border: '0',
  });
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.src = `${new URL(viewHref, window.location.href).href.split('#')[0]}#/trades`;
  document.body.appendChild(frame);

  const doc = await wikifolioWaitFor(() => {
    const frameDoc = frame.contentDocument;
    const section = frameDoc?.querySelector(TRADES_SELECTOR);
    if (!section) return null;
    section.scrollIntoView();
    return section.querySelector('table') ? frameDoc : null;
  }, IFRAME_WAIT_MS);

  if (!doc) {
    frame.remove();
    throw new Error('wikifolio trades table did not load');
  }
  return { doc, close: () => frame.remove() };
}

// Newest page first, flipping "Older" until every wanted ISIN has a buy or the history ends.
async function wikifolioFetchBuyDates(isins:any, onProgress:any) {
  const wanted = new Set(isins);
  const buys:any = {};
  const frame = await wikifolioOpenTradesFrame();
  try {
    for (let page = 1; ; page++) {
      onProgress(page);
      for (const trade of wikifolioReadTradeRows(frame.doc)) {
        if (!wanted.has(trade.isin) || !WIKIFOLIO_BUY_RE.test(trade.kind)) continue;
        (buys[trade.isin] ||= []).push(trade.date);
      }
      if ([...wanted].every((isin:any) => buys[isin])) break;
      if (page >= MAX_TRADE_PAGES) break;

      const older = frame.doc.querySelector(`${TRADES_SELECTOR} button.gtm-older-history`);
      if (!older || older.disabled) break;

      const before = wikifolioTradesSignature(frame.doc);
      older.click();
      const changed = await wikifolioWaitFor(() => {
        const now = wikifolioTradesSignature(frame.doc);
        return now && now !== before;
      }, TRADES_WAIT_MS);
      if (!changed) break;
      // The new page can render in steps; a short settle avoids reading half a table.
      await sleep(300);
    }
  } finally {
    frame.close();
  }
  return buys;
}

// Returns how many positions got a purchase date, so the caller knows whether to re-save.
async function wikifolioSyncPurchaseDates(positions:any, onProgress:any) {
  const cache = await wikifolioLoadPurchaseCache();
  const needed = (positions || []).filter((p:any) =>
    p.isin && wikifolioNeedsPurchaseDate(cache[wikifolioPurchaseKey(p.account_id, p.deposite_number, p.isin)], p.stocks_owned));
  console.log("wikifolioSyncPurchaseDates needed", needed.length);
  if (!needed.length) return 0;

  const buys = await wikifolioFetchBuyDates(needed.map((p:any) => p.isin), onProgress);

  const updates:any = {};
  let found = 0;
  for (const p of needed) {
    const key = wikifolioPurchaseKey(p.account_id, p.deposite_number, p.isin);
    const dates = [...new Set(buys[p.isin] || [])].sort().reverse();
    if (dates.length) found++;
    // Not found (older than the pages read, or never bought) still gets an entry, so the retry delay applies;
    // a previously found date is kept rather than blanked.
    updates[key] = {
      purchase_date: dates[0] || cache[key]?.purchase_date || null,
      dates: dates.length ? dates : (cache[key]?.dates || []),
      stocks_owned: p.stocks_owned,
      fetched_at: new Date().toISOString(),
    };
  }

  // Read-merge: another tab may have written ISINs this run never touched.
  const latest = await wikifolioLoadPurchaseCache();
  await chrome.storage.local.set({ [PURCHASE_CACHE_KEY]: { ...latest, ...updates } });
  return found;
}
