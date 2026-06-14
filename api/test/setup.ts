import { applyD1Migrations, env } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      API_TOKEN: string;
      TEST_MIGRATIONS: { name: string; queries: string[] }[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
