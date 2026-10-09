import { storage } from '#imports';
import { i18n } from '~/entrypoints/home/main';
import {
  flatexSyncState,
  flatexRunSync,
  flatexMaybeAutoSync,
  flatexAttachDebugHelpers,
} from '~/utils/kontoFlatex-utils';

export default defineContentScript({
  matches: [
    'https://konto.flatex.de/*', 
    //'https://www.flatex.de/*', 
    'https://app.smartbrokerplus.de/*',
    'https://www.consorsbank.de/*',
    'https://www.wikifolio.com/*',
    'https://webtrading.justtrade.com/*',
  ],
  //runAt: 'document_start',
  async main(ctx) {
    console.log('Hello content.');

    const MINUTE = 60 * 1000;
    //let updateDuration = 30 * MINUTE;
    let updateDuration = 1 * MINUTE;
    /*
    const settings = await storage.getItem('local:settings');
    let priceUpdateDuration = 30;
    if(settings) {
      priceUpdateDuration = settings.price_duration;
    }

    const stocks = await storage.getItem('local:KONTO_FLATEX');
    if(stocks && stocks.length>0) {
      updateDuration = priceUpdateDuration * MINUTE;
    }*/
    updateDuration = 10000;
    
    //console.log("priceUpdateDuration ",priceUpdateDuration)
    //console.log("updateDuration ",updateDuration)

    // await injectScript('/kontoFlatex.js',{
    //   keepInDom: true,
    // });

    //console.log('injectScript kontoFlatex');
    //console.log('content ctx',ctx);
    
    
    const kontoFlatexWebsite = 'konto.flatex.de';
    const flatexWebsite = 'flatex.de';
    const consorsBankWebsite = 'consorsbank.de';
    const smartBrokerPlusBankWebsite = 'app.smartbrokerplus.de';
    const wikifolioWebsite = 'wikifolio.com';
    const justtradeWebsite = 'webtrading.justtrade.com';
    
    /* --- Sync QX+ button ------------------------------------------------------
     * One button does everything: persist the depot, then fill in any missing
     * Kaufdaten, then persist again. State lives out here because the button element
     * itself is destroyed and recreated by webcore on every detail open/close.
     * -------------------------------------------------------------------------- */

    let syncButton:any = null;
    let syncState = 'idle';
    let syncDetail = '';
    let syncTitle = '';
    let syncResetTimer:any;

    const SYNC_STYLES:any = {
      idle:       { bg: '#fcaf2c', opacity: '1' },
      saving:     { bg: '#fcaf2c', opacity: '0.7' },
      fetching: { bg: '#fcaf2c', opacity: '0.7' },
      done:       { bg: '#57a658', opacity: '1' },
      partial:    { bg: '#57a658', opacity: '1' },
      error:      { bg: '#d24b4b', opacity: '1' },
      busy:       { bg: '#fcaf2c', opacity: '1' },
    };

    function syncLabel() {
      const t = (k) => i18n.global.t(k);
      switch (syncState) {
        case 'saving':     return t('syncing');
        case 'fetching': return `${t('fetching_purchase_dates')}${syncDetail ? ' ' + syncDetail : ''}`;
        case 'done':       return `${t('synced')}${syncDetail ? ' ' + syncDetail : ''}`;
        case 'partial':    return `${t('synced')}${syncDetail ? ' ' + syncDetail : ''}`;
        case 'error':      return t('sync_failed');
        case 'busy':       return t('sync_running');
        default:           return t('sync_qx');
      }
    }

    function renderSyncButton() {
      const tabBlock = document.querySelector(".BlockSelectionItemContainer");
      if (!tabBlock) return;

      if (!syncButton) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sync-qx-button";
        button.style.marginLeft = "10px";
        button.style.padding = "5px 10px";
        button.style.border = "none";
        button.style.borderRadius = "6px";
        button.style.cursor = "pointer";
        button.style.color = "white";
        button.setAttribute('aria-live', 'polite');
        button.addEventListener("click", () => { void runSync(); });
        syncButton = button;
      }

      // webcore detaches the button on every re-render; re-appending the SAME element keeps it live.
      if (!syncButton.isConnected || syncButton.parentElement !== tabBlock) {
        tabBlock.appendChild(syncButton);
      }

      const style = SYNC_STYLES[syncState];
      syncButton.textContent = syncLabel();
      syncButton.style.backgroundColor = style.bg;
      syncButton.style.opacity = style.opacity;
      syncButton.disabled = syncState === 'saving';
      syncButton.setAttribute('aria-busy', String(syncState === 'saving' || syncState === 'fetching'));
      if (syncTitle) syncButton.title = syncTitle;
    }

    function setSync(state, detail = '') {
      syncState = state;
      syncDetail = detail;
      renderSyncButton();
    }

    function finishSync(state, detail = '') {
      clearTimeout(syncResetTimer);
      setSync(state, detail);
      syncResetTimer = setTimeout(() => setSync('idle'), state === 'done' ? 2000 : 4000);
    }

    async function runSync() {
      // A second press cancels. 'cancel' is not 'user', so the depot view is still restored.
      if (syncState === 'fetching') {
        flatexSyncState.abortRequested = true;
        flatexSyncState.abortReason = 'cancel';
        return;
      }
      if (syncState === 'saving') return;
      if (flatexSyncState.inFlight) return finishSync('busy');

      clearTimeout(syncResetTimer);
      let result:any = null;

      try {
        setSync('saving');
        await flatexSaveDataToLocalStorage();

        setSync('fetching');
        result = await flatexRunSync({
          // Cache-respecting: instant when known, and table-less positions aren't re-probed every press.
          allowInline: true,
          profile: 'interactive',
          onProgress: ({ done, total }) => setSync('fetching', `${done + 1}/${total}`),
        });

        if (result.synced) {
          setSync('saving');
          await flatexSaveDataToLocalStorage();
        }
      } catch (err) {
        console.error('Sync QX+ failed:', err);
        // Phase 1 may already have succeeded — never lose it.
        try { await flatexSaveDataToLocalStorage(); } catch { /* already reported */ }
        return finishSync('error');
      } finally {
        // An inline run re-rendered the table; nothing else will put the injected rows back.
        await mainFlatex();
      }

      syncTitle = `synced ${result.synced} · failed ${result.failed} · remaining ${result.remaining} · mode ${result.mode}${result.reason ? ' · ' + result.reason : ''}`;

      if (result.skipped === 'in_flight' || result.skipped === 'locked') return finishSync('busy');
      if (result.remaining > 0 || result.failed > 0) {
        return finishSync('partial', `${result.synced}/${result.synced + result.remaining + result.failed}`);
      }
      finishSync('done', result.synced ? `(${result.synced})` : '');
    }

    async function mainFlatex() {
      console.log("mainFlatex")
      //antiSessionTimeout();
      addThirdRowHeader("Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)",
        "Bewertungstag", "Cap", "Zielwert",
        "", "G/V Ziel €", "G/V Ziel p.a. (abs.) %", "Basiswert-Kurs");
      
      /*
      const stocks = document.querySelector("table.Data tbody");
      if (!stocks) {
        console.log("HTML Structure changed or stocks haven't loaded yet...");
        //setTimeout(mainFlatex, 1000);
        //return false;
      }*/

      
      if (!window.location.href.includes("overviewFormAction.do")) {
        console.log("HTML Structure changed or not on the right page...");
        return false;
      }

      createEmptyRowsToFill();
      renderSyncButton();

      await flatexUpdateCustomRowData();
    }

    async function mainConsorBank() {
      console.log("mainConsorBank")
      
      //const selectWrapper = document.querySelector('.select-dropdown-wrapper--white .select-dropdown');
      
      
      consorsBankAddHeaderRow("Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)","");
      consorsBankUpdateCustomRowData();

      await consorsBankSaveDataToLocalStorage();
      setTimeout(() => mainConsorBank(), updateDuration);
      //setTimeout(() => mainConsorBank(), 10000);
    }

    async function mainSmartBrokerPlus() {
      console.log("mainSmartBrokerPlus")
      
      /*if (!checkIfStocksLoaded()) {
        console.log("HTML Structure changed or stocks haven't loaded yet...");
        setTimeout(() => mainSmartBrokerPlus(), 1000);
        return false;
      }*/

      // createEmptyRowsToFill();
      // await updateData();
      
      await smartBrokerSaveDataToLocalStorage();
      setTimeout(() => mainSmartBrokerPlus(), updateDuration);
    }

    async function mainWikiFolio() {
      console.log("mainWikiFolio")
      
      /*if (!checkIfStocksLoaded()) {
        console.log("HTML Structure changed or stocks haven't loaded yet...");
        setTimeout(() => mainSmartBrokerPlus(), 1000);
        return false;
      }*/

      // createEmptyRowsToFill();
      // await updateData();
      
      await mainWikiFolioSaveDataToLocalStorage();
      setTimeout(() => mainWikiFolio(), updateDuration);
    }

    //await storage.getItem('local:flatexUserSync'); use storage instead chrome

    // Top frame only: the flatex Kaufdatum sync runs a hidden iframe, and two frames
    // migrating at once both read-modify-write ACCOUNTS and lose each other's entries.
    if (window.self !== window.top) {
      console.log("content: not the top frame, skipping");
      return;
    }

    // Stamps account_id onto pre-2.8 data before any scraper writes; no-op after the first run.
    await accountMigrate();

    if (window.location.href.includes(flatexWebsite)) {

      if (!window.location.href.includes(kontoFlatexWebsite)) {
        //reset
        await chrome.storage.local.set({ flatexUserSync: '' });
        // Cleared a pending prompt for ANY broker just because the user opened www.flatex.de.
        //await chrome.storage.local.set({ hasNewAccount: '' });
        return;
      }

      // window.qxSync.* — only when localStorage.qxSyncDebug is set.
      flatexAttachDebugHelpers();

      mainFlatex();
      setInterval(async () => {
        // Inline sync swaps the list for detail views; scraping mid-run persists partial data.
        if (flatexSyncState.inlineInFlight) return;
        mainFlatex();
        await flatexSaveDataToLocalStorage();
        // Debounced to ~10 min and iframe-only, so the page is never navigated unasked.
        await flatexMaybeAutoSync();
      }, updateDuration);

      document.addEventListener('click', (e) => {
        // Untrusted = our synthetic clicks and webcore replays; mainFlatex() must not run mid-sync.
        if (flatexSyncState.inlineInFlight || !e.isTrusted) return;
        const target = (e.target as HTMLElement).closest('.BlockSelectionItem');
        if (target) {
          console.log('BlockSelectionItem toggled');
          setTimeout(() => {
            mainFlatex();
          }, 1500);
        }
      }, true);

    } else if (window.location.href.includes(consorsBankWebsite)) {
      mainConsorsBank();
      setTimeout(() => mainConsorsBank(), updateDuration);
      //setInterval(saveDataToLocalStorage, updateDuration);
      document.addEventListener('change', () => {
        const selectEl = document.querySelector('select[data-type="accountSelect"]');
        if (selectEl) {
          selectEl.addEventListener('change', (event) => {
            console.log('Changed to:', event.target.value);
            mainConsorsBank();
          });
        }
      });

    } else if (window.location.href.includes(smartBrokerPlusBankWebsite)) {
      chrome.runtime.sendMessage({ website: "smartBrokerPlus", action: "initial" }, () => {
        mainSmartBrokerPlus();
      });
      //setInterval(saveDataToLocalStorage, 10000);
     } else if (window.location.href.includes(wikifolioWebsite)) {
        addCustomRowHeaderWikifolio();
        addSyncButtonOnWikifolio();
        updateCustomRowDataWikifolio();
        mainWikiFolio();
    } else if (window.location.href.includes(justtradeWebsite)) {
      mainJusttrade();
    }
    
  },
});
