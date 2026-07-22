import type { Env } from './index';
import { reorderDump } from './reorder';

// Current live table count for `kemana-uangku-db` (config, categories, accounts,
// users, transactions, sessions, monthly_balances, budgets, user_account_access,
// tracked_items, tracked_item_refills — see api/migrations/*.sql). Bump this if
// a future migration adds or drops a table; querying it dynamically would need
// an extra D1 REST round trip for a value that only changes with a migration.
export const EXPECTED_TABLE_COUNT = 11;

const MAX_POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 1000;

type D1ExportResult = {
  success: boolean;
  error?: string;
  status?: string;
  at_bookmark?: string;
  signed_url?: string;
};

type D1ExportResponse = {
  result?: D1ExportResult;
  success: boolean;
  errors?: { message: string }[];
};

export type ExportMode = 'full' | 'data-only';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestExport(
  env: Env,
  dumpOptions: Record<string, unknown>,
  currentBookmark?: string
): Promise<D1ExportResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.CF_DATABASE_ID}/export`;
  const body: Record<string, unknown> = {
    output_format: 'polling',
    dump_options: dumpOptions,
  };
  if (currentBookmark) body.current_bookmark = currentBookmark;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`D1 export request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as D1ExportResponse;
  if (!json.success || !json.result) {
    const message = json.errors?.map((e) => e.message).join(', ') ?? 'unknown error';
    throw new Error(`D1 export API returned an error: ${message}`);
  }
  if (!json.result.success) {
    throw new Error(`D1 export failed: ${json.result.error ?? 'unknown error'}`);
  }

  return json.result;
}

async function pollForSignedUrl(env: Env, dumpOptions: Record<string, unknown>): Promise<string> {
  let result = await requestExport(env, dumpOptions);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (result.signed_url) return result.signed_url;
    await sleep(POLL_DELAY_MS);
    result = await requestExport(env, dumpOptions, result.at_bookmark);
  }

  if (result.signed_url) return result.signed_url;

  throw new Error(
    `D1 export did not produce a signed_url after ${MAX_POLL_ATTEMPTS} polling attempts (timed out)`
  );
}

export async function fetchDump(env: Env, mode: ExportMode): Promise<string> {
  const dumpOptions = mode === 'data-only' ? { no_schema: true } : { no_schema: false, no_data: false };
  const signedUrl = await pollForSignedUrl(env, dumpOptions);

  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(`Failed to download D1 export from signed URL: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export function validateDump(mode: ExportMode, dump: string): { ok: true } | { ok: false; reason: string } {
  if (!dump || !dump.trim()) {
    return { ok: false, reason: 'export is empty' };
  }

  if (mode === 'full') {
    const matches = dump.match(/CREATE TABLE/gi) ?? [];
    if (matches.length !== EXPECTED_TABLE_COUNT) {
      return {
        ok: false,
        reason: `expected ${EXPECTED_TABLE_COUNT} CREATE TABLE statements, found ${matches.length}`,
      };
    }
  }

  return { ok: true };
}

export async function exportAndReorder(env: Env, mode: ExportMode): Promise<string> {
  const dump = await fetchDump(env, mode);
  return reorderDump(dump);
}
