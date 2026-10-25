/*
    These functions can only be applied to KontoFlatex website
    as it depends on a specific HTML structure.

    PART ONE — the visible depot page
      §5  injected DOM (extra header row + extra data row per position)
      §6  page-state predicates
      §7  session / account sync
      §8  scraping & persistence  -> chrome.storage.local.KONTO_FLATEX

    PART TWO — the Kaufdatum sync run (see the banner further down)
      §9 cache · §10 DOM primitives · §11 Kaufdaten table · §12 detail tabs
      §13 detail open · §14 close & restore · §15 abort & lock
      §16 orchestrator · §17 iframe mode · §18 entry points · §19 debug helpers

    Public API is small on purpose: everything not consumed by another file is
    module-private, because WXT turns every export into a project-wide global.
*/
import { germanToNumer, parseGermanDateOnly, todayIso, sleep } from "./helper";

const broker = "Flatex";

// getAllStockData() is synchronous, so the id has to be resolved ahead of it, not awaited inside.
let currentAccountId:any = null;

// Split from syncFlatexUser so the once-a-day probe guard never costs us the identity.
async function flatexResolveAccountId() {
  try {
    // Clear, not keep: a value left over from an earlier tick is just as wrong a
    // guess as the stored one, and the save guard relies on null to skip.
    if (!await accountMayFallback(broker)) { currentAccountId = null; return null; }

    const stored = await chrome.storage.local.get({ CUR_FLATEXID: null });
    currentAccountId = stored.CUR_FLATEXID ? String(stored.CUR_FLATEXID) : null;
  } catch (err) {
    // Last known id stays in the module snapshot; a read failure must not blank it.
    console.error('flatexResolveAccountId error:', err);
  }
  return currentAccountId;
}

// Getting the ISIN of a specific stock.
// "0" on failure is a sentinel createEmptyRowsToFill turns into a `.row0` class — an
// empty string there would build a bare `.row` that matches every injected row.
function getIdFromRow(row:any) {
  const idText = row.querySelector(".C0");
  if (!idText) {
    console.log("Couldn't scrape the Stock Id from row");
    return "0";
  }
  // textContent fallback: innerText is layout-dependent and returns '' inside a
  // hidden subtree, which is exactly the off-screen sync iframe.
  const text = (idText.innerText || idText.textContent || "").trim();
  return text.split(" ")[0] || "0";
}

// Creating empty rows to fill
export function createEmptyRowsToFill() {
  console.log("createEmptyRowsToFill");
  
  const rowsThatNeedExtraData = document.querySelectorAll(
    ".I2.Last.DetailsAvailable:not(.hasExtraData):not(.extraData)"
  );
  for (let x = 0; x < rowsThatNeedExtraData.length; x++) {
    rowsThatNeedExtraData[x]!.classList.add("hasExtraData");
    const rowElement = document.createElement("tr");
    setAttributesForRowWrapper(rowElement);
    rowElement.classList.add("row" + getIdFromRow(rowsThatNeedExtraData[x]));
    createRowHTMLStructure(rowElement);
    insertAfter(rowsThatNeedExtraData[x], rowElement);
  }
  return true;
}

// Adding a third row to the Header with Column Names
export function addThirdRowHeader(...inputs:any[]) {
  console.log("addThirdRowHeader 1");
  if (document.querySelector(".extensionRow")) return false;
  console.log("addThirdRowHeader 2");
  
  const classicViewDataTable = document.querySelector(".DepositStatementTableWidgetArea");
  if (!classicViewDataTable) return false;
  const tableHead = classicViewDataTable.querySelector("thead");

  if (!tableHead) return false;

  const headI2 = tableHead.querySelector(".I2");
  if (headI2) headI2.className = "I2";

  const row = document.createElement("tr");
  row.className = "I2 Last I3 extensionRow";
  row.innerHTML = inputs.map((input, index) => {
    const style = index !== 0 ? 'style="text-align:right"' : '';
    return `<th class="C${index}" ${style}><a class="TextLink">${input}</a></th>`;
  }).join("");
  

  tableHead.appendChild(row);
  return true;
}

// No copied id or inline flatex handlers: they duplicated the real row's id and fired webcore with a stale widget id.
function setAttributesForRowWrapper(rowElement:any) {
  rowElement.setAttribute("class", "I2 Last Even extraData DetailsAvailable detailsNotAvailable ariba");
}

// The columns that are inside the container
function createRowHTMLStructure(rowElement:any) {
  rowElement.innerHTML = `${FLATEX_EXTRA_ROW_COLUMNS.map(cls => `<td class="${cls} ${cls=='type' ? 'C0' : 'C1'}"></td>`).join('')}`;
}


export async function flatexUpdateCustomRowData() {
    try {
    const extraDataRow = document.querySelector(".extraData");
    
    if (!extraDataRow) {
      console.log("No rows available, No Data Needed To Fetch");
      return false;
    }
    
    const result = await chrome.storage.local.get(['MAIN_LIST']);
    const data = await accountOwnRows(result.MAIN_LIST || [], broker, currentAccountId);
    data.forEach((currentStock) => {
      const { isin } = currentStock;
      // Cash has isin '', and ".row" alone matches every injected row.
      if (!isin || currentStock.stock_name === 'Cash') return;
      const currentStockRowElement = document.querySelector(".row" + isin);
  
      if (!currentStockRowElement) {
        console.log("Couldn't find row to update data for...");
        return;
      }
      currentStockRowElement.classList.remove("detailsNotAvailable");
      updateColumns(currentStockRowElement, currentStock);
    });
  
    document.querySelectorAll(".detailsNotAvailable").forEach((row) => {
      row.classList.remove("detailsNotAvailable");
      updateColumns(row);
    });
  
    return true;
    } catch (error) {
      /* display-only refresh: the next tick retries */
      console.error('flatexUpdateCustomRowData error:', error);
    }
}

// Example: call flatex overview API
async function fetchOverview(tokenId:any, windowId:any) {
  const url = DEPOT_URL;
  const formData = new FormData();
  formData.append("selectedViewWidget.overviewEntryBlockSelectionWidget.selecteditemindex","3");
  formData.append("selectedViewWidget.cbxTableType.selecteditemindex","1");
  formData.append("secondLevelWidgetList[0].secondLevelContentWidget.categorySelectionWidget.selecteditemindex","0");
  formData.append("headerAreaWidget.settingsButtonWidget.btnOpenUserSettings.clicked","true");
  
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    headers: {
      "accept": "application/json",
      "x-ajax": "true",
      "x-requested-with": "XMLHttpRequest",
      "x-tokenid":  tokenId,
      "x-windowid":  windowId,
    },
    credentials: "include"
  });

  if (!res.ok) {
    console.error("fetchOverview Request failed", res.status);
    return;
  }

  const text = await res.text(); // can also use .json() if JSON
  
  const match = text.match(/Kundennummer\s+(\d+)/);
  const accountNumber = match ? match[1] : null;


  return accountNumber;
}


// Older versions copied the bank session token into flatex's localStorage; remove it once, never touch it again.
async function flatexPurgeLegacyToken() {
  const { flatexLegacyTokenPurged } = await chrome.storage.local.get({ flatexLegacyTokenPurged: false });
  if (flatexLegacyTokenPurged) return;
  localStorage.removeItem('windowId');
  localStorage.removeItem('tokenId');
  await chrome.storage.local.set({ flatexLegacyTokenPurged: true });
}

// Only a hash is persisted: the raw x-tokenid is a live bank session credential and would land in backups.
async function flatexTokenHash(tokenId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tokenId));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

const FLATEX_PROBE_RETRY_MS = 10 * 60 * 1000;

// A failed probe was re-POSTed to flatex every 10 s tick; wait before retrying the same session.
export function flatexProbeBackedOff(session:any, tokenHash:any, now:number) {
  return !!tokenHash && session.flatexProbedTokenHash === tokenHash && !session.flatexProbedAccount
    && now - (session.flatexProbeFailedAt || 0) < FLATEX_PROBE_RETRY_MS;
}

async function syncFlatexUser() {
  console.log("syncFlatexUser");
  const today = todayIso();
  
  try{

    const flatexUserSession = await chrome.storage.local.get({
      flatexUserSync: null, flatexProbedTokenHash: null, flatexProbedAccount: null, flatexProbeFailedAt: 0 });
    const lastSync = flatexUserSession.flatexUserSync;
    const lastSyncDay = lastSync ? lastSync.slice(0, 10) : null;

    let currentSessionId:any = null;
    const scripts = Array.from(document.querySelectorAll("script"));
    const matchScript = scripts.find(s => (s.textContent || "").includes("setCurrentWindowId"));
    if (matchScript) {
      let windowId = matchScript.textContent!.match(/setCurrentWindowId\s*\(\s*["']([^"']+)["']\s*\)/)?.[1] || null;
      let tokenId = matchScript.textContent!.match(/setTokenId\s*\(\s*["']([^"']+)["']\s*\)/)?.[1] || null;
      await flatexPurgeLegacyToken();
      const tokenHash = tokenId ? await flatexTokenHash(tokenId) : null;

      // Throttle only the network probe, never the detection below. Returning here
      // left currentAccountId on the PREVIOUS account, so a second login's positions
      // were stamped with the first account's id and replaced its rows.
      const sameSession = lastSyncDay === today
        && tokenHash && flatexUserSession.flatexProbedTokenHash === tokenHash
        && flatexUserSession.flatexProbedAccount;

      if (sameSession) {
        currentSessionId = flatexUserSession.flatexProbedAccount;
      } else if (flatexProbeBackedOff(flatexUserSession, tokenHash, Date.now())) {
        console.log('syncFlatexUser probe backed off');
      } else if(windowId && tokenId){
        currentSessionId = await fetchOverview(tokenId, windowId);
        // Cache the result with its token so an accepted account is picked up on the
        // very next tick instead of waiting for tomorrow's probe.
        await chrome.storage.local.set({
          flatexUserSync: today, flatexProbedTokenHash: tokenHash, flatexProbedAccount: currentSessionId,
          flatexProbeFailedAt: currentSessionId ? 0 : Date.now() });
        await chrome.storage.local.remove('flatexProbedToken');
      }
      
    }
    
    // Adoption is accountDetect's job now; writing the id here persisted accounts
    // the user had not accepted yet.

    if (currentSessionId) {
      // null while a prompt is pending, which is what freezes this broker's writes.
      currentAccountId = await accountDetect(broker, String(currentSessionId));
      if (currentAccountId) await chrome.storage.local.set({ CUR_FLATEXID: currentAccountId });
      // Purchase dates are cleared on Replace, not on detection: the other account still needs them.
    } else {
      console.log('syncFlatexUser not found in cookies');
    }
  }catch (err) {
    /* the next 10 s tick re-probes; the save guard skips while the id is unknown */
    console.error('syncFlatexUser error:', err);
  }
}


