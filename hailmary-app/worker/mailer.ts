import type { Env } from "./types";

// PHASE 4 STUB. The weekly HailMary digest email is deferred (Phase 5+). Keeping
// the signature lets index.ts's cron + /admin/send-digest compile and no-op
// safely until an NFL digest template is written.

export interface DigestOptions {
  toEmail: string;
  picksDate: string;
  resultsDate: string;
  useSandbox?: boolean;
}

export interface DigestResult {
  id: string | null;
  attached: number;
  notes: string[];
}

export async function sendDailyDigest(_env: Env, _opts: DigestOptions): Promise<DigestResult> {
  return { id: null, attached: 0, notes: ["digest is a Phase 5 stub — not sent"] };
}
