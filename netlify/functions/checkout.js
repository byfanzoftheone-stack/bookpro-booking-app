// Zero-dependency checkout. STUB mode unless owner explicitly approves live mode.
// Guardrails: human approval flag, rate limit, JSON audit log (no secrets), env-only keys.
const PLANS = { starter: 'STRIPE_PRICE_STARTER', pro: 'STRIPE_PRICE_PRO' };
const hits = new Map();

function audit(event, data) {
  // Structured audit line; visible in Netlify function logs. Never log secrets/PII.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function rateLimited(ip, env, now = Date.now()) {
  const limit = parseInt(env.RATE_LIMIT_PER_MIN || '5', 10);
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

async function handle(event, env = process.env, fetchImpl = fetch) {
  const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'])) || 'unknown';
  if (rateLimited(ip, env)) { audit('checkout.rate_limited', { ip }); return json(429, { error: 'Too many requests' }); }
  let plan;
  try { plan = JSON.parse(event.body || '{}').plan; } catch { return json(400, { error: 'Bad JSON' }); }
  if (!PLANS[plan]) return json(400, { error: 'Unknown plan' });

  const live = env.LIVE_CHECKOUT_APPROVED === 'yes' && env.STRIPE_SECRET_KEY && env[PLANS[plan]] && env.SITE_URL;
  if (!live) {
    audit('checkout.stub', { plan, reason: 'live checkout not approved or not configured' });
    return json(200, { mode: 'stub', message: 'Checkout is not live yet. Owner approval and Stripe keys required.' });
  }
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': env[PLANS[plan]],
    'line_items[0][quantity]': '1',
    // Read by the webhook to map price -> tier (server-side only; never client-supplied).
    'metadata[price_id]': env[PLANS[plan]],
    'subscription_data[metadata][price_id]': env[PLANS[plan]],
    success_url: env.SITE_URL + '/pricing.html?paid=1',
    cancel_url: env.SITE_URL + '/pricing.html?canceled=1'
  });
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await res.json();
  audit('checkout.session', { plan, ok: res.ok, session: data.id });
  if (!res.ok) return json(502, { error: 'Stripe error' });
  return json(200, { mode: 'live', url: data.url });
}

module.exports = { handler: (e) => handle(e), handle, rateLimited, hits };
