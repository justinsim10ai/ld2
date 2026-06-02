import type { Env, DailyPayload, League } from "./types";
import { runDailyPipeline, runHighlightPhase, readArchiveIndex } from "./pipeline";
import { settlePayload, renderAndPersistSettled, runSettlementPhase } from "./settlement";
import { sendDailyDigest } from "./mailer";
import { storePlayerStats, readPlayerStats } from "./sources/nflStats";
import { computeBacktest } from "./backtest";

const DIGEST_RECIPIENT = "justin.snider@crypto.com";

const LEAGUES: League[] = ["nfl"];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/health") {
      return jsonResponse({ ok: true, ts: new Date().toISOString() });
    }
    if (p === "/api/today") return handleLatest(env, "nfl");
    if (p.startsWith("/api/latest/")) {
      const league = p.slice("/api/latest/".length) as League;
      return handleLatest(env, league);
    }
    // /api/r/mlb/2026-05-26
    const apiR = matchApiR(p);
    if (apiR) return handleArchive(env, apiR.league, apiR.date);

    if (p.startsWith("/api/index/")) {
      const league = p.slice("/api/index/".length) as League;
      return handleIndex(env, league);
    }

    if (p.startsWith("/api/backtest/")) {
      const league = p.slice("/api/backtest/".length) as League;
      return handleBacktest(env, league);
    }

    // /img/r/mlb/2026-05-26/leaderboard-hr.png  (optionally ?download=foo.png)
    if (p.startsWith("/img/r/")) {
      return handleImage(env, p.slice("/img/".length), url.searchParams.get("download"));
    }
    // Legacy: /img/<date>/<file>
    if (p.startsWith("/img/")) {
      return handleImage(env, p.slice("/img/".length), url.searchParams.get("download"));
    }

    if (p === "/admin/run") {
      return handleAdminRun(request, env, ctx);
    }
    if (p === "/admin/render-highlights") {
      return handleRenderHighlights(request, env);
    }
    if (p === "/admin/settle") {
      return handleSettle(request, env);
    }
    if (p === "/admin/send-digest") {
      return handleSendDigest(request, env);
    }
    if (p === "/admin/nfl-stats") {
      return handleNflStatsIngest(request, env);
    }

    // /r/mlb-2026-05-26 → serve SPA shell; SPA reads the slug.
    // /factors and /factors/<id> → SPA shell; SPA renders the factor pages.
    if (p.startsWith("/r/") || p === "/factors" || p.startsWith("/factors/") || p === "/backtest") {
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // NFL is weekly. Generate the slate on game mornings (Thu/Sun/Mon, 14:00 UTC);
    // settle the week's games Tuesday (13:00 UTC).
    if (event.cron === "0 14 * * 2") {
      // Tuesday settlement — grade the prior few days' slates (Thu–Mon).
      ctx.waitUntil(
        (async () => {
          for (let d = 1; d <= 5; d++) {
            const date = isoFromOffset(-d);
            try {
              const r = await settlePayload(env, date);
              if (r.outcome.picksUpdated > 0) console.log(`[scheduled] settled ${date}: ${r.outcome.picksUpdated}`);
            } catch (err) { console.error(`[scheduled] settle ${date} failed`, err); }
          }
        })(),
      );
      return;
    }
    // Otherwise a generation day (Thu/Sun/Mon): build today's slate.
    const today = isoFromOffset(0);
    ctx.waitUntil(
      runDailyPipeline(env, today, "full").then(
        (p) => console.log(`[scheduled] ${today} slate done: ${p.gameCount} games`),
        (err) => console.error(`[scheduled] ${today} failed`, err),
      ),
    );
  },
};

