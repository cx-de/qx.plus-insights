import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiAuthFailed, apiKey, buildSupportForm, sendSupportMessage, supportFormDefaults } from '@/utils/helper';

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

const fields = { message: 'Prices do not load', page_url: '#/list', client_version: '1.2.3', locale: 'de' };

describe('support form defaults', () => {
  it('starts with the screenshot off and numbers redacted', () => {
    expect(supportFormDefaults()).toEqual({ includeScreenshot: false, hideNumbers: true });
  });

  it('returns a fresh object, so a ticked box never leaks into the next open', () => {
    const first: any = supportFormDefaults();
    first.includeScreenshot = true;
    expect(supportFormDefaults().includeScreenshot).toBe(false);
  });
});

describe('buildSupportForm', () => {
  it('sends no screenshot field without an opted-in image', () => {
    const form = buildSupportForm(fields, null);

    expect(form.has('screenshot')).toBe(false);
    expect(form.get('message')).toBe('Prices do not load');
    expect(form.get('page_url')).toBe('#/list');
    expect(form.get('client_version')).toBe('1.2.3');
    expect(form.get('locale')).toBe('de');
  });

  it('attaches the screenshot as a JPEG file when given', () => {
    const form = buildSupportForm(fields, new Blob(['jpeg'], { type: 'image/jpeg' }));

    const file = form.get('screenshot') as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('screenshot.jpg');
  });

  it('adds name and email only when passed', () => {
    expect(buildSupportForm(fields, null).has('name')).toBe(false);
    expect(buildSupportForm(fields, null).has('email')).toBe(false);

    const form = buildSupportForm({ ...fields, name: 'Max Muster', email: 'max@example.com' }, null);
    expect(form.get('name')).toBe('Max Muster');
    expect(form.get('email')).toBe('max@example.com');
  });
});

describe('sendSupportMessage', () => {
  it('posts next to the feed base and returns the reference', async () => {
    const spy = stubFetch(async () => json({ status: '1', message: '', responseValue: { reference: 'QX-261008-ABCD' } }));

    const result: any = await sendSupportMessage(new FormData());

    expect(result).toEqual({ ok: true, reference: 'QX-261008-ABCD', errors: {} });
    expect(String(spy.mock.calls[0]![0])).toMatch(/\/support\/extension$/);
    expect(String(spy.mock.calls[0]![0])).not.toContain('/feed/');
  });

  it('sends the API key only when one is saved', async () => {
    const spy = stubFetch(async () => json({ status: '1', responseValue: { reference: 'R' } }));

    await sendSupportMessage(new FormData());
    expect(spy.mock.calls[0]![1].headers['X-Api-Key']).toBeUndefined();

    apiKey.value = 'qxp_secret';
    await sendSupportMessage(new FormData());
    expect(spy.mock.calls[1]![1].headers['X-Api-Key']).toBe('qxp_secret');
  });

  it('drops a key that is latched as failed', async () => {
    const spy = stubFetch(async () => json({ status: '1', responseValue: { reference: 'R' } }));

    apiKey.value = 'qxp_dead';
    apiAuthFailed.value = true;
    await sendSupportMessage(new FormData());
    expect(spy.mock.calls[0]![1].headers['X-Api-Key']).toBeUndefined();
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
