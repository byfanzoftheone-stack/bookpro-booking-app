const test = require('node:test'); const assert = require('node:assert');
const crypto = require('node:crypto'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { handle, priceTiersFromEnv } = require('../netlify/functions/stripe-webhook.js');
const checkout = require('../netlify/functions/checkout.js');

const SECRET = 'whsec_test_only';
const env = { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_STARTER: 'price_starter' };
const mem = () => { let d = { events: {}, licenses: {}, outbox: {} }; return { read: () => JSON.parse(JSON.stringify(d)), write: (x) => { d = JSON.parse(JSON.stringify(x)); }, get d() { return d; } }; };
const sign = (body, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex')}`;
const paid = (id, price = 'price_pro', status = 'paid') => JSON.stringify({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, payment_status: status, customer: 'cus_1', subscription: 'sub_1', metadata: { price_id: price }, customer_details: { email: 'a@b.co' } } } });
const ev = (body, sig, b64 = false) => ({ httpMethod: 'POST', headers: { 'Stripe-Signature': sig }, body: b64 ? Buffer.from(body).toString('base64') : body, isBase64Encoded: b64 });

test('rejects bad/missing signature, accepts good (plain and base64)', async () => {
  const s = mem(); const b = paid('evt_1');
  assert.equal((await handle(ev(b, 'bogus'), env, { store: s })).statusCode, 400);
  assert.equal((await handle(ev(b, sign(b, undefined, 'wrong')), env, { store: s })).statusCode, 400);
  assert.equal((await handle(ev(b, sign(b, 1)), env, { store: s })).statusCode, 400); // stale timestamp
  assert.equal(Object.keys(s.d.licenses).length, 0);
  assert.equal((await handle(ev(b, sign(b)), env, { store: s })).statusCode, 200);
  const b2 = paid('evt_2') + ' '; // whitespace is part of the signed raw bytes
  assert.equal((await handle(ev(b2, sign(b2), true), env, { store: s })).statusCode, 200);
  // base64 body with signature computed over a DIFFERENT string must fail
  assert.equal((await handle(ev(b2, sign(paid('evt_2')), true), env, { store: s })).statusCode, 400);
});

test('issues on paid: hash stored, plaintext only in outbox; tier from env map', async () => {
  const s = mem(); const b = paid('evt_3');
  await handle(ev(b, sign(b)), env, { store: s });
  const [h] = Object.keys(s.d.licenses);
  assert.equal(s.d.licenses[h].tier, 'pro');
  assert.ok(!JSON.stringify(s.d.licenses).includes('FZ-'));
  assert.match(s.d.outbox[h].key, /^FZ-PRO-/);
  assert.equal(crypto.createHash('sha256').update(s.d.outbox[h].key).digest('hex'), h);
});

test('replay issues nothing; unpaid and unknown price issue nothing', async () => {
  const s = mem(); const b = paid('evt_4');
  await handle(ev(b, sign(b)), env, { store: s });
  const r = await handle(ev(b, sign(b)), env, { store: s });
  assert.equal(JSON.parse(r.body).duplicate, true);
  assert.equal(Object.keys(s.d.licenses).length, 1);
  const u = paid('evt_5', 'price_unknown'); await handle(ev(u, sign(u)), env, { store: s });
  const np = paid('evt_6', 'price_pro', 'unpaid'); await handle(ev(np, sign(np)), env, { store: s });
  assert.equal(Object.keys(s.d.licenses).length, 1);
});

test('refuses without persistent store unless explicitly allowed; non-POST 405', async () => {
  const b = paid('evt_7');
  assert.equal((await handle(ev(b, sign(b)), env)).statusCode, 503);
  assert.equal((await handle({ httpMethod: 'GET', headers: {} }, env)).statusCode, 405);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-')), 'l.json');
  assert.equal((await handle(ev(b, sign(b)), { ...env, ALLOW_EPHEMERAL_STORE: 'yes', LICENSE_DB: f })).statusCode, 200);
});

test('price map ignores placeholders; checkout sets metadata.price_id', async () => {
  assert.deepEqual(priceTiersFromEnv({ STRIPE_PRICE_PRO: 'price_REPLACE_ME' }), {});
  let sent;
  checkout.hits.clear();
  await checkout.handle({ httpMethod: 'POST', headers: { 'x-forwarded-for': 'wh' }, body: '{"plan":"pro"}' },
    { STRIPE_SECRET_KEY: 'x', STRIPE_PRICE_PRO: 'price_pro', SITE_URL: 'u', LIVE_CHECKOUT_APPROVED: 'yes' },
    async (_u, o) => { sent = o.body; return { ok: true, json: async () => ({ id: 'cs', url: 'https://s' }) }; });
  assert.equal(sent.get('metadata[price_id]'), 'price_pro');
});

test('owner CLI lists pending and marks delivered with approver', async () => {
  const { run } = await import('../scripts/deliveries.mjs');
  const s = mem(); const b = paid('evt_8'); await handle(ev(b, sign(b)), env, { store: s });
  const [h] = Object.keys(s.d.outbox); const lines = [];
  assert.equal(run(['list'], s, (l) => lines.push(l)), 0);
  assert.ok(lines[0].startsWith(h));
  assert.equal(run(['delivered', h], s, () => {}), 2); // approver required
  assert.equal(run(['delivered', h, '--approver', 'owner'], s, () => {}), 0);
  assert.equal(s.d.outbox[h].key, undefined); assert.equal(s.d.outbox[h].approver, 'owner');
  lines.length = 0; run(['list'], s, (l) => lines.push(l)); assert.equal(lines[0], 'No pending deliveries.');
});
