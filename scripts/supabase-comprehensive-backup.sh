#!/bin/bash

# ============================================================================
# Comprehensive Supabase Backup Script for Edge Functions and DB Objects
# ============================================================================
# This script creates a complete backup of all Supabase components:
# - All deployed edge functions (with full source code)
# - All database functions and stored procedures 
# - All database triggers
# - Database schema and policies
# - All content organized in dated directories
#
# Usage: ./supabase-comprehensive-backup.sh
# Optional: ./supabase-comprehensive-backup.sh --mini (creates mini backup without data)
#
# IMPORTANT: This solves version control issues by capturing deployed state
# ============================================================================

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BASE_DIR="$PROJECT_DIR/supabase-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/backup_$TIMESTAMP"

# Database connection
DB_HOST="${SUPABASE_DB_HOST:-db.xsqdkubgyqwpyvfltnrf.supabase.co}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_PASSWORD="${PGPASSWORD:-6kEtvU9n0KhTVr5}"

# Check if mini mode
MINI_MODE=false
if [[ "$1" == "--mini" ]]; then
    MINI_MODE=true
    echo "🚀 Running in MINI mode (no data export)"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}"; }
log_header() { echo -e "${CYAN}🔥 $*${NC}"; }

# Error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    log_error "Script failed at line $line_number with exit code $exit_code"
    
    # Cleanup failed backup if it exists
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
        log_info "Cleaning up failed backup directory: $BACKUP_DIR"
        rm -rf "$BACKUP_DIR"
    fi
    
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Check if Supabase CLI is available
check_supabase_cli() {
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI not found. Please install it first:"
        log_info "npm install -g supabase"
        exit 1
    fi
    
    # Try to get functions list to test CLI works
    log_info "Testing Supabase CLI connection..."
    if supabase functions list &>/dev/null; then
        log_success "Supabase CLI is working"
    else
        log_warn "Supabase CLI may not be authenticated or configured"
        log_info "Make sure you have run: supabase login"
    fi
}

# Check database connection
check_db_connection() {
    log_info "Testing database connection..."
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT 1;" &>/dev/null; then
        log_error "Cannot connect to database at $DB_HOST:$DB_PORT"
        exit 1
    fi
    log_success "Database connection verified"
}

# Create backup directory structure
create_backup_structure() {
    log_info "Creating backup directory structure..."
    
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/edge-functions-deployed"
    mkdir -p "$BACKUP_DIR/edge-functions-local"
    mkdir -p "$BACKUP_DIR/database-functions"
    mkdir -p "$BACKUP_DIR/database-triggers"
    mkdir -p "$BACKUP_DIR/database-schema"
    mkdir -p "$BACKUP_DIR/database-policies"
    if [[ "$MINI_MODE" == false ]]; then
        mkdir -p "$BACKUP_DIR/database-data"
    fi
    mkdir -p "$BACKUP_DIR/metadata"
    
    # Create backup metadata
    cat > "$BACKUP_DIR/metadata/backup-info.json" << EOF
{
    "backup_type": "comprehensive-supabase-backup",
    "mini_mode": $MINI_MODE,
    "timestamp": "$TIMESTAMP",
    "created_at": "$(date -Iseconds)",
    "script_version": "1.0",
    "database": {
        "host": "$DB_HOST",
        "port": $DB_PORT,
        "database": "$DB_NAME",
        "user": "$DB_USER"
    },
    "project_dir": "$PROJECT_DIR",
    "backup_dir": "$BACKUP_DIR"
}
EOF
    
    log_success "Backup structure created: $BACKUP_DIR"
}

# Download all deployed edge functions
backup_deployed_functions() {
    log_header "Backing up deployed edge functions..."
    
    # Get list of deployed functions
    local functions_json="$BACKUP_DIR/metadata/deployed-functions-list.json"
    if supabase functions list --output json > "$functions_json" 2>/dev/null; then
        log_success "Retrieved deployed functions list"
    else
        log_warn "Could not retrieve deployed functions list - continuing with local functions only"
        return 0
    fi
    
    # Parse function names and download each one
    local function_count=0
    while IFS= read -r func_name; do
        if [ -n "$func_name" ] && [ "$func_name" != "null" ]; then
            log_info "Downloading function: $func_name"
            local func_dir="$BACKUP_DIR/edge-functions-deployed/$func_name"
            mkdir -p "$func_dir"
            
            # Download function source
            if supabase functions download "$func_name" --output "$func_dir" &>/dev/null; then
                log_success "  ✓ Downloaded: $func_name"
                ((function_count++))
                
                # Save metadata about this function
                cat > "$func_dir/deployment-info.json" << EOF
{
    "function_name": "$func_name",
    "downloaded_at": "$(date -Iseconds)",
    "backup_timestamp": "$TIMESTAMP",
    "source": "deployed"
}
EOF
            else
                log_warn "  ✗ Failed to download: $func_name"
            fi
        fi
    done < <(jq -r '.[].name // empty' "$functions_json" 2>/dev/null || echo "")
    
    log_success "Downloaded $function_count deployed functions"
    
    # Update metadata
    echo "\"deployed_functions_count\": $function_count," >> "$BACKUP_DIR/metadata/backup-info.json.tmp"
}

