# Governance

## Rules
1. **Human approval first** for any spend, publishing, deployment, outbound message or pricing change. Automation may only draft.
2. **No secrets in code.** Keys live in Netlify env vars; `.env*` is git-ignored; only `.env.example` placeholders are committed.
3. **Audit log.** Every checkout event emits a JSON line (`checkout.stub`, `checkout.session`, `checkout.rate_limited`) in function logs, without secrets or personal data.
4. **Rate limits.** Checkout is limited per IP per minute (`RATE_LIMIT_PER_MIN`, default 5). Note: in-memory per function instance, a best-effort control; add edge/WAF limits before heavy traffic.
5. **Live payments gated.** Checkout stays in stub mode unless `LIVE_CHECKOUT_APPROVED=yes` AND Stripe keys and price IDs are set. Only the owner changes this.

## Known gaps
- Employee PIN is client-side only; not real security.
- Data is localStorage per browser until Supabase is wired.
- Review RLS policies in `supabase/schema.sql` before multi-tenant use.

## Verification
`npm test` covers stub default, approval gate, plan validation and rate limiting.

## Webhook and licenses
Webhook events emit JSON audit lines (no plaintext keys, masked emails). Key delivery is manual and requires a named approver (`scripts/deliveries.mjs`). Production storage is Postgres via `LICENSE_DATABASE_URL`; the webhook fails closed (503) without it; see `MONETIZATION.md`. Default PIN 1234 remains a known gap.
