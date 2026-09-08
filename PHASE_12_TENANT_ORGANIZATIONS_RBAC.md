# Phase 12 — Tenant Organizations, Teams, RBAC & Multi-Channel Ownership

## Boundary
`organizations.id` is the workspace tenant key. Existing users receive a personal workspace during migration. `user_id` remains creator/audit compatibility; organization membership is authoritative for shared access.

## Roles
- Owner: full workspace authority; cannot be removed by ordinary member RPCs.
- Admin: team/channel administration and privileged content management.
- Editor: create/update campaigns, templates, assets and campaign items.
- Analyst: read-only workspace access plus audit/analytics visibility.

## Isolation
RLS for campaigns, campaign items, templates, assets and YouTube connections is workspace membership based. Campaign integrity triggers reject YouTube channels and private templates owned by another organization. Campaign items must inherit their campaign organization.

## Teams
Invitations are seven-day, one-time credentials. Only a SHA-256 hash is persisted. Invitation acceptance verifies the authenticated account email before membership creation. Team mutations are audited.

## Audit
Membership changes and INSERT/UPDATE/DELETE operations on campaigns, templates, assets and YouTube connections append organization-scoped audit records.

## Billing/capacity
Each workspace has a `billing_owner_user_id`. Existing Phase 11 billing remains attached to that financial identity, while render fairness uses `organization_id` as the worker tenant key. This causes all members of a workspace to share one concurrency/fairness allocation and one billing-owner entitlement rather than multiplying capacity per teammate.

## Multi-channel ownership
YouTube connections now carry `organization_id`. Owner/admin can manage workspace connections. Campaign integrity guarantees a campaign cannot publish through a channel from another workspace.

## Migration behavior
The migration is additive-first. Existing rows are assigned to the personal workspace of their current `user_id`, then core RLS policies are replaced. Insert triggers preserve legacy create flows by filling the user's default workspace when `organization_id` is omitted.

## Certification limitation
Static source/migration certification and worker regressions run locally. A staging Postgres test with two authenticated users in separate organizations is still required to prove RLS isolation, invitation acceptance, role changes, and cross-workspace denial under real Supabase JWTs before production rollout.
