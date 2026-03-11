# Vote26 Connectivity and Credentials

## Credential policy
- Store DB password in `~/creds/vote26_pgpassword`.
- Keep file permissions strict:
  - directory: `700`
  - file: `600`
- Read password at runtime only:
```bash
PGPASSWORD="$(< ~/creds/vote26_pgpassword)"
```

## Connection defaults (validated)
- Preferred pooled host:
  - `aws-0-ca-central-1.pooler.supabase.com`
  - port `6543`
  - user `postgres.xsqdkubgyqwpyvfltnrf`
- Direct host may be unavailable from some environments:
  - `db.xsqdkubgyqwpyvfltnrf.supabase.co:5432`

## Safe migration command
```bash
PGPASSWORD="$(< ~/creds/vote26_pgpassword)" \
psql "host=aws-0-ca-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.xsqdkubgyqwpyvfltnrf sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f /absolute/path/to/migration.sql
```

## Safe test command
```bash
PGPASSWORD="$(< ~/creds/vote26_pgpassword)" \
psql "host=aws-0-ca-central-1.pooler.supabase.com port=6543 dbname=postgres user=postgres.xsqdkubgyqwpyvfltnrf sslmode=require connect_timeout=8" \
  -v ON_ERROR_STOP=1 \
  -c "select now() at time zone 'utc', current_user;"
```

## Notes
- Avoid echoing password values in logs.
- Prefer SQL verification plus endpoint verification after every migration.
