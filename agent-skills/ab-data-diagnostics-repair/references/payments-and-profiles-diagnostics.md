# Payments and Profiles Diagnostics (Vote26)

## Core learnings encoded from incident work
- `working-admin-payments` behavior is driven by enhanced RPCs (`get_enhanced_admin_artists_owed`, `get_ready_to_pay_artists`).
- `simple-admin-payments`/related endpoints use `get_simple_admin_payments_data` and can diverge if logic differs.
- `verified` payout status must be treated as settled for owed-balance computation.
- Recent-city joins can duplicate rows if not reduced to one latest row per artist.
- Profile primary selection must clear `superseded_by` on the chosen primary profile.
- A profile can look "not owed" in enhanced logic while still appearing owed in simple logic if `verified` debits are excluded.
- Claimed sold amounts should be validated against `payment_processing.amount` (checkout truth), not only art table fields.
- Unpaid balance often splits into two very different classes: onboarding blocked (`artist_global_payments`/`payment_invitations`) vs payout failure after readiness.
- `events.currency` is the canonical event payout/read-model currency. If it diverges from `cities.countries.currency_code`, event admin views can become nonsensical even when checkout truth is correct.
- `admin-create-event` has historically been able to introduce bad event currency defaults; verify create-path behavior separately from edit-path behavior.
- `get_event_ready_to_pay(uuid)` can drift independently of deployed edge-function bundles. If artists appear in both `Ready to Pay` and `In Progress`, inspect the live function definition.
- Event-scoped payout writes should include `event_id` and a representative `art_id`; otherwise event-specific payment attempts may not reconcile back into the event read model.

## Root-cause checklist
1. Confirm UI path -> edge function -> RPC mapping.
2. Compute balance components explicitly:
   - art sales total
   - settled debits (`completed`, `paid`, `verified`)
3. For amount disputes, reconcile `art.final_price/current_bid` with `payment_processing.amount` and event share.
4. For event payment incidents, reconcile `events.currency` against `cities.countries.currency_code` and existing `artist_payments.currency`.
5. Check payout readiness state (`artist_global_payments`, `payment_invitations`) before assuming payout execution failed.
6. Check simple vs enhanced parity for the same profile ID.
7. Validate profile linking state for the same person.
8. Validate controls from recently paid artists.
9. If event tabs disagree, inspect the live definition of `get_event_ready_to_pay(uuid)` before blaming the edge function.

## High-value SQL snippets

### A) Profile contradiction count
```sql
select count(*) as contradictory_profile_count
from artist_profiles
where superseded_by is not null
  and set_primary_profile_at is not null;
```

### B) Detect duplicates in simple payments output
```sql
with s as (
  select artist_id
  from get_simple_admin_payments_data(365)
)
select count(*)
from (
  select artist_id
  from s
  group by artist_id
  having count(*) > 1
) d;
```

### C) Detect false owed due to verified-status mismatch
```sql
with simple as (
  select artist_id, estimated_balance
  from get_simple_admin_payments_data(365)
),
enhanced as (
  select artist_id, estimated_balance
  from get_enhanced_admin_artists_owed()
),
latest as (
  select distinct on (artist_profile_id)
    artist_profile_id,
    status
  from artist_payments
  order by artist_profile_id, created_at desc
)
select count(distinct s.artist_id) as false_owed_artists
from simple s
join latest l on l.artist_profile_id = s.artist_id
left join enhanced e on e.artist_id = s.artist_id
where l.status = 'verified'
  and s.estimated_balance > 0
  and coalesce(e.estimated_balance, 0) = 0;
```

### D) Compare target artist with controls
```sql
with target as (
  select * from (values
    ('TARGET_ARTIST_PROFILE_UUID'::uuid),
    ('CONTROL_PAID_PROFILE_UUID'::uuid),
    ('CONTROL_VERIFIED_PROFILE_UUID'::uuid)
  ) v(id)
),
sales as (
  select a.artist_id,
         sum(coalesce(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total
  from art a
  join events e on e.id = a.event_id
  where a.status = 'paid'
    and a.artist_id in (select id from target)
  group by a.artist_id
),
settled as (
  select artist_profile_id as artist_id,
         sum(gross_amount) as settled_total
  from artist_payments
  where status in ('completed', 'paid', 'verified')
    and artist_profile_id in (select id from target)
  group by artist_profile_id
)
select ap.id,
       ap.name,
       coalesce(sales.sales_total, 0) as sales_total,
       coalesce(settled.settled_total, 0) as settled_total,
       greatest(0, coalesce(sales.sales_total, 0) - coalesce(settled.settled_total, 0)) as owed
from target t
join artist_profiles ap on ap.id = t.id
left join sales on sales.artist_id = ap.id
left join settled on settled.artist_id = ap.id;
```

