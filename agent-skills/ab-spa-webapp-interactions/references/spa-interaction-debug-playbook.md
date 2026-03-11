# SPA Interaction Debug Playbook (AB)

## Goal
Resolve user-facing SPA interaction failures with evidence-based tracing.

## Route-to-Fix Flow
1. Pinpoint the route and exact interaction point.
2. Locate component and modal code.
3. Trace data source query and filters.
4. Check matching backend function/RPC only after proving frontend path.
5. Patch the smallest change that fixes visibility/behavior.

## Known Failure Pattern: Missing Event In Invite Dropdown
Observed pattern:
- Invite modals queried `events` with `order(desc)` and `limit(50)`.
- Valid near-term events were excluded by global truncation.

Reliable fix pattern:
- Use bounded time window (`event_start_datetime >= now - 120 days`).
- Sort ascending for selection UX.
- Use larger bounded limit (for example `400`).
- Apply fix to every equivalent invite modal component.

## Example Query Shape
```js
const inviteWindowStart = new Date();
inviteWindowStart.setDate(inviteWindowStart.getDate() - 120);

const { data, error } = await supabase
  .from('events')
  .select('id, name, eid, event_start_datetime, cities(name, countries(name))')
  .gte('event_start_datetime', inviteWindowStart.toISOString())
  .order('event_start_datetime', { ascending: true })
  .limit(400);
```

## AB-Specific Notes
- Duplicate UI surfaces are common (`ArtistsManagement` and `ArtistDetailModal` had parallel invite dropdown logic).
- Verify route-specific components under `art-battle-admin/src/components`.
- Do not assume backend is at fault when dropdown omissions match frontend truncation logic.

## Known Failure Pattern: Event Payment Pay Now / Event Currency
Observed pattern:
- The SPA displayed location-derived or prize-related currency controls that looked like event currency.
- The actual submit payload omitted canonical fields needed by the backend (`event_id`, correct `artist_profile_id`, event currency).
- The backend then either defaulted incorrectly or could not associate the write with the event read model.

Reliable fix pattern:
- Inspect the exact `supabase.functions.invoke(...)` payload.
- Verify IDs come from the actual nested object shape used by the response (`artist_profiles.id` vs `artist_id`, etc.).
- Pass `event_id` for event-scoped payment actions.
- Show backend `event.currency` directly in event detail/admin surfaces instead of inferring event-level amounts from location joins.