# Backup local edge functions (from filesystem)
backup_local_functions() {
    log_header "Backing up local edge functions..."
    
    local local_count=0
    
    # Find all unique function directories
    find "$PROJECT_DIR" -path "*/supabase/functions/*" -name "index.ts" | while read -r index_file; do
        local func_dir=$(dirname "$index_file")
        local func_name=$(basename "$func_dir")
        local source_project=$(echo "$func_dir" | sed "s|$PROJECT_DIR/||" | cut -d'/' -f1)
        
        # Skip if we already processed this function name from this project
        local backup_func_dir="$BACKUP_DIR/edge-functions-local/${source_project}_${func_name}"
        
        if [ ! -d "$backup_func_dir" ]; then
            log_info "Backing up local function: $source_project/$func_name"
            mkdir -p "$backup_func_dir"
            
            # Copy entire function directory
            cp -r "$func_dir"/* "$backup_func_dir/" 2>/dev/null || true
            
            # Create metadata
            cat > "$backup_func_dir/source-info.json" << EOF
{
    "function_name": "$func_name",
    "source_project": "$source_project",
    "original_path": "$func_dir",
    "backed_up_at": "$(date -Iseconds)",
    "backup_timestamp": "$TIMESTAMP",
    "source": "local"
}
EOF
            ((local_count++))
            log_success "  ✓ Backed up: $source_project/$func_name"
        fi
    done
    
    log_success "Backed up local functions from filesystem"
}

# Export all database functions and stored procedures
backup_database_functions() {
    log_header "Backing up database functions and stored procedures..."
    
    # Get list of all functions
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
    SELECT 
        routine_name
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
    ORDER BY routine_name;
    " | while read -r func_name; do
        func_name=$(echo "$func_name" | xargs)  # Trim whitespace
        if [ -n "$func_name" ]; then
            log_info "Exporting database function: $func_name"
            
            # Export function definition
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
            SELECT 
                routine_name,
                routine_type,
                data_type,
                routine_definition
            FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name = '$func_name';
            " > "$BACKUP_DIR/database-functions/${func_name}.sql"
            
            # Also get the CREATE FUNCTION statement
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
            SELECT pg_get_functiondef(f.oid) 
            FROM pg_proc f 
            INNER JOIN pg_namespace n ON (f.pronamespace = n.oid) 
            WHERE n.nspname = 'public' 
            AND f.proname = '$func_name';
            " > "$BACKUP_DIR/database-functions/${func_name}_create.sql"
            
            log_success "  ✓ Exported: $func_name"
        fi
    done
    
    # Create summary
    local func_count=$(find "$BACKUP_DIR/database-functions" -name "*.sql" | wc -l)
    log_success "Exported $func_count database function files"
}

# Export all database triggers
backup_database_triggers() {
    log_header "Backing up database triggers..."
    
    # Export triggers with their definitions
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
        trigger_name,
        event_object_table,
        action_timing,
        event_manipulation,
        action_statement,
        action_condition,
        action_orientation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
    " > "$BACKUP_DIR/database-triggers/all_triggers_info.sql"
    
    # Export trigger definitions individually
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
    SELECT DISTINCT trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY trigger_name;
    " | while read -r trigger_name; do
        trigger_name=$(echo "$trigger_name" | xargs)  # Trim whitespace
        if [ -n "$trigger_name" ]; then
            log_info "Exporting trigger: $trigger_name"
            
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
            SELECT 
                'Trigger: ' || trigger_name,
                'Table: ' || event_object_table,
                'Timing: ' || action_timing,
                'Event: ' || event_manipulation,
                'Action: ' || action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = 'public' 
            AND trigger_name = '$trigger_name';
            " > "$BACKUP_DIR/database-triggers/${trigger_name}.sql"
            
            log_success "  ✓ Exported: $trigger_name"
        fi
    done
    
    local trigger_count=$(find "$BACKUP_DIR/database-triggers" -name "*.sql" | wc -l)
    log_success "Exported $trigger_count database trigger files"
}

# Export database schema and policies
backup_database_schema() {
    log_header "Backing up database schema and policies..."
    
    # Export table schemas
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
      table_name,
      string_agg(
        column_name || ' ' || data_type || 
        CASE 
          WHEN character_maximum_length IS NOT NULL 
          THEN '(' || character_maximum_length || ')' 
          ELSE '' 
        END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END, 
        ', '
      ) as columns
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    GROUP BY table_name 
    ORDER BY table_name;
    " > "$BACKUP_DIR/database-schema/table_definitions.sql"
    
    # Export RLS policies
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
    " > "$BACKUP_DIR/database-policies/rls_policies.sql"
    
    # Export indexes
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
    " > "$BACKUP_DIR/database-schema/indexes.sql"
    
    # Export constraints
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
        table_name,
        constraint_name,
        constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
    ORDER BY table_name, constraint_name;
    " > "$BACKUP_DIR/database-schema/constraints.sql"
    
    log_success "Database schema and policies exported"
}

# Backup critical database data (only if not in mini mode)
backup_database_data() {
    if [[ "$MINI_MODE" == true ]]; then
        log_info "Skipping data backup (mini mode)"
        return 0
    fi
    
    log_header "Backing up critical database data..."
    
    # Critical tables to backup
    local tables=(
        "events"
        "art" 
        "people"
        "artist_profiles"
        "bids"
        "votes"
        "payment_processing"
        "media_files"
        "art_media"
        "event_admins"
        "event_artists"
        "round_contestants"
        "message_queue"
        "qr_secrets"
        "qr_scans"
        "vote_weights"
        "countries"
        "cities"
        "sms_config"
        "abhq_admin_users"
        "admin_users"
        "artist_applications"
        "artist_invites"
        "artist_sample_works"
    )
    
    local total_rows=0
    
    for table in "${tables[@]}"; do
        # Check if table exists
        local table_exists=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '$table';
        " | tr -d ' ')
        
        if [ "$table_exists" = "1" ]; then
            log_info "Exporting data from table: $table"
            
            # Export table data
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
            COPY (SELECT * FROM $table) TO STDOUT WITH CSV HEADER;
            " > "$BACKUP_DIR/database-data/$table.csv"
            
            # Count rows
            local row_count=$(wc -l < "$BACKUP_DIR/database-data/$table.csv")
            row_count=$((row_count - 1))  # Subtract header row
            total_rows=$((total_rows + row_count))
            
            log_success "  ✓ $table: $row_count rows"
        else
            log_warn "  ✗ $table: table not found, skipping"
        fi
    done
    
    log_success "Data backup completed: $total_rows total rows exported"
}

# Create comprehensive report
create_backup_report() {
    log_header "Creating backup report..."
    
    local report_file="$BACKUP_DIR/BACKUP_REPORT.md"
    
    cat > "$report_file" << EOF
# Comprehensive Supabase Backup Report

**Generated:** $(date)  
**Backup ID:** $TIMESTAMP  
**Mode:** $([ "$MINI_MODE" == "true" ] && echo "Mini (no data)" || echo "Full")

## Summary

This backup contains a complete snapshot of all Supabase components to solve version control issues.

### What's Included

#### 📁 Edge Functions (Deployed)
- **Location:** \`edge-functions-deployed/\`
- **Description:** All functions currently deployed to Supabase
- **Count:** $(find "$BACKUP_DIR/edge-functions-deployed" -maxdepth 1 -type d | wc -l) functions
- **Source:** Downloaded via Supabase CLI

#### 📁 Edge Functions (Local)
- **Location:** \`edge-functions-local/\`
- **Description:** All functions found in local filesystem
- **Count:** $(find "$BACKUP_DIR/edge-functions-local" -maxdepth 1 -type d | wc -l) functions
- **Source:** Local filesystem copy

#### 📁 Database Functions
- **Location:** \`database-functions/\`
- **Description:** All PostgreSQL functions and stored procedures
- **Count:** $(find "$BACKUP_DIR/database-functions" -name "*.sql" | wc -l) functions
- **Source:** Database export

#### 📁 Database Triggers  
- **Location:** \`database-triggers/\`
- **Description:** All database triggers
- **Count:** $(find "$BACKUP_DIR/database-triggers" -name "*.sql" | wc -l) triggers
- **Source:** Database export

#### 📁 Database Schema
- **Location:** \`database-schema/\`
- **Description:** Table definitions, indexes, constraints
- **Files:** $(find "$BACKUP_DIR/database-schema" -name "*.sql" | wc -l) schema files
- **Source:** Database export

#### 📁 Database Policies
- **Location:** \`database-policies/\`
- **Description:** Row Level Security policies
- **Files:** $(find "$BACKUP_DIR/database-policies" -name "*.sql" | wc -l) policy files
- **Source:** Database export

EOF

    if [[ "$MINI_MODE" == false ]]; then
        cat >> "$report_file" << EOF
#### 📁 Database Data
- **Location:** \`database-data/\`
- **Description:** Critical table data exports
- **Files:** $(find "$BACKUP_DIR/database-data" -name "*.csv" | wc -l) data files
- **Source:** Database export

EOF
    fi

    cat >> "$report_file" << EOF
## Recovery Instructions

### 1. Edge Functions Recovery
\`\`\`bash
# Deploy functions from backup
cd edge-functions-deployed/[function-name]
supabase functions deploy [function-name]
\`\`\`

### 2. Database Functions Recovery
\`\`\`bash
# Restore database functions
cd database-functions/
for file in *.sql; do
    psql -h [host] -d [db] -U [user] -f "\$file"
done
\`\`\`

### 3. Database Schema Recovery
\`\`\`bash
# Restore database schema
cd database-schema/
psql -h [host] -d [db] -U [user] -f table_definitions.sql
psql -h [host] -d [db] -U [user] -f indexes.sql
psql -h [host] -d [db] -U [user] -f constraints.sql
\`\`\`

### 4. Database Policies Recovery
\`\`\`bash
# Restore RLS policies
cd database-policies/
psql -h [host] -d [db] -U [user] -f rls_policies.sql
\`\`\`

EOF

    if [[ "$MINI_MODE" == false ]]; then
        cat >> "$report_file" << EOF
### 5. Data Recovery
\`\`\`bash
# Restore critical data
cd database-data/
for file in *.csv; do
    table_name=\$(basename "\$file" .csv)
    psql -h [host] -d [db] -U [user] -c "\\COPY \$table_name FROM '\$file' WITH CSV HEADER;"
done
\`\`\`

EOF
    fi

    cat >> "$report_file" << EOF
## File Structure
\`\`\`
$(find "$BACKUP_DIR" -type f | head -20 | sed "s|$BACKUP_DIR/||" | sed 's/^/├── /')
$([ $(find "$BACKUP_DIR" -type f | wc -l) -gt 20 ] && echo "└── ... ($(find "$BACKUP_DIR" -type f | wc -l) total files)")
\`\`\`

## Next Steps

1. **Store this backup safely** - This contains all your Supabase configuration
2. **Test recovery process** - Use a test environment to verify recovery works
3. **Schedule regular backups** - Run this script daily/weekly to avoid data loss
4. **Version control** - Consider adding these backups to your version control

---
*Generated by supabase-comprehensive-backup.sh v1.0*
EOF

    log_success "Backup report created: $report_file"
}

# Compress the backup
compress_backup() {
    log_header "Compressing backup..."
    
    cd "$BACKUP_BASE_DIR"
    local backup_name=$(basename "$BACKUP_DIR")
    
    tar -czf "${backup_name}.tar.gz" "$backup_name"
    
    if [ -f "${backup_name}.tar.gz" ]; then
        local original_size=$(du -sh "$backup_name" | cut -f1)
        local compressed_size=$(du -sh "${backup_name}.tar.gz" | cut -f1)
        
        log_success "Backup compressed: $original_size → $compressed_size"
        log_info "Compressed backup: $BACKUP_BASE_DIR/${backup_name}.tar.gz"
        
        # Remove original directory
        rm -rf "$backup_name"
        
        echo "$BACKUP_BASE_DIR/${backup_name}.tar.gz"
    else
        log_error "Compression failed"
        exit 1
    fi
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    echo ""
    log_header "🚀 Starting Comprehensive Supabase Backup"
    echo ""
    log_info "Timestamp: $TIMESTAMP"
    log_info "Mode: $([ "$MINI_MODE" == "true" ] && echo "Mini (no data)" || echo "Full")"
    log_info "Backup directory: $BACKUP_DIR"
    echo ""
    
    # Checks
    check_supabase_cli
    check_db_connection
    
    # Create structure
    create_backup_structure
    
    # Backup all components
    backup_deployed_functions
    backup_local_functions
    backup_database_functions
    backup_database_triggers
    backup_database_schema
    backup_database_data
    
    # Create report
    create_backup_report
    
    # Compress
    local compressed_file=$(compress_backup)
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local duration_formatted=$(printf '%02d:%02d:%02d' $((duration/3600)) $((duration%3600/60)) $((duration%60)))
    
    echo ""
    log_header "🎉 Backup Completed Successfully!"
    echo ""
    log_success "Duration: $duration_formatted"
    log_success "Backup file: $compressed_file"
    log_success "Review the BACKUP_REPORT.md for details and recovery instructions"
    echo ""
    log_info "Next steps:"
    log_info "1. Store this backup in a safe location"
    log_info "2. Test recovery process in a development environment"
    log_info "3. Schedule this script to run regularly"
    echo ""
}

# Run main function
main "$@"