const DEV_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5787',
  'http://127.0.0.1:5787',
];

const DEFAULT_ADMIN_PASSWORD_HASH =
  '$2b$10$QjBGehZoncz48XTspt34PuX1UPkRIutS5akOV5fprLDafPCWhDNoW';

export class AppConfigError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AppConfigError';
    this.status = status;
  }
}

type SecurityEnv = {
  DB?: D1Database;
  API_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  ALLOW_API_TOKEN_AUTH?: string;
};

export function assertRequiredBindings(env: SecurityEnv): void {
  if (!env.DB) {
    throw new AppConfigError('Missing DB binding');
  }

  if (!env.API_TOKEN || !env.API_TOKEN.trim()) {
    throw new AppConfigError('Missing API_TOKEN binding');
  }
}

function getAllowedOrigins(env: Pick<SecurityEnv, 'ALLOWED_ORIGINS'>): string[] {
  const configured = env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : DEV_ALLOWED_ORIGINS;
}

export function resolveAllowedOrigin(
  requestOrigin: string | undefined,
  env: Pick<SecurityEnv, 'ALLOWED_ORIGINS'>
): string | null {
  if (!requestOrigin) return null;
  return getAllowedOrigins(env).includes(requestOrigin) ? requestOrigin : null;
}

export function isApiTokenAuthEnabled(env: Pick<SecurityEnv, 'ALLOW_API_TOKEN_AUTH'>): boolean {
  return env.ALLOW_API_TOKEN_AUTH === 'true';
}

export function isDefaultAdminPasswordHash(passwordHash: string): boolean {
  return passwordHash === DEFAULT_ADMIN_PASSWORD_HASH;
}
