import { createMiddleware } from 'hono/factory';

export type Bindings = {
  DB: D1Database;
  API_TOKEN: string;
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  RECEIPT_OCR_MODEL?: string;
};

export const authMiddleware = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (token !== c.env.API_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});
