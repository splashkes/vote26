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
BACKUP_BASE_DIR="/nfs/store/vote26/backups"
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
- Database tables and data (770,000+ rows)
- Edge functions (Supabase functions)  
- Database migrations and app migrations
- RLS policies and database triggers
- TOML configuration files (config.toml, wrangler.toml)
- Package.json files from all sub-projects
- Build configurations (vite, eslint, etc.)
- External service documentation
- Infrastructure configurations
- Environment variable documentation
- Recovery procedures and instructions
- Application configurations and scripts
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
    
    # Dynamically fetch all public tables from the database
    log_info "Fetching current table list from database..."
    local tables_query_result=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE' 
    ORDER BY table_name;
    " | tr -d ' ' | grep -v '^$')
    
    # Convert query result to array
    local tables=()
    while IFS= read -r table; do
        if [ -n "$table" ]; then
            tables+=("$table")
        fi
    done <<< "$tables_query_result"
    
    local table_count=${#tables[@]}
    log_info "Found $table_count tables to backup"
    
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
            log_info "  └── Local edge functions backed up: $function_count functions"
            
            # List all backed up functions
            for func_dir in "$BACKUP_DIR/config/supabase/functions"/*; do
                if [ -d "$func_dir" ] && [ "$(basename "$func_dir")" != "functions" ] && [ -f "$func_dir/index.ts" ]; then
                    local func_name=$(basename "$func_dir")
                    log_info "      ✓ $func_name"
                fi
            done
        else
            log_warn "Local edge functions directory not found in backup"
        fi
    fi
    
    # Download all deployed functions (including those not in local filesystem)
    log_info "Downloading deployed edge functions..."
    local deployed_functions_dir="$BACKUP_DIR/deployed-functions"
    
    # Source the download function script with timeout
    if timeout 120 bash -c "source '$SCRIPT_DIR/download-deployed-functions.sh' && download_all_functions '$deployed_functions_dir'"; then
        local deployed_count=$(find "$deployed_functions_dir" -maxdepth 1 -type d 2>/dev/null | wc -l || echo "0")
        deployed_count=$((deployed_count - 1)) # Subtract the parent directory
        log_info "  └── Deployed functions downloaded: $deployed_count functions"
        
        # List downloaded deployed functions
        if [ -d "$deployed_functions_dir" ]; then
            for func_dir in "$deployed_functions_dir"/*; do
                if [ -d "$func_dir" ] && [ "$(basename "$func_dir")" != "deployed-functions" ] && [ -f "$func_dir/metadata.json" ]; then
                    local func_name=$(basename "$func_dir")
                    log_info "      ✓ $func_name (deployed)"
                fi
            done
        fi
    else
        log_warn "Failed to download deployed functions (timeout or error) - backup will continue with local functions only"
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
    
    # Backup TOML configuration files
    if [ -f "$PROJECT_DIR/config.toml" ]; then
        cp "$PROJECT_DIR/config.toml" "$BACKUP_DIR/config/" 2>/dev/null && log_info "  ✓ config.toml backed up"
    fi
    
    if [ -f "$PROJECT_DIR/cloudflare-worker/wrangler.toml" ]; then
        cp "$PROJECT_DIR/cloudflare-worker/wrangler.toml" "$BACKUP_DIR/config/" 2>/dev/null && log_info "  ✓ wrangler.toml backed up"
    fi
    
    # Backup package.json files from all sub-projects
    mkdir -p "$BACKUP_DIR/config/package-configs"
    local package_files=()
    while IFS= read -r -d '' package_file; do
        package_files+=("$package_file")
    done < <(find "$PROJECT_DIR" -maxdepth 2 -name "package.json" -not -path "*/node_modules/*" -print0)
    
    for package_file in "${package_files[@]}"; do
        if [ -f "$package_file" ]; then
            local project_name=$(basename "$(dirname "$package_file")")
            cp "$package_file" "$BACKUP_DIR/config/package-configs/${project_name}-package.json" 2>/dev/null
        fi
    done
    local package_count=$(find "$BACKUP_DIR/config/package-configs" -name "*-package.json" | wc -l)
    if [ "$package_count" -gt 0 ]; then
        log_info "  ✓ $package_count package.json files backed up"
    fi
    
    # Backup environment files (without sensitive data)
    if [ -f "$PROJECT_DIR/.env.example" ]; then
        cp "$PROJECT_DIR/.env.example" "$BACKUP_DIR/config/" 2>/dev/null || log_warn "Could not copy .env.example"
    fi
    
    # Backup other important config files
    local config_files=(
        "vite.config.js"
        "eslint.config.js" 
        "tailwind.config.js"
        "tsconfig.json"
        "supabase.json"
    )
    
    for config in "${config_files[@]}"; do
        local config_files_array=()
        while IFS= read -r -d '' config_file; do
            config_files_array+=("$config_file")
        done < <(find "$PROJECT_DIR" -maxdepth 2 -name "$config" -not -path "*/node_modules/*" -print0)
        
        for config_file in "${config_files_array[@]}"; do
            if [ -f "$config_file" ]; then
                local project_dir=$(basename "$(dirname "$config_file")")
                local dest_name="${project_dir}-${config}"
                cp "$config_file" "$BACKUP_DIR/config/${dest_name}" 2>/dev/null && log_info "  ✓ $dest_name backed up"
            fi
        done
    done
    
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
    log_info "DEBUG: Started verify_edge_functions function"
    log_info "DEBUG: BACKUP_DIR is: $BACKUP_DIR"
    
    local main_functions_dir="$BACKUP_DIR/config/supabase/functions"
    local vote_functions_dir="$BACKUP_DIR/config/art-battle-vote-functions"
    local deployed_functions_dir="$BACKUP_DIR/deployed-functions"
    
    log_info "DEBUG: Set directory paths - main: $main_functions_dir"
    
    log_info "DEBUG: About to initialize local variables"
    local local_found=0
    local deployed_found=0
    log_info "DEBUG: Initialized local variables"
    
    # Check local functions
    log_info "DEBUG: About to check if directory exists: $main_functions_dir"
    if [ -d "$main_functions_dir" ]; then
        log_info "DEBUG: Directory exists, proceeding with find command"
        log_success "✓ Local Supabase functions directory backed up"
        log_info "DEBUG: About to run find command"
        local_found=$(find "$main_functions_dir" -name "index.ts" 2>/dev/null | wc -l || echo "0")
        log_info "DEBUG: Find command completed, local_found: $local_found"
        log_info "  └── Local functions: $local_found"
    else
        log_info "DEBUG: Directory does not exist"
        log_warn "Local edge functions directory not found in backup"
        local_found=0
    fi
    log_info "DEBUG: Completed local functions check"
    
    # Check deployed functions
    log_info "DEBUG: About to check deployed functions directory: $deployed_functions_dir"
    if [ -d "$deployed_functions_dir" ]; then
        log_info "DEBUG: Deployed functions directory exists"
        log_success "✓ Deployed functions directory backed up"
        log_info "DEBUG: About to run find command for deployed functions"
        deployed_found=$(find "$deployed_functions_dir" -name "metadata.json" 2>/dev/null | wc -l || echo "0")
        log_info "DEBUG: Deployed find command completed, deployed_found: $deployed_found"
        log_info "  └── Deployed functions: $deployed_found"
        
        # Check for critical deployed functions
        log_info "DEBUG: About to check critical functions"
        local critical_functions=(
            "stripe-create-checkout"
            "stripe-payment-status" 
            "stripe-webhook-handler"
            "send-sms"
            "generate-qr-code"
            "validate-qr-scan"
            "slack-webhook"
            "meta-ads-report"
            "rfm-scoring"
            "eventbrite-data"
            "health-report-public"
        )
        
        local found_critical=0
        log_info "DEBUG: Starting critical functions loop"
        for func in "${critical_functions[@]}"; do
            if [ -f "$deployed_functions_dir/$func/metadata.json" ]; then
                log_info "  ✓ $func - OK (deployed)"
                ((found_critical++))
            elif [ -f "$main_functions_dir/$func/index.ts" ]; then
                log_info "  ✓ $func - OK (local)"
                ((found_critical++))
            else
                log_warn "  ✗ $func - MISSING"
            fi
        done
        
        log_info "Critical functions verification: $found_critical/${#critical_functions[@]} critical functions found"
        log_info "DEBUG: Finished critical functions loop"
    else
        log_warn "Deployed functions directory not found in backup"
        deployed_found=0
    fi
    
    log_info "DEBUG: About to update backup_info.txt"
    
    # Update backup info with edge functions details
    echo "" >> "$BACKUP_DIR/backup_info.txt"
    echo "EDGE FUNCTIONS BACKUP:" >> "$BACKUP_DIR/backup_info.txt"
    echo "Local functions: $local_found" >> "$BACKUP_DIR/backup_info.txt"
    echo "Deployed functions: $deployed_found" >> "$BACKUP_DIR/backup_info.txt"
    echo "Total functions backed up: $((local_found + deployed_found))" >> "$BACKUP_DIR/backup_info.txt"
    
    log_info "DEBUG: Finished updating backup_info.txt"
    
    # List all functions in backup
    echo "" >> "$BACKUP_DIR/backup_info.txt"
    echo "Local functions backed up:" >> "$BACKUP_DIR/backup_info.txt"
    if [ -d "$main_functions_dir" ]; then
        for func_dir in "$main_functions_dir"/*; do
            if [ -d "$func_dir" ] && [ "$(basename "$func_dir")" != "functions" ] && [ -f "$func_dir/index.ts" ]; then
                echo "- $(basename "$func_dir") (local)" >> "$BACKUP_DIR/backup_info.txt"
            fi
        done
    fi
    
    echo "" >> "$BACKUP_DIR/backup_info.txt"
    echo "Deployed functions backed up:" >> "$BACKUP_DIR/backup_info.txt"
    if [ -d "$deployed_functions_dir" ]; then
        for func_dir in "$deployed_functions_dir"/*; do
            if [ -d "$func_dir" ] && [ "$(basename "$func_dir")" != "deployed-functions" ] && [ -f "$func_dir/metadata.json" ]; then
                echo "- $(basename "$func_dir") (deployed)" >> "$BACKUP_DIR/backup_info.txt"
            fi
        done
    fi
    
    log_success "Edge functions verification completed - Total: $((local_found + deployed_found)) functions"
    log_info "DEBUG: About to exit verify_edge_functions function"
}

# Export Supabase project settings
export_supabase_settings() {
    log_info "Exporting Supabase project settings..."
    
    mkdir -p "$BACKUP_DIR/supabase-settings"
    
    # Export project configuration
    if command -v supabase &> /dev/null; then
        # Get project info
        supabase projects list --output json > "$BACKUP_DIR/supabase-settings/projects.json" 2>/dev/null || log_warn "Could not export projects list"
        
        # Get project settings
        supabase project api-keys --project-ref xsqdkubgyqwpyvfltnrf --output json > "$BACKUP_DIR/supabase-settings/api-keys.json" 2>/dev/null || log_warn "Could not export API keys info"
        
        log_info "  ✓ Project configuration exported"
    else
        log_warn "Supabase CLI not available, skipping project settings export"
    fi
    
    # Export database schema with RLS policies
    log_info "Exporting RLS policies and triggers..."
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
    " > "$BACKUP_DIR/supabase-settings/rls_policies.txt"
    
    # Export triggers
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
    SELECT 
        trigger_name,
        event_manipulation,
        event_object_table,
        action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
    " > "$BACKUP_DIR/supabase-settings/triggers.txt"
    
    log_success "Supabase settings export completed"
}

# Document required environment variables and external services
document_external_dependencies() {
    log_info "Documenting external dependencies..."
    
    mkdir -p "$BACKUP_DIR/recovery-info"
    
    # Create environment variables documentation
    cat > "$BACKUP_DIR/recovery-info/REQUIRED_ENVIRONMENT_VARIABLES.md" << 'EOF'
# Required Environment Variables for Recovery

⚠️ **CRITICAL**: These environment variables must be set in Supabase for the application to function.

## Database & Core
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

## SMS/Twilio Integration
- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio authentication token
- `TWILIO_FROM_NUMBER` - Phone number for sending SMS

## Stripe Payment Processing
- `stripe_canada_secret_key` - Stripe secret key for Canadian account
- `stripe_intl_secret_key` - Stripe secret key for international account
- `stripe_webhook_secret_canada` - Webhook secret for Canadian Stripe account
- `stripe_webhook_secret_intl` - Webhook secret for international Stripe account

## Slack Integration
- `SLACK_BOT_TOKEN` - Slack bot OAuth token for notifications

## Recovery Instructions
1. Set these in Supabase Dashboard → Project Settings → API → Environment variables
2. Deploy edge functions after setting environment variables
3. Test each service integration before going live

## Where to Find These Values
- Supabase: Dashboard → Project Settings → API
- Twilio: Console → Account Info
- Stripe: Dashboard → Developers → API keys
- Slack: App → OAuth & Permissions → Bot User OAuth Token
EOF

    # Create external services documentation
    cat > "$BACKUP_DIR/recovery-info/EXTERNAL_SERVICES.md" << 'EOF'
# External Service Configurations

## Twilio (SMS Service)
- **Account**: Art Battle Twilio account
- **Phone Numbers**: Check console for assigned numbers
- **Messaging Service**: Configured for international SMS
- **Webhooks**: Set to Supabase edge function endpoints

## Stripe (Payment Processing)
- **Canada Account**: For Canadian events (CAD currency)
- **International Account**: For USD/international events  
- **Webhooks**: 
  - Canada: `https://domain/stripe/webhook` → stripe-webhook-handler
  - International: Similar setup
- **Products**: Event-specific artwork products

## Slack Integration
- **Workspace**: Art Battle Slack workspace
- **Bot Name**: Art Battle Vote Bot
- **Channels**: Event-specific channels for notifications
- **Permissions**: Send messages, read channel info

## DigitalOcean Spaces (CDN)
- **Bucket**: `artb`
- **Region**: `tor1` (Toronto)
- **Endpoints**: 
  - Vote app: `https://artb.tor1.cdn.digitaloceanspaces.com/vote26/`
  - API: `https://artb.tor1.digitaloceanspaces.com/`
- **CORS**: Configured for artb.art domain

## Cloudflare (Image Delivery)
- **Domain**: `imagedelivery.net`
- **Account**: Art Battle Cloudflare account
- **Image variants**: thumbnail, compressed, public sizes
EOF

    # Create DNS/domain documentation  
    cat > "$BACKUP_DIR/recovery-info/DNS_DOMAIN_CONFIG.md" << 'EOF'
# DNS and Domain Configuration

## Primary Domain: artb.art
- **Registrar**: [Document current registrar]
- **DNS Provider**: [Document DNS provider]

## Critical DNS Records
```
# A/AAAA Records
artb.art → [IP address]
www.artb.art → [IP address or CNAME]

# CNAME Records  
cdn.artb.art → artb.tor1.cdn.digitaloceanspaces.com

# Subdomains
vote.artb.art → [Main app]
api.artb.art → [API endpoint]
```

## CDN Configuration
- **Main CDN**: DigitalOcean Spaces
- **Image CDN**: Cloudflare Image Delivery
- **Cache Settings**: [Document cache rules]
- **SSL**: [Document certificate setup]

## Application Routes
- `artb.art/` → Event list (main app)
- `artb.art/e/{event_id}/` → Event details  
- `artb.art/e/{event_id}/auction` → Auction view
- `artb.art/payment/{session_id}` → Payment receipt
- `artb.art/vote26/` → CDN asset path

## Recovery Steps
1. Point DNS to new infrastructure
2. Configure CDN with same paths
3. Update CORS settings for new domains  
4. Test all routes and redirects
EOF

    # Create infrastructure documentation
    cat > "$BACKUP_DIR/recovery-info/INFRASTRUCTURE_CONFIG.md" << 'EOF'
# Infrastructure Configuration

## Supabase Project
- **Project ID**: xsqdkubgyqwpyvfltnrf
- **Region**: [Document region]
- **Plan**: [Document current plan]
- **Database**: PostgreSQL
- **Auth**: Phone-based OTP authentication

## Database Settings
- **Connection pooling**: Enabled
- **Row Level Security**: Enabled on all tables
- **Realtime**: Enabled for critical tables (art, bids, votes)
- **API rate limiting**: [Document current limits]

## Edge Functions
- **Runtime**: Deno
- **Deployed functions**: 9 functions (see backup)
- **Triggers**: Database triggers for notifications
- **Cron jobs**: Vote weight calculations

## Deployment Pipeline
1. **Build**: Vite builds React app
2. **Upload**: Assets to DigitalOcean Spaces
3. **Cache**: CDN cache invalidation
4. **Functions**: Deploy via Supabase CLI

## Monitoring & Logging
- **Database logs**: Supabase dashboard
- **Application logs**: Browser console + edge function logs
- **Error tracking**: [Document if any service used]
- **Uptime monitoring**: [Document if configured]

## Backup Strategy
- **Database**: Daily automated backups (this script)
- **Code**: Git repository backups
- **Assets**: CDN has redundancy
- **Secrets**: Manual documentation (secure location)
EOF

    # Document current deployment state
    cat > "$BACKUP_DIR/recovery-info/CURRENT_DEPLOYMENT_STATE.txt" << EOF
# Current Deployment State
Generated: $(date)

## Git Information
Current branch: $(git branch --show-current 2>/dev/null || echo "unknown")
Last commit: $(git log -1 --oneline 2>/dev/null || echo "unknown")
Repository: $(git remote get-url origin 2>/dev/null || echo "unknown")

## Build Information  
Node version: $(node --version 2>/dev/null || echo "not available")
npm version: $(npm --version 2>/dev/null || echo "not available")

## Database Connection
Host: $DB_HOST
Port: $DB_PORT
Database: $DB_NAME
User: $DB_USER

## Backup Details
Created: $(date)
Backup size: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "calculating...")
Tables backed up: $(find "$BACKUP_DIR/data" -name "*.csv" | wc -l)
Functions backed up: $(find "$BACKUP_DIR/config/supabase/functions" -name "index.ts" | wc -l)

## Recovery Priority
1. Restore database and functions (critical - app won't work)
2. Configure environment variables (critical - services won't work)  
3. Set up DNS and CDN (critical - users can't access)
4. Configure external services (important - features won't work)
5. Test all functionality (essential - before going live)
EOF

    local doc_count=$(find "$BACKUP_DIR/recovery-info" -name "*.md" -o -name "*.txt" | wc -l)
    log_info "  ✓ Created $doc_count recovery documentation files"
    
    log_success "External dependencies documentation completed"
}

# Export nginx and web server configurations
export_infrastructure_config() {
    log_info "Exporting infrastructure configuration..."
    
    mkdir -p "$BACKUP_DIR/infrastructure"
    
    # Copy nginx configurations
    if [ -f "$PROJECT_DIR/nginx-stripe-webhook-proxy.conf" ]; then
        cp "$PROJECT_DIR/nginx-stripe-webhook-proxy.conf" "$BACKUP_DIR/infrastructure/"
        log_info "  ✓ Nginx configuration backed up"
    fi
    
    # Copy any docker or deployment configurations
    local docker_files=()
    while IFS= read -r -d '' config_file; do
        docker_files+=("$config_file")
    done < <(find "$PROJECT_DIR" -name "Dockerfile" -o -name "docker-compose.*" -o -name "*.yml" -o -name "*.yaml" | head -5 | tr '\n' '\0')
    
    for config_file in "${docker_files[@]}"; do
        if [ -f "$config_file" ]; then
            cp "$config_file" "$BACKUP_DIR/infrastructure/$(basename "$config_file")"
            log_info "  ✓ $(basename "$config_file") backed up"
        fi
    done
    
    # Export current system information
    cat > "$BACKUP_DIR/infrastructure/system_info.txt" << EOF
# System Information at Backup Time
Generated: $(date)

## Operating System
$(uname -a)

## Available Services
PostgreSQL client: $(which psql 2>/dev/null || echo "not found")
Node.js: $(node --version 2>/dev/null || echo "not found") 
npm: $(npm --version 2>/dev/null || echo "not found")
Supabase CLI: $(supabase --version 2>/dev/null || echo "not found")

## Network Configuration
Hostname: $(hostname)
$(ip route show default | head -1)

## Disk Usage
$(df -h | grep -E "(/$|/root)")
EOF
    
    log_success "Infrastructure configuration export completed"
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
    local old_archives=()
    while IFS= read -r -d '' old_backup; do
        old_archives+=("$old_backup")
    done < <(find "$BACKUP_BASE_DIR" -name "daily_*.tar.gz" -type f -mtime +$RETENTION_DAYS -print0)
    
    for old_backup in "${old_archives[@]}"; do
        log_info "Deleting old backup: $(basename "$old_backup")"
        rm -f "$old_backup"
        ((deleted_count++))
    done
    
    # Also clean up any uncompressed directories (from failed runs)
    local old_dirs=()
    while IFS= read -r -d '' old_dir; do
        old_dirs+=("$old_dir")
    done < <(find "$BACKUP_BASE_DIR" -name "daily_*" -type d -mtime +1 -print0)
    
    for old_dir in "${old_dirs[@]}"; do
        log_warn "Cleaning up old uncompressed directory: $(basename "$old_dir")"
        rm -rf "$old_dir"
    done
    
    log_success "Cleanup completed"
}

# Run smart cleanup script
run_cleanup_script() {
    log_info "Running smart backup cleanup script..."
    
    local cleanup_script="$BACKUP_BASE_DIR/cleanup_backups.sh"
    
    if [ -f "$cleanup_script" ] && [ -x "$cleanup_script" ]; then
        log_info "Executing: $cleanup_script --execute"
        
        # Run the cleanup script in execute mode
        if "$cleanup_script" --execute; then
            log_success "Smart cleanup completed successfully"
        else
            log_warn "Smart cleanup script returned with warnings or errors"
        fi
    else
        log_warn "Smart cleanup script not found or not executable at: $cleanup_script"
    fi
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
    log_info "✓ Edge functions verification completed - proceeding to next step"
    
    # Export Supabase project settings and RLS policies
    log_info "Starting Supabase settings export..."
    export_supabase_settings
    log_info "✓ Supabase settings export completed - proceeding to next step"
    
    # Document external dependencies and recovery information
    log_info "Starting external dependencies documentation..."
    document_external_dependencies
    log_info "✓ External dependencies documentation completed - proceeding to next step"
    
    # Export infrastructure configurations
    log_info "Starting infrastructure config export..."
    export_infrastructure_config
    log_info "✓ Infrastructure config export completed - proceeding to next step"
    
    # Compress backup
    log_info "Starting backup compression..."
    compress_backup
    log_info "✓ Backup compression completed - proceeding to next step"
    
    # Cleanup old backups
    log_info "Starting old backup cleanup..."
    cleanup_old_backups
    log_info "✓ Old backup cleanup completed - proceeding to next step"
    
    # Run additional cleanup script
    log_info "Starting smart cleanup script..."
    run_cleanup_script
    log_info "✓ Smart cleanup script completed - proceeding to next step"
    
    # Finalize backup
    log_info "Starting backup finalization..."
    finalize_backup
    log_info "✓ Backup finalization completed"
    
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