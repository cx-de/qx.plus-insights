import { i18n } from '~/entrypoints/home/i18n';
import { SYNC_COLOR_IDLE, SYNC_COLOR_DONE, SYNC_COLOR_ERROR } from './constants';

// Values shown in the extra row under each position. "" leaves a cell empty so the row lines up with the broker's own columns.
export const EXTRA_ROW_COLUMNS = ["type", "", "cap", "future_total_value", "profit_loss_target", "profit_loss_target_pa", "underlying_price"];

// Header labels for EXTRA_ROW_COLUMNS, same order.
export const EXTRA_ROW_HEADERS = ["Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)", "", "Cap", "Zielwert", "G/V Ziel €", "G/V Ziel p.a. (abs.) %", "Basiswert-Kurs"];

// flatex's depot table has room for more cells, so its extra row shows a longer list.
export const FLATEX_EXTRA_ROW_COLUMNS = ["type", "valuation_date", "cap", "future_total_value", "na", "profit_loss_target", "profit_loss_target_pa", "underlying_price"];

// Brand-coloured "Sync QX+" button behaviour: run the save, flash the result for a second, then reset.
export function attachSyncFeedback(button: HTMLElement, save: () => Promise<any>) {
  const idleText = 'Sync QX+';
  button.textContent = idleText;
  button.style.backgroundColor = SYNC_COLOR_IDLE;
  button.addEventListener('click', async () => {
    try {
      await save();
      button.style.backgroundColor = SYNC_COLOR_DONE;
      button.textContent = 'Synced';
    } catch (err) {
      console.error('attachSyncFeedback error:', err);
      button.style.backgroundColor = SYNC_COLOR_ERROR;
      button.textContent = 'Sync failed';
    }
    setTimeout(() => {
      button.style.backgroundColor = SYNC_COLOR_IDLE;
      button.textContent = idleText;
    }, 1000);
  });
}

function updateColumnValue(data:any, col:any){
  let colVal = "-";
  if(data[col] !== undefined){
    if(col=="type"){
      //$type ($underlying_isin / $settlement / $quanto / $ratio)
      colVal = `${i18n.global.t(data[col])} (${data['underlying_isin'] ? data['underlying_isin'] : '-' } / ${data['settlement'] ? data['settlement'] : '-'} / ${data['quanto'] ? data['quanto'] : '-'} / ${ data['ratio'] ? numberToGerman(data['ratio'],false,4) : '-'})`;
    }else if(col=="cap"){
      colVal = numberToGerman(data[col])+ ' '+ (data['currency'] || '');
    }else if(col==="future_total_value"){
      colVal = numberToGerman(data[col]);
    }else if(col==="profit_loss_target"){
      colVal = numberToGerman(data[col])+' €';
    }else if(col==="profit_loss_target_pa"){
      colVal = numberToGerman(data[col], false, 2)+' %';
    }else if(col==="underlying_price"){
      colVal = numberToGerman(data[col]);
    }else{
      colVal = data[col];
    }
  }

  return colVal;
}

// Values come from the feed API but land in bank pages via innerHTML, so they must not carry markup.
export function updateColumnValueHtml(data:any, col:any){
  return escapeHtml(updateColumnValue(data, col));
}

export function updateColumns(row:any, data = {}) {
    
    FLATEX_EXTRA_ROW_COLUMNS.forEach((col) => {
      const columnElement = row.querySelector(`.${col}`);
      if (columnElement) {
        let colVal = updateColumnValue(data, col);
        columnElement.innerText = colVal;
      }
    });
}
  
export function insertAfter(referenceNode:any, newNode:any) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}