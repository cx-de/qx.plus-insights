/*
    These functions can only be applied to consorsbank website
    as it depends on a specific HTML structure
*/

import { germanToNumer } from "./helper";

const broker = "Consors Bank";

let currentAccountId:any = null;


async function addSyncButtonOnConsorsBank(){
  console.log("addSyncButtonOnConsorsBank")
  const selectWrapper = document.querySelector('.select-dropdown-wrapper--white .select-dropdown');
  if (selectWrapper) {
    const parent = selectWrapper.parentElement.parentElement;
    if (!parent.querySelector('.sync-qx-button')) {
      parent.style.display = 'flex';
      parent.style.alignItems = 'center';
      parent.style.gap = '10px'; // spacing between select and button

      // Create the button

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sync-qx-button";
    button.style.marginLeft = "10px";
    button.style.padding = "5px 10px";
    button.style.border = "none";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";
    button.style.color = "white";
    attachSyncFeedback(button, consorsBankSaveDataToLocalStorage);
    parent.appendChild(button);
  }
  }
}

function addCustomRowHeaderConsorsBank(){
  console.log("addCustomRowHeaderWikifolio");
  
  // Select the sticky header row
  const headerRow = document.querySelector('.tablecards-row-descriptions[data-type="sticky-header"]');
  if (!headerRow) return;

  // Avoid duplicates: if custom header already exists, do nothing
  if (headerRow.querySelector('.custom-col')) {
    console.log('Custom columns already added. Skipping...');
    return;
  }

  // Find all header cells
  const headerCells = headerRow.querySelectorAll('.tablecards-cell');
  headerCells.forEach((headCel,index) => {
    const newHeaderCell = document.createElement('div');
    newHeaderCell.className = 'flex middle-xs no-wrap custom-col';
    newHeaderCell.innerHTML = `
      <div>
        <div class="link link-inline link-underline link--grey">
          ${EXTRA_ROW_HEADERS[index] || '&nbsp;'}
        </div>
      </div>`;
      headerCells[index].appendChild(newHeaderCell);
  });
}

async function updateCustomRowDataConsorsBank(){
  console.log("updateCustomRowDataConsorsBank");

  const result = await chrome.storage.local.get(['MAIN_LIST']) || [];
  const accountRows = await accountOwnRows(result.MAIN_LIST || [], broker, currentAccountId);
  // One account id covers several depots here, and only this one is on screen.
  const depotNo = new URLSearchParams(window.location.search).get("depotNo");
  const data = depotNo
    ? accountRows.filter((item:any) => String(item.deposite_number) === String(depotNo))
    : accountRows;
  if (!data.length) return;

  
  try {
    
    const headerRows = document.querySelectorAll('.tablecards-row');
    if (!headerRows) {
      console.log("updateCustomRowDataConsorsBank No rows ");
      return false;
    }
    
    headerRows.forEach((headerRow,index) => {
      console.log("updateCustomRowDataConsorsBank headerRow",headerRow);
      const headerCells = headerRow.querySelectorAll('.tablecards-cell');
      
      if (headerRow.querySelector('.custom_colValue')) {
        console.log('Custom columns already added. Skipping...');
        return;
      }

      const wknElement = headerRow.querySelector('[label="WKN"]');
      const currentWKN = wknElement ? wknElement.getAttribute('ui-value') : null;
      console.log("consorsBankUpdateCustomRowData currentWKN",currentWKN);
      const currentStock = data.find(item => item.wkn === currentWKN);
      if(!currentStock){ return; }
      
      EXTRA_ROW_COLUMNS.forEach((col, i) => {
        const cell = headerCells[i];
        if (!cell) return;
        if (cell.querySelector(`.custom_colValue[data-col="${col}"]`)) return;

        const colVal = updateColumnValueHtml(currentStock, col);
        const newHeaderCell = document.createElement('div');

        newHeaderCell.className = 'flex middle-xs no-wrap custom_colValue';
        newHeaderCell.setAttribute("data-col", col);
        newHeaderCell.innerHTML = `<div>${colVal}</div>`;
        cell.appendChild(newHeaderCell);
      });

    });

  } catch (error) {
    console.log("Failed to get MAIN_LIST from storage:", error);
  }
}

async function syncConsorsBankUser() {
  console.log("syncConsorsBankUser");
  try {
    const stored = await chrome.storage.local.get({ CUR_CONSORSBANKID: null });
    // Only safe while this broker has one account; see accountMayFallback. With
    // several, clear it so a value left over from an earlier tick cannot stamp wrong.
    currentAccountId = (await accountMayFallback(broker) && stored.CUR_CONSORSBANKID)
      ? String(stored.CUR_CONSORSBANKID) : null;

    const userInfoString = sessionStorage.getItem("wemo.user.info");
    if (!userInfoString) return currentAccountId;

    const userInfo = JSON.parse(userInfoString);
    const currentSessionId = userInfo.userId;
    if (!currentSessionId) {
      console.log('syncConsorsBankUser not found in cookies');
      return currentAccountId;
    }

    // depotNo is what migration stamped, so pass it as the legacy id or this
    // customer id looks like a brand-new account and prompts for no reason.
    const params = new URLSearchParams(window.location.search);
    const depotNo = params.get("depotNo");

    // null while a prompt is pending, which is what freezes this broker's writes.
    currentAccountId = await accountDetect(broker, String(currentSessionId), depotNo);
    if (currentAccountId) await chrome.storage.local.set({ CUR_CONSORSBANKID: currentAccountId });
  } catch (err) {
    // Last known id stays in the module snapshot; a parse failure must not blank it.
    console.error('syncConsorsBankUser error:', err);
  }
  return currentAccountId;
}