### E) Reconcile claimed sale amount to checkout truth and artist share
```sql
select
  a.id as art_id,
  a.art_code,
  a.artist_id,
  coalesce(a.final_price, a.current_bid, 0) as art_sale_amount,
  pp.amount as checkout_amount,
  pp.status as checkout_status,
  pp.completed_at as checkout_completed_at,
  e.artist_auction_portion,
  coalesce(pp.amount, coalesce(a.final_price, a.current_bid, 0)) * e.artist_auction_portion as expected_artist_share
from art a
join events e on e.id = a.event_id
left join lateral (
  select amount, status, completed_at
  from payment_processing p
  where p.art_id = a.id
  order by p.completed_at desc nulls last, p.created_at desc
  limit 1
) pp on true
where a.id = 'TARGET_ART_UUID'::uuid;
```

### F) Separate onboarding block from payout failure for a target artist
```sql
with target as (
  select 'TARGET_ARTIST_PROFILE_UUID'::uuid as artist_profile_id
),
owed as (
  select artist_id, estimated_balance, payment_account_status, stripe_recipient_id
  from get_enhanced_admin_artists_owed()
  where artist_id in (select artist_profile_id from target)
),
agp as (
  select artist_profile_id, status as account_status, stripe_recipient_id, updated_at
  from artist_global_payments
  where artist_profile_id in (select artist_profile_id from target)
),
invites as (
  select
    artist_profile_id,
    count(*) as invite_count,
    max(sent_at) as latest_sent_at,
    max(completed_at) as latest_completed_at
  from payment_invitations
  where artist_profile_id in (select artist_profile_id from target)
  group by artist_profile_id
)
select
  t.artist_profile_id,
  coalesce(o.estimated_balance, 0) as estimated_balance,
  coalesce(o.payment_account_status, 'no_account') as rpc_payment_account_status,
  coalesce(agp.account_status, 'no_record') as agp_status,
  coalesce(o.stripe_recipient_id, agp.stripe_recipient_id) as stripe_recipient_id,
  coalesce(i.invite_count, 0) as invite_count,
  i.latest_sent_at,
  i.latest_completed_at,
  case
    when coalesce(o.estimated_balance, 0) <= 0 then 'not_owed'
    when coalesce(agp.account_status, '') in ('ready', 'processing', 'completed') then 'ready_or_paid_path'
    when coalesce(i.invite_count, 0) > 0 and i.latest_completed_at is null then 'onboarding_blocked'
    else 'needs_manual_review'
  end as payout_path_class
from target t
left join owed o on o.artist_id = t.artist_profile_id
left join agp on agp.artist_profile_id = t.artist_profile_id
left join invites i on i.artist_profile_id = t.artist_profile_id;
```

## Resolution classes (report one per case)
- `logic mismatch`
- `linkage issue`
- `deployment/config`
- `onboarding block`
- `expectation mismatch`

## Repair patterns
- Function parity fix:
  - include `verified` in debit and completed counts
  - dedupe recent city with `row_number()` and keep `rn = 1`
- Primary profile fix:
  - in `set_profile_as_primary`, set `superseded_by = null` for selected profile
- Data reconciliation fix:
  - move linked records to canonical profile in controlled table-by-table updates
  - clear primary flag from source profiles
  - set canonical profile as primary and unsuperseded

## Post-fix acceptance criteria
- Target artist no longer appears as false owed in simple output.
- Duplicate rows in simple output collapse to one per artist.
- Enhanced and simple owed logic align for verified-only cases.
- Target profile is primary and unsuperseded.
- Endpoint payload matches SQL expectations.
