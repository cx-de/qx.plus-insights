// Without both ratios a price gap this large is more likely a different ratio than a real saving.
const UNKNOWN_RATIO_MAX_GAIN = 0.05;
// A peer quote this much older than the own one may no longer be on offer.
const MAX_QUOTE_LAG_MS = 15 * 60_000;

const quoteTime = (value:any) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
};

// Sell the held product at its bid, buy the peer at its ask: the saving is bid - ask per piece.
// Peers with a different ratio or currency are skipped, their prices are not comparable.
// Only the per-piece gain is returned: the total follows stocks_owned, which a sync can change.
export function peerSwitchBest(row:any, peerPrices:any[]) {
  const bid = parseFloat(row?.bid);
  if (!(bid > 0) || !Number(row?.stocks_owned)) return null;
  const ratio = parseFloat(row.ratio);
  const ownTime = quoteTime(row.timestamp);

  let best:any = null;
  for (const peer of peerPrices || []) {
    if (!peer?.wkn || peer.wkn === row.wkn) continue;
    const ask = parseFloat(peer.ask);
    if (!(ask > 0)) continue;
    if (row.currency && peer.currency && row.currency !== peer.currency) continue;
    const peerTime = quoteTime(peer.timestamp);
    if (ownTime !== null && peerTime !== null && ownTime - peerTime > MAX_QUOTE_LAG_MS) continue;
    const gainPerPiece = bid - ask;
    if (!(gainPerPiece > 1e-9)) continue;
    const peerRatio = parseFloat(peer.ratio);
    if (ratio > 0 && peerRatio > 0) {
      if (Math.abs(ratio - peerRatio) > 1e-9) continue;
    } else if (gainPerPiece / bid > UNKNOWN_RATIO_MAX_GAIN) {
      continue;
    }
    if (!best || gainPerPiece > best.gainPerPiece) best = { wkn: peer.wkn, bid, ask, gainPerPiece };
  }
  return best;
}
