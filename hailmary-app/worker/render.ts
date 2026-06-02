import type { Pick, Category, Env } from "./types";

// PHASE 4 STUB. Branded NFL PNG rendering (Satori/resvg leaderboards +
// highlight cards) is Phase 5. For now the pipeline ships a JSON payload with
// no images; the SPA renders the factor table (its primary surface) and shows a
// placeholder where a leaderboard image would go. Keeping these signatures lets
// the pipeline + settlement compile unchanged.

type ByCat<T> = Partial<Record<Category, T>>;

export async function renderLeaderboards(
  _env: Env, _dateIso: string, _byCategory: Record<Category, Pick[]>,
): Promise<{ leaderboard: ByCat<string>; leaderboardAmerican: ByCat<string> }> {
  return { leaderboard: {}, leaderboardAmerican: {} };
}

export async function renderHighlights(
  _env: Env, _dateIso: string, _byCategory: Record<Category, Pick[]>,
): Promise<ByCat<string[]>> {
  return {};
}

export async function renderSettledLeaderboards(
  _env: Env, _dateIso: string, _byCategory: Record<Category, Pick[]>,
): Promise<ByCat<string>> {
  return {};
}

export async function renderSettledHighlights(
  _env: Env, _dateIso: string, _byCategory: Record<Category, Pick[]>,
): Promise<ByCat<string[]>> {
  return {};
}

export async function renderAllImages(): Promise<void> {
  /* no-op stub */
}
