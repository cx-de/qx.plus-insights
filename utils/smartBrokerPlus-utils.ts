/*
    These functions can only be applied to SmartBrokerPlus website
    as it depends on a specific HTML structure
*/

const broker = "Smartbroker+";

// SmartBroker+ exposes no customer id anywhere, so the depot number is the account.
let currentAccountId:any = null;

async function smartBrokerSyncUser() {
  console.log("smartBrokerSyncUser");
  try {
    const stored = await chrome.storage.local.get({ CUR_SMARTBROKERID: null });
    // Only safe while this broker has one account; see accountMayFallback. The
    // /finance dashboard has no depot in its URL and relies on this for the Cash row.
    // With several accounts clear it instead, so a leftover value cannot stamp wrong.
    currentAccountId = (await accountMayFallback(broker) && stored.CUR_SMARTBROKERID)
      ? String(stored.CUR_SMARTBROKERID) : null;

    // Only a depot URL carries the id; /finance has to fall back to the stored one.
    let pageId:any = null;
    const urlParts = window.location.pathname.split("/");
    const depotAt = urlParts.indexOf('depot');
    // The segment after "depot", not the last one: /depot/<id>/orders would give "orders".
    if (depotAt !== -1) pageId = urlParts[depotAt + 1] || null;
    if (!pageId) return currentAccountId;

    // Pre-2.9 rows were stamped with the LAST path segment; pass it as the legacy id
    // so /depot/<id>/orders data folds in instead of prompting as a new account.
    const legacyId = urlParts[urlParts.length - 1] || null;

    // null while a prompt is pending, which is what freezes this broker's writes.
    currentAccountId = await accountDetect(broker, String(pageId), legacyId);
    if (currentAccountId) await chrome.storage.local.set({ CUR_SMARTBROKERID: currentAccountId });
  } catch (err) {
    // Last known id stays in the module snapshot; a read failure must not blank it.
    console.error('smartBrokerSyncUser error:', err);
  }
  return currentAccountId;
}

async function addSyncButtonOnSmartBroker() {
  console.log("addSyncButtonOnSmartBroker");

  const exportBtn = document.querySelector('[data-testid="PageHeaderFinance"]');
  const container = exportBtn?.parentElement;
  if (!exportBtn || !container) return;
  
  let syncBtn = container.querySelector<HTMLElement>('[data-testid="sync-button"]');
  if (syncBtn) return;

  syncBtn = document.createElement("button");
  syncBtn.setAttribute("data-testid", "sync-button");
  syncBtn.className ="flex justify-center gap-x-1.5 p-1  font-semibold text-onSurface-primary text-10 text-label-xs inline-block mt-2";
  attachSyncFeedback(syncBtn, smartBrokerSaveDataToLocalStorage);
  container.appendChild(syncBtn);
}

function addCustomRowHeaderSmartBroker() {
  console.log("addCustomRowHeaderSmartBroker");
  
  const header = document.querySelector('[data-testid="depot-sorting-header"]');
  if (!header) return;

  const cols = header.querySelectorAll('.flex.flex-col');
  if (header.querySelector('[data-qx="custom-extra-row"]')) return;

  cols.forEach((col, i) => {
    const text = EXTRA_ROW_HEADERS[i] ?? "";
    const row = document.createElement("p");
    row.setAttribute("data-qx", "custom-extra-row");
    row.className = "text-onSurface-secondary";
    
    row.textContent = text;
    col.appendChild(row);
  });
}

async function updateCustomRowDataSmartBroker(){
  console.log("updateCustomRowDataSmartBroker");

  const result = await chrome.storage.local.get(['MAIN_LIST']) || [];
  if (!result.MAIN_LIST?.length) return;

  const ownRows = await accountOwnRows(result.MAIN_LIST, broker, currentAccountId);

    
  const cards = document.querySelectorAll('a[data-testid="depot-asset-card"]');
  cards.forEach(card => {
    if (card.nextElementSibling?.classList?.contains("custom-extra-row")) return;
    
    const isin = smartBrokerIsinFromCard(card);
    if (!isin) return;

    const rowData = ownRows.find( x => x.isin?.toUpperCase() === isin.toUpperCase());
    if (!rowData) return;
    
    const extra = document.createElement("div");
    extra.className =
      "[grid-template-columns:minmax(0,1fr)_minmax(0,0.8fr)_minmax(140px,auto)_minmax(140px,auto)_minmax(140px,auto)] grid gap-3 border-onSurface-quaternary border-b p-4 text-onSurface-primary bg-surface-5 custom-extra-row";

    extra.innerHTML = EXTRA_ROW_COLUMNS
    .slice(0, 5)  // grid has 5 columns
    .map((col, index) => `
        <div class="flex flex-col ${index === 0 ? '' : 'items-end'}">
          <p class="text-label-sm text-onSurface-secondary">
            ${updateColumnValueHtml(rowData, col)}
          </p>
        </div>
      `).join("");
      card.parentNode!.insertBefore(extra, card.nextSibling);
    });
  
}


// Own name: flatex exports a global getIdFromRow that reads a table cell instead.
const smartBrokerIsinFromCard = (aTag:any) =>{
    let link = aTag.getAttribute("href");
    let arrayOfLinkPath = link.split("/");
    const ISIN = arrayOfLinkPath[arrayOfLinkPath.length - 1];
    return ISIN;
}

