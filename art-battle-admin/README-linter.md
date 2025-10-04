# Event Linter System

A comprehensive event health checking system with both **Web UI** and **CLI** interfaces. All linting logic runs in a **Supabase Edge Function** for consistency and performance.

## Currently Active Rules (20 total)

### 🔴 Live Event Rules (4)
- **Event Started - No Photos**: Event started >15min ago but no photos uploaded
- **Round 3 Ended - Auction Still Open**: Round 3 ended >10min ago but auction not closed
- **Door Time Soon - No QR Codes**: Door time <60min away, no QR codes generated
- **Event Active - No Round Timer**: Event started >5min ago but timer not set

### 📋 Pre-Event Completeness (4)
- **Event Tomorrow - No Venue**: Event <24hrs away but venue not set
- **Event Soon - Low Artist Count**: Event in 3 days with <6 confirmed artists
- **Applications Open - No City Set**: Applications open but city not configured
- **Event Week Away - No Promo Materials**: Event <7 days away, no promo materials

### 📊 Post-Event Completeness (3)
- **Event Ended - Revenue Not Recorded**: Event ended 2+ days ago, F&B revenue not recorded
- **Event Ended - Other Revenue Not Recorded**: Event ended 2+ days ago, other revenue not recorded
- **Event Ended - Producer Tickets Not Recorded**: Event ended 2+ days ago, tickets not recorded

### 📈 Comparative Analysis (3)
- **Ticket Sales Below City Average**: Sales <70% of city historical average
- **Applications Closed - Below Typical Count**: Applications closed with <50% typical artist count
- **Food/Beverage Revenue Above Average**: F&B revenue >110% of city average ✅

### ⚙️ Operational Timing (4)
- **Event Disabled**: Event is disabled (not visible to public)
- **Timezone Not Configured**: Event timezone not set
- **No Slack Channel**: No Slack channel configured
- **No Eventbrite Link**: Event <14 days away but no Eventbrite integration

### ✅ Success Metrics (2)
- **Well Prepared Event**: Event <3 days away with >10 artists, venue set, >2 promo materials
- **Event Sold Out**: Event has sold out 🎉

## Architecture

```
┌─────────────────┐
│  YAML Rules     │  ← Single source of truth (on CDN)
│  (CDN)          │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  Supabase Edge Function             │
│  /functions/v1/event-linter         │
│  • Loads rules from CDN             │
│  • Fetches events (service role)    │
│  • Runs linter engine               │
│  • Returns structured JSON          │
│  • Includes debug info              │
└──────┬──────────────────────┬───────┘
       │                      │
       ↓                      ↓
┌─────────────┐      ┌──────────────┐
│  Web UI     │      │  CLI Tool    │
│  /event-    │      │  test-       │
│  linter     │      │  linter-     │
│             │      │  cli.js      │
└─────────────┘      └──────────────┘
```

## Setup

**No setup required!** Both CLI and UI call the deployed edge function.

## Usage

### Web UI

Navigate to **`/event-linter`** in the admin dashboard:

**Interactive Severity Badges** (click to toggle):
- ❌ **Errors** - Click to show only errors (or click again to show all)
- ⚠️ **Warnings** - Click to show only warnings
- 📊 **Info** - Click to show only info
- ✅ **Success** - Click to show only successes

**Time Filters:**
- **Future** - Events in the future or with no start date
- **Active (±24h)** - Events within 24 hours either direction

**Other Filters:**
- Search by EID or event name
- Filter by category (timing, operational, etc.)
- Filter by context (pre_event, during_event, etc.)
- Click rows for event details

### CLI Commands

```bash
# Run linter on all events (summary only)
node test-linter-cli.js --summary

# Run linter on all events (show all findings)
node test-linter-cli.js

# Test specific event by EID
node test-linter-cli.js --eid AB3003

# Filter by severity
node test-linter-cli.js --severity error
node test-linter-cli.js --severity warning

# Future events only (or events with no start date)
node test-linter-cli.js --future --summary

# Active events only (within ±24 hours of now)
node test-linter-cli.js --active --summary

# Combine filters
node test-linter-cli.js --future --severity error
node test-linter-cli.js --active --severity error

# Verbose mode (show debug info)
node test-linter-cli.js --summary --verbose
```

