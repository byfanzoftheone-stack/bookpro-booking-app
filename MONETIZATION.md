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
