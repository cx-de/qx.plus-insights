/*
    These functions can only be applied to wikifolio website
    as it depends on a specific HTML structure
*/

const broker = "Wikifolio";

let currentAccountId:any = null;

export async function addSyncButtonOnWikifolio(){
  console.log("addSyncButtonOnWikifolio")
  if (window.location.href.includes("/trade/")) {
    const container = document.querySelector('.c-wf-trade__header-container');
    if (!container) return;

    const syncBtn = document.createElement("a");
    syncBtn.className = "c-button c-wf-trade__header-button";
    syncBtn.href = "#sync";
    attachSyncFeedback(syncBtn, mainWikiFolioSaveDataToLocalStorage);
    container.appendChild(syncBtn);
  }
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
  if (!result.MAIN_LIST.length) return;

  const ownRows = await accountOwnRows(result.MAIN_LIST, broker, currentAccountId);

    
  const headers  = document.querySelectorAll(".table-group-row");
  if (!headers ) return;
  
  // Only apply for first 2 headers
  const targetHeaders = Array.from(headers).slice(0, 2);
  targetHeaders.forEach(stockHeader => {
    let row = stockHeader.nextElementSibling;
    
    while (row && !row.classList.contains("table-group-row")) {
      if (!(row.nextElementSibling && row.nextElementSibling.classList.contains("custom-extra-row"))) {
        let parentISIN = row?.querySelector('.isin')?.textContent.trim();
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
      row = row.nextElementSibling.nextElementSibling;
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
    const url = window.location.pathname;
    const urlParts = url.split("/");
    const deposite_number = url.split("/")[urlParts.length-1];
    
    const rows = document.querySelectorAll(".c-r-table tbody .c-r-table__tr");
    let stockData = [];
    let currentGroup = null;
    // Sequential, not forEach(async ...): that returned stockData before a single await
    // resolved, so a short or empty array was persisted and read back as "everything sold".
    for (const row of rows) {
      // Detect group row
      if (row.classList.contains("table-group-row")) {
        const text = row.innerText.trim();
        if (text.startsWith("Aktien")) currentGroup = "stocks";
        else if (text.startsWith("Strukturierte Produkte")) currentGroup = "structuredProducts";
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
      
      let bid = row.querySelector(".tick-data .nowrap")?.textContent.trim() ?? 0;
      bid = germanToNumer(bid);

      let stocks_owned = row.querySelector(".tick-data-quantity")?.textContent.trim() ?? 0;
      stocks_owned = germanToNumer(stocks_owned);
      
      let value = row.children[3]?.innerText.trim() ?? null;
      value = germanToNumer(value);
      
      const perfCell = row.children[4];
      let profit_loss_price = 0;
      let profit_loss_percentage = 0;
      if (perfCell) {
        profit_loss_price = perfCell.querySelector(".nowrap:nth-child(1)")?.innerText.trim();
        profit_loss_price = germanToNumer(profit_loss_price);
        
        profit_loss_percentage = perfCell.querySelector(".nowrap:nth-child(2)")?.innerText.trim();
        profit_loss_percentage = profit_loss_percentage.replace('%', '');
        profit_loss_percentage = germanToNumer(profit_loss_percentage);
      }

      const total_entry_value = value - profit_loss_price;

      let buy_price = 0;
      if (stocks_owned > 0) {
        buy_price = total_entry_value / stocks_owned;
      }
      
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
        timestamp: Date.now()
      });

    }

    return stockData;
}

//Save data on Chrome Storage for the grouped page
export async function mainWikiFolioSaveDataToLocalStorage(){
  try{
    
    await syncWikiFolioUser();
    // Superseded: accountDetect returns null while a prompt is pending, and the
    // currentAccountId guard below is what now freezes this broker's writes.

    const lang = document.querySelector(".js-countrymode-select + button .filter-option-inner-inner")?.innerText.trim() || null;
    console.log("mainWikiFolioSaveDataToLocalStorage lang",lang);
    if(lang != "Deutschland") return;

    // Rows with no account_id would merge into the wrong account.
    if (!currentAccountId) {
      console.log("wikifolio: account id unknown, skipping save");
      return false;
    }

    if(checkIfWikiFolioStocksLoaded()){
      const freshWikifolio = await getAllStockDataWikiFolio();
      // Never persist an empty scrape: getLatestData would read every position as sold.
      if (!freshWikifolio.length) {
        console.log("wikifolio: no rows scraped, skipping save to avoid wiping WIKIFOLIO");
        return false;
      }
      const storedWikifolio = await chrome.storage.local.get(['WIKIFOLIO']);
      chrome.storage.local.set({
        [`WIKIFOLIO`]: accountReplaceRows(storedWikifolio.WIKIFOLIO, freshWikifolio, broker, currentAccountId)
      });
      console.log("wikifolio: Saved Data To Local Storage!");

      chrome.storage.local.get(['WIKIFOLIO'], (result) => {
        const currentData = result.WIKIFOLIO || [];
        const cashIndex = currentData.findIndex(item => item.stock_name === 'Cash' && item.broker === broker
          && item.account_id === currentAccountId);
        const now = new Date();
        let currentTimestamp = now.toISOString();
        let accountBalance = document.querySelector('.js-cash-account-current-balance')?.textContent?.trim() || 0;
        if (!accountBalance) return null;
        accountBalance = accountBalance.split(' ')[0];
        accountBalance = germanToNumer(accountBalance);
        
        if (cashIndex !== -1) {
          currentData[cashIndex].total_entry_value = accountBalance;
          currentData[cashIndex].timestamp = currentTimestamp;
        } else {
          currentData.push({
            id: crypto.randomUUID(),
            broker: broker,
            account_id: currentAccountId,
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

        chrome.storage.local.set({ WIKIFOLIO: currentData }, () => {
        });
        updateCustomRowDataWikifolio();
      });

      return false;
    }else{
      console.log("Can't update data, not on stocks page...");
      return;
    }
  }catch (err) {
    console.error('mainWikiFolioSaveDataToLocalStorage error:', err);
  }
}