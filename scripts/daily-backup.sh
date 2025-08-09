#!/bin/bash

# ============================================================================
# Daily Supabase Database Backup Script
# ============================================================================
# Comprehensive backup script for Art Battle Vote database
# Creates full backup and compresses it for efficient storage
#
# Usage: ./daily-backup.sh
# Cron: 0 2 * * * /root/vote_app/vote26/scripts/daily-backup.sh >> /var/log/artbattle-backup.log 2>&1
#
# Features:
# - Full database export (schema + data)
# - Configuration backup
# - Compression with verification
# - Cleanup on success
# - Detailed logging
# - Error handling with notifications
# ============================================================================

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BASE_DIR="$PROJECT_DIR/backups"
LOG_FILE="/var/log/artbattle-backup.log"
RETENTION_DAYS=30  # Keep backups for 30 days

# Database connection
DB_HOST="${SUPABASE_DB_HOST:-db.xsqdkubgyqwpyvfltnrf.supabase.co}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_PASSWORD="${PGPASSWORD:-6kEtvU9n0KhTVr5}"

# Colors for output (if terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

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
    
    # Optional: Send notification (uncomment if you have notification system)
    # send_notification "BACKUP FAILED" "Daily backup failed at line $line_number"
    
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Send notification function (customize as needed)
send_notification() {
    local subject="$1"
    local message="$2"
    
    # Example: Send to Slack (customize webhook URL)
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"$subject: $message\"}" \
    #   "$SLACK_WEBHOOK_URL" 2>/dev/null || true
    
    log_info "Notification: $subject - $message"
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql is not installed or not in PATH"
        exit 1
    fi
    
    # Check if tar is available
    if ! command -v tar &> /dev/null; then
        log_error "tar is not installed or not in PATH"
        exit 1
    fi
    
    # Check if gzip is available
    if ! command -v gzip &> /dev/null; then
        log_error "gzip is not installed or not in PATH"
        exit 1
    fi
    
    # Test database connection
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT 1;" &>/dev/null; then
        log_error "Cannot connect to database at $DB_HOST:$DB_PORT"
        exit 1
    fi
    
    log_success "All dependencies verified"
}

# Create backup directory
create_backup_dir() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="$BACKUP_BASE_DIR/daily_$timestamp"
    
    log_info "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/data"
    mkdir -p "$BACKUP_DIR/config"
    
    # Create backup metadata
    cat > "$BACKUP_DIR/backup_info.txt" << EOF
DAILY SUPABASE DATABASE BACKUP
==============================
Created: $(date)
Script: $0
Backup Directory: $BACKUP_DIR
Database: $DB_HOST:$DB_PORT/$DB_NAME
Backup Type: Daily automated backup
Status: IN PROGRESS

Command used: $0
Environment:
- BACKUP_BASE_DIR: $BACKUP_BASE_DIR
- RETENTION_DAYS: $RETENTION_DAYS
- LOG_FILE: $LOG_FILE

COMPONENTS TO BACKUP:
- Database tables and data
- Edge functions (Supabase functions)  
- Database migrations
- Application configurations
- Backup and cleanup scripts
EOF
}

# Export database schema
export_schema() {
    log_info "Exporting database schema..."
    
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
    " > "$BACKUP_DIR/schema_info.txt"
    
    # Export functions
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
      routine_name,
      routine_type,
      data_type
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
    ORDER BY routine_name;
    " > "$BACKUP_DIR/functions.txt"
    
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
    " > "$BACKUP_DIR/indexes.txt"
    
    log_success "Schema export completed"
}

# Export table data
export_data() {
    log_info "Exporting table data..."
    
    # Define critical tables to backup
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
    )
    
    local total_rows=0
    
    for table in "${tables[@]}"; do
        log_info "Exporting table: $table"
        
        # Check if table exists
        local table_exists=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '$table';
        " | tr -d ' ')
        
        if [ "$table_exists" = "1" ]; then
            # Export table data
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
            COPY (SELECT * FROM $table) TO STDOUT WITH CSV HEADER;
            " > "$BACKUP_DIR/data/$table.csv"
            
            # Count rows
            local row_count=$(wc -l < "$BACKUP_DIR/data/$table.csv")
            row_count=$((row_count - 1))  # Subtract header row
            total_rows=$((total_rows + row_count))
            
            log_info "  └── $table: $row_count rows"
        else
            log_warn "  └── $table: table not found, skipping"
        fi
    done
    
    log_success "Data export completed: $total_rows total rows"
    
    # Update backup info with row count
    echo "Total rows exported: $total_rows" >> "$BACKUP_DIR/backup_info.txt"
}

