// Stripe webhook -> license issuance (verify, record, queue). NEVER sends email or calls Stripe.
// Wraps the vendored shared modules (lib/*.mjs, ESM) via dynamic import. All store calls are ASYNC.
//
// STORAGE: production requires LICENSE_DATABASE_URL (Postgres; event claim + key issue + outbox are one
// transaction). Without a usable store this function FAILS CLOSED with 503 (Stripe retries).
// Dev only (NODE_ENV !== 'production', not a Netlify runtime): LICENSE_DB=<file> or LICENSE_DEV_STORE=memory.

// Static reference so Netlify's bundler ships `pg` (loaded at runtime by lib/stores.mjs; see netlify.toml).
// Never called here.
const _shipPg = () => require('pg');
void _shipPg;

function audit(rec) { console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'webhook', ...rec })); }

/** price id -> tier, from env only. Unset/placeholder ids are skipped. */
function priceTiersFromEnv(env) {
  const map = {};
  for (const [name, tier] of [['STRIPE_PRICE_STARTER', 'starter'], ['STRIPE_PRICE_PRO', 'pro']]) {
    const id = env[name];
    if (id && !/REPLACE_ME/.test(id)) map[id] = tier;
  }
  return map;
}

/** Netlify passes the raw body as a string; base64 when isBase64Encoded. Return raw bytes. */
function rawBodyOf(event) {
  if (event.body == null) return Buffer.alloc(0);
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');
}

function header(event, name) {
  const h = event.headers || {};
  for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
  return undefined;
}

// Module-level cache of the store promise for the real process env (warm invocations reuse the pool).
let storePromise = null;
function getStore(env) {
  const load = async () => (await import('./lib/store-config.mjs')).resolveStore(env);
  if (env !== process.env) return load(); // injected env (tests): no caching
  if (!storePromise) storePromise = load().catch((e) => { storePromise = null; throw e; }); // never cache a failure
  return storePromise;
}
function resetStoreCache() { storePromise = null; }

/**
 * opts.store: any ASYNC transactional store (see lib/stores.mjs). Injected by tests; otherwise from env.
 * Returns a Netlify response.
 */
async function handle(event, env = process.env, opts = {}) {
  const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const { createAsyncLicenseWebhook } = await import('./lib/async.mjs');

  let store = opts.store;
  if (!store) {
    try { store = await getStore(env); }
    catch (e) {
      audit({ type: 'webhook_refused', reason: 'no_persistent_store', detail: String(e.message).slice(0, 200) });
      return json(503, { error: 'no persistent store configured' });
    }
  }
  const lw = createAsyncLicenseWebhook({
    secret: env.STRIPE_WEBHOOK_SECRET,
    priceTiers: priceTiersFromEnv(env),
    store,
    audit,
    now: opts.now,
  });
  try {
    const out = await lw.handle(rawBodyOf(event), header(event, 'stripe-signature'));
    return json(out.status, out.body);
  } catch (e) {
    audit({ type: 'webhook_error', detail: String(e.message).slice(0, 200) });
    return json(500, { error: 'processing failed' }); // transaction rolled back; Stripe will retry
  }
}

module.exports = { handler: (e) => handle(e), handle, priceTiersFromEnv, rawBodyOf, resetStoreCache };
