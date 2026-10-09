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

    let btnText = "Sync QX+";
    const syncBtn = document.createElement("a");
    syncBtn.className = "c-button c-wf-trade__header-button";
    syncBtn.href = "#sync";
    syncBtn.style.backgroundColor = "#fcaf2c";
    syncBtn.innerText = btnText;

    syncBtn.addEventListener("click", async () => {
      await mainWikiFolioSaveDataToLocalStorage();
      syncBtn.style.backgroundColor = "#57a658";
      syncBtn.textContent = "Synced";

      setTimeout(()=>{
        syncBtn.style.backgroundColor = "#fcaf2c";
        syncBtn.textContent = btnText;
      },1000);
    });

    container.appendChild(syncBtn);
  }
}

export function addCustomRowHeaderWikifolio() {
  console.log("addCustomRowHeaderWikifolio");
  const rowHeaders = [
    "Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)",
    "", 
    "Cap", 
    "Zielwert",
    "G/V Ziel €", 
    "G/V Ziel p.a. (abs.) %", 
    "Basiswert-Kurs"
  ];
  const table = document.querySelector(".c-r-table__tr.c-r-table__tr--head");
  if (!table) return;

  // Prevent duplicate insert
  if (document.querySelector(".custom-extra-row")) return;

  const newRow = document.createElement("tr");
  newRow.className = "custom-extra-row";   // <-- marker to detect later
  newRow.innerHTML = rowHeaders.map((heading, index) => {
    return `<td class="c-r-table__head c-r-table__cell hidden-from-xs text-right u-min-col nowrap">
      ${heading}
    </td>`;
  }).join("");

  table.parentNode.insertBefore(newRow, table.nextSibling);
}

