// No imports: the justTRADE page-world hook bundles this file, and anything it pulls in runs inside the bank page.
export async function justtradeFingerprint(value:any) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`qx-justtrade:${value}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
