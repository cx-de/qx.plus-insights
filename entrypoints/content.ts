import { i18n } from '~/entrypoints/home/i18n';
import {
  flatexSyncState,
  flatexRunSync,
  flatexMaybeAutoSync,
  flatexAttachDebugHelpers,
  flatexOpenDashboard,
  flatexOpenDepotList,
} from '~/utils/kontoFlatex-utils';
import { tourTick, flatexTourSyncDone } from '~/utils/tour-utils';
import { SYNC_COLOR_IDLE, SYNC_COLOR_DONE, SYNC_COLOR_ERROR, BROKER_REFRESH_MS } from '~/utils/constants';

export default defineContentScript({
  matches: [
    'https://konto.flatex.de/*', 
    'https://app.smartbrokerplus.de/*',
    'https://www.consorsbank.de/*',
    'https://www.wikifolio.com/*',
    'https://webtrading.justtrade.com/*',
  ],
  async main(ctx) {
    const updateDuration = BROKER_REFRESH_MS;

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
      idle:       { bg: SYNC_COLOR_IDLE, opacity: '1' },
      saving:     { bg: SYNC_COLOR_IDLE, opacity: '0.7' },
      fetching: { bg: SYNC_COLOR_IDLE, opacity: '0.7' },
      done:       { bg: SYNC_COLOR_DONE, opacity: '1' },
      partial:    { bg: SYNC_COLOR_DONE, opacity: '1' },
      error:      { bg: SYNC_COLOR_ERROR, opacity: '1' },
      busy:       { bg: SYNC_COLOR_IDLE, opacity: '1' },
    };

    function syncLabel() {
      const t = (k:any) => i18n.global.t(k);
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

    function setSync(state:any, detail = '') {
      syncState = state;
      syncDetail = detail;
      renderSyncButton();
    }

    function finishSync(state:any, detail = '') {
      clearTimeout(syncResetTimer);
      setSync(state, detail);
      syncResetTimer = ctx.setTimeout(() => setSync('idle'), state === 'done' ? 2000 : 4000);
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
        // One click walks the round users did by hand: Dashboard for cash, then "Alle" for every position.
        if (await flatexOpenDashboard()) await flatexSaveDataToLocalStorage();
        await flatexOpenDepotList();
        await flatexSaveDataToLocalStorage();

        setSync('fetching');
        result = await flatexRunSync({
          // Cache-respecting: instant when known, and table-less positions aren't re-probed every press.
          allowInline: true,
          profile: 'interactive',
          onProgress: ({ done, total }:any) => setSync('fetching', `${done + 1}/${total}`),
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
        try { await mainFlatex(); } catch (err) { console.error('mainFlatex error:', err); }
      }

      // Not awaited into the button state: the guide is optional and must not delay the result.
      void flatexTourSyncDone(ctx);
      syncTitle = `synced ${result.synced} · failed ${result.failed} · remaining ${result.remaining} · mode ${result.mode}${result.reason ? ' · ' + result.reason : ''}`;

      if (result.skipped === 'in_flight' || result.skipped === 'locked') return finishSync('busy');
      if (result.remaining > 0 || result.failed > 0) {
        return finishSync('partial', `${result.synced}/${result.synced + result.remaining + result.failed}`);
      }
      finishSync('done', result.synced ? `(${result.synced})` : '');
    }

    async function mainFlatex() {
      console.log("mainFlatex")
      addThirdRowHeader("Derivatetyp (Basiswert / Lieferung / Quanto / Ratio)",
        "Bewertungstag", "Cap", "Zielwert",
        "", "G/V Ziel €", "G/V Ziel p.a. (abs.) %", "Basiswert-Kurs");
      

      if (!window.location.href.includes("overviewFormAction.do")) {
        console.log("HTML Structure changed or not on the right page...");
        return false;
      }

      createEmptyRowsToFill();
      renderSyncButton();

      await flatexUpdateCustomRowData();
    }

    // ctx timers stop once the extension reloads; finally keeps one failed tick from ending the loop.
    async function brokerLoop(name:string, tick:() => Promise<any>) {
      try {
        await tick();
      } catch (err) {
        console.error(`${name} error:`, err);
      } finally {
        ctx.setTimeout(() => { void brokerLoop(name, tick); }, updateDuration);
      }
    }

    async function mainSmartBrokerPlus() {
      console.log("mainSmartBrokerPlus")
      await smartBrokerSaveDataToLocalStorage();
    }

    async function mainWikiFolio() {
      console.log("mainWikiFolio")
      // Every tick: the header renders late, and a one-shot add found no container.
      addSyncButtonOnWikifolio();

      await mainWikiFolioSaveDataToLocalStorage();
    }


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
        // Scoped to flatex: www.flatex.de only resets the flatex pending prompt, never other brokers'.
        await chrome.storage.local.set({ flatexUserSync: '' });
        return;
      }

      flatexAttachDebugHelpers();

      // Not awaited: a failed repaint must not skip the save or stop the loop from starting.
      const paintFlatex = () => { mainFlatex().catch((err) => console.error('mainFlatex error:', err)); };
      paintFlatex();
      void tourTick(ctx);
      ctx.setInterval(async () => {
        // Inline sync swaps the list for detail views; scraping mid-run persists partial data.
        if (flatexSyncState.inlineInFlight) return;
        paintFlatex();
        try {
          await flatexSaveDataToLocalStorage();
          // After the save, so the step it checks reads this tick's data.
          await tourTick(ctx);
          // Debounced to ~10 min and iframe-only, so the page is never navigated unasked.
          await flatexMaybeAutoSync();
        } catch (err) {
          console.error('flatex tick error:', err);
        }
      }, updateDuration);

      ctx.addEventListener(document, 'click', (e) => {
        // Untrusted = our synthetic clicks and webcore replays; mainFlatex() must not run mid-sync.
        if (flatexSyncState.inlineInFlight || !e.isTrusted) return;
        const target = (e.target as HTMLElement).closest('.BlockSelectionItem');
        if (target) {
          console.log('BlockSelectionItem toggled');
          ctx.setTimeout(paintFlatex, 1500);
        }
      }, { capture: true });

    } else if (window.location.href.includes(consorsBankWebsite)) {
      // A loop, not one retry: the SPA can reach the portfolio long after the first 10 s.
      void brokerLoop('mainConsorsBank', mainConsorsBank);
      // Delegated: re-attaching to the select on every change stacked one extra mainConsorsBank() run per event.
      ctx.addEventListener(document, 'change', (event) => {
        if (!(event.target as Element)?.matches?.('select[data-type="accountSelect"]')) return;
        console.log('consorsAccountSelect changed');
        mainConsorsBank().catch((err) => console.error('mainConsorsBank error:', err));
      });

    } else if (window.location.href.includes(smartBrokerPlusBankWebsite)) {
      void brokerLoop('mainSmartBrokerPlus', mainSmartBrokerPlus);
    } else if (window.location.href.includes(wikifolioWebsite)) {
      addCustomRowHeaderWikifolio();
      updateCustomRowDataWikifolio().catch((err) => console.error('updateCustomRowDataWikifolio error:', err));
      void brokerLoop('mainWikiFolio', mainWikiFolio);
    } else if (window.location.href.includes(justtradeWebsite)) {
      mainJusttrade().catch((err) => console.error('mainJusttrade error:', err));
    }

    // flatex ticks its guide right after each save above; the other brokers save in their own loops.
    if (!window.location.href.includes(flatexWebsite)) void brokerLoop('tourTick', () => tourTick(ctx));

  },
});
