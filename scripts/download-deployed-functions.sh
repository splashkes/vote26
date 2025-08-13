#!/bin/bash

# ============================================================================
# Download All Deployed Supabase Functions Script
# ============================================================================
# Downloads all deployed Edge Functions from Supabase that may not exist locally
# Used by backup script to ensure complete function coverage
# ============================================================================

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ACCESS_TOKEN_FILE="$HOME/.supabase/access-token"
PROJECT_REF="xsqdkubgyqwpyvfltnrf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${timestamp} [${level}] ${message}"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Check if access token exists
check_auth() {
    if [ ! -f "$ACCESS_TOKEN_FILE" ]; then
        log_error "Supabase access token not found at $ACCESS_TOKEN_FILE"
        log_error "Please run: supabase login"
        exit 1
    fi
    
    log_info "Using access token from $ACCESS_TOKEN_FILE"
}

# Get list of all deployed functions
get_deployed_functions() {
    # Use supabase CLI to get function list and extract names from the NAME column
    local temp_file=$(mktemp)
    supabase functions list > "$temp_file" 2>&1
    
    grep -E "^\s+[a-f0-9-]+ \|" "$temp_file" | \
        awk -F'|' '{print $2}' | \
        sed 's/^ *//;s/ *$//' | \
        grep -v '^$'
    
    rm -f "$temp_file"
}

# Download function metadata and source
download_function() {
    local function_name="$1"
    local output_dir="$2"
    local token=$(cat "$ACCESS_TOKEN_FILE" 2>/dev/null)
    
    log_info "Downloading function: $function_name"
    
    # Create function directory
    mkdir -p "$output_dir/$function_name"
    
    # Download function metadata
    curl -s -X GET \
        "https://api.supabase.com/v1/projects/$PROJECT_REF/functions/$function_name" \
        -H "Authorization: Bearer $token" \
        > "$output_dir/$function_name/metadata.json"
    
    if [ $? -eq 0 ]; then
        log_info "  ✓ Downloaded metadata for $function_name"
    else
        log_warn "  ✗ Failed to download metadata for $function_name"
    fi
    
    # Download function source (binary ESZIP format)
    curl -s -X GET \
        "https://api.supabase.com/v1/projects/$PROJECT_REF/functions/$function_name/body" \
        -H "Authorization: Bearer $token" \
        > "$output_dir/$function_name/source.eszip"
    
    if [ $? -eq 0 ] && [ -s "$output_dir/$function_name/source.eszip" ]; then
        log_info "  ✓ Downloaded source for $function_name"
        
        # Try to extract readable information from the binary
        strings "$output_dir/$function_name/source.eszip" | grep -E "(import|export|function|const|let)" | head -20 > "$output_dir/$function_name/source_preview.txt" 2>/dev/null || true
        
        return 0
    else
        log_warn "  ✗ Failed to download source for $function_name"
        return 1
    fi
}

# Main download function
download_all_functions() {
    local output_dir="$1"
    
    if [ -z "$output_dir" ]; then
        log_error "Output directory not specified"
        exit 1
    fi
    
    # Create output directory
    mkdir -p "$output_dir"
    
    log_info "Starting download of all deployed functions to: $output_dir"
    
    # Get list of functions
    log_info "Fetching deployed function list..."
    local functions=$(get_deployed_functions 2>/dev/null)
    
    if [ -z "$functions" ]; then
        log_error "No functions found or failed to fetch function list"
        exit 1
    fi
    
    local total_functions=$(echo "$functions" | wc -l)
    local downloaded_count=0
    local failed_count=0
    
    log_info "Found $total_functions deployed functions"
    
    # Download each function
    while IFS= read -r function_name; do
        if [ -n "$function_name" ]; then
            if download_function "$function_name" "$output_dir"; then
                ((downloaded_count++))
            else
                ((failed_count++))
            fi
        fi
    done <<< "$functions"
    
    log_success "Download completed: $downloaded_count successful, $failed_count failed"
    
    # Create summary file
    cat > "$output_dir/download_summary.txt" << EOF
Function Download Summary
========================
Downloaded: $(date)
Project: $PROJECT_REF
Total functions: $total_functions
Successfully downloaded: $downloaded_count
Failed downloads: $failed_count

Functions downloaded:
$(ls "$output_dir" | grep -v download_summary.txt)

Note: Function source is stored in ESZIP binary format.
Source previews are available in source_preview.txt files.
EOF
    
    log_info "Download summary saved to: $output_dir/download_summary.txt"
}

# Script entry point
main() {
    local output_dir="$1"
    
    if [ -z "$output_dir" ]; then
        echo "Usage: $0 <output_directory>"
        echo "Example: $0 /tmp/downloaded-functions"
        exit 1
    fi
    
    log_info "==================== FUNCTION DOWNLOAD STARTED ===================="
    
    check_auth
    download_all_functions "$output_dir"
    
    log_success "==================== FUNCTION DOWNLOAD COMPLETED =================="
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi