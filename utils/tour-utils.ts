import { createShadowRootUi } from '#imports';
import { i18n } from '~/entrypoints/home/i18n';
import { numberToGerman } from './helper';

// One entry per broker the welcome dialog offers; step order is the order the user walks them.
// name is the stored row `broker`; url's host also tells the content script which guide this page runs.
export const TOUR_BROKERS:any = {
  flatex: {
    name: 'Flatex', url: 'https://konto.flatex.de', rowsKey: 'KONTO_FLATEX', idKey: 'CUR_FLATEXID',
    steps: ['login', 'sync', 'finish'], cash: true,
  },
  consorsbank: {
    name: 'Consorsbank', url: 'https://www.consorsbank.de/web/Mein-Konto-und-Depot/Konto/Kontouebersicht',
    rowsKey: 'consorsBank', idKey: 'CUR_CONSORSBANKID', steps: ['login', 'sync', 'finish'],
  },
  smartbroker: {
    name: 'Smartbroker+', url: 'https://app.smartbrokerplus.de/', rowsKey: 'SMART_BROKER_PLUS', idKey: 'CUR_SMARTBROKERID',
    steps: ['login', 'sync', 'finish'], ownLogin: true,
  },
  wikifolio: {
    name: 'Wikifolio', url: 'https://www.wikifolio.com/', rowsKey: 'WIKIFOLIO', idKey: 'CUR_WIKIFOLIO',
    steps: ['login', 'sync', 'finish'], ownLogin: true,
  },
  justtrade: {
    name: 'justTRADE', url: 'https://webtrading.justtrade.com/', rowsKey: 'JUSTTRADE', idKey: 'CUR_JUSTTRADEID',
    steps: ['login', 'sync', 'finish'],
  },
};

// What the "connected" screen reports; only the last 4 digits of the account so it is recognisable, not readable.
export function tourSummary(rows:any, brokerName:string, accountId:any) {
  const own = (Array.isArray(rows) ? rows : [])
    .filter((r:any) => r?.broker === brokerName && (!accountId || r.account_id === String(accountId)));
  const positions = own.filter((r:any) => r.stock_name !== 'Cash');
  const cashRow = own.find((r:any) => r.stock_name === 'Cash');
  return {
    account: accountId ? `•••• ${String(accountId).slice(-4)}` : '',
    positions: positions.length,
    cash: Number.isFinite(cashRow?.total_entry_value) ? cashRow.total_entry_value : null,
    invested: positions.reduce((sum:number, r:any) => sum + (Number(r.total_entry_value) || 0), 0),
    withDates: positions.filter((r:any) => r.purchase_date).length,
  };
}

export const TOUR_DATA_KEYS = ['KONTO_FLATEX', 'consorsBank', 'SMART_BROKER_PLUS', 'WIKIFOLIO', 'JUSTTRADE'];

export function tourHasBrokerData(stored:any) {
  return TOUR_DATA_KEYS.some(key => Array.isArray(stored?.[key]) && stored[key].length > 0);
}

let tourUi:any = null;
let tourCard:any = null;
let tourTarget:any = null;
let shownStep = '';

// Advances only on what the scraper actually stored, so a step is never ticked off by a click alone.
// Known limit: rows carry no save time, so a restarted guide with old data ticks through right after login.
export function tourNextStep(step:any, rows:any, broker:any, onDepot:boolean) {
  const own = (Array.isArray(rows) ? rows : []).filter((r:any) => r?.broker === broker.name);
  if (step === 'login' && onDepot) step = 'sync';
  // flatex needs cash too: positions alone are only half of its Sync QX+ round.
  const done = own.some((r:any) => r.stock_name !== 'Cash') && (!broker.cash || own.some((r:any) => r.stock_name === 'Cash'));
  if (step === 'sync' && done) step = 'finish';
  return step;
}

// The guide whose broker owns this page, or '' on a site no guide runs on.
function tourPageBroker() {
  return Object.keys(TOUR_BROKERS).find(key => new URL(TOUR_BROKERS[key].url).hostname === location.hostname) || '';
}

