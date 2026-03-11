#!/usr/bin/env bash
set -euo pipefail

# Execute SQL against Vote26 Postgres via pooler using a local credentials file.

CREDS_FILE="${VOTE26_PG_PASSWORD_FILE:-$HOME/creds/vote26_pgpassword}"
DB_HOST="${VOTE26_DB_HOST:-aws-0-ca-central-1.pooler.supabase.com}"
DB_PORT="${VOTE26_DB_PORT:-6543}"
DB_NAME="${VOTE26_DB_NAME:-postgres}"
DB_USER="${VOTE26_DB_USER:-postgres.xsqdkubgyqwpyvfltnrf}"
DB_SSLMODE="${VOTE26_DB_SSLMODE:-require}"

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") --sql "select 1;"
  $(basename "$0") --file /absolute/path/query.sql

Environment overrides:
  VOTE26_PG_PASSWORD_FILE, VOTE26_DB_HOST, VOTE26_DB_PORT,
  VOTE26_DB_NAME, VOTE26_DB_USER, VOTE26_DB_SSLMODE
USAGE
}

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "Credentials file not found: $CREDS_FILE" >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

mode="$1"
shift

PGPASSWORD="$(< "$CREDS_FILE")"
export PGPASSWORD

conn="host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=$DB_SSLMODE"

case "$mode" in
  --sql)
    sql="$1"
    psql "$conn" -v ON_ERROR_STOP=1 -c "$sql"
    ;;
  --file)
    file="$1"
    if [[ ! -f "$file" ]]; then
      echo "SQL file not found: $file" >&2
      exit 1
    fi
    psql "$conn" -v ON_ERROR_STOP=1 -f "$file"
    ;;
  *)
    usage
    exit 1
    ;;
esac
