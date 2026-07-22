const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 900;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

export async function checkLoginRateLimit(
  kv: KVNamespace | undefined,
  identifier: string
): Promise<{ allowed: true } | { allowed: false }> {
  if (!kv) {
    return { allowed: true };
  }

  const key = `ratelimit:login:${identifier}`;
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false };
  }

  await kv.put(key, String(count + 1), { expirationTtl: LOGIN_RATE_LIMIT_WINDOW_SECONDS });

  return { allowed: true };
}
