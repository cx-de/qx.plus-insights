import { describe, it, expect } from 'vitest';
import { flatexTourNextStep, tourHasBrokerData, tourSummary } from '@/utils/tour-utils';

const position = { broker: 'Flatex', stock_name: 'Product X', isin: 'DE000X' };
const cash = { broker: 'Flatex', stock_name: 'Cash' };

describe('flatexTourNextStep', () => {
  it('waits on the login step until the depot overview is open', () => {
    expect(flatexTourNextStep('login', [], false)).toBe('login');
    expect(flatexTourNextStep('login', [], true)).toBe('sync');
  });

  it('finishes the sync step only once positions and cash are both stored', () => {
    expect(flatexTourNextStep('sync', [position], true)).toBe('sync');
    expect(flatexTourNextStep('sync', [cash], true)).toBe('sync');
    expect(flatexTourNextStep('sync', [position, cash], true)).toBe('finish');
  });

  it('ignores rows from other brokers', () => {
    expect(flatexTourNextStep('sync', [{ ...position, broker: 'Consorsbank' }, cash], true)).toBe('sync');
  });

  it('runs straight through for a user whose data is already stored', () => {
    expect(flatexTourNextStep('login', [position, cash], true)).toBe('finish');
  });

  it('never moves past finish or done on its own', () => {
    expect(flatexTourNextStep('finish', [position, cash], true)).toBe('finish');
    expect(flatexTourNextStep('done', null, true)).toBe('done');
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
