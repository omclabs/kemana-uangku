import { exportAndReorder, validateDump, type ExportMode } from './export';
import { findOrCreateFolder, getAccessToken, uploadOrReplaceFile } from './drive';

export interface Env {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_DATABASE_ID: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
}

const MODES: { mode: ExportMode; filename: string }[] = [
  { mode: 'data-only', filename: 'kemana-uangku-data-only.sql' },
  { mode: 'full', filename: 'kemana-uangku-full.sql' },
];

async function runMode(env: Env, accessToken: string, folderId: string, mode: ExportMode, filename: string): Promise<void> {
  const dump = await exportAndReorder(env, mode);

  const validation = validateDump(mode, dump);
  if (!validation.ok) {
    throw new Error(`Validation failed for ${mode} export: ${validation.reason}`);
  }

  await uploadOrReplaceFile(accessToken, folderId, filename, dump);
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBackup(env));
  },
};

async function runBackup(env: Env): Promise<void> {
  const accessToken = await getAccessToken(env);
  const folderId = await findOrCreateFolder(accessToken);

  let failures = 0;

  // Each mode's export -> reorder -> validate -> upload sequence is
  // independently try/caught: a failure in one mode (bad export, failed
  // validation, Drive error) is logged and skipped without throwing, so it
  // never blocks the other mode's run and never aborts the scheduled handler.
  for (const { mode, filename } of MODES) {
    try {
      await runMode(env, accessToken, folderId, mode, filename);
      console.log(`[dbbackup] ${mode} (${filename}) uploaded successfully`);
    } catch (err) {
      failures++;
      console.error(`[dbbackup] ${mode} (${filename}) FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[dbbackup] run complete: ${MODES.length - failures}/${MODES.length} modes succeeded`);
}
