// Stripe webhook -> license issuance (verify, record, queue). NEVER sends email or calls Stripe.
// Wraps the vendored shared module (lib/license-webhook.mjs, ESM) via dynamic import.
//
// STORAGE WARNING: Netlify function filesystems are ephemeral. The JsonStore is for tests/local only.
// Production needs a persistent store object with read()/write() (see docs in MONETIZATION.md).
// Until one is provided, this function REFUSES to process events (503, Stripe will retry) unless
// ALLOW_EPHEMERAL_STORE=yes is set explicitly (then licenses may be silently lost).
const os = require('node:os');
const path = require('node:path');

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

/**
 * opts.store: any object with read()/write(). Injected by tests or a production adapter.
 * Returns a Netlify response.
 */
async function handle(event, env = process.env, opts = {}) {
  const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const { createLicenseWebhook, JsonStore } = await import('./lib/license-webhook.mjs');

  let store = opts.store;
  if (!store) {
    if (env.ALLOW_EPHEMERAL_STORE !== 'yes') {
      audit({ type: 'webhook_refused', reason: 'no_persistent_store' });
      return json(503, { error: 'no persistent store configured' });
    }
    store = new JsonStore(env.LICENSE_DB || path.join(os.tmpdir(), 'bookpro-licenses.json'));
  }
  const lw = createLicenseWebhook({
    secret: env.STRIPE_WEBHOOK_SECRET,
    priceTiers: priceTiersFromEnv(env),
    store,
    audit,
    now: opts.now,
  });
  const out = lw.handle(rawBodyOf(event), header(event, 'stripe-signature'));
  return json(out.status, out.body);
}

module.exports = { handler: (e) => handle(e), handle, priceTiersFromEnv, rawBodyOf };