// A finished Sync QX+ press closes the step on whatever it stored: a cash-only depot or a missed cash read must not strand the guide.
export async function tourSyncDone() {
  try {
    const key = tourPageBroker();
    const broker = TOUR_BROKERS[key];
    if (!broker) return;
    const stored = await chrome.storage.local.get(['TOUR', broker.rowsKey]);
    const rows = stored[broker.rowsKey];
    const saved = (Array.isArray(rows) ? rows : []).some((r:any) => r?.broker === broker.name);
    console.log('tourSyncDone', key, stored.TOUR?.step, saved);
    if (stored.TOUR?.broker !== key || stored.TOUR.step !== 'sync' || !saved) return;
    await tourSet('finish');
    // Before the first loop tick there is no context yet; that tick then renders the finished card.
    if (tourCtx) await tourTick(tourCtx);
  } catch (err) {
    /* the guide is optional; the sync result is already on the button */
    console.error('tourSyncDone error:', err);
  }
}

// Every scraper renders this button only on its depot page once logged in, so it doubles as the "on depot" check.
function tourSyncButton() {
  return document.querySelector('.sync-qx-button');
}

// Below the target when it is on screen, otherwise a corner card, so a changed bank layout only loses the pointer.
function tourPlace() {
  if (!tourCard) return;
  const rect = tourTarget?.isConnected ? tourTarget.getBoundingClientRect() : null;
  if (!rect || !rect.width || rect.bottom < 0 || rect.bottom > innerHeight - 120) {
    Object.assign(tourCard.style, { top: '', left: '', right: '16px', bottom: '16px' });
    return;
  }
  const left = Math.min(Math.max(8, rect.left), innerWidth - tourCard.offsetWidth - 8);
  Object.assign(tourCard.style, { top: `${rect.bottom + 8}px`, left: `${left}px`, right: '', bottom: '' });
}

// Merged, not replaced: the dashboard keeps its own flags (celebrated) on the same object.
async function tourSet(step:string, extra:any = {}) {
  const { TOUR } = await chrome.storage.local.get('TOUR');
  await chrome.storage.local.set({ TOUR: { ...TOUR, step, ...extra } });
}

async function ensureTourUi(ctx:any) {
  if (tourUi) return;
  tourUi = await createShadowRootUi(ctx, {
    name: 'qx-tour',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    // Keeps our clicks away from the bank page and from the BlockSelectionItem listener in content.ts.
    isolateEvents: true,
    onMount(container:any) {
      const style = document.createElement('style');
      // The dashboard's light theme tokens (assets/tailwind.css); the bank pages are light.
      style.textContent = `
        .card { --fg: hsl(222.2 47.4% 11.2%); --muted-fg: hsl(215.4 16.3% 46.9%); --border: hsl(214.3 31.8% 91.4%);
          --muted: hsl(210 40% 96.1%); --ring: hsl(215 20.2% 65.1%);
          position: fixed; z-index: 2147483647; width: 300px; box-sizing: border-box; padding: 16px;
          border: 1px solid var(--border); border-radius: 12px; background: #fff; color: var(--fg);
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1);
          font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: left; }
        .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; }
        .name { font-weight: 600; }
        .count { color: var(--muted-fg); }
        .progress { display: flex; gap: 4px; margin: 8px 0 14px; }
        .progress span { flex: 1; height: 4px; border-radius: 999px; background: var(--muted); }
        .progress .done { background: var(--fg); }
        h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; line-height: 1.4; }
        p { margin: 0 0 14px; color: var(--muted-fg); }
        .actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        button { border: 0; border-radius: 6px; padding: 7px 14px; cursor: pointer; font: inherit; font-weight: 500; }
        .primary { margin-left: auto; background: var(--fg); color: #f8fafc; }
        .primary:hover { opacity: .9; }
        .skip { background: none; padding: 7px 0; color: var(--muted-fg); text-decoration: underline; text-underline-offset: 3px; }
        .skip:hover { color: var(--fg); }
        button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }`;
      const card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-live', 'polite');
      container.append(style, card);
      return card;
    },
  });
  tourUi.mount();
  tourCard = tourUi.mounted;
  ctx.addEventListener(window, 'scroll', tourPlace, { capture: true, passive: true });
  ctx.addEventListener(window, 'resize', tourPlace);
}

function tourButton(label:string, className:string, onClick:() => Promise<void>) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', () => { void onClick(); });
  return button;
}

