#!/usr/bin/env node
// Owner CLI: list pending license deliveries / mark one delivered. Never sends email, never calls Stripe.
//   LICENSE_DB=./data/licenses.json node scripts/deliveries.mjs list
//   LICENSE_DB=... node scripts/deliveries.mjs delivered <hash> --approver "Your Name"
// `list` prints plaintext keys (needed for manual delivery): run it only in a private terminal.
import { createLicenseWebhook, JsonStore } from '../netlify/functions/lib/license-webhook.mjs';

export function run(argv, store, out = console.log) {
  const lw = createLicenseWebhook({ secret: 'unused', store, audit: (r) => out(JSON.stringify({ audit: r })) });
  const [cmd, hash, ...rest] = argv;
  if (cmd === 'list') {
    const p = lw.pendingDeliveries();
    if (!p.length) out('No pending deliveries.');
    for (const d of p) out(`${d.hash}\t${d.tier}\t${d.email || '-'}\t${d.key}`);
    return 0;
  }
  if (cmd === 'delivered') {
    const i = rest.indexOf('--approver');
    const approver = i >= 0 ? rest[i + 1] : undefined;
    if (!hash || !approver) { out('usage: delivered <hash> --approver "<name>"'); return 2; }
    try { lw.markDelivered(hash, approver); out(`Marked delivered by ${approver}; plaintext dropped.`); return 0; }
    catch (e) { out('error: ' + e.message); return 1; }
  }
  out('usage: list | delivered <hash> --approver "<name>"');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.env.LICENSE_DB;
  if (!file) { console.error('Set LICENSE_DB to the license store JSON file (export it from your persistent store).'); process.exit(2); }
  process.exit(run(process.argv.slice(2), new JsonStore(file)));
}