export async function updateCustomRowDataWikifolio(){
  console.log("updateCustomRowDataWikifolio");

  const result = await chrome.storage.local.get(['MAIN_LIST']) || [];
  console.log("updateCustomRowDataWikifolio result",result.MAIN_LIST);
  if (!result.MAIN_LIST.length) return;

  const ownRows = await accountOwnRows(result.MAIN_LIST, broker, currentAccountId);

  const columns = [
    "type", 
    "",
    "cap", 
    "future_total_value",
    "profit_loss_target",
    "profit_loss_target_pa", 
    "underlying_price"
  ];
    
  const headers  = document.querySelectorAll(".table-group-row");
  if (!headers ) return;
  
  // Only apply for first 2 headers
  const targetHeaders = Array.from(headers).slice(0, 2);
  targetHeaders.forEach(stockHeader => {
    let row = stockHeader.nextElementSibling;
    
    while (row && !row.classList.contains("table-group-row")) {
      if (!(row.nextElementSibling && row.nextElementSibling.classList.contains("custom-extra-row"))) {
        //let parentISIN = row.parentNode?.querySelector('.isin')?.textContent.trim();
        let parentISIN = row?.querySelector('.isin')?.textContent.trim();
        let currentRowData = ownRows.find(item => item.isin === parentISIN);
        console.log("updateCustomRowDataWikifolio parentISIN",parentISIN);
        //console.log("updateCustomRowDataWikifolio row",row);
        //console.log("updateCustomRowDataWikifolio currentRowData",currentRowData);
        
        if(currentRowData){
          const extra = document.createElement("tr");
          extra.className = "c-r-table__tr custom-extra-row";
          //extra.innerHTML = `<td class='c-r-table__cell'> Extra info row: ${parentISIN}</td>`;
          extra.innerHTML = columns.map((col, index) => {
            let colVal = updateColumnValue(currentRowData, col);
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
  const today = new Date().toISOString().slice(0, 10);
  
  try{
    const storedSession = await chrome.storage.local.get({ CUR_WIKIFOLIO: null });
    const storedSessionId = storedSession.CUR_WIKIFOLIO;
    console.log('syncWikiFolioUser storedSessionId',storedSessionId);
    
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
      console.log('syncWikiFolioUser if currentSessionId',currentSessionId);
      console.log('syncWikiFolioUser if storedSessionId',storedSessionId);
      // null while a prompt is pending, which is what freezes this broker's writes.
      currentAccountId = await accountDetect(broker, String(currentSessionId));
      if (currentAccountId) await chrome.storage.local.set({ CUR_WIKIFOLIO: currentAccountId });
      //await chrome.storage.local.set({ hasNewAccount: 'wikifolio' });
      //await chrome.storage.local.set({ NEW_WIKIFOLIO: currentSessionId });
    } else {
      console.log('syncWikiFolioUser not found in cookies');
    }
  }catch (err) {
    console.error('syncWikiFolioUser error:', err);
  }
}

export function checkIfWikiFolioStocksLoaded() {
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

export async function getWKNFromDetailPage2(row) {
  try {
    const link = row.querySelector(".hbo-link.area");
    if (!link) return null;

    const url = link.href;
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const labels = [...doc.querySelectorAll("dt.c-underlying-info__label")];

    for (const dt of labels) {
      if (dt.innerText.trim() === "WKN") {
        const dd = dt.nextElementSibling;
        return dd?.innerText.trim() || null;
      }
    }

    return null;
  } catch (e) {
    console.error("Failed to get WKN", e);
    return null;
  }
}


function loadCache() {
  return JSON.parse(localStorage.getItem("wikifolioWknCache") || "{}");
}

function saveCache(cache) {
  localStorage.setItem("wikifolioWknCache", JSON.stringify(cache));
}

export async function getWKNFromDetailPage(row, type='stock') {
  let wknCache = loadCache();

  const isin = row.querySelector(".isin")?.innerText.trim();
  //console.log("getWKNFromDetailPage isin",isin)
  //console.log("getWKNFromDetailPage type",type)
  if (!isin) return null;

  if (wknCache[isin]) return wknCache[isin];
  //console.log("getWKNFromDetailPage == fromLink isin",isin)
  
  const certificateLink = "https://markets.vontobel.com/de-de/produkte/hebel/discount-optionsscheine/"+isin;
  //const link = row.querySelector(".hbo-link.area");
  const link = type === 'stock' ? row.querySelector(".hbo-link.area").href : certificateLink;
  //console.log("getWKNFromDetailPage == fromLink link",link);
  if (!link) return null;

  let wkn = '';
  try{
    //const res = await fetch(link.href, { credentials: "include" });
    const res = await fetch(link, { credentials: "include" });
    const html = await res.text();
    //console.log("getWKNFromDetailPage == fromLink res",res);
    //console.log("getWKNFromDetailPage == fromLink html",html);

    const doc = new DOMParser().parseFromString(html, "text/html");
    //console.log("getWKNFromDetailPage == fromLink doc",doc);
    
    if(type === 'stock'){
      const dt = [...doc.querySelectorAll("dt.c-underlying-info__label")]
        .find(el => el.innerText.trim() === "WKN");
      wkn = dt?.nextElementSibling?.innerText.trim() || null;
    }else{
      //console.log("getWKNFromDetailPage == fromLink doc",doc);
      const btn = doc.querySelector('[data-testid="wkn_button"]');
      //console.log("getWKNFromDetailPage == fromLink btn",btn);
      if (!btn) return null;
      const text = btn.querySelector("span")?.innerText.trim() || "";
      const parts = text.split(/\s+/).pop();
      wkn = parts.pop();
    }

    //console.log("getWKNFromDetailPage == fromLink wkn",wkn);
  }catch(error){
    console.error("getWKNFromDetailPage == fromLink error",error);
    if(type !== 'stock'){
      wkn = isin;
    }
  }
  
  //console.log("getWKNFromDetailPage == fromLink SAVE wkn",wkn);
  wknCache[isin] = wkn;
  saveCache(wknCache);

  return wkn;
}


//Get All Stock Data
export async function getAllStockDataWikiFolio(){
    console.log("getAllStockData");
    const url = window.location.pathname;
    const urlParts = url.split("/");
    const deposite_number = url.split("/")[urlParts.length-1];
    //console.log("getAllStockData deposite_number",deposite_number);
    
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

      //if (currentGroup === "stocks") result.stocks.push(row);
      //if (currentGroup === "structuredProducts") result.structuredProducts.push(row);

      const id  = crypto.randomUUID();
      const isinEl = row.querySelector(".isin");
      const stock_name = row.querySelector("a span")?.textContent.trim() ?? "";
      
      const type = currentGroup === 'stocks' ? 'stock' : 'certificate';
      console.log("getAllStockData currentGroup",currentGroup);
      console.log("getAllStockData type",type);

      const isin = isinEl.textContent.trim();
      //const wkn = '';
      //const wkn = await getWKNFromDetailPage(row,type) || isin;
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
      //console.log("getAllStockData perfCell",perfCell);
      if (perfCell) {
        profit_loss_price = perfCell.querySelector(".nowrap:nth-child(1)")?.innerText.trim();
        profit_loss_price = germanToNumer(profit_loss_price);
        
        profit_loss_percentage = perfCell.querySelector(".nowrap:nth-child(2)")?.innerText.trim();
        //console.log("getAllStockData profit_loss_percentage",profit_loss_percentage);
        profit_loss_percentage = profit_loss_percentage.replace('%', '');
        profit_loss_percentage = germanToNumer(profit_loss_percentage);
      }

      const total_entry_value = value - profit_loss_price;

      let buy_price = 0;
      if (stocks_owned > 0) {
        //const buyTotal = total_entry_value - profit_loss_price;
        //buy_price = buyTotal / stocks_owned;
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

    console.log("getAllStockData stockData",stockData);
    return stockData;
}

//Save data on Chrome Storage for the grouped page
export async function mainWikiFolioSaveDataToLocalStorage(){
  try{
    
    await syncWikiFolioUser();
    // Superseded: accountDetect returns null while a prompt is pending, and the
    // currentAccountId guard below is what now freezes this broker's writes.
    //const storedSession = await chrome.storage.local.get({ hasNewAccount: null });
    //const hasNewAccount = storedSession.hasNewAccount;
    //if (hasNewAccount === 'wikifolio') {
    //  console.log("mainWikiFolioSaveDataToLocalStorage hasNewAccount")
    //  return false;
    //}

    const lang = document.querySelector(".js-countrymode-select + button .filter-option-inner-inner")?.innerText.trim() || null;
    console.log("mainWikiFolioSaveDataToLocalStorage lang",lang);
    if(lang != "Deutschland") return;

    //if(!isOnStocksPage()){
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
        console.log("mainWikiFolioSaveDataToLocalStorage currentData",currentData);
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
          console.log("wikifolio accountBalance:",accountBalance);
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