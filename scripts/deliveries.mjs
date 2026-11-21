#!/usr/bin/env node
// Owner CLI: list pending license deliveries / mark one delivered / import a legacy JSON DB.
// Never sends email, never calls Stripe. Uses the same store as the webhook:
//   LICENSE_DATABASE_URL=postgres://... node scripts/deliveries.mjs list
//   LICENSE_DATABASE_URL=... node scripts/deliveries.mjs delivered <hash> --approver "Your Name"
//   LICENSE_DATABASE_URL=... node scripts/deliveries.mjs migrate-json ./data/licenses.json
// (dev only, no Postgres: LICENSE_DB=./data/dev.sqlite with NODE_ENV!=production)
// `list` prints plaintext keys (needed for manual delivery): run it only in a private terminal.
import { createAsyncLicenseWebhook, migrateFromLegacyJson } from '../netlify/functions/lib/async.mjs';

export async function run(argv, store, out = console.log) {
  const lw = createAsyncLicenseWebhook({ secret: 'unused', store, audit: (r) => out(JSON.stringify({ audit: r })) });
  const [cmd, hash, ...rest] = argv;
  if (cmd === 'list') {
    const p = await lw.pendingDeliveries();
    if (!p.length) out('No pending deliveries.');
    for (const d of p) out(`${d.hash}\t${d.tier}\t${d.email || '-'}\t${d.key}`);
    return 0;
  }
  if (cmd === 'delivered') {
    const i = rest.indexOf('--approver');
    const approver = i >= 0 ? rest[i + 1] : undefined;
    if (!hash || !approver) { out('usage: delivered <hash> --approver "<name>"'); return 2; }
    try { await lw.markDelivered(hash, approver); out(`Marked delivered by ${approver}; plaintext dropped.`); return 0; }
    catch (e) { out('error: ' + e.message); return 1; }
  }
  if (cmd === 'migrate-json') {
    if (!hash) { out('usage: migrate-json <file>'); return 2; }
    try {
      const c = await migrateFromLegacyJson(hash, store);
      out(`Imported ${c.licenses} licenses, ${c.outbox} outbox entries, ${c.events} events (idempotent).`);
      return 0;
    } catch (e) { out('error: ' + e.message); return 1; }
  }
  out('usage: list | delivered <hash> --approver "<name>" | migrate-json <file>');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resolveStore } = await import('../netlify/functions/lib/store-config.mjs');
  let store;
  try { store = await resolveStore(process.env); }
  catch (e) { console.error(e.message + '\nSet LICENSE_DATABASE_URL (Postgres).'); process.exit(2); }
  const code = await run(process.argv.slice(2), store);
  if (store.pool && store.pool.end) await store.pool.end();
  process.exit(code);
}
