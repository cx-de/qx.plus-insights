import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiAuthFailed, apiKey, sendSupportMessage } from '@/utils/helper';

const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Promise<Response>) => {
  const spy = vi.fn(async (_url: string, _init: any) => response());
  vi.stubGlobal('fetch', spy);
  return spy;
};

beforeEach(() => {
  apiKey.value = '';
  apiAuthFailed.value = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendSupportMessage', () => {
  it('posts next to the feed base and returns the reference', async () => {
    const spy = stubFetch(async () => json({ status: '1', message: '', responseValue: { reference: 'QX-261008-ABCD' } }));

    const result: any = await sendSupportMessage(new FormData());

    expect(result).toEqual({ ok: true, reference: 'QX-261008-ABCD', errors: {} });
    expect(String(spy.mock.calls[0][0])).toMatch(/\/support\/extension$/);
    expect(String(spy.mock.calls[0][0])).not.toContain('/feed/');
  });

  it('sends the API key only when one is saved', async () => {
    const spy = stubFetch(async () => json({ status: '1', responseValue: { reference: 'R' } }));

    await sendSupportMessage(new FormData());
    expect(spy.mock.calls[0][1].headers['X-Api-Key']).toBeUndefined();

    apiKey.value = 'qxp_secret';
    await sendSupportMessage(new FormData());
    expect(spy.mock.calls[1][1].headers['X-Api-Key']).toBe('qxp_secret');
  });

  it('drops a key that is latched as failed', async () => {
    const spy = stubFetch(async () => json({ status: '1', responseValue: { reference: 'R' } }));

    apiKey.value = 'qxp_dead';
    apiAuthFailed.value = true;
    await sendSupportMessage(new FormData());
    expect(spy.mock.calls[0][1].headers['X-Api-Key']).toBeUndefined();
  });

  it('passes validation errors and status through', async () => {
    stubFetch(async () => json({ message: 'invalid', errors: { email: ['The email field is required.'] } }, 422));

    const result: any = await sendSupportMessage(new FormData());

    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.errors.email[0]).toBe('The email field is required.');
  });

  it('reports a network failure as status 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });

    const result: any = await sendSupportMessage(new FormData());

    expect(result).toEqual({ ok: false, status: 0, message: '', errors: {} });
  });
});
