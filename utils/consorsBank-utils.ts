/*
    These functions can only be applied to consorsbank website
    as it depends on a specific HTML structure
*/

import { germanToNumer } from "./helper";

const broker = "Consors Bank";

let currentAccountId:any = null;


export async function addSyncButtonOnConsorsBank(){
  console.log("addSyncButtonOnConsorsBank")
  const selectWrapper = document.querySelector('.select-dropdown-wrapper--white .select-dropdown');
  if (selectWrapper) {
    const parent = selectWrapper.parentElement.parentElement;
    if (!parent.querySelector('.sync-qx-button')) {
      parent.style.display = 'flex';
      parent.style.alignItems = 'center';
      parent.style.gap = '10px'; // spacing between select and button

      // Create the button
      // const syncBtn = document.createElement('button');
      // syncBtn.id = 'syncAccountBtn';
      // syncBtn.className = 'button button--small button-secondary sync-qx-button';
      // syncBtn.title = 'Sync Account';
      // syncBtn.textContent = 'Sync QX+';

    let btnText = "Sync QX+";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = btnText;
    button.className = "sync-qx-button";
    button.style.marginLeft = "10px";
    button.style.backgroundColor = "#fcaf2c";
    button.style.padding = "5px 10px";
    button.style.border = "none";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";
    button.style.color = "white";

    button.addEventListener("click", async () => {

      await consorsBankSaveDataToLocalStorage();

      button.style.backgroundColor = "#57a658";
      button.textContent = "Synced";

      setTimeout(()=>{
        button.style.backgroundColor = "#fcaf2c";
        button.textContent = btnText;
      },1000);
    });
    parent.appendChild(button);
  }
  }
}

