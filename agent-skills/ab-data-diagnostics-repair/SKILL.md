---
name: ab-data-diagnostics-repair
description: Diagnose and repair Art Battle data integrity and payments anomalies across Supabase/Postgres and edge-function layers. Use when owed or paid values look wrong, artists disappear from admin tabs, profile linking looks inconsistent, payout statuses mismatch across views, or safe SQL repair with verification is required.
---

# AB Data Diagnostics and Repair

## Overview
Run a safety-first workflow for AB data issues: isolate the serving path, prove root cause with SQL evidence, apply minimal repair, and verify behavior in both database functions and user-facing endpoints.

## Workflow
1. Confirm the serving path before touching data.
2. Reproduce the anomaly with direct SQL and function output.
3. Reconcile disputed payout amounts to checkout truth and payout-share math.
4. Compare with recently normal records to find the true delta.
5. Classify root cause (logic/linkage/deployment/onboarding/expectation).
6. Repair with reversible steps and capture pre/post evidence.
7. Verify from both SQL and edge function responses.
8. Record a concise audit trail with exact IDs, timestamps, and commands.

## 1) Confirm Serving Path
- Identify which frontend tab or endpoint the user is referencing.
- Identify which edge function and RPCs back that view.
- Do not assume similarly named functions power the same UI.
- For event-specific payments, verify the full read model:
  - edge function: `event-admin-payments`
  - RPCs: `get_event_artists_owed`, `get_event_ready_to_pay`, `get_event_payment_attempts`, `get_event_payment_summary`
- A stale Postgres function can mimic stale edge-function behavior. Check RPC definitions directly when tabs disagree.
- For AB payments, start with [references/payments-and-profiles-diagnostics.md](references/payments-and-profiles-diagnostics.md).

## 2) Reproduce with Two Data Sources
- Query the underlying RPC/function output directly in SQL.
- Query the live edge function payload for the same entity.
- Compare by immutable identifiers (`artist_profile_id`, `person_id`, `payment_id`) instead of names.

## 3) Reconcile Amounts and Payout Readiness
- For payout amount disputes, reconcile:
  - sale fields (`art.final_price` / `art.current_bid`)
  - checkout truth (`payment_processing.amount`, `payment_processing.status`)
  - payout share (`events.artist_auction_portion`)
- For cross-currency incidents, also reconcile:
  - `events.currency`
  - `cities -> countries.currency_code`
  - `artist_payments.currency`
- Compute expected owed from settled sale amount and compare with RPC outputs.
- Distinguish unpaid causes:
  - no payout account / invite incomplete (`artist_global_payments`, `payment_invitations`)
  - payout attempt failed after account readiness (check `artist_payments`/`global_payment_requests`)

## 4) Compare Against Controls
- Select a recent normal cohort (for payments: recently paid artists).
- Compare profile cardinality, supersession state, payment status mix, and computed balances.
- Keep at least one control for each relevant status (`paid`, `verified`, `completed`, manual payments).

## 5) Classify Root Cause
- `Logic mismatch`: different functions count statuses differently or join differently.
- `Linkage issue`: contradictory profile state (for example, primary profile also marked superseded).
- `Deployment/config`: migration present locally but not deployed, wrong DB endpoint, wrong credentials.
- `Onboarding block`: artist is owed but cannot be paid yet due to incomplete payout setup.
- `Expectation mismatch`: reported sold/owed amount disagrees with checkout and payout-share evidence.

## 6) Repair Safely
- Take pre-change snapshots to `.audit/` first.
- Apply the smallest change that resolves the proven root cause.
- Prefer deterministic SQL/function fixes over ad-hoc data edits.
- When reconciling profiles, preserve canonical IDs and migrate linked rows explicitly.

## 7) Deploy and Verify
- Use pooled Postgres when direct 5432 is unavailable.
- Use credential files in `~/creds/` and never print secret values.
- Re-check: target entity, controls, and global drift indicators.
- Confirm endpoint-level behavior after DB-level fixes.
- When production may be stale, compare deployed edge-function bundles with local code and inspect live RPC definitions separately.
- Connectivity runbook: [references/vote26-connectivity-and-credentials.md](references/vote26-connectivity-and-credentials.md).

## 8) Required Evidence in Final Output
- Exact entity IDs affected.
- Exact before/after metrics.
- Claimed amount vs verified amount evidence (`art`, `payment_processing`, payout-share math).
- Resolution class label (`logic mismatch` | `linkage issue` | `deployment/config` | `onboarding block` | `expectation mismatch`).
- List of commands and files changed.
- Any unresolved anomalies and whether they are same class or separate backlog.

## Resources
- Diagnostic patterns and query pack:
[references/payments-and-profiles-diagnostics.md](references/payments-and-profiles-diagnostics.md)
- Vote26 DB connectivity and credential pattern:
[references/vote26-connectivity-and-credentials.md](references/vote26-connectivity-and-credentials.md)
- Safe pooled-psql wrapper:
[scripts/vote26_psql.sh](scripts/vote26_psql.sh)
- Fast parity drift check:
[scripts/payments_parity_check.sh](scripts/payments_parity_check.sh)