// Checks whether the user is on stocks page data can be stored locally & accurately
function isOnStocksPage() {
  const stockLink = document.getElementById(LEGACY_DEPOT_TAB_ID);
  return !!stockLink && stockLink.className.includes("Selected");
}

function isOnDashboardPage(){
  const stockLink = document.querySelector(".DepositAndBalanceOverviewWidget .ValueRows");
  return !!stockLink;
}


// Save data on Chrome Storage for the grouped page
export async function flatexSaveDataToLocalStorage() {
  console.log("flatexSaveDataToLocalStorage")
  
  try{
    // Before the probe: the daily guard must never leave rows unattributed.
    await flatexResolveAccountId();
    await syncFlatexUser();

    // Pick up anything the purchase-date sync run wrote since the last cycle.
    await flatexRefreshPurchaseDateCache();

    // Rows with no account_id would merge into the wrong account; one 10s tick is cheaper.
    if (!currentAccountId) {
      console.log("flatex: account id unknown, skipping save");
      return false;
    }

    // Snapshot: a later tick nulls currentAccountId while it re-resolves, and the awaits
    // below mean this tick would otherwise scrape under whatever that left behind.
    const saveAccountId = currentAccountId;

    if (isOnDashboardPage()) {
      console.log("flatexSaveDataToLocalStorage isOnDashboardPage");
      const values = document.querySelectorAll(".DepositAndBalanceOverviewWidget .ValueRows .Value");
      const accountBalance = values.length >= 2
        ? germanToNumer(values[1]?.textContent?.trim().split(' ')[0] || '') : NaN;
      // A half-rendered widget used to overwrite the stored cash with 0 or null.
      if (!Number.isFinite(accountBalance)) {
        console.log("flatex: cash not readable, skipping save");
        return false;
      }

      const result = await chrome.storage.local.get(['KONTO_FLATEX']);
      const currentData = result.KONTO_FLATEX || [];

      const now = new Date();
      let currentTimestamp = now.toISOString();

      const cashIndex = currentData.findIndex((item:any) => item.stock_name === 'Cash'
        && item.account_id === saveAccountId);
      if (cashIndex !== -1) {
        currentData[cashIndex].total_entry_value = accountBalance;
        currentData[cashIndex].timestamp = currentTimestamp;
      } else {
        currentData.push({
          id: crypto.randomUUID(),
          broker: broker,
          account_id: saveAccountId,
          stock_name: 'Cash',
          total_entry_value: accountBalance,
          isGroup: false,
          isin : '', 
          stocks_owned:0, 
          buy_price:0, 
          product_type: '', 
          wkn: '', 
          profit_loss_percentage:0, 
          profit_loss_price:0,
          bid:0,
          timestamp:currentTimestamp
        });
      }
      
      await chrome.storage.local.set({ KONTO_FLATEX: currentData });
      return false;
    }

    if (isOnStocksPage()) {
      console.log("flatexSaveDataToLocalStorage isOnStocksPage");

      const stockData = getAllStockData(saveAccountId);
      // Never persist an empty list: getAllStockData() also returns [] while a
      // detail view is open or the table hasn't rendered yet, and getLatestData()
      // would read every missing position as "sold" and drop the whole portfolio.
      if (!stockData.length) {
        console.log("flatex: no rows scraped, skipping save to avoid wiping KONTO_FLATEX");
        return false;
      }

      const storedFlatex = await chrome.storage.local.get(['KONTO_FLATEX']);
      await chrome.storage.local.set({
        [`KONTO_FLATEX`]: accountReplaceRows(storedFlatex.KONTO_FLATEX, stockData, broker, saveAccountId)
      });
      console.log("flatex: Saved Data To Local Storage!");
      await flatexUpdateCustomRowData();
      return false;
    }
  }catch (err) {
    /* a failed tick keeps the stored rows; the next tick retries */
    console.error('flatexSaveDataToLocalStorage error:', err);
  }
}

function parseStockTimestamp(input:any) {
  
  if(input=="-"){ return; }
  
  if (!input || typeof input !== 'string') {
    console.log('parseStockTimestamp Invalid input: must be a non-empty string');
  }

  try{

    const now = new Date();
    let resultDate;

    // Handle HH:MM format (today's date)
    if (/^\d{2}:\d{2}$/.test(input)) {
      const [hour, minute] = input.split(':').map(Number);
      if (hour > 23 || minute > 59) {
        throw new Error('Invalid time: hours must be 0-23 and minutes 0-59');
      }
      resultDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour,
        minute
      );
    }else if (/^Gestern\s*\/\s*\d{2}:\d{2}$/i.test(input)) {
      // Handle "Gestern / HH:MM" format (yesterday's date)
      const [, time] = input.split('/');
      const [hour, minute] = time.trim().split(':').map(Number);
      if (hour > 23 || minute > 59) {
        console.log('parseStockTimestamp Invalid time: hours must be 0-23 and minutes 0-59');
      }
      
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1); // Use local date, not UTC
      resultDate = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
        hour,
        minute
      ); 
    }else if (/^\d{2}\.\d{2}\.\d{2}\s*\/\s*\d{2}:\d{2}$/.test(input)) {
      // Handle DD.MM.YY / HH:MM format
      const [dateStr, timeStr] = input.split('/');
      const [day, month, year] = dateStr.trim().split('.').map(Number);
      const [hour, minute] = timeStr.trim().split(':').map(Number);
      
      if (month < 1 || month > 12) throw new Error('Invalid month: must be 1-12');
      if (day < 1 || day > 31) throw new Error('Invalid day: must be 1-31');
      if (hour > 23 || minute > 59) {
        throw new Error('Invalid time: hours must be 0-23 and minutes 0-59');
      }

      const fullYear = year < 50 ? 2000 + year : 1900 + year;
      resultDate = new Date(fullYear, month - 1, day, hour, minute);
      
      // Validate the date was parsed correctly (e.g., catches Feb 30)
      if (resultDate.getFullYear() !== fullYear ||
        resultDate.getMonth() !== month - 1 ||
        resultDate.getDate() !== day
      ) {
        console.log('parseStockTimestamp Invalid date: date does not exist');
      }
    } else {
      console.log('parseStockTimestamp Invalid format: unrecognized timestamp format');
    }

    if (!resultDate) return;
    // Format as ISO-8601 string
    const pad = (n:any) => String(n).padStart(2, '0');
    return `${resultDate.getFullYear()}-${pad(resultDate.getMonth() + 1)}-${pad(resultDate.getDate())}T${pad(resultDate.getHours())}:${pad(resultDate.getMinutes())}:${pad(resultDate.getSeconds())}`;

  } catch (err) {
    console.error('parseStockTimestamp error:', err);
    return;
  }
}


// Get All Stock Rows
function getAllStockData(accountId:any) {
  const typetRowOfAllStocks = document.querySelectorAll(".I0.DetailsAvailable");
  const firstRowOfAllStocks = document.querySelectorAll(".I1.DetailsAvailable");
  const secondRowOfAllStocks = document.querySelectorAll(".I2.DetailsAvailable:not(.ariba)");
  
  if (!firstRowOfAllStocks.length || firstRowOfAllStocks.length !== secondRowOfAllStocks.length) {
    return [];
  }

  // Read once: this stays synchronous, so it uses the snapshot refreshed by
  // flatexSaveDataToLocalStorage() rather than awaiting storage here.
  const purchaseDateCache = flatexGetPurchaseDateCacheSnapshot();

  return Array.from(firstRowOfAllStocks, (row, x) => {
    const id  = crypto.randomUUID();
    const isGroup  = false;

    const stock_name = row.querySelector(".C0")!.textContent;
    const isin = getIdFromRow(secondRowOfAllStocks[x]);
    const wkn = secondRowOfAllStocks[x]!.textContent.split('(')[1]?.split(')')[0]?.trim();
    
    //Type
    let type = typetRowOfAllStocks[x]!.querySelector(".C0 .PaperKindName")!.textContent.trim();
    if(type=='Aktie'){
      type = 'stock';
    }else if(type=='Zertifikat'){
      type = 'certificate';
    }

    let stocks_owned:any = row.querySelector(".C2")!.textContent.trim().split(' ')[0];
    stocks_owned = germanToNumer(stocks_owned);

    let bid:any = secondRowOfAllStocks[x]!.querySelector(".C2")!.textContent.trim();
    bid = bid.substring(0, bid.length - 1).trim();
    bid = germanToNumer(bid);

    let buy_price:any = secondRowOfAllStocks[x]!.querySelector(".C4")!.textContent.trim();
    buy_price = buy_price.substring(0, buy_price.length - 1).trim();
    buy_price = germanToNumer(buy_price);

    
    let total_entry_value:any = row.querySelector(".C4")!.textContent.trim().split(' ')[0];
    total_entry_value = germanToNumer(total_entry_value);

    let profit_loss_price:any = secondRowOfAllStocks[x]!.querySelector(".C5")!.textContent.trim().split(' ')[0];
    profit_loss_price = germanToNumer(profit_loss_price);
    
    let profit_loss_percentage:any = row.querySelector(".C5")!.textContent.trim();
    profit_loss_percentage = profit_loss_percentage.replace('%', '');
    profit_loss_percentage = germanToNumer(profit_loss_percentage);
    
    let timestamp = secondRowOfAllStocks[x]!.querySelector(".C1")!.textContent?.trim();
    let page_timestamp = parseStockTimestamp(timestamp);

    // Kaufdatum comes from the cache the sync run fills, not from this table.
    const purchaseEntry = purchaseDateCache[flatexPurchaseKey(isin, accountId)];

    return { id, isGroup, broker, account_id: accountId, stock_name, isin, stocks_owned, buy_price,
      type, wkn, total_entry_value, profit_loss_percentage, profit_loss_price,
      bid, page_bid:bid,
      timestamp:page_timestamp, page_timestamp,
      // Spread conditionally: the merges overwrite, so a null here would erase a good value.
      ...(purchaseEntry?.purchase_date
        ? { purchase_date: purchaseEntry.purchase_date, purchase_dates: purchaseEntry.dates }
        : {})
    };

  });
}


/* =========================================================================== *
 *  PART TWO — Kaufdatum (purchase date) sync run
 *
 *  Merged in from the former utils/kontoFlatex-purchase-utils.ts. The purchase
 *  date is not in the depot table: it lives in the Kaufdaten table inside the
 *  Portfolio tab of a position detail view, reachable only by clicking the row.
 *
 *  §9  cache          §10 DOM primitives   §11 Kaufdaten table   §12 detail tabs
 *  §13 detail open    §14 close & restore  §15 abort & lock      §16 orchestrator
 *  §17 iframe mode    §18 entry points     §19 debug helpers
 * =========================================================================== */


const PURCHASE_CACHE_KEY = 'FLATEX_PURCHASE_DATES';
const SYNC_LOCK_KEY = 'FLATEX_SYNC_LOCK';
const IFRAME_SUPPORT_KEY = 'FLATEX_IFRAME_SUPPORTED';
const TAB_HINT_KEY = 'FLATEX_DETAIL_TAB_HINT';
const DIAG_KEY = 'FLATEX_SYNC_DIAG';

const DEPOT_URL = 'https://konto.flatex.de/next-desktop/overviewFormAction.do';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// A stale lock (crashed tab, closed mid-run) must not block syncing forever.
const LOCK_STALE_MS = 3 * 60 * 1000;

const DETAIL_OPEN_TIMEOUT_MS = 8000;
const TAB_PROBE_TIMEOUT_MS = 4000;
const MAX_TAB_PROBES = 3;
const CLOSE_TIMEOUT_MS = 6000;
const LIST_TIMEOUT_MS = 12000;
const IFRAME_LOAD_TIMEOUT_MS = 15000;

// Automatic runs are rare by design; the explicit button bypasses this.
const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

// Kaufdaten lives only in the Portfolio tab; anchor on the widget path, wrappers vary.
const DETAIL_TAB_SELECTOR = '.BlockSelectionItem[data-widgetname*="detailsBlockSelectionWidget"]';
const DETAIL_TAB_FALLBACK_SELECTOR =
  '.DetailsCategorySelection .BlockSelectionItemContainer .BlockSelectionItem';

// Confirmed against the live German UI: the tab is literally "Portfolio".
const PORTFOLIO_TAB_RE = /(bestand|portfolio|position|holding)/i;
// Tabs that never hold Kaufdaten, probed last. Live labels: Allgemeine Daten/Chart Detail/News.
const KNOWN_WRONG_TAB_RE =
  /(chart|news|nachricht|stammdaten|allgemein|general|handelspl|trading|platform|kurse|umsatz|order)/i;

const TOP_NAV_SELECTOR = '.BlockSelectionItemContainer .BlockSelectionItem';
const DEPOT_TAB_RE = /(depotbestand|depot|bestand|portfolio|holding)/i;
// Live markup: items[0] Dashboard, items[1] Alle, items[3] Derivate; the old items[3] hint picked Derivate.
const DEPOT_TAB_WIDGET_HINT = 'overviewEntryBlockSelectionWidget.items[1]';
const DEPOT_TAB_LABEL = 'alle';
const DASHBOARD_VALUES_SELECTOR = '.DepositAndBalanceOverviewWidget .ValueRows .Value';
// Historical hardcode, kept only as a tiebreaker — webcore ids are not contractual.
const LEGACY_DEPOT_TAB_ID = '__1551384479';

const CLOSE_SELECTORS = [
  '[data-widgetname$=".btnClose"]',
  '.HeaderButtonArea a.BtnClose',
  '.HeaderButtonArea a[role="button"][aria-label]',
];

const DEPOT_ROW_SELECTOR = '.I2.DetailsAvailable:not(.ariba)';

// no_table (bond/fund) is settled; wrong_tab means flatex changed shape, so retry it sooner.
const RETRY_MS_BY_STATUS:any = {
  no_table: 24 * HOUR,
  no_detail: 1 * HOUR,
  wrong_tab: 1 * HOUR,
  error: 1 * HOUR,
};

// A dead position must not be re-clicked forever.
const MAX_FAILED_ATTEMPTS = 3;

const flatexDebugLog = (...args:any[]) => {
  try {
    if (localStorage.getItem('qxSyncDebug')) console.log('[qx:kaufdaten]', ...args);
  } catch {
    /* localStorage can throw in some contexts; debug logging is never load-bearing */
  }
};

function debugEnabled() {
  try {
    return !!localStorage.getItem('qxSyncDebug');
  } catch {
    /* storage blocked: debug stays off */
    return false;
  }
}

/* ------------------------------------------------------------------------- *
 *  Cache
 * ------------------------------------------------------------------------- */

// Module snapshot so the synchronous getAllStockData() can read it without becoming async.
let purchaseDateCache:any = {};

// Two flatex depots can hold one ISIN with different tranches, so the account belongs in the key.
// The id is passed in, never read live: the 10s scrape nulls currentAccountId while it
// re-resolves, and a run that keyed on that would file its Kaufdaten under no account.
function flatexPurchaseKey(isin:any, accountId:any) {
  return `${accountId || ''}|${isin}`;
}

function flatexGetPurchaseDateCacheSnapshot() {
  return purchaseDateCache;
}

// Pre-2.9.2 entries are keyed by bare ISIN. Adopt them only while one account exists;
// with two, there is no way to tell whose tranches they were.
async function flatexMigratePurchaseKeys(stored:any) {
  const legacy = Object.keys(stored).filter(key => !key.includes('|'));
  if (!legacy.length) return stored;

  // Unknown id is not "several accounts": the next flush persists whatever this returns,
  // so deleting here would throw away a single-account user's dates for good.
  if (!currentAccountId) return stored;

  const adopt = await accountMayFallback(broker);
  for (const isin of legacy) {
    if (adopt) stored[flatexPurchaseKey(isin, currentAccountId)] = stored[isin];
    delete stored[isin];
  }
  console.log("flatexMigratePurchaseKeys", legacy.length, adopt ? 'adopted' : 'dropped');

  // Persist here, not via the flush: a fully synced user never marks a key dirty, so the
  // flush never runs and this would re-migrate on every 10s tick forever.
  try {
    await chrome.storage.local.set({ [PURCHASE_CACHE_KEY]: stored });
  } catch (err) {
    // In-memory keys are already migrated, so this run still reads the right entries.
    console.error('flatexMigratePurchaseKeys error:', err);
  }
  return stored;
}

async function flatexLoadPurchaseDateCache() {
  try {
    const result = await chrome.storage.local.get([PURCHASE_CACHE_KEY]);
    return await flatexMigratePurchaseKeys(result[PURCHASE_CACHE_KEY] || {});
  } catch (err) {
    console.error('flatexLoadPurchaseDateCache error:', err);
    return {};
  }
}

// Keeps dirty entries: a blind overwrite would make the pending flush persist a stale value.
async function flatexRefreshPurchaseDateCache() {
  const fresh = await flatexLoadPurchaseDateCache();
  for (const key of dirtyKeys) fresh[key] = purchaseDateCache[key];
  purchaseDateCache = fresh;
  return purchaseDateCache;
}

// In-memory write; the storage flush is debounced. finally and pagehide both flush before exit.
const dirtyKeys:any = new Set();
let flushTimer:any;
let flushInFlight:any = null;

function flatexSavePurchaseDateEntry(isin:any, entry:any, accountId:any) {
  if (!isin || !accountId) return;
  const key = flatexPurchaseKey(isin, accountId);
  purchaseDateCache[key] = entry;
  dirtyKeys.add(key);
  if (flushTimer === undefined) {
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      void flatexFlushPurchaseCache();
    }, 400);
  }
}

async function flatexFlushPurchaseCache() {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (!dirtyKeys.size) return;
  if (flushInFlight) {
    await flushInFlight;
    if (!dirtyKeys.size) return;
  }

  const keys:any = Array.from(dirtyKeys);
  dirtyKeys.clear();

  flushInFlight = (async () => {
    // Read-merge: another tab may have written ISINs this run never touched.
    const stored = await flatexLoadPurchaseDateCache();
    for (const key of keys) stored[key] = purchaseDateCache[key];
    await chrome.storage.local.set({ [PURCHASE_CACHE_KEY]: stored });
    purchaseDateCache = stored;
  })()
    .catch(err => {
      console.error('flatexFlushPurchaseCache error:', err);
      keys.forEach((k:any) => dirtyKeys.add(k)); // retry on the next flush
    })
    .finally(() => {
      flushInFlight = null;
    });

  await flushInFlight;
}

