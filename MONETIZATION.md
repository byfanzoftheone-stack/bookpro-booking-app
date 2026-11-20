# Monetization

**Product:** BookPro, a phone-first booking calendar with staff clock-in, quotes and branding, for solo service businesses (barbers, cleaners, trainers, detailers).
**Who pays:** the business owner, monthly.

## Pricing tiers (PLACEHOLDERS, owner must approve)
| Tier | Price | Includes |
|---|---|---|
| Free | $0 | Local-only calendar, clock, quotes |
| Starter | $19/mo | Supabase cloud sync, 1 location, reminders |
| Pro | $49/mo | Multi-staff, booking deposits, custom branding/domain |

## Revenue paths
1. Monthly subscriptions via Stripe Checkout (`pricing.html` + `netlify/functions/checkout.js`, stub until approved).
2. One-time setup fee ($99-$299) to configure a business's branding and Supabase.
3. Booking deposits (Stripe) on Pro, optionally with a small platform fee.
4. Agency/white-label resale to local service businesses.

## Launch checklist
- [ ] Owner approves prices; create Stripe products and prices
- [ ] Set env vars in Netlify (see `.env.example`); deploy from Git (functions are not supported by drag-and-drop)
- [ ] Test in Stripe test mode, then set `LIVE_CHECKOUT_APPROVED=yes`
- [ ] Add privacy policy and terms; confirm tax settings
- [ ] Replace local-only storage with Supabase auth before charging for cloud sync
- [ ] Change default employee PIN (1234) and move PIN checks server-side
- [ ] Review `LAUNCH.md` copy and post manually

## Licenses via Stripe webhook (verify, record, queue; never emails or calls Stripe)
- Endpoint: `netlify/functions/stripe-webhook.js` wraps the vendored shared module `netlify/functions/lib/license-webhook.mjs` (copy of `the-one-foundation/packages/license-webhook/index.mjs`; re-copy to update).
- Raw body is verified (base64 bodies decoded to bytes first). Tier comes only from env price ids (`STRIPE_PRICE_STARTER` -> starter, `STRIPE_PRICE_PRO` -> pro); `checkout.js` sets `metadata.price_id`. Unknown prices issue nothing. Replays are idempotent.
- Only the sha256 hash of each key is stored in `licenses`; plaintext sits in `outbox` until you deliver it by hand.
- Owner delivery: `LICENSE_DB=<file> npm run deliveries -- list`, then after sending the key yourself `npm run deliveries -- delivered <hash> --approver "Name"`. Neither command sends anything.
- **Persistence is REQUIRED before launch.** Netlify functions have an ephemeral filesystem; `JsonStore` is for tests/local only. The function returns 503 (Stripe retries) unless a store is injected or `ALLOW_EPHEMERAL_STORE=yes`. The store is any object with synchronous `read()`/`write()`. Netlify Blobs and DBs are async, so the next step is either an async store variant of the shared module or a read-through cache with write-back; NOT implemented here (no dependency-free, correct adapter without changing the shared module). Concurrent webhooks also need a lock/compare-and-set.
- Not tested against live Stripe; tested with locally signed payloads.
- Reminder: the default employee PIN `1234` is still in place and client-side only; change it before charging.