// Checks whether the user is on stocks page data can be stored locally & accurately
function consorsBankDepositPortfolio() {
  const stockLink = document.querySelector("li.tabs--active span");
  return !!stockLink && stockLink.textContent.trim().toLowerCase().includes("portfolio");
}

// Save data on Chrome Storage for the grouped page
async function consorsBankSaveDataToLocalStorage() {
  console.log("consorsBankSaveDataToLocalStorage")
  await syncConsorsBankUser();

  // Rows with no account_id would merge into the wrong account.
  if (!currentAccountId) {
    console.log("consorsbank: account id unknown, skipping save");
    return false;
  }

  if (consorsBankDepositPortfolio()) {
    console.log("consorsBankSaveDataToLocalStorage isOnStocksPage");
    
    const result = await chrome.storage.local.get(['consorsBank']);
    const consorsBankData = result.consorsBank || [];
    const latestConsorsBankData = consorsBankGetAllStockData();

    // Never persist an empty scrape: getLatestData would read every position as sold.
    if (!latestConsorsBankData.length) {
      console.log("consorsbank: no rows scraped, skipping save to avoid wiping consorsBank");
      return false;
    }

    // Scoped by depot as well as account: one customer has several depots here and the
    // switcher only ever shows one, so an account-wide replace would delete the others.
    const depotNo = latestConsorsBankData[0]?.deposite_number;
    chrome.storage.local.set({
      [`consorsBank`]: accountReplaceRows(consorsBankData, latestConsorsBankData, broker, currentAccountId, depotNo)
    });

    console.log("Saved Data To Local Storage!");
    return false;
  }

}

// Get All Stock Rows
function consorsBankGetAllStockData() {
  const rows = document.querySelectorAll('.tablecards-row.transition--ease-3');
  const data:any = [];
  
  const params = new URLSearchParams(window.location.search);
  const depotNo = params.get("depotNo");

  if(depotNo){
    rows.forEach(row => {
      let rowData:any = {};
      
      // Get all elements inside this row with label and value
      const labels = row.querySelectorAll('.tablecards-label');
      const values = row.querySelectorAll('.tablecards-values');
      
      labels.forEach((label, index) => {
          const key = label.textContent.trim();
          const value = values[index] ? values[index].textContent.trim() : '';
          
          const id  = crypto.randomUUID();
          const isGroup  = false;

          rowData['id'] = id;
          rowData['isGroup'] = isGroup;
          rowData['broker'] = broker;
          rowData['account_id'] = currentAccountId;
          rowData['deposite_number'] = depotNo;
          
          //Einstandskurs inkl. NK
          if(key==="Name"){
            rowData['stock_name'] = value;
          }else if(key==="WKN"){
            rowData['wkn'] = value;
          }else if(key==="Gattung"){
            let type = value;
            if(type==='Aktie'){
              type = 'stock';
            }
            rowData['type'] = type;
          }else if(key==="Kurs"){
            let bid = value;
            bid = bid.split(' ')[0];
            bid = germanToNumer(bid);
            rowData['bid'] = bid;
          }else if(key==="Stück/Nominal"){
            let stocks_owned = germanToNumer(value);
            rowData['stocks_owned'] = stocks_owned;
          }else if(key==="Einstandskurs inkl. NK"){
            let buy_price = value;
            rowData['buy_price'] = germanToNumer(buy_price);
          }else if(key==="Einstandskurs"){
            
          }else if(key==="Einstandswert"){
            let total_entry_value = value;
            rowData['total_entry_value'] = germanToNumer(total_entry_value);
          }else if(key==="Datum/Uhrzeit"){
            const [day, month, year, time] = value.split(/[\s.]+/);
            const timestamp = new Date(`${year}-${month}-${day}T${time}`).toISOString();
            rowData['timestamp'] = timestamp;
          }else if(key==="Handelsplatz"){
            rowData['trading_partner'] = value;
          }else if(key==="Gesamtwert"){
          }else if(key==="Entwicklung absolut"){
          }else if(key==="Entwicklung prozentual"){
          }
      });
      data.push(rowData);
    });
    return data;
  }else{
    console.log("consorsBankGetAllStockData no depotNo");
    // Callers immediately read .length; falling off the end returned undefined.
    return [];
  }


}

export async function mainConsorsBank(){
  addSyncButtonOnConsorsBank();
  addCustomRowHeaderConsorsBank();
  updateCustomRowDataConsorsBank();

  await consorsBankSaveDataToLocalStorage();
}

