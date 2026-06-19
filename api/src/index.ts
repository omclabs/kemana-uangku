import { Hono } from 'hono';
import { ZodError } from 'zod';
import { authMiddleware, type Bindings } from './middleware/auth';
import { AppConfigError, assertRequiredBindings, resolveAllowedOrigin } from './lib/security';
import authRoute from './routes/auth';
import configRoute from './routes/config';
import categoriesRoute from './routes/categories';
import accountsRoute from './routes/accounts';
import balancesRoute from './routes/balances';
import budgetsRoute from './routes/budgets';
import usersRoute from './routes/users';
import transactionsRoute from './routes/transactions';

const app = new Hono<{ Bindings: Bindings }>();

function applySecurityHeaders(response: Response): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

app.use('*', async (c, next) => {
  assertRequiredBindings(c.env);

  const requestOrigin = c.req.header('Origin');
  const allowedOrigin = resolveAllowedOrigin(requestOrigin, c.env);

  if (requestOrigin && !allowedOrigin) {
    return c.json({ error: 'Origin not allowed' }, 403);
  }

  if (c.req.method === 'OPTIONS') {
    const response = new Response(null, { status: 204 });
    if (allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      response.headers.set('Vary', 'Origin');
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    applySecurityHeaders(response);
    return response;
  }

  await next();

  const response = c.res;
  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Vary', 'Origin');
  }
  applySecurityHeaders(response);
});

const protectedApp = new Hono<{ Bindings: Bindings }>();
protectedApp.use('*', authMiddleware);
protectedApp.route('/config', configRoute);
protectedApp.route('/categories', categoriesRoute);
protectedApp.route('/accounts', accountsRoute);
protectedApp.route('/balances', balancesRoute);
protectedApp.route('/budgets', budgetsRoute);
protectedApp.route('/users', usersRoute);
protectedApp.route('/transactions', transactionsRoute);

app.route('/auth', authRoute);
app.route('/', protectedApp);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
  if (err instanceof ZodError) {
    const response = c.json({ error: 'Validation failed', details: err.issues }, 400);
    applySecurityHeaders(response);
    return response;
  }

  if (err instanceof AppConfigError) {
    console.error('Invalid API configuration', {
      method: c.req.method,
      path: c.req.path,
      error: err.message,
    });
    const response = c.json({ error: 'Service misconfigured' }, err.status);
    applySecurityHeaders(response);
    return response;
  }

  console.error('Unhandled API error', {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const response = c.json({ error: 'Internal Server Error' }, 500);
  applySecurityHeaders(response);
  return response;
});

export default app;
