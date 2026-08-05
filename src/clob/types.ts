export type BookLevel = { price: number; size: number };

export type LocalBook = {
  tokenId: string;
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
};

export function bestAsk(asks: BookLevel[]): { price: number; size: number } | null {
  if (!asks.length) return null;
  const sorted = [...asks].sort((a, b) => a.price - b.price);
  return sorted[0] ?? null;
}

export function bestBid(bids: BookLevel[]): { price: number; size: number } | null {
  if (!bids.length) return null;
  const sorted = [...bids].sort((a, b) => b.price - a.price);
  return sorted[0] ?? null;
}

export function askDepth(asks: BookLevel[], maxLevels = 3): number {
  return [...asks]
    .sort((a, b) => a.price - b.price)
    .slice(0, maxLevels)
    .reduce((sum, l) => sum + l.size, 0);
}
