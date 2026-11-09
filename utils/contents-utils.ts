import { storage } from '#imports';
import { i18n } from '~/entrypoints/home/i18n';
import { SYNC_COLOR_IDLE, SYNC_COLOR_DONE, SYNC_COLOR_ERROR } from './constants';
import { tourSyncDone } from './tour-utils';
import { storageClearKeepPrivate } from '@/lib/storage-utils';

// Values shown in the extra row under each position. "" leaves a cell empty so the row lines up with the broker's own columns.
export const EXTRA_ROW_COLUMNS = ["type", "", "cap", "future_total_value", "profit_loss_target", "profit_loss_target_pa", "underlying_price"];

// Header labels for EXTRA_ROW_COLUMNS, same order.
export const EXTRA_ROW_HEADERS = ["Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)", "", "Cap", "Zielwert", "G/V Ziel €", "G/V Ziel p.a. (abs.) %", "Basiswert-Kurs"];

// flatex's depot table has room for more cells, so its extra row shows a longer list.
export const FLATEX_EXTRA_ROW_COLUMNS = ["type", "valuation_date", "cap", "future_total_value", "na", "profit_loss_target", "profit_loss_target_pa", "underlying_price"];

// Gate for every Sync click while demo data is loaded. A click is consent, but wiping the demo still asks once.
// 'replaced' leaves an empty registry, so the sync that follows adopts the real account without a prompt.
export async function contentSampleGate(): Promise<'none' | 'replaced' | 'declined'> {
  if (!await storage.getItem('local:SAMPLE_DATA')) return 'none';
  const result = window.confirm(i18n.global.t('tour.sample.replace_confirm')) ? 'replaced' : 'declined';
  if (result === 'replaced') await storageClearKeepPrivate();
  console.log('contentSampleGate', result);
  return result;
}

// Brand-coloured "Sync QX+" button behaviour: run the save, flash the result for a second, then reset.
// save resolves true when the depot is stored, 'partial' when only part is (green, but the guide waits), false when nothing is.
export function attachSyncFeedback(button: HTMLElement, save: () => Promise<boolean | 'partial'>) {
  const idleText = 'Sync QX+';
  button.textContent = idleText;
  button.style.backgroundColor = SYNC_COLOR_IDLE;
  button.addEventListener('click', async () => {
    if (await contentSampleGate() === 'declined') {
      // Not an error: the save is held back on purpose while the demo is loaded.
      button.textContent = i18n.global.t('tour.sample.sync_declined');
      setTimeout(() => { button.textContent = idleText; }, 2000);
      return;
    }
    try {
      const result = await save();
      // A skipped save used to flash "Synced" too, which told users a failed sync had worked.
      if (result === false) throw new Error('nothing saved');
      button.style.backgroundColor = SYNC_COLOR_DONE;
      button.textContent = 'Synced';
      // Not awaited: the guide is optional and must not delay the button.
      if (result === true) void tourSyncDone();
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
      colVal = `${i18n.global.t(data[col])} (${data['underlying_isin'] ? data['underlying_isin'] : '-' } / ${data['settlement'] ? data['settlement'] : '-'} / ${data['quanto'] ? data['quanto'] : '-'} / ${ data['ratio'] ? numberToGerman(data['ratio']) : '-'})`;
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