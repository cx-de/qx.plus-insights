import { i18n } from '~/entrypoints/home/main';

export function updateColumnValue(data, col){
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
      colVal = numberToGerman(data[col])+' %';
    }else if(col==="underlying_price"){
      colVal = numberToGerman(data[col]);
    }else{
      colVal = data[col];
    }
  }

  return colVal;
}

export function updateColumns(row, data = {}) {
    
  const columns = [
    "type", 
    "valuation_date", "cap", "future_total_value",
    "na","profit_loss_target", "profit_loss_target_pa", 
    "underlying_price"];

    columns.forEach((col) => {
      const columnElement = row.querySelector(`.${col}`);
      if (columnElement) {
        //let colVal = "N/A";
        let colVal = updateColumnValue(data, col);
        columnElement.innerText = colVal;
      }
    });
}
  
export function insertAfter(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}
  
export function antiSessionTimeout() {
    /*
    setTimeout(() => {
      window.location.reload();
    }, 180000); // Run every 3 minutes
    */
}