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
- Endpoint: `netlify/functions/stripe-webhook.js` wraps the vendored shared modules `netlify/functions/lib/{index,stores,async}.mjs` (copies of `the-one-foundation/packages/license-webhook/`; re-copy all three together to update) plus the local `lib/store-config.mjs`.
- Raw body is verified (base64 bodies decoded to bytes first). Tier comes only from env price ids (`STRIPE_PRICE_STARTER` -> starter, `STRIPE_PRICE_PRO` -> pro); `checkout.js` sets `metadata.price_id`. Unknown prices issue nothing. Replays are idempotent.
- Only the sha256 hash of each key is stored in `licenses`; plaintext sits in `outbox` until you deliver it by hand.
- Owner delivery (uses the same store; set `LICENSE_DATABASE_URL` first): `npm run deliveries -- list`, then after sending the key yourself `npm run deliveries -- delivered <hash> --approver "Name"`. Neither command sends anything. Import an old JSON DB with `npm run deliveries -- migrate-json <file>` (idempotent).
- **Production requires `LICENSE_DATABASE_URL` (Postgres).** The webhook uses an async transactional store: event claim, key issue and outbox write commit together, so concurrent duplicate deliveries issue exactly one key and failures roll back (Stripe retries). With no usable store it FAILS CLOSED (503). The old `ALLOW_EPHEMERAL_STORE` escape hatch is removed; file/SQLite/memory stores (`LICENSE_DB`, `LICENSE_DEV_STORE=memory`) work only when `NODE_ENV!=production` and not on Netlify's runtime. `pg` is a dependency and `netlify.toml` lists it in `external_node_modules`. Not yet tested against a live Postgres, a managed pooler, or a real Netlify build: verify on a deploy preview. The plaintext key stays in `license_outbox` until marked delivered, so protect the DB.
- Not tested against live Stripe; tested with locally signed payloads.
- Reminder: the default employee PIN `1234` is still in place and client-side only; change it before charging.