function isoFromOffset(days: number): string {
  const d = new Date(Date.now());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function matchApiR(pathname: string): { league: League; date: string } | null {
  const m = pathname.match(/^\/api\/r\/([a-z]+)\/(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  return { league: m[1] as League, date: m[2] };
}

async function handleLatest(env: Env, league: League): Promise<Response> {
  if (!LEAGUES.includes(league)) return jsonResponse({ error: "unknown league" }, 404);
  const raw = await env.HAILMARY_KV.get(`latest:${league}`)
    ?? await env.HAILMARY_KV.get("linedrive:today"); // legacy fallback
  if (!raw) return jsonResponse({ error: "no payload yet" }, 503);
  return jsonText(raw, 120);
}

async function handleArchive(env: Env, league: League, date: string): Promise<Response> {
  if (!LEAGUES.includes(league)) return jsonResponse({ error: "unknown league" }, 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse({ error: "bad date" }, 400);
  const raw = await env.HAILMARY_KV.get(`r:${league}:${date}`);
  if (!raw) {
    // Legacy key (pre-multi-league)
    const fallback = await env.HAILMARY_KV.get(`linedrive:date:${date}`);
    if (!fallback) return jsonResponse({ error: "not found" }, 404);
    return jsonText(fallback, 3600);
  }
  return jsonText(raw, 3600);
}

async function handleIndex(env: Env, league: League): Promise<Response> {
  if (!LEAGUES.includes(league)) return jsonResponse({ error: "unknown league" }, 404);
  const dates = await readArchiveIndex(env, league);
  return jsonResponse({ league, dates });
}

async function handleBacktest(env: Env, league: League): Promise<Response> {
  if (!LEAGUES.includes(league)) return jsonResponse({ error: "unknown league" }, 404);
  // Reads every archived payload — cache 10 min so it isn't recomputed per view.
  const report = await computeBacktest(env, league);
  return jsonText(JSON.stringify(report), 600);
}

async function handleImage(env: Env, key: string, downloadName: string | null): Promise<Response> {
  if (!key || key.includes("..")) return new Response("bad key", { status: 400 });
  let obj = await env.HAILMARY_ASSETS.get(key);
  // Legacy fallback: /img/<date>/<file> → /img/r/mlb/<date>/<file>
  if (!obj && /^\d{4}-\d{2}-\d{2}\//.test(key)) {
    obj = await env.HAILMARY_ASSETS.get(`r/nfl/${key}`);
  }
  if (!obj) return new Response("not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": obj.httpMetadata?.contentType ?? "image/png",
    "cache-control": "public, max-age=3600",
  };
  if (downloadName) {
    const safe = downloadName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    headers["content-disposition"] = `attachment; filename="${safe}"`;
  }
  return new Response(obj.body, { headers });
}

async function handleAdminRun(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") ?? "";
  if (!env.ADMIN_KEY || provided !== env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const dateParam = url.searchParams.get("date") ?? undefined;
  const scopeParam = (url.searchParams.get("scope") as "full" | "leaderboards-only" | null) ?? "full";
  // Special: ?days=3 fires the full multi-day cron path
  const days = parseInt(url.searchParams.get("days") ?? "0", 10);
  if (days > 0) {
    const todayUtc = new Date(Date.now());
    const results: Array<{ date: string; games: number; ok: boolean; err?: string }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const scope = i === 0 ? "full" : "leaderboards-only";
      try {
        const p: DailyPayload = await runDailyPipeline(env, iso, scope);
        console.log(`[admin] ${iso} (${scope}) done: ${p.gameCount} games`);
        results.push({ date: iso, games: p.gameCount, ok: true });
      } catch (err) {
        console.error(`[admin] ${iso} failed`, err);
        results.push({ date: iso, games: 0, ok: false, err: String(err) });
      }
    }
    return jsonResponse({ status: "done", results });
  }
  try {
    const p = await runDailyPipeline(env, dateParam, scopeParam);
    console.log(`[admin] phase A done: ${p.gameCount} games`);
    return jsonResponse({
      status: "done",
      date: p.date,
      scope: scopeParam,
      games: p.gameCount,
      notes: p.notes,
      hint: scopeParam === "full"
        ? `Phase B (highlights): POST /admin/render-highlights?key=…&date=${p.date}`
        : "leaderboards-only scope — no highlights",
    });
  } catch (err) {
    console.error(`[admin] failed`, err);
    return jsonResponse({ status: "error", error: String(err) }, 500);
  }
}

// Ingest Statcast CSVs uploaded by the off-worker savant job (savant blocks
// Worker egress). GET also reports current KV freshness for debugging.
// Ingest the nflverse weekly player-stats CSV (POSTed by the off-worker
// uploader Action), aggregate to season per-game rates + team defense, store in
// KV. GET reports current counts.
async function handleNflStatsIngest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") ?? "";
  if (!env.ADMIN_KEY || provided !== env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  if (request.method === "GET") {
    const s = await readPlayerStats(env);
    return jsonResponse({ status: "ok", players: Object.keys(s.players).length, defenses: Object.keys(s.defense).length });
  }
  try {
    const csv = await request.text();
    const stored = await storePlayerStats(env, csv);
    if (stored === 0) {
      return jsonResponse({ status: "rejected", stored, note: "0 players parsed — kept previous data" }, 422);
    }
    return jsonResponse({ status: "done", players: stored });
  } catch (err) {
    console.error("[nfl-stats-ingest] failed", err);
    return jsonResponse({ status: "error", error: String(err) }, 500);
  }
}

async function handleSendDigest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") ?? "";
  if (!env.ADMIN_KEY || provided !== env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const picksDate = url.searchParams.get("date") ?? isoFromOffset(0);
  const resultsDate = url.searchParams.get("results") ?? isoFromOffset(-1);
  const to = url.searchParams.get("to") ?? DIGEST_RECIPIENT;
  const useSandbox = url.searchParams.get("sandbox") === "1";
  try {
    const r = await sendDailyDigest(env, { toEmail: to, picksDate, resultsDate, useSandbox });
    return jsonResponse({ status: "done", id: r.id, attached: r.attached, notes: r.notes, picksDate, resultsDate, to });
  } catch (err) {
    console.error("[send-digest] failed", err);
    return jsonResponse({ status: "error", error: String(err) }, 500);
  }
}

async function handleSettle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") ?? "";
  if (!env.ADMIN_KEY || provided !== env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const date = url.searchParams.get("date") ?? isoFromOffset(-1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: "bad date" }, 400);
  }
  // Combined settle + render path; useful for backfills.
  try {
    const result = await runSettlementPhase(env, date);
    return jsonResponse({
      status: "done",
      date,
      picksUpdated: result.outcome.picksUpdated,
      rendered: result.rendered,
      byCategory: result.outcome.byCategory,
    });
  } catch (err) {
    console.error("[settle] failed", err);
    return jsonResponse({ status: "error", error: String(err) }, 500);
  }
}

async function handleRenderHighlights(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key") ?? "";
  if (!env.ADMIN_KEY || provided !== env.ADMIN_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const date = url.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: "bad date" }, 400);
  }
  try {
    const result = await runHighlightPhase(env, date);
    return jsonResponse(result);
  } catch (err) {
    console.error("[render-highlights] failed", err);
    return jsonResponse({ rendered: 0, notes: [String(err)], error: String(err) }, 500);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonText(text: string, maxAge: number): Response {
  return new Response(text, {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });
}