function renderTourCard(ctx:any, key:string, step:string, lang:any, summary:any) {
  // Explicit locale, not the global one: the Sync button keeps its own and the bank origin has no 'lang'.
  const t = (key:string, values:any = {}, plural?:number) => i18n.global.t(`tour.${key}`, values, { ...(lang ? { locale: lang } : {}), ...(plural === undefined ? {} : { plural }) });
  const broker = TOUR_BROKERS[key];
  const steps = broker.steps;
  const current = steps.indexOf(step);
  const head = document.createElement('div');
  head.className = 'head';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t('guide_name');
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = t('step_of', { current: current + 1, total: steps.length });
  head.append(name, count);
  // Same reading as the dashboard's step path: filled segments are the steps already done.
  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < steps.length; i++) {
    const segment = document.createElement('span');
    if (i < current || step === 'finish') segment.className = 'done';
    progress.append(segment);
  }
  const title = document.createElement('h2');
  title.textContent = step === 'finish' ? t('card_done_title') : t(tourStepTitleKey(key, step), { broker: broker.name });
  const text = document.createElement('p');
  // Worded, not a bare number: a cash-only depot read "0 Positionen", which looked like a failed sync.
  const positions = t('positions_count', { count: summary.positions }, summary.positions);
  text.textContent = step !== 'finish' ? t(tourStepTextKey(key, step), { broker: broker.name })
    : summary.cash === null ? t('card_done_text_no_cash', { positions })
    : t('card_done_text', { positions, cash: numberToGerman(summary.cash, false, 2) });

  const actions = document.createElement('div');
  actions.className = 'actions';
  const go = (next:string, extra:any = {}) => async () => { await tourSet(next, extra); await tourTick(ctx); };
  if (step === 'finish') {
    // Stays on 'finish' so the dashboard still shows the connected screen; only this card goes away.
    actions.append(tourButton(t('close'), 'skip', go('finish', { cardClosed: true })));
    actions.append(tourButton(t('open_app'), 'primary', async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'qx:open-dashboard' });
      } catch (err) {
        /* Chrome rejects when the listener sends no reply; the tab opens regardless, so the card still closes */
        console.error('open dashboard error:', err);
      }
      await go('finish', { cardClosed: true })();
    }));
  } else {
    actions.append(tourButton(t('skip_guide'), 'skip', go('done')));
  }
  tourCard.setAttribute('aria-label', t('guide_name'));
  tourCard.replaceChildren(head, progress, title, text, actions);
}

// Sync differs per broker; login too where the button only appears past the start page, since that is what ticks it.
export function tourStepTextKey(key:string, step:string) {
  return step === 'sync' || (step === 'login' && TOUR_BROKERS[key]?.ownLogin) ? `${key}.${step}_text` : `steps.${step}_text`;
}

export function tourStepTitleKey(key:string, step:string) {
  return step === 'login' && TOUR_BROKERS[key]?.ownLogin ? `${key}.login_title` : `steps.${step}_title`;
}

// Kept from the loop, so a Sync press can redraw the card at once without every scraper passing it along.
let tourCtx:any = null;

export async function tourTick(ctx:any) {
  tourCtx = ctx;
  try {
    const key = tourPageBroker();
    const broker = TOUR_BROKERS[key];
    const { TOUR } = await chrome.storage.local.get('TOUR');
    if (!broker || TOUR?.broker !== key || !broker.steps.includes(TOUR.step) || TOUR.cardClosed) {
      tourUi?.remove();
      tourUi = tourCard = null;
      shownStep = '';
      return;
    }

    const stored = await chrome.storage.local.get([broker.rowsKey, broker.idKey]);
    const rows = stored[broker.rowsKey];
    const step = tourNextStep(TOUR.step, rows, broker, !!tourSyncButton());
    if (step !== TOUR.step) await tourSet(step);

    await ensureTourUi(ctx);
    if (step !== shownStep) {
      console.log('tourTick', key, step);
      renderTourCard(ctx, key, step, TOUR.lang, tourSummary(rows, broker.name, stored[broker.idKey]));
      shownStep = step;
    }
    // Re-found every tick: the bank SPAs rebuild the tab bar and the sync button on every re-render.
    tourTarget = step === 'sync' ? tourSyncButton() : null;
    tourPlace();
  } catch (err) {
    /* the guide is optional; a failed tick must never stop the scrape loop */
    console.error('tourTick error:', err);
  }
}
