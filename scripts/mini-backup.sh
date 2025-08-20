#!/bin/bash

# ============================================================================
# Mini Supabase Backup Script - Quick Edge Functions & DB Objects Backup
# ============================================================================
# Lightweight backup script that captures essential Supabase components:
# - All edge functions (deployed and local)
# - Database functions and triggers
# - No data export (for speed)
#
# Usage: ./mini-backup.sh
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BASE_DIR="$PROJECT_DIR/mini-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/mini_$TIMESTAMP"

# Database connection
DB_HOST="${SUPABASE_DB_HOST:-db.xsqdkubgyqwpyvfltnrf.supabase.co}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_PASSWORD="${PGPASSWORD:-6kEtvU9n0KhTVr5}"

# Simple logging
log() { echo "$(date '+%H:%M:%S') $*"; }

echo "🚀 Mini Backup Started - $TIMESTAMP"

# Create directories
mkdir -p "$BACKUP_DIR"/{functions-deployed,functions-local,db-functions,db-triggers}

# 1. Download deployed functions
log "📥 Downloading deployed functions..."
if command -v supabase &> /dev/null; then
    if supabase functions list --output json > "$BACKUP_DIR/deployed-list.json" 2>/dev/null; then
        while IFS= read -r func_name; do
            if [ -n "$func_name" ] && [ "$func_name" != "null" ]; then
                echo "  → $func_name"
                supabase functions download "$func_name" --output "$BACKUP_DIR/functions-deployed/$func_name" &>/dev/null || echo "    ✗ Failed"
            fi
        done < <(jq -r '.[].name // empty' "$BACKUP_DIR/deployed-list.json" 2>/dev/null || echo "")
    fi
else
    echo "  ⚠️  Supabase CLI not available"
fi

# 2. Copy local functions
log "📁 Copying local functions..."
find "$PROJECT_DIR" -path "*/supabase/functions/*" -name "index.ts" | while read -r index_file; do
    func_dir=$(dirname "$index_file")
    func_name=$(basename "$func_dir")
    source_project=$(echo "$func_dir" | sed "s|$PROJECT_DIR/||" | cut -d'/' -f1)
    
    backup_func_dir="$BACKUP_DIR/functions-local/${source_project}_${func_name}"
    if [ ! -d "$backup_func_dir" ]; then
        echo "  → $source_project/$func_name"
        mkdir -p "$backup_func_dir"
        cp -r "$func_dir"/* "$backup_func_dir/" 2>/dev/null || true
    fi
done

# 3. Export database functions
log "🗄️  Exporting database functions..."
export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
ORDER BY routine_name;
" | while read -r func_name; do
    func_name=$(echo "$func_name" | xargs)
    if [ -n "$func_name" ]; then
        echo "  → $func_name"
        psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
        SELECT pg_get_functiondef(f.oid) 
        FROM pg_proc f INNER JOIN pg_namespace n ON (f.pronamespace = n.oid) 
        WHERE n.nspname = 'public' AND f.proname = '$func_name';
        " > "$BACKUP_DIR/db-functions/${func_name}.sql" 2>/dev/null || true
    fi
done

# 4. Export database triggers
log "⚡ Exporting database triggers..."
psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
SELECT trigger_name, event_object_table, action_timing, event_manipulation, action_statement
FROM information_schema.triggers WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
" > "$BACKUP_DIR/db-triggers/all_triggers.sql" 2>/dev/null || true

# 5. Create summary
deployed_count=$(find "$BACKUP_DIR/functions-deployed" -maxdepth 1 -type d | wc -l)
local_count=$(find "$BACKUP_DIR/functions-local" -maxdepth 1 -type d | wc -l)
db_func_count=$(find "$BACKUP_DIR/db-functions" -name "*.sql" | wc -l)

cat > "$BACKUP_DIR/SUMMARY.txt" << EOF
Mini Backup Summary
===================
Created: $(date)
Backup ID: $TIMESTAMP

Components:
- Deployed functions: $deployed_count
- Local functions: $local_count  
- Database functions: $db_func_count
- Database triggers: 1 file (all_triggers.sql)

Recovery:
- Deploy functions: supabase functions deploy [function-name]
- Restore DB functions: psql -f db-functions/[function].sql
- Review triggers: cat db-triggers/all_triggers.sql

Backup location: $BACKUP_DIR
EOF

# 6. Compress
cd "$BACKUP_BASE_DIR"
tar -czf "mini_$TIMESTAMP.tar.gz" "mini_$TIMESTAMP"
rm -rf "mini_$TIMESTAMP"

# Summary
echo ""
echo "✅ Mini backup completed!"
echo "📦 File: $BACKUP_BASE_DIR/mini_$TIMESTAMP.tar.gz"
echo "📊 $deployed_count deployed + $local_count local functions + $db_func_count DB functions"
echo ""
echo "To restore: tar -xzf mini_$TIMESTAMP.tar.gz"