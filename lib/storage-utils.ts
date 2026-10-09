import { storage } from '#imports';

const storageKeys = [
    //Dashboard
    "local:DAILY_TOTAL", 

    //Settings
    "local:api_key", 
    "local:settings", 

    //List
    "local:LIST_DATA", 
    "local:MAIN_LIST", 
    "local:portfolio_history", 
    "local:PEER_PRODUCTS", 
    "local:scenarios",
    "local:SCENARIO_EXCLUDED_WKNS",
    "local:ALERTS",

    //Brocker
    "local:KONTO_FLATEX",
    "local:FLATEX_PURCHASE_DATES",
    "local:consorsBank", 
    "local:SMART_BROKER_PLUS", 
    "local:WIKIFOLIO", 
    "local:JUSTTRADE",
    "local:JUSTTRADE_ISINS",

    //Accounts
    "local:ACCOUNTS",
    "local:ACCOUNTS_SCHEMA",
    "local:NEW_ACCOUNTS",
    "local:ACCOUNT_SNOOZE",
    "local:CUR_FLATEXID",
    "local:CUR_WIKIFOLIO",
    "local:CUR_CONSORSBANKID",
    "local:CUR_SMARTBROKERID",
    "local:CUR_JUSTTRADEID",

    //Legacy identity keys, kept so pre-2.8 backups still round-trip
    "local:NEW_FLATEXID",
    "local:NEW_WIKIFOLIO",
    "local:hasNewAccount",
    "local:flatexUserSync",

    //Misc state that export was silently skipping
    "local:list_updated_at",
    "local:api_auth_failed",
    "local:api_auth_failed_at",
    "local:api_auth_fail_count",
];

/**
 * Get all data from WXT storage and localStorage
 */
export async function getAllData() {
  const extData = await storage.getItems(storageKeys);
  console.log("getAllData extData", extData);
  console.log("getAllData localStorage", localStorage);
  
  // --- LocalStorage ---
  const localData: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      try {
        localData[key] = JSON.parse(localStorage.getItem(key) as string);
      } catch {
        localData[key] = localStorage.getItem(key);
      }
    }
  }

  return { extension: extData, local: localData };
}

/**
 * Export all data to JSON file
 */
export async function exportAll(filename = 'backup.json') {
  const allData = await getAllData();
  const blob = new Blob([JSON.stringify(allData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


function validateBackupFile(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push("Extension data must be an array.");
    return { valid: false, errors };
  }

  // Collect keys from backup
  const keysInBackup = data
    .filter(item => item && item.key)
    .map(item => item.key);

  // Check if at least one required key exists
  const hasValidKey = storageKeys.some(requiredKey => keysInBackup.includes(requiredKey));
  if (!hasValidKey) {
    errors.push("No valid storage keys found in backup.");
  }

  // Validate entries
  /*data.forEach((item, index) => {
    if (!item.key) {
      errors.push(`Missing "key" at index ${index}`);
    }
    if (item.value === null || item.value === undefined) {
      errors.push(`Missing or null "value" for key "${item.key}" at index ${index}`);
    }
  });
  */

  return { valid: errors.length === 0, errors };
}


/**
 * Import all data from JSON file
 */
export async function importAll(file: File) {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));

        /*
        if (parsed.extension) {
          await storage.setItems(parsed.extension);
        }
        */

        const { valid, errors } = validateBackupFile(parsed.extension || parsed.local);
        //console.log("importAll validateBackupFile valid",valid);
        //console.log("importAll validateBackupFile errors",errors);
        if (!valid) {
            //console.error('Import validation failed:', errors);
            reject(errors);
            return;
        }

        if (parsed.extension) {
            //console.log("importAll parsed.extension",parsed.extension);
            if (parsed.extension && Array.isArray(parsed.extension)) {
                for (const item of parsed.extension) {
                    const { key, value } = item;
                    //console.log("importAll item",item);
                    // skip invalid entries
                    if (!key || value === null || value === undefined) continue;
                    await storage.setItem(key, value);
                }
            }
        }


        // Restore localStorage
        // if (parsed.local) {
        //   for (const [key, value] of Object.entries(parsed.local)) {
        //     localStorage.setItem(key, JSON.stringify(value));
        //   }
        // }

        if (parsed.local) {
            for (const [key, value] of Object.entries(parsed.local)) {
                //console.log("importAll key",key);

                try {
                  
                  /*
                  const existing = localStorage.getItem(key);
                    if (existing) {
                        let parsedExisting;
                        try {
                            parsedExisting = JSON.parse(existing);
                        } catch {
                            parsedExisting = existing;
                        }
                        //console.log("importAll parsedExisting",parsedExisting);
                        
                        if (typeof parsedExisting === 'object' && typeof value === 'object') {
                            //console.log("importAll parsedExisting object",value);
                            //localStorage.setItem(key, JSON.stringify({ ...parsedExisting, ...value }));
                            localStorage.setItem(key, value);
                        } else {
                            //console.log("importAll parsedExisting value",value);
                            //localStorage.setItem(key, JSON.stringify(value));
                            localStorage.setItem(key, value);
                        }
                  } else {
                    //console.log("importAll not exist",value);
                    //localStorage.setItem(key, JSON.stringify(value));
                    localStorage.setItem(key,value);
                  }*/

                  let jsonKeys = ['tableSortState','columnOrder','tableExpanded','accountViewSelected'];
                  if(jsonKeys.includes(key)){
                    localStorage.setItem(key,JSON.stringify(value));
                  }else{
                    localStorage.setItem(key,value);
                  }
                  

                } catch (err) {
                    console.error(`Failed to import key "${key}":`, err);
                }
            }
        }
        
        // Restored rows may predate account_id; clearing the flag lets accountMigrate
        // stamp them on next load instead of leaving them keyed as "Broker::".
        const restoredSchema = (parsed.extension || []).some(
          (item: any) => item?.key === 'local:ACCOUNTS_SCHEMA' && item?.value
        );
        if (!restoredSchema) await storage.removeItem('local:ACCOUNTS_SCHEMA');

        //resolve();
        resolve({ valid: true });

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