function checkIfStocksLoaded(){
  console.log("checkIfStocksLoaded")
    const stockRow = document.querySelector("main > div div a");
    if(stockRow){
        let ISIN = smartBrokerIsinFromCard(stockRow);
        if(ISIN.length == "12")return true;
        else return false;
    }

    return false;
}


//Get All Stock Data
function smartBrokerGetAllStockData(){
    console.log("smartBrokerGetAllStockData")
    //all stocks in an array
    const allStocksPurchased = Array.from(document.querySelectorAll("[data-testid='depot-asset-card']"));
    
    //Store all the stock data
    let stockData:any[] = [];
    for(let stock of allStocksPurchased){
      const id  = crypto.randomUUID();
      const isin = smartBrokerIsinFromCard(stock);
      
      const url = window.location.pathname;
      const urlParts = url.split("/");
      // Segment after "depot": the last one is "orders" etc. on depot sub-routes.
      const depotAt = urlParts.indexOf('depot');
      const deposite_number = depotAt !== -1
        ? urlParts[depotAt + 1] : urlParts[urlParts.length-1];

      const cols = stock.querySelectorAll(":scope > div > div");
      
      let type = cols[0]?.querySelectorAll("p")[1]?.textContent.trim() || "";
      if(type=='Aktien'){
        type = 'stock';
      }else if(type=='ETFs'){
        type = 'certificate';
      }

      const stock_name = cols[0]?.querySelector("p")?.textContent.trim() || "";
      const wkn = cols[0]?.querySelectorAll("p")[2]?.textContent.trim() || "";
      
      // String fallbacks: a number 0 made germanToNumer/substring throw and one blank cell aborted every save.
      const total_entry_value = germanToNumer(cols[1]?.querySelector("p")?.textContent.trim() || '0');

      const stocks_owned = germanToNumer(cols[1]?.querySelectorAll("p")[1]?.textContent.trim() || '0');

      const bidText = cols[2]?.querySelector("p")?.textContent.trim() || '';
      const bid = bidText ? germanToNumer(bidText.substring(0, bidText.length - 1).trim()) : 0;
      
      const profit_loss_price = germanToNumer(cols[4]?.querySelector(".priceClass")?.textContent.trim() || '0');

      let profit_loss_percentage:any = cols[4]?.querySelector("div")?.textContent.trim() || '0';
      profit_loss_percentage = profit_loss_percentage.replace('%', '');
      profit_loss_percentage = germanToNumer(profit_loss_percentage);

      let buy_price = 0;
      if (stocks_owned > 0) {
        const buyTotal = total_entry_value - profit_loss_price;
        buy_price = buyTotal / stocks_owned;
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
        buy_price:buy_price, 
        stocks_owned,
        total_entry_value,
        profit_loss_percentage,
        profit_loss_price,
        timestamp: Date.now()
      });
    }

    return stockData;
}

function checkSmartBrokerDashboardPage (){
  return window.location.href.toLowerCase().includes("finance");
}

//Save data on Chrome Storage for the grouped page
export async function smartBrokerSaveDataToLocalStorage(){
  try{
    
    await smartBrokerSyncUser();

    // Rows with no account_id would merge into the wrong account.
    if (!currentAccountId) {
      console.log("smartbroker: account id unknown, skipping save");
      return false;
    }

    if(checkIfStocksLoaded()){
      addSyncButtonOnSmartBroker();
      addCustomRowHeaderSmartBroker();
      // Display only: a repaint error must not skip the save below.
      await updateCustomRowDataSmartBroker().catch((err) => console.error('updateCustomRowDataSmartBroker error:', err));
      
      
      const freshSmartBroker = smartBrokerGetAllStockData();
      // Never persist an empty scrape: getLatestData would read every position as sold.
      if (!freshSmartBroker.length) {
        console.log("smartbroker: no rows scraped, skipping save to avoid wiping SMART_BROKER_PLUS");
        return false;
      }
      const storedSmartBroker = await chrome.storage.local.get(['SMART_BROKER_PLUS']);
      await chrome.storage.local.set({
        [`SMART_BROKER_PLUS`]: accountReplaceRows(storedSmartBroker.SMART_BROKER_PLUS, freshSmartBroker, broker, currentAccountId)
      });
      console.log("smartbroker: Saved Data To Local Storage!");
      return false;
    }else if(checkSmartBrokerDashboardPage()){
      const card = document.querySelector('[data-testid="portfolio-Verrechnungskonto"]')?.closest("a");
      if (!card) return null;
      const balanceText = card.querySelector('h4 span[aria-hidden="true"]')?.textContent?.trim() || '';
      const accountBalance = germanToNumer(balanceText.split(' ')[0]);
      // A masked or not-yet-rendered balance must not overwrite the stored cash with 0 or NaN.
      if (!balanceText || isNaN(accountBalance)) {
        console.log("smartbroker: cash not readable, skipping save");
        return false;
      }

      const result = await chrome.storage.local.get(['SMART_BROKER_PLUS']);
      const currentData = result.SMART_BROKER_PLUS || [];
      const cashIndex = currentData.findIndex((item:any) => item.stock_name === 'Cash' && item.broker === broker
        && item.account_id === currentAccountId);
      
      const now = new Date();
      let currentTimestamp = now.toISOString();
      
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

      await chrome.storage.local.set({ SMART_BROKER_PLUS: currentData });
    }else{
      console.log("Can't update data, not on stocks page...");
      return;
    }
  }catch (err) {
    // Nothing was written yet or the write failed whole; the next tick retries.
    console.error('smartBrokerSaveDataToLocalStorage error:', err);
  }
}
