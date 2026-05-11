const KEY = "chaintrace-recent-searches";
const MAX = 20;

export interface RecentSearchEntry {
  address: string;
  chain: string;
  searchedAt: string;
}

export function saveRecentSearch(address: string, chain: string): void {
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter((e) => !(e.address === address && e.chain === chain));
    const updated = [{ address, chain, searchedAt: new Date().toISOString() }, ...filtered].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("chaintrace-recent-searches-updated"));
  } catch { /* noop */ }
}

export function getRecentSearches(): RecentSearchEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentSearchEntry[]) : [];
  } catch { return []; }
}
