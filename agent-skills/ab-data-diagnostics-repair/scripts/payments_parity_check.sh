#!/usr/bin/env bash
set -euo pipefail

# Quick drift check between simple and enhanced payment logic.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL_WRAPPER="$SCRIPT_DIR/vote26_psql.sh"

read -r -d '' SQL <<'SQL_EOF' || true
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
select
  (select count(*) from (select artist_id from simple group by artist_id having count(*) > 1) d) as duplicated_artists_in_simple,
  (select count(*) from simple s
     join latest l on l.artist_profile_id = s.artist_id
     left join enhanced e on e.artist_id = s.artist_id
    where l.status = 'verified'
      and s.estimated_balance > 0
      and coalesce(e.estimated_balance, 0) = 0) as false_owed_rows_verified,
  (select count(distinct s.artist_id) from simple s
     join latest l on l.artist_profile_id = s.artist_id
     left join enhanced e on e.artist_id = s.artist_id
    where l.status = 'verified'
      and s.estimated_balance > 0
      and coalesce(e.estimated_balance, 0) = 0) as false_owed_artists_verified,
  (select count(*) from artist_profiles
    where superseded_by is not null and set_primary_profile_at is not null) as contradictory_profiles;
SQL_EOF

"$PSQL_WRAPPER" --sql "$SQL"