# Backup configuration and edge functions
backup_config() {
    log_info "Backing up configuration files..."
    
    # Backup Supabase configuration and edge functions
    if [ -d "$PROJECT_DIR/supabase" ]; then
        cp -r "$PROJECT_DIR/supabase" "$BACKUP_DIR/config/" 2>/dev/null || log_warn "Could not copy supabase config"
        
        # Verify edge functions were backed up
        if [ -d "$BACKUP_DIR/config/supabase/functions" ]; then
            local function_count=$(find "$BACKUP_DIR/config/supabase/functions" -name "index.ts" | wc -l)
            log_info "  └── Edge functions backed up: $function_count functions"
            
            # List all backed up functions
            find "$BACKUP_DIR/config/supabase/functions" -maxdepth 1 -type d -not -name "functions" | while read -r func_dir; do
                if [ -f "$func_dir/index.ts" ]; then
                    local func_name=$(basename "$func_dir")
                    log_info "      ✓ $func_name"
                fi
            done
        else
            log_warn "Edge functions directory not found in backup"
        fi
    fi
    
    # Backup migrations
    if [ -d "$PROJECT_DIR/migrations" ]; then
        cp -r "$PROJECT_DIR/migrations" "$BACKUP_DIR/config/" 2>/dev/null || log_warn "Could not copy migrations"
        local migration_count=$(find "$BACKUP_DIR/config/migrations" -name "*.sql" | wc -l)
        log_info "  └── Database migrations: $migration_count files"
    fi
    
    # Backup app migrations
    if [ -d "$PROJECT_DIR/art-battle-vote/migrations" ]; then
        cp -r "$PROJECT_DIR/art-battle-vote/migrations" "$BACKUP_DIR/config/app-migrations/" 2>/dev/null || log_warn "Could not copy app migrations"
        local app_migration_count=$(find "$BACKUP_DIR/config/app-migrations" -name "*.sql" | wc -l)
        log_info "  └── App migrations: $app_migration_count files"
    fi
    
    # Backup environment files (without sensitive data)
    if [ -f "$PROJECT_DIR/.env.example" ]; then
        cp "$PROJECT_DIR/.env.example" "$BACKUP_DIR/config/" 2>/dev/null || log_warn "Could not copy .env.example"
    fi
    
    # Backup scripts
    if [ -d "$PROJECT_DIR/scripts" ]; then
        cp -r "$PROJECT_DIR/scripts" "$BACKUP_DIR/config/" 2>/dev/null || log_warn "Could not copy scripts"
        local script_count=$(find "$BACKUP_DIR/config/scripts" -name "*.sh" -o -name "*.sql" | wc -l)
        log_info "  └── Backup/cleanup scripts: $script_count files"
    fi
    
    # Also backup any edge functions from art-battle-vote directory
    if [ -d "$PROJECT_DIR/art-battle-vote/supabase/functions" ]; then
        mkdir -p "$BACKUP_DIR/config/art-battle-vote-functions"
        cp -r "$PROJECT_DIR/art-battle-vote/supabase/functions"/* "$BACKUP_DIR/config/art-battle-vote-functions/" 2>/dev/null || log_warn "Could not copy art-battle-vote functions"
        local vote_func_count=$(find "$BACKUP_DIR/config/art-battle-vote-functions" -name "index.ts" | wc -l)
        if [ "$vote_func_count" -gt 0 ]; then
            log_info "  └── Art Battle Vote functions: $vote_func_count additional functions"
        fi
    fi
    
    log_success "Configuration backup completed"
}

# Verify edge functions backup
verify_edge_functions() {
    log_info "Verifying edge functions backup..."
    
    local main_functions_dir="$BACKUP_DIR/config/supabase/functions"
    local vote_functions_dir="$BACKUP_DIR/config/art-battle-vote-functions"
    
    if [ -d "$main_functions_dir" ]; then
        log_success "✓ Main Supabase functions directory backed up"
        
        # Check for critical edge functions
        local critical_functions=(
            "stripe-create-checkout"
            "stripe-payment-status" 
            "stripe-webhook-handler"
            "send-sms"
            "generate-qr-code"
            "validate-qr-scan"
            "slack-webhook"
        )
        
        local found_functions=0
        for func in "${critical_functions[@]}"; do
            if [ -f "$main_functions_dir/$func/index.ts" ]; then
                log_info "  ✓ $func - OK"
                ((found_functions++))
            else
                log_warn "  ✗ $func - MISSING"
            fi
        done
        
        log_info "Edge functions verification: $found_functions/${#critical_functions[@]} critical functions found"
        
        # Update backup info with edge functions details
        echo "" >> "$BACKUP_DIR/backup_info.txt"
        echo "EDGE FUNCTIONS BACKUP:" >> "$BACKUP_DIR/backup_info.txt"
        echo "Critical functions found: $found_functions/${#critical_functions[@]}" >> "$BACKUP_DIR/backup_info.txt"
        
        # List all functions in backup
        echo "All functions backed up:" >> "$BACKUP_DIR/backup_info.txt"
        find "$main_functions_dir" -maxdepth 1 -type d -not -name "functions" | while read -r func_dir; do
            if [ -f "$func_dir/index.ts" ]; then
                echo "- $(basename "$func_dir")" >> "$BACKUP_DIR/backup_info.txt"
            fi
        done
        
    else
        log_error "Edge functions directory not found in backup!"
        return 1
    fi
    
    log_success "Edge functions verification completed"
}

# Compress backup
compress_backup() {
    log_info "Compressing backup..."
    
    local backup_name=$(basename "$BACKUP_DIR")
    local compressed_file="$BACKUP_BASE_DIR/${backup_name}.tar.gz"
    
    # Create compressed archive
    cd "$BACKUP_BASE_DIR"
    tar -czf "${backup_name}.tar.gz" "$backup_name"
    
    # Verify compression was successful
    if [ ! -f "$compressed_file" ]; then
        log_error "Compression failed: $compressed_file not created"
        exit 1
    fi
    
    # Verify archive integrity
    if ! tar -tzf "$compressed_file" >/dev/null 2>&1; then
        log_error "Compression verification failed: archive is corrupted"
        exit 1
    fi
    
    local original_size=$(du -sh "$backup_name" | cut -f1)
    local compressed_size=$(du -sh "${backup_name}.tar.gz" | cut -f1)
    
    log_success "Backup compressed: $original_size → $compressed_size"
    log_info "Compressed backup: $compressed_file"
    
    # Update backup info
    cat >> "$BACKUP_DIR/backup_info.txt" << EOF

COMPRESSION INFO:
Original size: $original_size
Compressed size: $compressed_size
Compressed file: $compressed_file
Compression completed: $(date)
EOF
    
    # Only remove original if compression was successful
    log_info "Removing original backup directory..."
    rm -rf "$BACKUP_DIR"
    
    # Update reference to compressed file
    BACKUP_FILE="$compressed_file"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local deleted_count=0
    
    # Find and delete old compressed backups
    find "$BACKUP_BASE_DIR" -name "daily_*.tar.gz" -type f -mtime +$RETENTION_DAYS | while read -r old_backup; do
        log_info "Deleting old backup: $(basename "$old_backup")"
        rm -f "$old_backup"
        ((deleted_count++))
    done
    
    # Also clean up any uncompressed directories (from failed runs)
    find "$BACKUP_BASE_DIR" -name "daily_*" -type d -mtime +1 | while read -r old_dir; do
        log_warn "Cleaning up old uncompressed directory: $(basename "$old_dir")"
        rm -rf "$old_dir"
    done
    
    log_success "Cleanup completed"
}

# Update backup status
finalize_backup() {
    log_info "Finalizing backup..."
    
    # Create a temporary directory to update the compressed backup info
    local temp_dir=$(mktemp -d)
    cd "$temp_dir"
    
    # Extract just the backup info file
    tar -xzf "$BACKUP_FILE" "$(basename "$BACKUP_FILE" .tar.gz)/backup_info.txt"
    
    # Update status
    local info_file="$(basename "$BACKUP_FILE" .tar.gz)/backup_info.txt"
    sed -i 's/Status: IN PROGRESS/Status: COMPLETED/' "$info_file"
    echo "Backup completed: $(date)" >> "$info_file"
    echo "Final file: $BACKUP_FILE" >> "$info_file"
    
    # Update the compressed archive
    tar -czf "$BACKUP_FILE.tmp" -C "$temp_dir" "$(basename "$BACKUP_FILE" .tar.gz)" && \
    mv "$BACKUP_FILE.tmp" "$BACKUP_FILE"
    
    # Cleanup temp directory
    rm -rf "$temp_dir"
    
    log_success "Backup finalized: $BACKUP_FILE"
}

# Main backup function
main() {
    local start_time=$(date +%s)
    
    log_info "==================== DAILY BACKUP STARTED ===================="
    log_info "Starting daily backup at $(date)"
    
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Check system requirements
    check_dependencies
    
    # Create backup directory
    create_backup_dir
    
    # Export database components
    export_schema
    export_data
    
    # Backup configuration
    backup_config
    
    # Verify edge functions were backed up properly
    verify_edge_functions
    
    # Compress backup
    compress_backup
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Finalize backup
    finalize_backup
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local duration_formatted=$(printf '%02d:%02d:%02d' $((duration/3600)) $((duration%3600/60)) $((duration%60)))
    
    log_success "==================== BACKUP COMPLETED ===================="
    log_success "Backup completed successfully in $duration_formatted"
    log_success "Backup file: $BACKUP_FILE"
    
    # Send success notification
    send_notification "BACKUP SUCCESS" "Daily backup completed in $duration_formatted: $(basename "$BACKUP_FILE")"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi