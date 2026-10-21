export type FuzzySearchItem<T> = {
  item: T;
  text: string;
};

export type FuzzySearchResult<T> = {
  item: T;
  score: number;
};

function normalise(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

/** Scores exact words, prefixes, and ordered character matches without a dependency. */
function score(query: string, candidate: string) {
  if (candidate === query) return 1_000;
  if (candidate.startsWith(query)) return 800 - candidate.length;

  const wordIndex = candidate.indexOf(` ${query}`);
  if (wordIndex >= 0) return 700 - wordIndex;

  let cursor = 0;
  let firstMatch = -1;
  let gaps = 0;
  for (const char of query) {
    const found = candidate.indexOf(char, cursor);
    if (found < 0) return 0;
    if (firstMatch < 0) firstMatch = found;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return Math.max(1, 500 - gaps * 12 - firstMatch * 3 - candidate.length / 100);
}

export function fuzzySearch<T>(query: string, items: FuzzySearchItem<T>[], limit = 8): FuzzySearchResult<T>[] {
  const needle = normalise(query);
  if (!needle) return [];

  return items
    .map(({ item, text }) => ({ item, score: score(needle, normalise(text)) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
