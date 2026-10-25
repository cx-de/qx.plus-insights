import { createShadowRootUi } from '#imports';
import { i18n } from '~/entrypoints/home/i18n';
import { numberToGerman } from './helper';

// One entry per broker the welcome dialog offers; step order is the order the user walks them.
export const TOUR_BROKERS:any = {
  flatex: {
    name: 'Flatex', url: 'https://konto.flatex.de', rowsKey: 'KONTO_FLATEX', idKey: 'CUR_FLATEXID',
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
// Known limit: rows carry no save time, so a restarted guide with old flatex data ticks through right after login.
export function flatexTourNextStep(step:any, rows:any, onOverview:boolean) {
  const flatex = (Array.isArray(rows) ? rows : []).filter((r:any) => r?.broker === 'Flatex');
  if (step === 'login' && onOverview) step = 'sync';
  // Positions and cash both stored means Sync QX+ ran its full round (or the user walked the tabs by hand).
  if (step === 'sync' && flatex.some((r:any) => r.stock_name === 'Cash') && flatex.some((r:any) => r.stock_name !== 'Cash')) step = 'finish';
  return step;
}

// A finished Sync QX+ press closes the step on whatever it stored: a cash-only depot or a missed cash read must not strand the guide.
export async function flatexTourSyncDone(ctx:any) {
  try {
    const { TOUR, KONTO_FLATEX } = await chrome.storage.local.get(['TOUR', 'KONTO_FLATEX']);
    const stored = (Array.isArray(KONTO_FLATEX) ? KONTO_FLATEX : []).some((r:any) => r?.broker === 'Flatex');
    console.log('flatexTourSyncDone', TOUR?.step, stored);
    if (TOUR?.broker !== 'flatex' || TOUR.step !== 'sync' || !stored) return;
    await tourSet('finish');
    await flatexTourTick(ctx);
  } catch (err) {
    /* the guide is optional; the sync result is already on the button */
    console.error('flatexTourSyncDone error:', err);
  }
}

function tourTargetFor(step:string) {
  return step === 'sync' ? document.querySelector('.sync-qx-button') : null;
}

// Below the target when it is on screen, otherwise a corner card, so a changed flatex layout only loses the pointer.
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
  await chrome.storage.local.set({ TOUR: { ...TOUR, broker: 'flatex', step, ...extra } });
}

async function ensureTourUi(ctx:any) {
  if (tourUi) return;
  tourUi = await createShadowRootUi(ctx, {
    name: 'qx-tour',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    // Keeps our clicks away from flatex and from the BlockSelectionItem listener in content.ts.
    isolateEvents: true,
    onMount(container:any) {
      const style = document.createElement('style');
      // The dashboard's light theme tokens (assets/tailwind.css); flatex is always light.
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

function renderTourCard(ctx:any, step:string, lang:any, summary:any) {
  // Explicit locale, not the global one: the Sync button keeps its own and the bank origin has no 'lang'.
  const t = (key:string, values:any = {}) => lang ? i18n.global.t(`tour.${key}`, values, { locale: lang }) : i18n.global.t(`tour.${key}`, values);
  const steps = TOUR_BROKERS.flatex.steps;
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
  title.textContent = step === 'finish' ? t('card_done_title') : t(`flatex.${step}_title`);
  const text = document.createElement('p');
  text.textContent = step !== 'finish' ? t(`flatex.${step}_text`)
    : summary.cash === null ? t('card_done_text_no_cash', { positions: summary.positions })
    : t('card_done_text', { positions: summary.positions, cash: numberToGerman(summary.cash, false, 2) });

  const actions = document.createElement('div');
  actions.className = 'actions';
  const go = (next:string, extra:any = {}) => async () => { await tourSet(next, extra); await flatexTourTick(ctx); };
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

export async function flatexTourTick(ctx:any) {
  try {
    const { TOUR, KONTO_FLATEX, CUR_FLATEXID } = await chrome.storage.local.get(['TOUR', 'KONTO_FLATEX', 'CUR_FLATEXID']);
    if (TOUR?.broker !== 'flatex' || !TOUR_BROKERS.flatex.steps.includes(TOUR.step) || TOUR.cardClosed) {
      tourUi?.remove();
      tourUi = tourCard = null;
      shownStep = '';
      return;
    }

    const step = flatexTourNextStep(TOUR.step, KONTO_FLATEX, location.href.includes('overviewFormAction.do'));
    if (step !== TOUR.step) await tourSet(step);

    await ensureTourUi(ctx);
    if (step !== shownStep) {
      console.log('flatexTourTick', step);
      renderTourCard(ctx, step, TOUR.lang, tourSummary(KONTO_FLATEX, 'Flatex', CUR_FLATEXID));
      shownStep = step;
    }
    // Re-found every tick: webcore rebuilds the tab bar and the sync button on every re-render.
    tourTarget = tourTargetFor(step);
    tourPlace();
  } catch (err) {
    /* the guide is optional; a failed tick must never stop the scrape loop */
    console.error('flatexTourTick error:', err);
  }
}
