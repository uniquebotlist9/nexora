import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { Logger } from '@nexora/logger';
import type { Cache } from '@nexora/cache';
import { getEnv, isProduction } from '@nexora/config';
import type { AppDeps } from './lib/deps';
import { requestContext } from './middleware/request-context';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { globalRateLimiter } from './lib/rate-limit';
import { apiKeyAuth } from './auth/api-key';
import { healthRoute } from './routes/health';
import { meRoute } from './routes/me';
import { listGuildsRoute, createGuildRouter } from './routes/guilds';
import { keysRouter } from './routes/keys';
import { internalRouter } from './routes/internal';
import { scheduledTasksRouter } from './routes/scheduled-tasks';
import { paymentsRouter } from './routes/payments';
import { adminRouter } from './routes/admin';

/**
 * Build the Express application. Kept separate from the bootstrap (index.ts)
 * so the app can be mounted in tests without binding a port.
 */
export function createApp(deps: { cache: Cache; logger: Logger }): Express {
  const env = getEnv();
  const app = express();

  // --- Security & parsing -------------------------------------------------
  // Trust the proxy chain (e.g. nginx/ingress) only in production so
  // req.ip reflects the real client IP for rate limiting.
  if (isProduction()) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  // CORS: dashboard + admin panel origins, credentials allowed (session cookies).
  const allowedOrigins = [env.DASHBOARD_URL, env.ADMIN_URL];
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, servers) that send no Origin header.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Origin not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // Capture the raw body BEFORE parsing: payment webhook signatures are
  // computed over the exact bytes the provider signed.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      },
    }),
  );

  // --- Request context & global rate limit --------------------------------
  app.use(requestContext(deps.logger));

  // Global IP rate limit: 300 requests/minute per IP (per-API-key limits are
  // enforced separately inside apiKeyAuth via the shared cache).
  app.use(globalRateLimiter());

  // --- Routes --------------------------------------------------------------
  app.get('/health', healthRoute(deps));
  app.get('/v1/health', healthRoute(deps));

  app.get('/v1/me', apiKeyAuth(deps.cache), meRoute());
  app.get('/v1/guilds', apiKeyAuth(deps.cache), listGuildsRoute());
  app.use('/v1/guilds/:guildId', apiKeyAuth(deps.cache), createGuildRouter(deps));

  // Self-service API key management — authenticated with the user's Discord
  // access token (validated against Discord), NOT an API key: a key that can
  // mint keys would defeat scope enforcement.
  app.use('/v1/keys', keysRouter(deps));

  // Payment provider webhooks — no auth middleware: requests are authenticated
  // by provider-specific HMAC signatures over the raw body (see routes/payments).
  app.use('/v1/payments', paymentsRouter());

  // Internal service endpoints (admin panel / bot backend) — HMAC header auth.
  app.use('/v1/internal', internalRouter());
  app.use('/v1/scheduled-tasks', scheduledTasksRouter());
  app.use('/v1/admin', adminRouter(deps));

  // --- Error handling ------------------------------------------------------
  app.use(notFoundHandler());
  app.use(errorHandler(deps.logger));

  return app;
}