### Example Output

```
🔍 Event Linter CLI

Loading rules...
✓ Loaded 20 rules

Fetching events from database...
✓ Fetched 145 events

Running linter...
✓ Analysis complete

─────────────────────────────────────────────────────────────
❌ [ERROR] Event Tomorrow - No Venue
EID: AB3003 | Event: Toronto Art Battle
Category: data_completeness | Context: pre_event
→ Event in 18 hours but venue not set

─────────────────────────────────────────────────────────────
⚠️ [WARNING] Door Time Soon - No QR Codes
EID: AB3003 | Event: Toronto Art Battle
Category: live_event | Context: pre_event
→ Door time in 45 minutes but no QR codes generated (testing not done?)

════════════════════════════════════════════════════════════
                    LINTER SUMMARY
════════════════════════════════════════════════════════════

Rules Loaded: 20
Total Findings: 47

❌ Errors:   5
⚠️  Warnings: 12
📊 Info:     28
✅ Success:  2

════════════════════════════════════════════════════════════
```

## Adding New Rules

Edit `public/eventLinterRules.yaml`:

```yaml
- id: your_new_rule_id
  name: Short Rule Name
  description: What this rule checks for
  severity: error | warning | info | success
  category: live_event | data_completeness | operational | comparative
  context: pre_event | during_event | post_event | always
  conditions:
    - field: event_field_name
      operator: equals | is_null | past_days | upcoming_hours | etc
      value: threshold_value
  message: "Message with {{placeholders}}"
```

### Available Operators

**Comparison:**
- `equals`, `not_equals`
- `greater_than`, `less_than`
- `is_null`, `is_not_null`
- `is_empty`, `is_not_empty`

**Time-based:**
- `past_minutes`, `past_hours`, `past_days`
- `upcoming_minutes`, `upcoming_hours`, `upcoming_days`

**Comparative:**
- `greater_than_percent`, `less_than_percent` (requires `compare_to` field)

## Testing Your Rules

After editing the YAML:

1. **Upload to CDN** (edge function reads from there):
   ```bash
   s3cmd put public/eventLinterRules.yaml \
     --acl-public \
     s3://artb/admin/eventLinterRules.yaml
   ```

2. **Test immediately**:
   ```bash
   # Quick test
   node test-linter-cli.js --summary

   # Full test
   node test-linter-cli.js

   # Test specific event
   node test-linter-cli.js --eid AB3003

   # Check only errors
   node test-linter-cli.js --severity error
   ```

3. **Refresh web UI**: Hard refresh (`Ctrl+Shift+R`) and click "Refresh"

## How It Works

1. **YAML Rules** stored on CDN at `https://artb.tor1.cdn.digitaloceanspaces.com/admin/eventLinterRules.yaml`
2. **Edge Function** (`/functions/v1/event-linter`) loads rules and runs linter
3. **Web UI & CLI** both call the edge function
4. **Results** returned as structured JSON with debug info

## Edge Function Debugging

Following the **EDGE_FUNCTION_DEBUGGING_SECRET.md** pattern:

The edge function returns debug info in the response body (not console.log):

```json
{
  "success": true,
  "findings": [...],
  "summary": {...},
  "debug": {
    "timestamp": "2025-10-04T...",
    "function_name": "event-linter",
    "rules_loaded": 20,
    "events_fetched": 993,
    "events_to_lint": 993,
    "findings_count": 1885,
    "filters": {...}
  }
}
```

**In CLI**: Use `--verbose` to see debug info
**In Web UI**: Check browser console for `result.debug`

## Troubleshooting

### "Failed to load rules"
- Check CDN URL is accessible
- Verify YAML is uploaded: `curl https://artb.tor1.cdn.digitaloceanspaces.com/admin/eventLinterRules.yaml`

### No findings but you expect some
- Use CLI with `--verbose` to see debug info
- Check your YAML syntax (especially indentation)
- Test specific event: `node test-linter-cli.js --eid AB3003`
- Check browser console for debug output

### Edge function errors
- Check response body for `debug` object
- Common issues:
  - YAML syntax errors
  - CDN caching (wait 60s or purge cache)
  - Rule condition logic errors