async function flatexClearPurchaseDateCache() {
  try {
    await chrome.storage.local.remove(PURCHASE_CACHE_KEY);
  } catch (err) {
    console.error('flatexClearPurchaseDateCache error:', err);
  }
  purchaseDateCache = {};
}

// Newest-first, so purchase_date is the newest; all dates kept so the rule can change later.
function flatexBuildPurchaseEntry(
  tranches:any,
  stocks_owned: number
) {
  const sorted = (tranches || [])
    .filter((t:any) => t && t.date)
    .sort((a:any, b:any) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const dates = sorted.map((t:any) => t.date);

  return {
    purchase_date: dates[0] || null,
    dates,
    tranches: sorted,
    stocks_owned,
    fetched_at: new Date().toISOString(),
    status: dates.length ? 'ok' : 'no_table',
    attempts: 0,
  };
}

// Records a failed attempt without discarding a previously good value.
function flatexBuildFailedEntry(previousEntry:any, status:any, stocks_owned:any) {
  return {
    purchase_date: null,
    dates: [],
    tranches: [],
    ...(previousEntry || {}),
    stocks_owned,
    fetched_at: new Date().toISOString(),
    status,
    attempts: (previousEntry?.attempts || 0) + 1,
  };
}

// Decides whether a position still needs syncing.
function flatexNeedsPurchaseDate(
  cacheEntry:any,
  stocks_owned: number,
  force = false
) {
  if (!cacheEntry) return true;

  if (cacheEntry.status === 'ok' && cacheEntry.purchase_date) {
    // A Zukauf changes the newest date; quantity is the cheapest signal (a sell trips it too).
    return cacheEntry.stocks_owned !== stocks_owned;
  }

  // Negative cache: bounded retries, with a per-status window.
  if (force) return true;
  if ((cacheEntry.attempts || 0) >= MAX_FAILED_ATTEMPTS) return false;

  const fetchedAt = cacheEntry.fetched_at ? new Date(cacheEntry.fetched_at).getTime() : 0;
  const retryAfter = RETRY_MS_BY_STATUS[cacheEntry.status] ?? 24 * HOUR;
  return !fetchedAt || Date.now() - fetchedAt > retryAfter;
}

/* ------------------------------------------------------------------------- *
 *  DOM primitives
 * ------------------------------------------------------------------------- */

export const flatexSyncState:any = {
  inFlight: false,
  starting: false,
  // Only while the VISIBLE page is driven — iframe runs let the periodic scrape keep running.
  inlineInFlight: false,
  abortRequested: false,
  // 'user' | 'cancel' | null. Only 'user' earns "leave the page alone"; the rest still restore.
  abortReason: null,
};

function cellText(row:any, selector:any) {
  return (row.querySelector(selector)?.textContent || '').replace(/ /g, ' ').trim();
}

// Auto-translate wraps labels in <font>, and the label may be German or the viewer's language.
function normLabel(el:any) {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Strip the currency marker first: germanToNumer() calls .replace() unguarded.
function cellNumber(text:any) {
  const cleaned = text.replace(/€/g, '').replace(/[A-Za-z]/g, '').trim();
  if (!cleaned) return NaN;
  return germanToNumer(cleaned);
}

// Null on timeout, not a reject — a missing table is expected. Observer-driven, polling as net.
function flatexWaitFor(
  predicate:any,
  {
    timeoutMs = DETAIL_OPEN_TIMEOUT_MS,
    pollMs = 500,
    ctx,
  }:any = {}
) {
  return new Promise<any>(resolve => {
    let done = false;
    let observer:any = null;
    let observedDoc:any = null;
    let scheduled = false;

    const finish = (value:any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      try {
        observer?.disconnect();
      } catch {
        /* document may already be gone */
      }
      resolve(value);
    };

    const check = () => {
      if (done) return;
      let value:any = null;
      try {
        value = predicate();
      } catch {
        /* DOM mid-swap: treat as not ready yet and poll again */
        value = null;
      }
      if (value) finish(value);
    };

    // One re-render emits hundreds of records; run the predicate once per microtask batch.
    const onMutate = () => {
      if (scheduled || done) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        check();
      });
    };

    // A frame reload swaps the Document, killing the observer — re-target every poll tick.
    const retarget = () => {
      const doc = ctx?.doc ?? null;
      if (!doc || doc === observedDoc || !doc.documentElement) return;
      try {
        observer?.disconnect();
        const Ctor = (doc.defaultView)?.MutationObserver || MutationObserver;
        observer = new Ctor(onMutate);
        observer!.observe(doc.documentElement, {
          childList: true,
          subtree: true,
          // freshTable() compares text signatures; an in-place update emits only characterData.
          characterData: true,
          // Never unfiltered — webcore churns attributes. class = .Selected/markers, style = hidden.
          attributes: true,
          attributeFilter: ['class', 'aria-selected', 'style'],
        });
        observedDoc = doc;
      } catch {
        /* doc navigated away: polling still covers the wait */
        observer = null;
        observedDoc = null; // poll-only fallback
      }
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const poll = setInterval(() => {
      retarget();
      check();
    }, pollMs);

    check(); // synchronous first tick — free, and usually enough
    if (!done) retarget();
  });
}

// Mirrors getAllStockData()'s row correlation so the two can't drift apart.
function flatexGetPositionRows(ctx:any) {
  const firstRows = ctx.doc.querySelectorAll('.I1.DetailsAvailable');
  // :not(.ariba) excludes the extra rows createEmptyRowsToFill() injects.
  const secondRows = ctx.doc.querySelectorAll(DEPOT_ROW_SELECTOR);

  if (!firstRows.length || firstRows.length !== secondRows.length) return [];

  const rows:any = [];
  for (let x = 0; x < firstRows.length; x++) {
    const isin = getIdFromRow(secondRows[x]);
    if (!isin || isin === '0') continue;

    const qtyText = cellText(firstRows[x], '.C2').split(' ')[0];
    rows.push({
      isin,
      stocks_owned: qtyText ? germanToNumer(qtyText) : NaN,
      clickTarget: firstRows[x],
    });
  }
  return rows;
}

// Rows bind onmousedown/onmouseup, so .click() alone may never reach the framework.
function flatexClickRow(ctx:any, rowEl:any) {
  const win = ctx.win;
  const init = { bubbles: true, cancelable: true, view: win };

  try {
    if (win.PointerEvent) rowEl.dispatchEvent(new win.PointerEvent('pointerdown', init));
  } catch {
    /* PointerEvent isn't essential */
  }
  const MouseEventCtor = win.MouseEvent || MouseEvent;
  rowEl.dispatchEvent(new MouseEventCtor('mousedown', init));
  rowEl.dispatchEvent(new MouseEventCtor('mouseup', init));
  rowEl.dispatchEvent(new MouseEventCtor('click', init));
}

function pressEscape(ctx:any) {
  const win = ctx.win;
  const KeyboardEventCtor = win.KeyboardEvent || KeyboardEvent;
  const init = { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape', keyCode: 27 };
  try {
    ctx.doc.dispatchEvent(new KeyboardEventCtor('keydown', init));
    ctx.doc.dispatchEvent(new KeyboardEventCtor('keyup', init));
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------------- *
 *  Kaufdaten table
 * ------------------------------------------------------------------------- */

function flatexReadAcquisitionTable(
  ctx:any,
  tableEl?: Element | null
) {
  // Anchor on the class: the id (__1090058778) is regenerated on every render.
  const table = tableEl || ctx.doc.querySelector('table.PaperDetailsAcquisitionTable');
  if (!table) return null;

  const tranches:any = [];
  table.querySelectorAll('tbody tr').forEach((tr:any) => {
    const date = parseGermanDateOnly(cellText(tr, '.C0'));
    // Rows without a parseable date are header repeats or total rows — skip them.
    if (!date) return;
    tranches.push({
      date,
      qty: cellNumber(cellText(tr, '.C1')),
      price: cellNumber(cellText(tr, '.C2')),
      total: cellNumber(cellText(tr, '.C4')),
    });
  });

  return tranches;
}

const STALE_MARKER = 'qx-stale-kaufdaten';
const STALE_DETAIL_MARKER = 'qx-stale-detail';

// Overlay slot + tabs + selection: tells "position 2 rendered" from "position 1 still up".
function detailSignature(ctx:any) {
  const tabs = Array.from<any>(ctx.doc.querySelectorAll(DETAIL_TAB_SELECTOR));
  if (!tabs.length) return '';
  const selected = tabs.find(isSelectedTab);
  return (
    tabs.map(t => t.getAttribute('data-widgetname') || '').join('|') +
    '::' +
    (selected ? normLabel(selected) : '')
  );
}

// Tags what is on screen BEFORE the click; must outlive the whole open-plus-probe run.
function markStaleDetail(ctx:any) {
  const el = ctx.doc.querySelector('table.PaperDetailsAcquisitionTable');
  const signature = el ? (el.textContent || '').trim() : '';
  if (el) el.classList.add(STALE_MARKER);

  ctx.doc.querySelectorAll(DETAIL_TAB_SELECTOR).forEach((t:any) => t.classList.add(STALE_DETAIL_MARKER));

  return {
    signature,
    detailSignature: detailSignature(ctx),
    clear: () => {
      try {
        ctx.doc
          .querySelectorAll(`.${STALE_MARKER}, .${STALE_DETAIL_MARKER}`)
          .forEach((n:any) => n.classList.remove(STALE_MARKER, STALE_DETAIL_MARKER));
      } catch {
        /* document may have been swapped out */
      }
    },
  };
}

// Has a NEW detail rendered? Else the open-wait reads the previous position's verdict.
function freshDetail(ctx:any, stale:any) {
  const tabs = Array.from<any>(ctx.doc.querySelectorAll(DETAIL_TAB_SELECTOR));
  if (!tabs.length) return false;
  // webcore regenerates the anchors each render, so an untagged tab means a new render.
  if (tabs.some(t => !t.classList.contains(STALE_DETAIL_MARKER))) return true;
  // Fallback for an in-place update.
  return detailSignature(ctx) !== stale.detailSignature;
}

// Detail mounts as an overlay or inline; the marker plus text signature covers both.
function freshTable(ctx:any, stale:any) {
  const candidate = ctx.doc.querySelector('table.PaperDetailsAcquisitionTable');
  if (!candidate) return null;
  // A re-render produces a new element, which never carries our marker.
  if (!candidate.classList.contains(STALE_MARKER)) return candidate;
  // Same element reused: accept it once its contents actually changed.
  const signature = (candidate.textContent || '').trim();
  return signature && signature !== stale.signature ? candidate : null;
}

/* ------------------------------------------------------------------------- *
 *  Detail view: tabs
 * ------------------------------------------------------------------------- */

let tabHint:any = null;
let tabHintLoaded = false;

async function loadTabHint() {
  if (tabHintLoaded) return tabHint;
  tabHintLoaded = true;
  try {
    const result = await chrome.storage.local.get([TAB_HINT_KEY]);
    tabHint = result[TAB_HINT_KEY] || null;
  } catch {
    /* no hint is the cold-start default */
    tabHint = null;
  }
  return tabHint;
}

async function saveTabHint(hint:any) {
  tabHint = hint;
  tabHintLoaded = true;
  try {
    await chrome.storage.local.set({ [TAB_HINT_KEY]: hint });
  } catch {
    /* hint is an optimisation, never load-bearing */
  }
}

function parseWidgetIndex(key:any) {
  const match = key.match(/items\[(\d+)\]\s*$/);
  return match ? Number(match[1]) : -1;
}

function isSelectedTab(el:any) {
  return el.classList.contains('Selected') || el.getAttribute('aria-selected') === 'true';
}

// Highest-scoring ("Portfolio") first. Not index-first: children[N] is paper-type dependent.
function queryDetailTabs(ctx:any) {
  const byWidget = Array.from<any>(ctx.doc.querySelectorAll(DETAIL_TAB_SELECTOR));
  if (byWidget.length) return byWidget;
  return Array.from<any>(ctx.doc.querySelectorAll(DETAIL_TAB_FALLBACK_SELECTOR));
}

function flatexReadDetailTabs(ctx:any) {
  const tabs = queryDetailTabs(ctx);

  return tabs
    .map(el => {
      const key = el.getAttribute('data-widgetname') || '';
      const label = normLabel(el);
      const index = parseWidgetIndex(key);
      const selected = isSelectedTab(el);

      let score = 0;
      if (PORTFOLIO_TAB_RE.test(label)) score += 100;
      if (tabHint?.label && label === tabHint.label) score += 40;
      if (tabHint && index >= 0 && index === tabHint.index) score += 30;
      if (index === 3) score += 10;
      if (KNOWN_WRONG_TAB_RE.test(label)) score -= 50;
      // Already selected and still no table -> we know this one is wrong.
      if (selected) score -= 1000;

      return { key, index, label, selected, score };
    })
    .sort((a, b) => b.score - a.score);
}

// Re-query by widgetname: every ajax round trip replaces the DOM, so held refs are dead.
function findTabByKey(ctx:any, candidate:any) {
  const tabs = queryDetailTabs(ctx);
  if (candidate.key) {
    const byKey = tabs.find(el => el.getAttribute('data-widgetname') === candidate.key);
    if (byKey) return byKey;
  }
  const byLabel = tabs.find(el => normLabel(el) === candidate.label);
  return byLabel || null;
}

function flatexDumpDetailTabs(ctx = { doc: document, win: window }) {
  const rows = queryDetailTabs(ctx).map(el => ({
    widgetname: el.getAttribute('data-widgetname'),
    label: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    selected: isSelectedTab(el),
    id: el.id,
  }));
  console.table(rows);
  return rows;
}

/* ------------------------------------------------------------------------- *
 *  Detail view: open / close
 * ------------------------------------------------------------------------- */

// If layout can't be measured, take the element rather than reporting the overlay closed.
function isRendered(el:any) {
  try {
    return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
  } catch {
    /* measuring failed: assume rendered rather than report the overlay closed */
    return true;
  }
}

// N from secondLevelWidgetList[N].btnClose — overlays stack, and the highest N is topmost.
function overlayIndex(el:any) {
  const match = (el.getAttribute('data-widgetname') || '').match(/secondLevelWidgetList\[(\d+)\]/);
  return match ? Number(match[1]) : -1;
}

// Topmost overlay first: querySelector returns the OUTER one, and dispatch ignores z-order.
function flatexFindDetailCloses(ctx:any) {
  const found:any = new Set();
  for (const selector of CLOSE_SELECTORS) {
    for (const el of Array.from<any>(ctx.doc.querySelectorAll(selector))) {
      if (isRendered(el)) found.add(el);
    }
  }
  return Array.from<any>(found).sort(
    (a, b) =>
      overlayIndex(b) - overlayIndex(a) ||
      // 4 = DOCUMENT_POSITION_FOLLOWING; the literal avoids a realm-specific global Node.
      (a.compareDocumentPosition(b) & 4 ? 1 : -1)
  );
}

function flatexFindDetailClose(ctx:any) {
  return flatexFindDetailCloses(ctx)[0] || null;
}

// Ignores detail tabs (webcore leaves them) and depot rows (they survive UNDER the overlay).
function flatexDetailOverlayOpen(ctx:any) {
  if (flatexFindDetailClose(ctx)) return true;
  return Array.from<any>(ctx.doc.querySelectorAll('.DetailsCategorySelection')).some(el =>
    isRendered(el)
  );
}

// Closes the detail overlay(s), topmost first. webcore stacks secondLevelWidgetList[0..n].
async function flatexCloseDetail(
  ctx:any,
  { timeoutMs = CLOSE_TIMEOUT_MS, maxRounds = 4 } = {}
) {
  let lastClickedId:any = null;

  for (let round = 0; round < maxRounds; round++) {
    if (!flatexDetailOverlayOpen(ctx)) return true;

    // Re-query every round: each ajax round trip replaces the DOM.
    const candidates = flatexFindDetailCloses(ctx);
    // webcore.clickOnce() debounces the same id, so a re-click is a no-op that costs a timeout.
    const button = candidates.find(el => !el.id || el.id !== lastClickedId) || null;

    if (button) {
      lastClickedId = button.id || null;
      const target = overlayIndex(button);
      flatexClickRow(ctx, button);

      // Wait for THAT overlay to go, not for a perfect global predicate.
      const gone = await flatexWaitFor(
        () =>
          !button.isConnected ||
          !isRendered(button) ||
          !flatexFindDetailCloses(ctx).some(el => overlayIndex(el) === target)
            ? true
            : null,
        { timeoutMs, ctx }
      );
      if (gone && !flatexDetailOverlayOpen(ctx)) return true;
    } else {
      // Overlay mounted but no fresh close affordance — try the keyboard once.
      pressEscape(ctx);
      const closed = await flatexWaitFor(
        () => (!flatexDetailOverlayOpen(ctx) ? true : null),
        { timeoutMs: 1500, ctx }
      );
      if (closed) return true;
      break;
    }

    await sleep(150);
  }

  flatexDebugLog('could not close the detail overlay');
  return false;
}


// Zero extra round trips on the happy path: webcore remembers the selected category index.
async function flatexOpenPositionDetail(
  ctx:any,
  row:any
) {
  const hint = await loadTabHint();
  const stale = markStaleDetail(ctx);
  let probes = 0;

  try {
    flatexClickRow(ctx, row.clickTarget);

    // freshDetail — not "tabs exist" — stops the previous overlay satisfying this instantly.
    const opened = await flatexWaitFor(
      () => freshTable(ctx, stale) || (freshDetail(ctx, stale) ? ('tabs') : null),
      { timeoutMs: DETAIL_OPEN_TIMEOUT_MS, ctx }
    );

    if (!opened) return { table: null, status: 'no_detail', probes };
    if (opened !== 'tabs') return { table: opened, status: 'ok', probes };

    const candidates = flatexReadDetailTabs(ctx);

    // Already on Portfolio with no table -> genuinely table-less (bond, fund). Don't probe.
    const selected = candidates.find(c => c.selected);
    if (selected && PORTFOLIO_TAB_RE.test(selected.label)) {
      flatexDebugLog(`${row.isin}: on "${selected.label}" tab, no Kaufdaten table`);
      return { table: null, status: 'no_table', probes };
    }

    // Probe only the hinted tab: three at 4s burns 12s on exactly the positions we retry.
    const unselected = candidates.filter(c => !c.selected);
    const hinted = hint ? unselected.filter(c => c.label === hint.label) : [];
    const order = hinted.length ? hinted : unselected.slice(0, MAX_TAB_PROBES);

    for (const candidate of order) {
      const el = findTabByKey(ctx, candidate);
      if (!el) continue;

      probes++;
      flatexDebugLog(`${row.isin}: probing tab "${candidate.label}" (score ${candidate.score})`);
      flatexClickRow(ctx, el);

      const table = await flatexWaitFor(() => freshTable(ctx, stale), {
        timeoutMs: TAB_PROBE_TIMEOUT_MS,
        ctx,
      });

      if (table) {
        await saveTabHint({ label: candidate.label, index: candidate.index, at: Date.now() });
        return { table, status: 'ok', probes };
      }
    }

    // The hint was wrong — fall back to the full scored list once, then give up.
    if (hinted.length) {
      for (const candidate of unselected.filter(c => c.label !== hint!.label).slice(0, MAX_TAB_PROBES)) {
        const el = findTabByKey(ctx, candidate);
        if (!el) continue;
        probes++;
        flatexClickRow(ctx, el);
        const table = await flatexWaitFor(() => freshTable(ctx, stale), {
          timeoutMs: TAB_PROBE_TIMEOUT_MS,
          ctx,
        });
        if (table) {
          await saveTabHint({ label: candidate.label, index: candidate.index, at: Date.now() });
          return { table, status: 'ok', probes };
        }
      }
    }

    if (debugEnabled()) flatexDumpDetailTabs(ctx);
    return { table: null, status: 'wrong_tab', probes };
  } finally {
    stale.clear();
  }
}

/* ------------------------------------------------------------------------- *
 *  Depot list
 * ------------------------------------------------------------------------- */

// Cheap presence check, no round trip — catches a session timeout mid-run.
async function flatexVerifyListPresent(
  ctx:any,
  { timeoutMs = 2000 } = {}
) {
  const ok = await flatexWaitFor(
    () => (ctx.doc.querySelectorAll(DEPOT_ROW_SELECTOR).length ? true : null),
    { timeoutMs }
  );
  return !!ok;
}

// Finds the top-level Depotbestand tab without relying on a hardcoded webcore id.
function findDepotTab(ctx:any) {
  const candidates = (Array.from<any>(ctx.doc.querySelectorAll(TOP_NAV_SELECTOR)))
    // The detail view has its own tab bar with the same classes — never click that one.
    .filter(
      el =>
        !el.closest('.DetailsCategorySelection') &&
        !(el.getAttribute('data-widgetname') || '').includes('detailsBlockSelectionWidget')
    )
    .map(el => {
      const key = el.getAttribute('data-widgetname') || '';
      const label = normLabel(el);
      let score = 0;
      if (label === DEPOT_TAB_LABEL) score += 200;
      if (key.includes(DEPOT_TAB_WIDGET_HINT)) score += 100;
      if (DEPOT_TAB_RE.test(label)) score += 50;
      if (el.id === LEGACY_DEPOT_TAB_ID) score += 20;
      return { el, score, label, selected: isSelectedTab(el) };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  return best && best.score > 0 ? best.el : null;
}

// The cash balance only renders on the Dashboard tab, which carries a "Dashboard" class in the live markup.
function findDashboardTab(ctx:any) {
  return Array.from<any>(ctx.doc.querySelectorAll(TOP_NAV_SELECTOR))
    .filter(el => !el.closest('.DetailsCategorySelection'))
    .find(el => el.classList.contains('Dashboard') || normLabel(el) === 'dashboard') || null;
}

// Sync QX+ part one: Dashboard for the cash balance. The tab switch is webcore ajax, so the page never reloads.
export async function flatexOpenDashboard(ctx:any = { doc: document, win: window }) {
  console.log('flatexOpenDashboard');
  const ready = () => (ctx.doc.querySelectorAll(DASHBOARD_VALUES_SELECTOR).length >= 2 ? true : null);
  if (ready()) return true;
  const tab = findDashboardTab(ctx);
  if (!tab) return false;
  flatexClickRow(ctx, tab);
  return !!(await flatexWaitFor(ready, { timeoutMs: LIST_TIMEOUT_MS, ctx }));
}

// Sync QX+ part two: "Alle" for every position. Waits on the selected tab too: rows alone may be a filtered view.
export async function flatexOpenDepotList(ctx:any = { doc: document, win: window }) {
  console.log('flatexOpenDepotList');
  const ready = () => {
    const tab = findDepotTab(ctx);
    return tab && isSelectedTab(tab) && ctx.doc.querySelectorAll(DEPOT_ROW_SELECTOR).length ? true : null;
  };
  if (ready()) return true;
  const tab = findDepotTab(ctx);
  if (!tab) return false;
  flatexClickRow(ctx, tab);
  return !!(await flatexWaitFor(ready, { timeoutMs: LIST_TIMEOUT_MS, ctx }));
}

// Close overlays, then re-navigate — a full nav rebuilds what the close button cannot.
async function flatexEnsureDepotList(
  ctx:any,
  { timeoutMs = LIST_TIMEOUT_MS } = {}
) {
  await flatexCloseDetail(ctx);

  // Rows survive UNDER the overlay; checking them alone made this a no-op after a failed close.
  if (ctx.doc.querySelectorAll(DEPOT_ROW_SELECTOR).length && !flatexDetailOverlayOpen(ctx)) {
    return { ok: true, diag: 'already' };
  }

  const tab = findDepotTab(ctx);
  if (!tab) {
    flatexDebugLog('no depot tab found in the top navigation');
    return { ok: false, diag: 'no_tab' };
  }

  const wasSelected = isSelectedTab(tab);
  flatexClickRow(ctx, tab);

  const listed = await flatexWaitFor(
    () => (ctx.doc.querySelectorAll(DEPOT_ROW_SELECTOR).length ? true : null),
    { timeoutMs }
  );

  if (listed) return { ok: true, diag: 'clicked' };
  // Already on the depot tab but no rows: not a click problem.
  return { ok: false, diag: wasSelected ? 'selected_but_empty' : 'timeout' };
}

// Every exit routes through this — normal, error, budget, cancel — so nobody is stranded.
async function flatexRestoreDepotView(
  ctx:any,
  { allowReload = false, deadlineMs = 10000 } = {}
) {
  const deadline = Date.now() + deadlineMs;
  const outOfTime = () => Date.now() >= deadline;

  // L0 — already good?
  const rowsPresent = () => ctx.doc.querySelectorAll(DEPOT_ROW_SELECTOR).length > 0;
  if (rowsPresent() && !flatexDetailOverlayOpen(ctx)) return 'already';

  // L1 + L2 — close the overlay stack (topmost first), Escape as a fallback.
  if (!outOfTime() && (await flatexCloseDetail(ctx, { timeoutMs: 2500 }))) {
    if (rowsPresent()) return 'closed';
  }

  // L3 is the only layer that GUARANTEES the list: a full nav rebuilds it server-side.
  if (!outOfTime()) {
    const ensured = await flatexEnsureDepotList(ctx, {
      timeoutMs: Math.max(2000, deadline - Date.now()),
    });
    if (ensured.ok) return 'renav';
    flatexDebugLog('restore: re-navigation failed', ensured.diag);
  }

  // L4 — destructive, opt-in only: loses scroll and any in-page state.
  if (allowReload) {
    try {
      flatexDebugLog('restore: hard reload');
      ctx.win.location.assign(DEPOT_URL);
      return 'reload';
    } catch {
      /* cross-origin or detached */
    }
  }

  flatexDebugLog('restore: could not get back to the depot list');
  return 'failed';
}

function hardResetEnabled() {
  try {
    return !!localStorage.getItem('qxSyncHardReset');
  } catch {
    /* storage blocked: hard reset stays off */
    return false;
  }
}

/* ------------------------------------------------------------------------- *
 *  Abort / lock
 * ------------------------------------------------------------------------- */

// A real user click on a position or a tab wins over the sync in progress.
function attachAbortListener(ctx:any) {
  const handler = (event:any) => {
    // Only trusted gestures abort — webcore replays our clicks, and that skipped the close.
    if (!event.isTrusted) return;
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('.DetailsAvailable') || target.closest('.BlockSelectionItem')) {
      flatexDebugLog('trusted user click detected, aborting sync');
      flatexSyncState.abortRequested = true;
      flatexSyncState.abortReason = 'user';
    }
  };
  ctx.doc.addEventListener('click', handler, true);
  return () => ctx.doc.removeEventListener('click', handler, true);
}

async function acquireSyncLock() {
  try {
    const result = await chrome.storage.local.get([SYNC_LOCK_KEY]);
    const existing = result[SYNC_LOCK_KEY];
    if (existing?.at && Date.now() - existing.at < LOCK_STALE_MS) return null;

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await chrome.storage.local.set({ [SYNC_LOCK_KEY]: { token, at: Date.now() } });
    // Read-then-write isn't atomic: two tabs can both write, and only the last writer owns the lock.
    const confirm = await chrome.storage.local.get([SYNC_LOCK_KEY]);
    return confirm[SYNC_LOCK_KEY]?.token === token ? token : null;
  } catch (err) {
    console.error('acquireSyncLock error:', err);
    return null;
  }
}

// Keeps a long run's lock from being declared stale by another tab.
async function touchSyncLock(token:any) {
  if (!token) return;
  try {
    const result = await chrome.storage.local.get([SYNC_LOCK_KEY]);
    if (result[SYNC_LOCK_KEY]?.token === token) {
      await chrome.storage.local.set({ [SYNC_LOCK_KEY]: { token, at: Date.now() } });
    }
  } catch {
    /* best effort */
  }
}

async function releaseSyncLock(token:any) {
  if (!token) return;
  try {
    const result = await chrome.storage.local.get([SYNC_LOCK_KEY]);
    if (result[SYNC_LOCK_KEY]?.token === token) {
      await chrome.storage.local.remove(SYNC_LOCK_KEY);
    }
  } catch (err) {
    console.error('releaseSyncLock error:', err);
  }
}

/* ------------------------------------------------------------------------- *
 *  Orchestrator
 * ------------------------------------------------------------------------- */

// Frame runs are invisible; inline stays bounded. inline.max 0 = never touch the visible page.
const SYNC_PROFILES:any = {
  background: { frame: { max: 25, budgetMs: 120_000 }, inline: { max: 0, budgetMs: 0 } },
  interactive: { frame: { max: Infinity, budgetMs: 300_000 }, inline: { max: 15, budgetMs: 90_000 } },
};

// Debug-only A/B switch for the pre-round-3 "don't close between positions" path.
function noCloseOverride() {
  try {
    return !!localStorage.getItem('qxSyncNoClose');
  } catch {
    /* storage blocked: override stays off */
    return false;
  }
}

async function flatexSyncPurchaseDates(
  options:any = {}
) {
  // No ctx means we're driving the page the user is looking at.
  const isInline = !options.ctx;
  const {
    ctx = { doc: document, win: window },
    force = false,
    watchForUserClicks = isInline,
    profile = 'background',
    onProgress,
  } = options;

  const mode: 'frame' | 'inline' = isInline ? 'inline' : 'frame';
  const limits = SYNC_PROFILES[profile][mode];
  const empty = { mode, synced: 0, failed: 0, remaining: 0, aborted: false };
  if (flatexSyncState.inFlight) return { ...empty, skipped: 'in_flight' };

  // The cache key carries the account, so an unresolved id would file this run's
  // Kaufdaten under an empty account and hand them to the other depot.
  if (!currentAccountId) {
    await flatexResolveAccountId();
    if (!currentAccountId) await syncFlatexUser();
    if (!currentAccountId) return { ...empty, skipped: 'no_account' };
  }

  // Snapshot: the concurrent 10s scrape blanks currentAccountId while it re-resolves.
  const runAccountId = currentAccountId;

  const cache = await flatexRefreshPurchaseDateCache();
  const rows = flatexGetPositionRows(ctx);
  const pending = rows.filter((r:any) => flatexNeedsPurchaseDate(cache[flatexPurchaseKey(r.isin, runAccountId)], r.stocks_owned, force));

  // Fast path: this is what keeps the 10s interval cheap once everything is known.
  if (!pending.length) return { ...empty, skipped: 'nothing_to_do' };
  // profile.inline.max === 0 means "this mode is not allowed to run at all".
  if (limits.max <= 0) return { ...empty, skipped: 'locked' };

  const lockToken = await acquireSyncLock();
  if (!lockToken) return { ...empty, skipped: 'locked' };
  // The lock goes stale in 3 min but a run may legitimately take longer, so keep it warm.
  const lockBeat = setInterval(() => void touchSyncLock(lockToken), 30_000);

  flatexSyncState.inFlight = true;
  flatexSyncState.inlineInFlight = isInline;
  flatexSyncState.abortRequested = false;
  flatexSyncState.abortReason = null;
  const detachAbort = watchForUserClicks ? attachAbortListener(ctx) : () => {};
  // Tab close / navigation mid-run: best-effort flush of anything still debounced.
  const onPageHide = () => void flatexFlushPurchaseCache();
  try {
    ctx.win.addEventListener('pagehide', onPageHide);
  } catch {
    /* detached frame */
  }

  const batch = Number.isFinite(limits.max) ? pending.slice(0, limits.max) : pending.slice();
  const perIsin:any = {};
  const startedAt = Date.now();
  let synced = 0;
  let failed = 0;
  let processed = 0;
  let frameUnusable = false;

  flatexDebugLog(`[${mode}/${profile}] syncing ${batch.length} of ${pending.length} pending`);

  try {
    for (let i = 0; i < batch.length; i++) {
      if (flatexSyncState.abortRequested) break;
      if (Date.now() - startedAt > limits.budgetMs) {
        flatexDebugLog('run budget exhausted, stopping early');
        break;
      }

      const { isin } = batch[i];
      // Report the real pending total: "8/8" with 34 outstanding is a lie.
      onProgress?.({ done: i, total: pending.length, isin });

      // Every round trip re-renders the table — re-query and match by ISIN, never by index.
      const current = flatexGetPositionRows(ctx).find((r:any) => r.isin === isin);
      if (!current) {
        flatexDebugLog(`row for ${isin} disappeared, skipping`);
        failed++;
        continue;
      }

      const { table, status } = await flatexOpenPositionDetail(ctx, current);
      processed++;

      // A user click mid-wait must never be recorded as this position's verdict.
      if (flatexSyncState.abortRequested && !table) break;

      if (table) {
        const tranches = flatexReadAcquisitionTable(ctx, table) || [];
        if (tranches.length) {
          const entry = flatexBuildPurchaseEntry(tranches, current.stocks_owned);
          flatexSavePurchaseDateEntry(isin, entry, runAccountId);
          perIsin[isin] = 'ok';
          synced++;
          flatexDebugLog(`${isin} -> ${entry.purchase_date} (${entry.dates.length} tranche(s))`);
        } else {
          // Table present but nothing parseable — a real failure, and attempts must climb.
          flatexSavePurchaseDateEntry(
            isin,
            flatexBuildFailedEntry(cache[flatexPurchaseKey(isin, runAccountId)], 'no_table', current.stocks_owned),
            runAccountId
          );
          perIsin[isin] = 'no_table';
          failed++;
        }
      } else {
        // A frame that can't open details is a frame problem — bail before burning attempts.
        if (mode === 'frame' && synced === 0 && processed === 1 && status !== 'no_table') {
          flatexDebugLog(`frame cannot open detail views (${status}), abandoning frame run`);
          frameUnusable = true;
          break;
        }
        flatexSavePurchaseDateEntry(
          isin,
          flatexBuildFailedEntry(cache[flatexPurchaseKey(isin, runAccountId)], status, current.stocks_owned),
          runAccountId
        );
        perIsin[isin] = status;
        failed++;
        flatexDebugLog(`${isin} -> ${status}`);
      }

      if (flatexSyncState.abortRequested) break;

      // Leaving the overlay up let webcore STACK a second one, so Zurück closed the wrong one.
      if (!noCloseOverride() || !table) {
        const restored = await flatexRestoreDepotView(ctx, { deadlineMs: 6000 });
        if (restored === 'failed') {
          flatexDebugLog('could not get back to the depot list, stopping');
          break;
        }
      } else if (!(await flatexVerifyListPresent(ctx))) {
        flatexDebugLog('depot list is gone (session timeout?), stopping');
        break;
      }
    }
  } catch (err) {
    console.error('flatexSyncPurchaseDates error:', err);
  } finally {
    clearInterval(lockBeat);
    detachAbort();
    try {
      ctx.win.removeEventListener('pagehide', onPageHide);
    } catch {
      /* detached frame */
    }
    // Never strand the user on a detail page; only a trusted click is exempt.
    if (isInline && flatexSyncState.abortReason !== 'user') {
      await flatexRestoreDepotView(ctx, { allowReload: hardResetEnabled() });
    }
    flatexSyncState.inFlight = false;
    flatexSyncState.inlineInFlight = false;
    await releaseSyncLock(lockToken);
    // ORDER MATTERS: flush before refresh, or this run's results are overwritten.
    await flatexFlushPurchaseCache();
    await flatexRefreshPurchaseDateCache();
  }

  const result:any = {
    mode,
    synced,
    failed,
    remaining: Math.max(0, pending.length - batch.length),
    aborted: flatexSyncState.abortRequested,
    abortReason: flatexSyncState.abortReason,
    perIsin,
    elapsedMs: Date.now() - startedAt,
  };
  if (frameUnusable) result.skipped = 'frame_unusable';

  // Don't let this run's abort state leak into the next one.
  flatexSyncState.abortRequested = false;
  flatexSyncState.abortReason = null;

  return result;
}

/* ------------------------------------------------------------------------- *
 *  Iframe mode
 * ------------------------------------------------------------------------- */

const REPROBE_MS:any = {
  xfo_denied: 7 * DAY,
  framing_blocked: 7 * DAY,
  load_timeout: 6 * HOUR,
  login: 24 * HOUR,
  no_shell: 24 * HOUR,
  no_depot: 24 * HOUR,
  no_detail: 24 * HOUR,
  error: 6 * HOUR,
};

async function readIframeSupport() {
  try {
    const result = await chrome.storage.local.get([IFRAME_SUPPORT_KEY]);
    return result[IFRAME_SUPPORT_KEY] || null;
  } catch {
    /* unknown support means probe again */
    return null;
  }
}

async function recordIframeSupport(supported:any, reason?:any) {
  try {
    await chrome.storage.local.set({
      [IFRAME_SUPPORT_KEY]: { supported, reason, at: Date.now() },
    });
  } catch (err) {
    console.error('recordIframeSupport error:', err);
  }
}

// Unknown -> try. Known-blocked -> retry only after this reason's window, not every run.
async function flatexShouldTryIframe() {
  const stored = await readIframeSupport();
  if (!stored) return true;
  if (stored.supported) return true;
  const window_ = (stored.reason && REPROBE_MS[stored.reason]) || 24 * HOUR;
  return Date.now() - (stored.at || 0) > window_;
}

// Definitive answer instead of a 15s guess; same-origin, so headers read without permission.
async function flatexProbeFramingHeaders() {
  try {
    const res = await fetch(DEPOT_URL, { method: 'GET', credentials: 'include' });
    try {
      res.body?.cancel();
    } catch {
      /* body may already be consumed/absent */
    }
    const xfo = res.headers.get('x-frame-options');
    const csp = res.headers.get('content-security-policy');
    // SAMEORIGIN is fine (we frame same-origin); only DENY or frame-ancestors 'none' blocks.
    const blocked =
      /\bdeny\b/i.test(xfo || '') || /frame-ancestors[^;]*'none'/i.test(csp || '');
    flatexDebugLog('framing headers:', { xfo, csp, blocked });
    return { blocked, xfo, csp };
  } catch (err) {
    flatexDebugLog('framing header probe failed:', err);
    return { blocked: false, xfo: null, csp: null };
  }
}


// Off-screen same-origin frame; webcore gives it its own windowId, so the user's view is safe.
async function flatexOpenSyncFrame(): Promise<any> {
  // Only probe when framing isn't known to work — it is a full GET of the depot HTML.
  const known = await readIframeSupport();
  if (!known?.supported) {
    const headers = await flatexProbeFramingHeaders();
    if (headers.blocked) {
      await recordIframeSupport(false, 'xfo_denied');
      console.log(`[qx:kaufdaten] framing blocked by headers (x-frame-options: ${headers.xfo})`);
      return { ok: false, reason: 'xfo_denied' };
    }
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  // Off-screen, not display:none — webcore measures layout and skips a zero-sized frame.
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1280px;height:900px;' +
    'opacity:0;pointer-events:none;border:0;';
  // Bare URL: the top frame's query string can encode window state we don't want to reuse.
  iframe.src = DEPOT_URL;

  const dispose = () => {
    try {
      iframe.remove();
    } catch {
      /* already gone */
    }
  };

  // Single exit funnel so no path can forget to persist the reason.
  const fail = async (reason:any, extra?:any) => {
    flatexDebugLog('frame unusable:', reason, extra ?? '');
    console.log(`[qx:kaufdaten] iframe unavailable (${reason}) — falling back`);
    dispose();
    await recordIframeSupport(false, reason);
    return { ok: false, reason };
  };

  document.body.appendChild(iframe);

  // A throw here (e.g. contentDocument gone after a login redirect) leaked the logged-in frame.
  try {
    // Phase 1: is it framed at all? An inaccessible contentDocument means blocked.
    const reachable = await flatexWaitFor(() => {
      try {
        const doc = iframe.contentDocument;
        return doc && doc.body ? doc : null;
      } catch {
        return 'blocked';
      }
    }, { timeoutMs: 8000, pollMs: 250 });

    if (reachable === 'blocked') return fail('framing_blocked');
    if (!reachable) return fail('load_timeout');

    // Phase 2: has webcore rendered? The old gate passed on a script tag — hence it never worked.
    const rendered = await flatexWaitFor(() => {
      const doc = iframe.contentDocument;
      if (!doc || doc.readyState !== 'complete') return null;
      return doc.querySelector(`${TOP_NAV_SELECTOR}, ${DEPOT_ROW_SELECTOR}`) ? doc : null;
    }, { timeoutMs: IFRAME_LOAD_TIMEOUT_MS, pollMs: 300 });

    if (!rendered) {
      const doc = iframe.contentDocument;
      if (doc?.querySelector('input[type="password"]')) return fail('login');
      return fail('no_shell', { readyState: doc?.readyState });
    }

    // Lazy getters: a reload inside the frame replaces them and a captured ref goes stale.
    const ctx = {
      get doc() {
        return iframe.contentDocument;
      },
      get win() {
        return iframe.contentWindow;
      },
    };

    const depot = await flatexEnsureDepotList(ctx);
    if (!depot.ok) return fail('no_depot', depot.diag);

    await recordIframeSupport(true);
    return { ok: true, ctx, dispose };
  } catch (err) {
    console.error('flatexOpenSyncFrame error:', err);
    return fail('error');
  }
}

/* ------------------------------------------------------------------------- *
 *  Entry points
 * ------------------------------------------------------------------------- */

let lastAutoSyncAt = 0;

async function saveDiag(result:any) {
  try {
    await chrome.storage.local.set({
      [DIAG_KEY]: {
        at: new Date().toISOString(),
        mode: result.mode,
        reason: result.reason ?? null,
        skipped: result.skipped ?? null,
        synced: result.synced,
        failed: result.failed,
        remaining: result.remaining,
        aborted: result.aborted,
        elapsedMs: result.elapsedMs ?? 0,
        perIsin: result.perIsin || {},
      },
    });
  } catch {
    /* diagnostics are never load-bearing */
  }
}

function logSummary(result:any) {
  console.log(
    `[qx:kaufdaten] mode=${result.mode} reason=${result.reason ?? 'none'} ` +
      `skipped=${result.skipped ?? 'none'} synced=${result.synced} failed=${result.failed} ` +
      `remaining=${result.remaining} aborted=${result.aborted} ` +
      `elapsed=${((result.elapsedMs ?? 0) / 1000).toFixed(1)}s`
  );
}

// Hidden iframe when possible; the visible page only if the caller allows it.
export async function flatexRunSync(options:any = {}) {
  // Claimed before the first await: inFlight is only set ~25 s later, so two callers both got through.
  if (flatexSyncState.inFlight || flatexSyncState.starting) {
    return { mode: 'inline', synced: 0, failed: 0, remaining: 0, aborted: false, skipped: 'in_flight' };
  }
  flatexSyncState.starting = true;
  try {
    return await flatexRunSyncOnce(options);
  } finally {
    flatexSyncState.starting = false;
  }
}

async function flatexRunSyncOnce(options:any) {
  const { force = false, allowInline = false, profile = 'background', onProgress } = options;

  // Same account guard as the sync run, here only to skip booting a frame for nothing.
  if (!currentAccountId) {
    await flatexResolveAccountId();
    if (!currentAccountId) await syncFlatexUser();
    if (!currentAccountId) {
      return { mode: 'inline', synced: 0, failed: 0, remaining: 0, aborted: false, skipped: 'no_account' };
    }
  }

  const runAccountId = currentAccountId;
  // Check "anything to do?" before any frame work — this used to boot the whole iframe first.
  const cache = await flatexRefreshPurchaseDateCache();
  const pendingNow = flatexGetPositionRows({ doc: document, win: window }).filter((r:any) =>
    flatexNeedsPurchaseDate(cache[flatexPurchaseKey(r.isin, runAccountId)], r.stocks_owned, force)
  );
  if (!pendingNow.length) {
    return { mode: 'inline', synced: 0, failed: 0, remaining: 0, aborted: false, skipped: 'nothing_to_do' };
  }

  let reason:any = null;

  if (await flatexShouldTryIframe()) {
    const frame = await flatexOpenSyncFrame();
    if (frame.ok) {
      let result;
      try {
        result = await flatexSyncPurchaseDates({
          ctx: frame.ctx,
          force,
          profile,
          // Nobody is clicking inside an off-screen frame.
          watchForUserClicks: false,
          onProgress,
        });
      } finally {
        frame.dispose();
      }

      // A frame that loads but can't open details: record it and fall through to the page.
      if (result.skipped === 'frame_unusable') {
        await recordIframeSupport(false, 'no_detail');
        reason = 'no_detail';
      } else {
        logSummary(result);
        await saveDiag(result);
        return result;
      }
    } else {
      reason = frame.reason;
    }
  } else {
    const stored = await readIframeSupport();
    reason = stored?.reason ?? null;
  }

  if (!allowInline) {
    const result:any = {
      mode: 'frame',
      synced: 0,
      failed: 0,
      remaining: 0,
      aborted: false,
      skipped: 'frame_unusable',
      reason,
    };
    flatexDebugLog('iframe unavailable and inline syncing not permitted, skipping');
    await saveDiag(result);
    return result;
  }

  flatexDebugLog('falling back to inline syncing on the visible page');
  const result = await flatexSyncPurchaseDates({
    force,
    profile,
    watchForUserClicks: true,
    onProgress,
  });
  result.reason = reason;
  logSummary(result);
  await saveDiag(result);
  return result;
}

// Called from the periodic scrape. Debounced hard, and never touches the visible page.
export async function flatexMaybeAutoSync() {
  if (flatexSyncState.inFlight || flatexSyncState.starting) return;
  if (Date.now() - lastAutoSyncAt < AUTO_SYNC_INTERVAL_MS) return;
  if (!(await flatexShouldTryIframe())) return;

  lastAutoSyncAt = Date.now();
  try {
    const result = await flatexRunSync({
      force: false,
      allowInline: false,
      profile: 'background',
    });
    if (result.synced) flatexDebugLog('auto sync result', result);
  } catch (err) {
    console.error('flatexMaybeAutoSync error:', err);
  }
}

/* ------------------------------------------------------------------------- *
 *  Debug helpers — attached to window only when qxSyncDebug is set.
 *  The DOM-driven sync can't run under vitest, so these are its manual regression surface.
 * ------------------------------------------------------------------------- */

export function flatexAttachDebugHelpers() {
  if (!debugEnabled()) return;
  const ctx = { doc: document, win: window };

  (window as any).qxSync = {
    dumpTabs: () => flatexDumpDetailTabs(ctx),
    dumpRows: () => {
      const rows = flatexGetPositionRows(ctx).map((r:any) => ({ isin: r.isin, qty: r.stocks_owned }));
      console.table(rows);
      return rows;
    },
    probeHeaders: () => flatexProbeFramingHeaders(),
    probeFrame: async () => {
      const frame = await flatexOpenSyncFrame();
      if (frame.ok) {
        console.log('[qx:kaufdaten] frame OK');
        frame.dispose();
        return { ok: true };
      }
      return frame;
    },
    closeDetail: () => flatexCloseDetail(ctx),
    overlayOpen: () => flatexDetailOverlayOpen(ctx),
    closeButtons: () =>
      flatexFindDetailCloses(ctx).map(el => ({ id: el.id, widget: el.getAttribute('data-widgetname') })),
    restore: () => flatexRestoreDepotView(ctx),
    runInline: (force = true) =>
      flatexSyncPurchaseDates({ force, watchForUserClicks: true, profile: 'interactive' }).then(r => {
        logSummary(r);
        return r;
      }),
    run: (force = true) => flatexRunSync({ force, allowInline: true, profile: 'interactive' }),
    diag: async () => {
      const data = await chrome.storage.local.get([
        DIAG_KEY,
        IFRAME_SUPPORT_KEY,
        TAB_HINT_KEY,
        PURCHASE_CACHE_KEY,
      ]);
      // Counts only: the bank page console must never show the cached quantities and prices.
      console.log('qxSync.diag', {
        diag: data[DIAG_KEY]?.skipped ?? null,
        iframeSupported: data[IFRAME_SUPPORT_KEY]?.supported ?? null,
        purchaseEntries: Object.keys(data[PURCHASE_CACHE_KEY] || {}).length,
      });
      return data;
    },
    reset: async () => {
      await chrome.storage.local.remove([IFRAME_SUPPORT_KEY, TAB_HINT_KEY, DIAG_KEY]);
      await flatexClearPurchaseDateCache();
      console.log('[qx:kaufdaten] caches cleared');
    },
  };
  console.log('[qx:kaufdaten] debug helpers on window.qxSync');
}
