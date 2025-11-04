#!/bin/bash

# ============================================================================
# Smart Backup Retention Policy Script
# ============================================================================
# Implements a graduated retention policy for backups:
# - Keep ALL backups less than 7 days old
# - Keep ONE backup per week for backups 7-30 days old
# - Keep ONE backup per month for backups 30-365 days old
# - Keep ONE backup per year for backups older than 365 days
#
# Usage: ./smart-backup-retention.sh [--execute]
#        Without --execute, runs in DRY RUN mode (shows what would be deleted)
# ============================================================================

# Don't exit on error - we'll handle errors gracefully
set +e

# Configuration
BACKUP_BASE_DIR="/nfs/store/vote26/backups"
LOG_FILE="/var/log/artbattle-backup-retention.log"
DRY_RUN=true

# Parse arguments
if [ "$1" == "--execute" ]; then
    DRY_RUN=false
fi

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Main retention function
apply_retention_policy() {
    log_info "==================== BACKUP RETENTION POLICY ===================="

    if $DRY_RUN; then
        log_warn "DRY RUN MODE - No files will be deleted"
    else
        log_info "EXECUTE MODE - Files will be deleted"
    fi

    log_info "Backup directory: $BACKUP_BASE_DIR"

    # Get current timestamp
    local now=$(date +%s)

    # Time thresholds (in seconds)
    local ONE_WEEK=$((7 * 24 * 3600))
    local ONE_MONTH=$((30 * 24 * 3600))
    local ONE_YEAR=$((365 * 24 * 3600))

    # Arrays to track what to keep
    declare -A keep_backups
    declare -A weekly_buckets
    declare -A monthly_buckets
    declare -A yearly_buckets

    # Find all backup directories and compressed files
    local all_backups=()

    # Add directories
    while IFS= read -r -d '' backup; do
        all_backups+=("$backup")
    done < <(find "$BACKUP_BASE_DIR" -maxdepth 1 \( -name "daily_*.tar.gz" -o -name "daily_*" -type d \) -print0 | sort -z)

    log_info "Found ${#all_backups[@]} total backups to evaluate"

    local keep_recent=0
    local keep_weekly=0
    local keep_monthly=0
    local keep_yearly=0
    local to_delete=0

    # Evaluate each backup
    for backup in "${all_backups[@]}"; do
        local basename=$(basename "$backup")

        # Extract timestamp from filename (format: daily_YYYYMMDD_HHMMSS or daily_YYYYMMDD_HHMMSS.tar.gz)
        local timestamp_str=$(echo "$basename" | sed -E 's/daily_([0-9]{8})_([0-9]{6}).*/\1 \2/')
        local date_part=$(echo "$timestamp_str" | awk '{print $1}')
        local time_part=$(echo "$timestamp_str" | awk '{print $2}')

        # Convert to Unix timestamp
        local backup_timestamp=$(date -d "${date_part:0:4}-${date_part:4:2}-${date_part:6:2} ${time_part:0:2}:${time_part:2:2}:${time_part:4:2}" +%s 2>/dev/null || echo "0")

        if [ "$backup_timestamp" == "0" ]; then
            log_warn "Could not parse timestamp for: $basename - skipping"
            continue
        fi

        local age=$((now - backup_timestamp))
        local age_days=$((age / 86400))

        # Decide retention bucket
        if [ $age -lt $ONE_WEEK ]; then
            # KEEP: Less than 1 week old - keep all
            keep_backups["$backup"]=1
            ((keep_recent++))
            log_info "  ✓ KEEP (recent): $basename (${age_days}d old)"

        elif [ $age -lt $ONE_MONTH ]; then
            # Keep one per week for backups 7-30 days old
            local week_number=$(date -d "@$backup_timestamp" +%Y-W%V)

            if [ -z "${weekly_buckets[$week_number]}" ]; then
                # First backup in this week - keep it
                weekly_buckets[$week_number]="$backup"
                keep_backups["$backup"]=1
                ((keep_weekly++))
                log_info "  ✓ KEEP (weekly): $basename (${age_days}d old, week $week_number)"
            else
                # Already have a backup for this week
                ((to_delete++))
                log_warn "  ✗ DELETE (weekly duplicate): $basename (${age_days}d old, week $week_number)"
            fi

        elif [ $age -lt $ONE_YEAR ]; then
            # Keep one per month for backups 30-365 days old
            local month=$(date -d "@$backup_timestamp" +%Y-%m)

            if [ -z "${monthly_buckets[$month]}" ]; then
                # First backup in this month - keep it
                monthly_buckets[$month]="$backup"
                keep_backups["$backup"]=1
                ((keep_monthly++))
                log_info "  ✓ KEEP (monthly): $basename (${age_days}d old, month $month)"
            else
                # Already have a backup for this month
                ((to_delete++))
                log_warn "  ✗ DELETE (monthly duplicate): $basename (${age_days}d old, month $month)"
            fi

        else
            # Keep one per year for backups older than 365 days
            local year=$(date -d "@$backup_timestamp" +%Y)

            if [ -z "${yearly_buckets[$year]}" ]; then
                # First backup in this year - keep it
                yearly_buckets[$year]="$backup"
                keep_backups["$backup"]=1
                ((keep_yearly++))
                log_info "  ✓ KEEP (yearly): $basename (${age_days}d old, year $year)"
            else
                # Already have a backup for this year
                ((to_delete++))
                log_warn "  ✗ DELETE (yearly duplicate): $basename (${age_days}d old, year $year)"
            fi
        fi
    done

    # Delete backups not marked to keep
    log_info ""
    log_info "==================== RETENTION SUMMARY ===================="
    log_info "Recent (< 7 days):      $keep_recent backups"
    log_info "Weekly (7-30 days):     $keep_weekly backups"
    log_info "Monthly (30-365 days):  $keep_monthly backups"
    log_info "Yearly (> 365 days):    $keep_yearly backups"
    log_info "Total to keep:          $((keep_recent + keep_weekly + keep_monthly + keep_yearly)) backups"
    log_info "Total to delete:        $to_delete backups"

    if [ $to_delete -eq 0 ]; then
        log_success "No backups need to be deleted"
        return 0
    fi

    # Calculate space savings
    local space_to_free=0

    log_info ""
    log_info "==================== DELETION PROCESS ===================="

    for backup in "${all_backups[@]}"; do
        if [ -z "${keep_backups[$backup]}" ]; then
            # This backup should be deleted
            local backup_size=$(du -sb "$backup" 2>/dev/null | awk '{print $1}' || echo "0")
            space_to_free=$((space_to_free + backup_size))

            if $DRY_RUN; then
                log_warn "  [DRY RUN] Would delete: $(basename "$backup") ($(numfmt --to=iec-i --suffix=B $backup_size))"
            else
                log_info "  Deleting: $(basename "$backup") ($(numfmt --to=iec-i --suffix=B $backup_size))"
                rm -rf "$backup"
                log_success "  ✓ Deleted: $(basename "$backup")"
            fi
        fi
    done

    local space_freed_human=$(numfmt --to=iec-i --suffix=B $space_to_free)

    if $DRY_RUN; then
        log_info ""
        log_info "==================== DRY RUN COMPLETE ===================="
        log_warn "Would free approximately: $space_freed_human"
        log_warn "Run with --execute to actually delete these backups"
    else
        log_info ""
        log_success "==================== DELETION COMPLETE ===================="
        log_success "Freed approximately: $space_freed_human"
    fi
}

# Main entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    apply_retention_policy
fi
