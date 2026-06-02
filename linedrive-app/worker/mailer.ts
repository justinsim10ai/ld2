import type { Category, DailyPayload, Env, League } from "./types";

const LEAGUE: League = "mlb";

// Verified sending domain on Resend. Until weregoingplaces.xyz is verified,
// pass `useSandbox: true` and we'll send from Resend's onboarding domain.
const FROM_VERIFIED = "LineDrive <linedrive@weregoingplaces.xyz>";
const FROM_SANDBOX = "LineDrive <onboarding@resend.dev>";

interface ResendAttachment {
  filename: string;
  content: string; // base64
}

interface ResendBody {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
}

export interface DigestOptions {
  toEmail: string;
  picksDate: string;     // today's projections (15:00 UTC payload)
  resultsDate: string;   // yesterday's settled payload
  useSandbox?: boolean;
}

export interface DigestResult {
  id: string | null;
  attached: number;
  notes: string[];
}

export async function sendDailyDigest(env: Env, opts: DigestOptions): Promise<DigestResult> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");

  const notes: string[] = [];
  const [picksPayload, resultsPayload] = await Promise.all([
    loadPayload(env, opts.picksDate),
    loadPayload(env, opts.resultsDate),
  ]);
  if (!picksPayload) notes.push(`no projections payload for ${opts.picksDate}`);
  if (!resultsPayload) notes.push(`no settled payload for ${opts.resultsDate}`);

  const attachments: ResendAttachment[] = [];

  // Yesterday's settled cards (per player category: 1 leaderboard + 4 highlights)
  if (resultsPayload) {
    for (const cat of PLAYER_CATEGORIES) {
      const block = resultsPayload.categories[cat];
      if (!block) continue;
      if (block.leaderboardSettledImage) {
        const att = await fetchAttachment(env, opts.resultsDate, block.leaderboardSettledImage, "results");
        if (att) attachments.push(att);
      }
      for (const f of block.highlightSettledImages ?? []) {
        const att = await fetchAttachment(env, opts.resultsDate, f, "results");
        if (att) attachments.push(att);
      }
    }
  }

  // Today's projections: per category, 1 leaderboard + up to 4 highlights
  if (picksPayload) {
    for (const cat of ALL_CATEGORIES) {
      const block = picksPayload.categories[cat];
      if (!block) continue;
      if (block.leaderboardImage) {
        const att = await fetchAttachment(env, opts.picksDate, block.leaderboardImage, "picks");
        if (att) attachments.push(att);
      }
      for (const f of block.highlightImages ?? []) {
        const att = await fetchAttachment(env, opts.picksDate, f, "picks");
        if (att) attachments.push(att);
      }
    }
  }

  if (attachments.length === 0) {
    notes.push("no images attached — payloads missing or empty");
    return { id: null, attached: 0, notes };
  }

  const subject = buildSubject(picksPayload, resultsPayload);
  const html = buildHtml(picksPayload, resultsPayload, attachments.length);

  const body: ResendBody = {
    from: opts.useSandbox ? FROM_SANDBOX : FROM_VERIFIED,
    to: opts.toEmail,
    subject,
    html,
    attachments,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = await res.json() as { id?: string };
  return { id: json.id ?? null, attached: attachments.length, notes };
}

// ---- internals ----

const ALL_CATEGORIES: Category[] = ["hr", "hit", "k", "tb", "rbi", "outs", "game"];
const PLAYER_CATEGORIES: Category[] = ["hr", "hit", "k", "tb", "rbi", "outs"];

async function loadPayload(env: Env, dateIso: string): Promise<DailyPayload | null> {
  const raw = await env.LINEDRIVE_KV.get(`r:${LEAGUE}:${dateIso}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as DailyPayload; } catch { return null; }
}

async function fetchAttachment(env: Env, dateIso: string, filename: string, prefix: string): Promise<ResendAttachment | null> {
  const r2Key = `r/${LEAGUE}/${dateIso}/${filename}`;
  const obj = await env.LINEDRIVE_ASSETS.get(r2Key);
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  return {
    filename: `${prefix}-${dateIso}-${filename}`,
    content: arrayBufferToBase64(buf),
  };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function buildSubject(picks: DailyPayload | null, results: DailyPayload | null): string {
  const todayDate = picks?.date ?? results?.date ?? "";
  let summary = "";
  if (results) {
    let hits = 0, settled = 0;
    for (const cat of PLAYER_CATEGORIES) {
      for (const p of results.categories[cat]?.picks ?? []) {
        if (p.result?.finalized) {
          settled++;
          if (p.result.hit) hits++;
        }
      }
    }
    if (settled > 0) summary = ` · yesterday ${hits}/${settled}`;
  }
  return `LineDrive · ${todayDate}${summary}`;
}

function buildHtml(picks: DailyPayload | null, results: DailyPayload | null, total: number): string {
  const css = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0c1f;line-height:1.45`;
  const muted = `color:#6b7280;font-size:13px`;
  const blocks: string[] = [];
  blocks.push(`<div style="${css}">`);
  if (picks) {
    blocks.push(`<h2 style="margin:0 0 8px">Tonight · ${picks.date}</h2>`);
    blocks.push(`<p style="${muted}">${picks.gameCount} games · ${picks.notes?.join(" · ") ?? ""}</p>`);
  }
  if (results) {
    let hits = 0, settled = 0, payout = 0;
    for (const cat of PLAYER_CATEGORIES) {
      for (const p of results.categories[cat]?.picks ?? []) {
        if (p.result?.finalized) {
          settled++;
          if (p.result.hit) hits++;
          if (typeof p.result.payoutDollars === "number") payout += p.result.payoutDollars;
        }
      }
    }
    const sign = payout >= 0 ? "+" : "−";
    blocks.push(`<h2 style="margin:18px 0 8px">Yesterday · ${results.date}</h2>`);
    blocks.push(`<p style="${muted}">${hits}/${settled} settled hits · $10 each → ${sign}$${Math.abs(payout).toFixed(2)} on the top-10 slate</p>`);
  }
  blocks.push(`<p style="${muted};margin-top:20px">${total} PNGs attached (leaderboards + highlights, projections + settled).</p>`);
  blocks.push(`</div>`);
  return blocks.join("\n");
}
