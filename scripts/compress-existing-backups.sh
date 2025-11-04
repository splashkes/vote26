#!/bin/bash

# ============================================================================
# Compress Existing Uncompressed Backups
# ============================================================================
# Compresses all uncompressed backup directories to save disk space
# ============================================================================

set -e

BACKUP_BASE_DIR="/nfs/store/vote26/backups"
LOG_FILE="/var/log/artbattle-backup-compression.log"

# Logging
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_error() { log "ERROR" "$@"; }

log_info "==================== COMPRESSING EXISTING BACKUPS ===================="

# Find all uncompressed backup directories
uncompressed_dirs=()
while IFS= read -r -d '' backup_dir; do
    uncompressed_dirs+=("$backup_dir")
done < <(find "$BACKUP_BASE_DIR" -maxdepth 1 -name "daily_*" -type d -print0 | sort -z)

total_dirs=${#uncompressed_dirs[@]}
log_info "Found $total_dirs uncompressed backup directories"

if [ $total_dirs -eq 0 ]; then
    log_info "No uncompressed backups to compress"
    exit 0
fi

compressed_count=0
failed_count=0
total_original_size=0
total_compressed_size=0

for backup_dir in "${uncompressed_dirs[@]}"; do
    backup_name=$(basename "$backup_dir")
    compressed_file="$BACKUP_BASE_DIR/${backup_name}.tar.gz"

    log_info "Compressing: $backup_name"

    # Check if compressed version already exists
    if [ -f "$compressed_file" ]; then
        log_info "  ⚠ Compressed version already exists, skipping"
        continue
    fi

    # Get original size
    original_size=$(du -sb "$backup_dir" 2>/dev/null | awk '{print $1}' || echo "0")
    total_original_size=$((total_original_size + original_size))

    # Compress the backup
    cd "$BACKUP_BASE_DIR"
    if tar -czf "${backup_name}.tar.gz" "$backup_name" 2>&1 | tee -a "$LOG_FILE"; then
        # Verify the compressed file was created and is valid
        if [ -f "$compressed_file" ] && tar -tzf "$compressed_file" >/dev/null 2>&1; then
            # Get compressed size
            compressed_size=$(du -sb "$compressed_file" 2>/dev/null | awk '{print $1}' || echo "0")
            total_compressed_size=$((total_compressed_size + compressed_size))

            # Calculate compression ratio
            if [ $original_size -gt 0 ]; then
                ratio=$(awk "BEGIN {printf \"%.1f\", ($original_size - $compressed_size) * 100 / $original_size}")
            else
                ratio="0"
            fi

            original_human=$(numfmt --to=iec-i --suffix=B $original_size)
            compressed_human=$(numfmt --to=iec-i --suffix=B $compressed_size)

            log_success "  ✓ Compressed: $original_human → $compressed_human (${ratio}% savings)"

            # Remove original directory
            log_info "  Removing original directory..."
            rm -rf "$backup_dir"
            log_success "  ✓ Original directory removed"

            ((compressed_count++))
        else
            log_error "  ✗ Compression verification failed for $backup_name"
            rm -f "$compressed_file"  # Remove bad compressed file
            ((failed_count++))
        fi
    else
        log_error "  ✗ Compression failed for $backup_name"
        ((failed_count++))
    fi
done

# Calculate totals
total_saved=$((total_original_size - total_compressed_size))
total_original_human=$(numfmt --to=iec-i --suffix=B $total_original_size)
total_compressed_human=$(numfmt --to=iec-i --suffix=B $total_compressed_size)
total_saved_human=$(numfmt --to=iec-i --suffix=B $total_saved)

if [ $total_original_size -gt 0 ]; then
    overall_ratio=$(awk "BEGIN {printf \"%.1f\", $total_saved * 100 / $total_original_size}")
else
    overall_ratio="0"
fi

log_info ""
log_info "==================== COMPRESSION SUMMARY ===================="
log_info "Directories processed:   $total_dirs"
log_success "Successfully compressed: $compressed_count"
log_error "Failed:                  $failed_count"
log_info ""
log_info "Original total size:     $total_original_human"
log_info "Compressed total size:   $total_compressed_human"
log_success "Total space saved:       $total_saved_human (${overall_ratio}%)"
log_info "==================== COMPRESSION COMPLETE ===================="

if [ $failed_count -gt 0 ]; then
    exit 1
fi
