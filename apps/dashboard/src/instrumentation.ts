/**
 * Runs once when the Next.js server process boots. In dev, `next dev` forks
 * the actual server as a child process using an environment snapshot taken
 * BEFORE next.config.mjs was evaluated, so env loading done in the config
 * never reaches route handlers. Importing @nexora/config here (it runs dotenv
 * against `../../.env`, the monorepo root) populates process.env inside the
 * real server process, before any route, middleware or page module runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@nexora/config');
  }
}
