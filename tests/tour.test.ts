import { describe, it, expect } from 'vitest';
import { TOUR_BROKERS, tourNextStep, tourHasBrokerData, tourSummary, tourStepTextKey, tourStepTitleKey } from '@/utils/tour-utils';

const position = { broker: 'Flatex', stock_name: 'Product X', isin: 'DE000X' };
const cash = { broker: 'Flatex', stock_name: 'Cash' };
const flatex = TOUR_BROKERS.flatex;
const consors = TOUR_BROKERS.consorsbank;

describe('tourNextStep', () => {
  it('waits on the login step until the depot page is open', () => {
    expect(tourNextStep('login', [], flatex, false)).toBe('login');
    expect(tourNextStep('login', [], flatex, true)).toBe('sync');
  });

  it('finishes the flatex sync step only once positions and cash are both stored', () => {
    expect(tourNextStep('sync', [position], flatex, true)).toBe('sync');
    expect(tourNextStep('sync', [cash], flatex, true)).toBe('sync');
    expect(tourNextStep('sync', [position, cash], flatex, true)).toBe('finish');
  });

  it('finishes other brokers on positions alone', () => {
    const row = { ...position, broker: 'Consorsbank' };
    expect(tourNextStep('sync', [{ ...cash, broker: 'Consorsbank' }], consors, true)).toBe('sync');
    expect(tourNextStep('sync', [row], consors, true)).toBe('finish');
  });

  it('ignores rows from other brokers', () => {
    expect(tourNextStep('sync', [{ ...position, broker: 'Consorsbank' }, cash], flatex, true)).toBe('sync');
    expect(tourNextStep('sync', [position, cash], consors, true)).toBe('sync');
  });

  it('runs straight through for a user whose data is already stored', () => {
    expect(tourNextStep('login', [position, cash], flatex, true)).toBe('finish');
  });

  it('never moves past finish or done on its own', () => {
    expect(tourNextStep('finish', [position, cash], flatex, true)).toBe('finish');
    expect(tourNextStep('done', null, flatex, true)).toBe('done');
  });
});

describe('tour step keys', () => {
  it('gives brokers whose button sits past the start page their own login step', () => {
    expect(tourStepTitleKey('smartbroker', 'login')).toBe('smartbroker.login_title');
    expect(tourStepTextKey('wikifolio', 'login')).toBe('wikifolio.login_text');
  });

  it('keeps the shared login step for the others and per-broker sync text for all', () => {
    expect(tourStepTitleKey('flatex', 'login')).toBe('steps.login_title');
    expect(tourStepTextKey('justtrade', 'login')).toBe('steps.login_text');
    expect(tourStepTextKey('consorsbank', 'sync')).toBe('consorsbank.sync_text');
    expect(tourStepTitleKey('smartbroker', 'sync')).toBe('steps.sync_title');
  });
});

describe('tourHasBrokerData', () => {
  it('is false for a fresh install', () => {
    expect(tourHasBrokerData({})).toBe(false);
    expect(tourHasBrokerData({ KONTO_FLATEX: [], consorsBank: [] })).toBe(false);
  });

  it('is true once any broker has rows', () => {
    expect(tourHasBrokerData({ SMART_BROKER_PLUS: [position] })).toBe(true);
  });

  it('ignores keys that are not broker data', () => {
    expect(tourHasBrokerData({ MAIN_LIST: [position], ALERTS: [1] })).toBe(false);
  });
});

describe('tourSummary', () => {
  const rows = [
    { broker: 'Flatex', account_id: '90000001', stock_name: 'Product X', total_entry_value: 1000, purchase_date: '2026-01-02' },
    { broker: 'Flatex', account_id: '90000001', stock_name: 'Product Y', total_entry_value: 500.5 },
    { broker: 'Flatex', account_id: '90000001', stock_name: 'Cash', total_entry_value: 250 },
    { broker: 'Flatex', account_id: '90000009', stock_name: 'Product Z', total_entry_value: 99 },
    { broker: 'Consorsbank', account_id: '90000001', stock_name: 'Product Q', total_entry_value: 7 },
  ];

  it('counts only this broker and account, cash apart from positions', () => {
    expect(tourSummary(rows, 'Flatex', '90000001')).toEqual({
      account: '•••• 0001', positions: 2, cash: 250, invested: 1500.5, withDates: 1,
    });
  });

  it('reports no cash instead of zero when the cash row is missing', () => {
    expect(tourSummary(rows.slice(0, 2), 'Flatex', '90000001').cash).toBeNull();
  });

  it('never shows more than the last four digits of the account', () => {
    expect(tourSummary([], 'Flatex', 90000001).account).toBe('•••• 0001');
    expect(tourSummary([], 'Flatex', null).account).toBe('');
  });
});

describe('positions wording on the bank-page done card', () => {
  it('says none or one instead of a bare 0 or "1 Positionen"', async () => {
    const { i18n } = await import('@/entrypoints/home/i18n');
    const words = (n:number) => i18n.global.t('tour.positions_count', { count: n }, { locale: 'de', plural: n });
    expect([words(0), words(1), words(5)]).toEqual(['keine Positionen', 'eine Position', '5 Positionen']);
  });
});
