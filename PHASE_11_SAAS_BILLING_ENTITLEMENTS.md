# Phase 11 — SaaS Subscription, Billing Entitlements & Tenant Provisioning

Phase 11 separates billing truth from operational capacity. `tenant_subscriptions` and Stripe webhook state determine the effective plan; `phase11_sync_entitlements()` materializes that result into the Phase 10 `tenant_capacity_policies` used by render/publisher governance.

## Entitlement precedence
1. Active/trialing subscription, or paid entitlement during a payment grace window / cancellation period.
2. Active admin entitlement override (plan and/or numeric quota overrides).
3. Free defaults.

## Billing lifecycle
- Stripe Checkout creates subscriptions with `user_id` metadata.
- Stripe webhook signatures are verified from the raw request body and replay-protected by `billing_webhook_events.provider_event_id`.
- Subscription updates are upserted idempotently and immediately re-sync capacity policy.
- `invoice.payment_failed` moves the account to `past_due` with `BILLING_GRACE_HOURS` (default 72h), preserving paid entitlements during grace.
- A canceled subscription keeps paid entitlement until `current_period_end`; after that the resolver returns Free.
- Billing Portal is available for card/payment/cancellation management.

## Overage
Overage is disabled by default. An admin may enable `tenant_billing_preferences.overage_enabled` and set a monthly cap. When Phase 10 would block a render for daily/monthly plan budget, the render pipeline can authorize a job-specific, idempotent `billing_overage_charges` entry using the campaign item ID.

## User billing page
`/_app/billing` shows plan, effective entitlement source, render usage, cost usage, credits, and invoice history, and starts Checkout / Billing Portal flows.

## Infrastructure variables
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, six plan price IDs, and `BILLING_GRACE_HOURS`. `PUBLIC_APP_URL` remains optional when the live request origin is correct.

## Remaining live certification
A real Stripe test-mode certification still needs test credentials: Checkout → webhook → active entitlement → payment failure/grace → recovery → cancel-at-period-end → Free downgrade. Static/source certification does not substitute for that external integration run.
