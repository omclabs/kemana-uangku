import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import { authMiddleware, type Bindings } from './middleware/auth';
import authRoute from './routes/auth';
import configRoute from './routes/config';
import categoriesRoute from './routes/categories';
import accountsRoute from './routes/accounts';
import usersRoute from './routes/users';

const app = new Hono<{ Bindings: Bindings }>();

// Web frontend (web/) runs on a different origin/port than the API.
// CORS must be registered before the auth/protected routes so that
// preflight OPTIONS requests are answered without hitting authMiddleware.
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

const protectedApp = new Hono<{ Bindings: Bindings }>();
protectedApp.use('*', authMiddleware);
protectedApp.route('/config', configRoute);
protectedApp.route('/categories', categoriesRoute);
protectedApp.route('/accounts', accountsRoute);
protectedApp.route('/users', usersRoute);

app.route('/auth', authRoute);
app.route('/', protectedApp);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: 'Validation failed', details: err.issues }, 400);
  }
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
