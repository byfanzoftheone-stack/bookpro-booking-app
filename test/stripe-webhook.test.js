const test = require('node:test'); const assert = require('node:assert');
const crypto = require('node:crypto'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { handle, priceTiersFromEnv } = require('../netlify/functions/stripe-webhook.js');
const checkout = require('../netlify/functions/checkout.js');

const SECRET = 'whsec_test_only';
const env = { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_STARTER: 'price_starter' };
// Temp SQLite store (async transactional) + raw-table views so assertions can inspect rows.
const { DatabaseSync } = require('node:sqlite');
const mem = async () => {
  const { SqliteStore } = await import('../netlify/functions/lib/stores.mjs');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-')), 'l.sqlite');
  const store = new SqliteStore(file); await store.ready;
  const q = (sql) => { const db = new DatabaseSync(file); try { return db.prepare(sql).all(); } finally { db.close(); } };
  store.count = (t) => q(`SELECT COUNT(*) n FROM ${t}`)[0].n;
  store.rows = (t) => q(`SELECT * FROM ${t}`);
  return store;
};
const sign = (body, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex')}`;
const paid = (id, price = 'price_pro', status = 'paid') => JSON.stringify({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, payment_status: status, customer: 'cus_1', subscription: 'sub_1', metadata: { price_id: price }, customer_details: { email: 'a@b.co' } } } });
const ev = (body, sig, b64 = false) => ({ httpMethod: 'POST', headers: { 'Stripe-Signature': sig }, body: b64 ? Buffer.from(body).toString('base64') : body, isBase64Encoded: b64 });

test('rejects bad/missing signature, accepts good (plain and base64)', async () => {
  const s = await mem(); const b = paid('evt_1');
  assert.equal((await handle(ev(b, 'bogus'), env, { store: s })).statusCode, 400);
  assert.equal((await handle(ev(b, sign(b, undefined, 'wrong')), env, { store: s })).statusCode, 400);
  assert.equal((await handle(ev(b, sign(b, 1)), env, { store: s })).statusCode, 400); // stale timestamp
  assert.equal(s.count('licenses'), 0);
  assert.equal((await handle(ev(b, sign(b)), env, { store: s })).statusCode, 200);
  const b2 = paid('evt_2') + ' '; // whitespace is part of the signed raw bytes
  assert.equal((await handle(ev(b2, sign(b2), true), env, { store: s })).statusCode, 200);
  // base64 body with signature computed over a DIFFERENT string must fail
  assert.equal((await handle(ev(b2, sign(paid('evt_2')), true), env, { store: s })).statusCode, 400);
});

test('issues on paid: hash stored, plaintext only in outbox; tier from env map', async () => {
  const s = await mem(); const b = paid('evt_3');
  await handle(ev(b, sign(b)), env, { store: s });
  const [l] = s.rows('licenses'); const [o] = s.rows('license_outbox');
  assert.equal(l.tier, 'pro');
  assert.ok(!JSON.stringify(s.rows('licenses')).includes('FZ-'));
  assert.match(o.key, /^FZ-PRO-/);
  assert.equal(crypto.createHash('sha256').update(o.key).digest('hex'), l.hash);
});

test('replay issues nothing; unpaid and unknown price issue nothing', async () => {
  const s = await mem(); const b = paid('evt_4');
  await handle(ev(b, sign(b)), env, { store: s });
  const r = await handle(ev(b, sign(b)), env, { store: s });
  assert.equal(JSON.parse(r.body).duplicate, true);
  assert.equal(s.count('licenses'), 1);
  const u = paid('evt_5', 'price_unknown'); await handle(ev(u, sign(u)), env, { store: s });
  const np = paid('evt_6', 'price_pro', 'unpaid'); await handle(ev(np, sign(np)), env, { store: s });
  assert.equal(s.count('licenses'), 1);
});

test('fails closed (503) without a store; no ephemeral escape hatch; non-POST 405', async () => {
  const b = paid('evt_7'); const e = ev(b, sign(b));
  assert.equal((await handle(e, env)).statusCode, 503);
  assert.equal((await handle({ httpMethod: 'GET', headers: {} }, env)).statusCode, 405);
  assert.equal((await handle(e, { ...env, ALLOW_EPHEMERAL_STORE: 'yes' })).statusCode, 503); // old hatch is gone
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-')), 'l.sqlite');
  // production never accepts file/memory stores, even if configured
  assert.equal((await handle(e, { ...env, NODE_ENV: 'production', LICENSE_DB: f })).statusCode, 503);
  assert.equal((await handle(e, { ...env, NODE_ENV: 'production', LICENSE_DEV_STORE: 'memory' })).statusCode, 503);
  assert.equal((await handle(e, { ...env, NETLIFY: 'true', LICENSE_DEV_STORE: 'memory' })).statusCode, 503);
  // dev-only paths
  assert.equal((await handle(e, { ...env, NODE_ENV: 'test', LICENSE_DEV_STORE: 'memory' })).statusCode, 200);
  assert.equal((await handle(e, { ...env, NODE_ENV: 'test', LICENSE_DB: f })).statusCode, 200);
  // LICENSE_DATABASE_URL without a reachable/installed driver also fails closed
  assert.equal((await handle(e, { ...env, LICENSE_DATABASE_URL: 'postgres://127.0.0.1:1/x' })).statusCode, 503);
});

test('25 concurrent copies of one event issue exactly one key', async () => {
  const s = await mem(); const b = paid('evt_conc'); const e = ev(b, sign(b));
  const rs = await Promise.all(Array.from({ length: 25 }, () => handle(e, env, { store: s })));
  assert.ok(rs.every((r) => r.statusCode === 200));
  assert.equal(rs.filter((r) => !JSON.parse(r.body).duplicate).length, 1);
  assert.equal(s.count('licenses'), 1); assert.equal(s.count('license_outbox'), 1);
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

test('owner CLI lists pending, marks delivered with approver, migrates legacy JSON', async () => {
  const { run } = await import('../scripts/deliveries.mjs');
  const s = await mem(); const b = paid('evt_8'); await handle(ev(b, sign(b)), env, { store: s });
  const [{ hash: h }] = s.rows('license_outbox'); const lines = [];
  assert.equal(await run(['list'], s, (l) => lines.push(l)), 0);
  assert.ok(lines[0].startsWith(h));
  assert.equal(await run(['delivered', h], s, () => {}), 2); // approver required
  assert.equal(await run(['delivered', h, '--approver', 'owner'], s, () => {}), 0);
  const [o] = s.rows('license_outbox'); assert.equal(o.key, null); assert.equal(o.approver, 'owner');
  lines.length = 0; await run(['list'], s, (l) => lines.push(l)); assert.equal(lines[0], 'No pending deliveries.');

  const legacy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-')), 'old.json');
  fs.writeFileSync(legacy, JSON.stringify({ events: { evt_old: { type: 'x', at: 't' } },
    licenses: { h1: { tier: 'pro', status: 'active', created: 't' } }, outbox: { h1: { key: 'FZ-PRO-OLD', tier: 'pro', status: 'pending_delivery', created: 't' } } }));
  const s2 = await mem(); lines.length = 0;
  assert.equal(await run(['migrate-json', legacy], s2, (l) => lines.push(l)), 0);
  assert.match(lines[0], /Imported 1 licenses, 1 outbox entries, 1 events/);
  assert.equal(await run(['migrate-json', legacy], s2, () => {}), 0); // idempotent
  assert.equal(s2.count('licenses'), 1);
  assert.equal(await run(['migrate-json'], s2, () => {}), 2);
});
