// Store selection for this app. FAIL CLOSED: anything not explicitly configured throws (callers answer 503).
// Production (and any Netlify runtime) requires LICENSE_DATABASE_URL (Postgres). File/SQLite/memory stores are
// dev-only: they need NODE_ENV !== 'production' and a non-Netlify-runtime host, because those disks are ephemeral.
import { storeFromEnv, MemoryStore } from './stores.mjs';

export function isProductionLike(env) {
  return env.NODE_ENV === 'production' || (env.NETLIFY === 'true' && !env.NETLIFY_DEV);
}

export async function resolveStore(env = process.env) {
  if (env.LICENSE_DATABASE_URL) return storeFromEnv(env);
  if (isProductionLike(env)) throw new Error('LICENSE_DATABASE_URL is required in production');
  if (env.LICENSE_DEV_STORE === 'memory') return new MemoryStore(); // dev-only, lost on restart
  return storeFromEnv(env); // LICENSE_DB=<file> (dev) or throws "not configured"
}