export function addCustomRowHeaderConsorsBank(){
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
          ${rowHeaders[index] || '&nbsp;'}
        </div>
      </div>`;
      headerCells[index].appendChild(newHeaderCell);
  });
}

export async function updateCustomRowDataConsorsBank(){
  console.log("updateCustomRowDataConsorsBank");

  const result = await chrome.storage.local.get(['MAIN_LIST']) || [];
  const accountRows = await accountOwnRows(result.MAIN_LIST || [], broker, currentAccountId);
  // One account id covers several depots here, and only this one is on screen.
  const depotNo = new URLSearchParams(window.location.search).get("depotNo");
  const data = depotNo
    ? accountRows.filter((item:any) => String(item.deposite_number) === String(depotNo))
    : accountRows;
  console.log("updateCustomRowDataConsorsBank result",data);
  if (!data.length) return;

  const columns = [
    "type", 
    "",
    "cap", 
    "future_total_value",
    "profit_loss_target",
    "profit_loss_target_pa", 
    "underlying_price"
  ];
  
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
      console.log("consorsBankUpdateCustomRowData currentStock",currentStock);
      if(!currentStock){ return; }
      
      columns.forEach((col, i) => {
        const cell = headerCells[i];
        if (!cell) return;
        if (cell.querySelector(`.custom_colValue[data-col="${col}"]`)) return;

        const colVal = updateColumnValue(currentStock, col);
        const newHeaderCell = document.createElement('div');

        newHeaderCell.className = 'flex middle-xs no-wrap custom_colValue';
        newHeaderCell.setAttribute("data-col", col);
        //newHeaderCell.innerHTML = `<div>${col} ${colVal}</div>`;
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
export function consorsBankDepositPortfolio() {
  const stockLink = document.querySelector("li.tabs--active span");
  return !!stockLink && stockLink.textContent.trim().toLowerCase().includes("portfolio");
}

// Save data on Chrome Storage for the grouped page
export async function consorsBankSaveDataToLocalStorage() {
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
    //updateData();
    return false;
  }

}

// Get All Stock Rows
export function consorsBankGetAllStockData() {
  const rows = document.querySelectorAll('.tablecards-row.transition--ease-3');
  const data:any = [];
  
  const params = new URLSearchParams(window.location.search);
  const depotNo = params.get("depotNo");
  console.log("consorsBankGetAllStockData depotNo",depotNo);

  if(depotNo){
    rows.forEach(row => {
      let rowData:any = {};
      
      // Get all elements inside this row with label and value
      const labels = row.querySelectorAll('.tablecards-label');
      const values = row.querySelectorAll('.tablecards-values');
      
      labels.forEach((label, index) => {
          const key = label.textContent.trim();
          const value = values[index] ? values[index].textContent.trim() : '';
          //console.log("consorsBankGetAllStockData index key value",index,key,value);
          
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
            /*
            let total_value = value;
            total_value = total_value.split(' ')[0];
            total_value = germanToNumer(total_value);
            rowData['total_value'] = total_value;
            */
          }else if(key==="Entwicklung absolut"){
            //rowData['profit_loss_price'] = value;
          }else if(key==="Entwicklung prozentual"){
            //rowData['profit_loss_percentage'] = value;
          }else{
            console.log("consorsBankGetAllStockData index key value",index,key,value);
            //rowData[key] = value;
          }
      });
      data.push(rowData);
    });
    console.log("consorsBankGetAllStockData",data);
    return data;
  }else{
    console.log("consorsBankGetAllStockData no depotNo");
    // Callers immediately read .length; falling off the end returned undefined.
    return [];
  }

  /*
  return Array.from(rows, (row, x) => {
    const id  = crypto.randomUUID();
    const isGroup  = false;

    const stock_name = row.querySelector(".C0").textContent;
    const isin = getIdFromRow(secondRowOfAllStocks[x]);
    const wkn = secondRowOfAllStocks[x].textContent.split('(')[1]?.split(')')[0]?.trim();
    
    //Type
    let type = typetRowOfAllStocks[x].querySelector(".C0 .PaperKindName").textContent.trim();
    if(type=='Aktie'){
      type = 'stock';
    }else if(type=='Zertifikat'){
      type = 'certificate';
    }

    let stocks_owned = row.querySelector(".C2").textContent.trim().split(' ')[0];
    stocks_owned = germanToNumer(stocks_owned);

    let bid = secondRowOfAllStocks[x].querySelector(".C2").textContent.trim();
    bid = bid.substring(0, bid.length - 1).trim();
    bid = germanToNumer(bid);
    //console.log("getAllStockData bid",bid);

    let buy_price = secondRowOfAllStocks[x].querySelector(".C4").textContent.trim();
    buy_price = buy_price.substring(0, buy_price.length - 1).trim();
    buy_price = germanToNumer(buy_price);

    
    //let total_entry_value = row.querySelector(".C4 .PositiveAmount").textContent.trim().split(' ')[0];
    let total_entry_value = row.querySelector(".C4").textContent.trim().split(' ')[0];
    total_entry_value = germanToNumer(total_entry_value);

    let profit_loss_price = secondRowOfAllStocks[x].querySelector(".C5").textContent.trim().split(' ')[0];
    profit_loss_price = germanToNumer(profit_loss_price);
    
    let profit_loss_percentage = row.querySelector(".C5").textContent.trim();
    profit_loss_percentage = profit_loss_percentage.replace('%', '');
    profit_loss_percentage = germanToNumer(profit_loss_percentage);
    //.replace(/\s+/g, '');
    
    let timestamp = secondRowOfAllStocks[x].querySelector(".C1").textContent?.trim();
    //console.log("getAllStockData timestamp",timestamp);
    let page_timestamp = parseStockTimestamp(timestamp);
    //console.log("getAllStockData timestamp",timestamp);
    
    return { id, isGroup, broker,stock_name, isin, stocks_owned, buy_price,
      type, wkn, total_entry_value, profit_loss_percentage, profit_loss_price, 
      bid, page_bid:bid,
      timestamp:page_timestamp, page_timestamp 
    };

  });*/

}

export async function mainConsorsBank(){
  addSyncButtonOnConsorsBank();
  addCustomRowHeaderConsorsBank();
  updateCustomRowDataConsorsBank();

  await consorsBankSaveDataToLocalStorage();
}






