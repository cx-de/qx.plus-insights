import { justtradeFingerprint } from '@/utils/hash-utils';

// Page world: justTRADE's depot API carries the WKN (asset.nsin) the DOM never shows, and its auth
// token is encrypted in localStorage, so read the response the site already fetches instead.
export default defineContentScript({
  matches: ['https://webtrading.justtrade.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    let lastMessage: any = null;
    // The extension's listener starts after document_idle; replay the last payload when it asks.
    window.addEventListener('message', (event: any) => {
      if (event.source !== window || event.data?.source !== 'qx-justtrade-ext' || event.data?.kind !== 'request') return;
      if (lastMessage) window.postMessage(lastMessage, window.location.origin);
    });

    const originalFetch = window.fetch;
    window.fetch = async function (this: any, ...args: any[]) {
      const response = await originalFetch.apply(this, args as any);
      try {
        const url = String(args[0]?.url || args[0] || '');
        // List endpoint only: /securities/{id} detail responses would replace the positions payload.
        if (/trading\.justtrade\.com\/securities(?:[?#]|$)/.test(url) && response.ok) {
          // Sent before hashing: the site may render a new login's depot before the hashed payload lands.
          window.postMessage({ source: 'qx-justtrade', kind: 'pending' }, window.location.origin);
          // Clone so the site still gets an unread body.
          response.clone().json().then(async (body: any) => {
            // Every page script hears postMessage: public identifiers in clear, quantity and Kundennummer only hashed.
            const positions = await Promise.all((body?.data || []).map(async (row: any) => ({
              isin: row?.isin || row?.asset?.isin || '',
              wkn: row?.asset?.nsin || '',
              // Both names: the depot row may show either, and a miss blocks the whole save.
              names: [row?.asset?.customName, row?.asset?.instrumentName].filter(Boolean),
              quantityHash: await justtradeFingerprint(String(Number(row?.quantity) || 0)),
              type: row?.type || row?.asset?.type || '',
            })));
            // Kundennummer of the logged-in session: the extension matches it against accounts it already knows.
            const userHash = body?.data?.[0]?.user ? await justtradeFingerprint(String(body.data[0].user)) : null;
            lastMessage = { source: 'qx-justtrade', kind: 'securities', total: body?.total, userHash, positions };
            window.postMessage(lastMessage, window.location.origin);
          }).catch(() => { /* non-JSON body or hashing failed: the pending flag expires, the site handles its own errors */ });
        }
      } catch (err) {
        // Never let our hook break the site's own request.
        console.error('justtradeFetchHook error:', err);
      }
      return response;
    } as any;
  },
});
