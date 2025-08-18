#!/bin/bash

# Supabase Realtime Queue Monitor
# Runs every 30 seconds and alerts on performance issues
# Usage: ./scripts/monitor-realtime-queue.sh [--alert-email=email@domain.com] [--interval=30]

# Configuration
DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASS="6kEtvU9n0KhTVr5"

# Default settings
INTERVAL=30
ALERT_EMAIL=""
LOG_FILE="/tmp/realtime-queue-monitor.log"
ALERT_SENT_FILE="/tmp/realtime-alert-sent.flag"
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --alert-email=*)
      ALERT_EMAIL="${1#*=}"
      shift
      ;;
    --interval=*)
      INTERVAL="${1#*=}"
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--alert-email=email] [--interval=seconds] [--verbose] [--help]"
      echo "  --alert-email: Email address for critical alerts"
      echo "  --interval: Check interval in seconds (default: 30)"
      echo "  --verbose: Show detailed output"
      echo "  --help: Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to log with timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to send alert (basic implementation)
send_alert() {
  local message="$1"
  local severity="$2"
  
  log "ALERT [$severity]: $message"
  
  # If email is configured, try to send email
  if [[ -n "$ALERT_EMAIL" ]]; then
    if command -v mail >/dev/null 2>&1; then
      echo "$message" | mail -s "Art Battle Realtime Alert [$severity]" "$ALERT_EMAIL" 2>/dev/null
      log "Alert email sent to $ALERT_EMAIL"
    else
      log "Warning: 'mail' command not available, email alert not sent"
    fi
  fi
  
  # Create alert flag file to prevent spam
  echo "$(date)" > "$ALERT_SENT_FILE"
}

# Function to check if we recently sent an alert (prevent spam)
alert_recently_sent() {
  if [[ -f "$ALERT_SENT_FILE" ]]; then
    local last_alert=$(cat "$ALERT_SENT_FILE")
    local last_alert_epoch=$(date -d "$last_alert" +%s 2>/dev/null || echo 0)
    local current_epoch=$(date +%s)
    local diff=$((current_epoch - last_alert_epoch))
    
    # Don't send alerts more than once every 5 minutes
    if [[ $diff -lt 300 ]]; then
      return 0
    fi
  fi
  return 1
}

# Function to run the monitoring query
check_queue_stats() {
  local result
  result=$(timeout 30 bash -c "PGPASSWORD='$DB_PASS' psql -h '$DB_HOST' -p '$DB_PORT' -d '$DB_NAME' -U '$DB_USER' -t -c \"SELECT metric_name || '|' || metric_value || '|' || metric_unit || '|' || status FROM get_realtime_queue_stats();\"" 2>/dev/null)
  
  if [[ $? -ne 0 ]]; then
    log "ERROR: Failed to connect to database or execute query (timeout or connection issue)"
    return 1
  fi
  
  echo "$result"
}

# Function to convert bytes to human readable format
convert_bytes_to_mb() {
  local bytes="$1"
  
  # Handle special cases like -1 (no data) or 0
  if [[ "$bytes" -le 0 ]]; then
    echo "$bytes"
    return
  fi
  
  # Convert bytes to megabytes with 2 decimal places
  local mb=$(echo "scale=2; $bytes / 1048576" | bc -l 2>/dev/null)
  if [[ $? -eq 0 && -n "$mb" ]]; then
    echo "$mb"
  else
    # Fallback to awk if bc is not available
    echo "$bytes" | awk '{printf "%.2f", $1 / 1048576}'
  fi
}

# Function to parse and display results
parse_and_alert() {
  local stats="$1"
  local has_critical=false
  local has_warning=false
  local critical_messages=""
  local warning_messages=""
  
  echo "$stats" | while IFS='|' read -r metric_name metric_value metric_unit status; do
    # Trim whitespace
    metric_name=$(echo "$metric_name" | xargs)
    metric_value=$(echo "$metric_value" | xargs)
    metric_unit=$(echo "$metric_unit" | xargs)
    status=$(echo "$status" | xargs)
    
    if [[ -z "$metric_name" ]]; then
      continue
    fi
    
    # Convert bytes to megabytes for better readability
    local display_value="$metric_value"
    local display_unit="$metric_unit"
    
    if [[ "$metric_unit" == "bytes" ]] && [[ "$metric_value" =~ ^-?[0-9]+$ ]]; then
      if [[ "$metric_value" -gt 0 ]]; then
        display_value=$(convert_bytes_to_mb "$metric_value")
        display_unit="MB"
      elif [[ "$metric_value" -eq 0 ]]; then
        display_value="0.00"
        display_unit="MB"
      else
        # Keep negative values as-is (like -1 for no data)
        display_value="$metric_value"
        display_unit="bytes"
      fi
    fi
    
    # Color code based on status
    case "$status" in
      "CRITICAL")
        color=$RED
        has_critical=true
        critical_messages="$critical_messages\n$metric_name: $display_value $display_unit"
        ;;
      "WARNING")
        color=$YELLOW
        has_warning=true
        warning_messages="$warning_messages\n$metric_name: $display_value $display_unit"
        ;;
      "OK")
        color=$GREEN
        ;;
      *)
        color=$NC
        ;;
    esac
    
    if [[ "$VERBOSE" == "true" ]] || [[ "$status" != "OK" ]]; then
      printf "${color}%-18s: %8s %-12s [%s]${NC}\n" "$metric_name" "$display_value" "$display_unit" "$status"
    fi
  done
  
  # Send alerts if needed and not recently sent
  if [[ "$has_critical" == "true" ]] && ! alert_recently_sent; then
    send_alert "CRITICAL realtime queue issues detected:$critical_messages" "CRITICAL"
  elif [[ "$has_warning" == "true" ]] && ! alert_recently_sent; then
    send_alert "WARNING realtime queue issues detected:$warning_messages" "WARNING"
  fi
}

# Function to display header
show_header() {
  echo "=================================================="
  echo "Art Battle Realtime Queue Monitor"
  echo "Started: $(date)"
  echo "Interval: ${INTERVAL}s"
  echo "Log: $LOG_FILE"
  if [[ -n "$ALERT_EMAIL" ]]; then
    echo "Alerts: $ALERT_EMAIL"
  fi
  echo "=================================================="
}

# Main monitoring loop
main() {
  show_header
  log "Realtime queue monitoring started (interval: ${INTERVAL}s)"
  
  # Handle Ctrl+C gracefully
  trap 'log "Monitoring stopped by user"; exit 0' INT
  
  while true; do
    echo
    echo "$(date '+%H:%M:%S') - Checking realtime queue..."
    
    local stats
    stats=$(check_queue_stats)
    
    if [[ $? -eq 0 && -n "$stats" ]]; then
      parse_and_alert "$stats"
    else
      log "ERROR: Unable to retrieve queue statistics"
      if ! alert_recently_sent; then
        send_alert "Unable to retrieve realtime queue statistics - database connection issue?" "CRITICAL"
      fi
    fi
    
    sleep "$INTERVAL"
  done
}

# Make sure we can connect before starting the loop
echo "Testing database connection..."
if ! timeout 10 bash -c "PGPASSWORD='$DB_PASS' psql -h '$DB_HOST' -p '$DB_PORT' -d '$DB_NAME' -U '$DB_USER' -c 'SELECT 1;'" >/dev/null 2>&1; then
  echo "ERROR: Cannot connect to database. Please check connection settings."
  exit 1
fi

echo "Database connection successful."

# Run the main monitoring function
main