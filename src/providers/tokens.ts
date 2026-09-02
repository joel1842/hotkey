export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${Number((count / 1_000_000).toFixed(1))}M`;
  }
  return `${Math.round(count / 1000)}K`;
}
