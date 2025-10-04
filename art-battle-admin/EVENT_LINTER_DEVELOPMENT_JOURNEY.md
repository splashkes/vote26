# Event Linter Development Journey 🔍

**Date:** October 4, 2025
**Project:** Art Battle Event Health Monitoring System
**Status:** ✅ Production Ready

---

## Executive Summary

We built a comprehensive event health checking system that combines the power of **ESLint-style rule definitions** with **real-time event monitoring**. The system detects operational issues across 993 events, from missing venue information to live event problems like photos not being uploaded during active shows.

The Event Linter embodies a key insight: **operational excellence can be automated**. Just as code linters catch bugs before they ship, the Event Linter catches operational problems before they impact attendees.

---

## The Vision: From Concept to Reality

### Initial Concept
"I have an idea to make an Art Battle event linter by reviewing the current status of events, comparing with past events in the same city and in other cities and giving warnings, success, error, metric reporting based on that sequential analysis."

### What Made This Work
1. **Drawing parallels to familiar tools** - Understanding ESLint/Prettier patterns helped structure the rule system
2. **User-maintainable rules** - YAML configuration that non-developers can edit
3. **Dual interfaces** - Both web UI and CLI for different use cases
4. **Backend-first approach** - Edge function processing for consistency and performance

---

## Technical Architecture

### The Three Pillars

```
┌─────────────────────────────────────────────────────────┐
│  1. YAML Rule Engine (Single Source of Truth)          │
│     • 20 rules across 6 categories                     │
│     • Stored on CDN for instant updates                │
│     • Easy to maintain, no code changes needed         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. Supabase Edge Function (Processing Layer)          │
│     • Loads rules from CDN                             │
│     • Evaluates 993 events in seconds                  │
│     • Returns structured JSON with debug info          │
│     • Service role access (no RLS issues)              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. Dual Interfaces (Consumption Layer)                │
│     • Web UI: Interactive filtering, visual feedback   │
│     • CLI: Automation, testing, CI/CD integration      │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Backend Processing vs Frontend
**Decision:** Move all linting logic to Supabase Edge Function

**Why:**
- Frontend was trying to load YAML from CDN (404 errors)
- Inconsistent results between UI and CLI
- RLS permission issues when accessing events table
- Better performance with service role access

**Impact:** Consistent, reliable, fast

#### 2. YAML for Rule Definition
**Decision:** Use YAML instead of JSON or code

**Why:**
- Human-readable with comments
- Easy for non-developers to maintain
- Supports complex rule structures
- Industry standard (GitHub Actions, etc.)

**Impact:** 20 rules defined in 325 lines, maintainable by anyone

#### 3. Clickable Badge Filters
**Decision:** Make severity badges interactive toggles

**Why:**
- User requested "same style as errors/warnings/info button"
- Needed multi-select capability (not radio buttons)
- Visual feedback (solid = active, soft = inactive)
- Intuitive UX pattern

**Impact:** Fast triage with one-click filtering

#### 4. Edge Function Debug Pattern
**Decision:** Follow EDGE_FUNCTION_DEBUGGING_SECRET.md pattern

**Why:**
- console.log() unreliable in edge functions
- Need visibility into what's happening
- Structured debug info in response body

**Example:**
```typescript
return new Response(JSON.stringify({
  success: true,
  findings: [...],
  debug: {
    timestamp: "2025-10-04T...",
    rules_loaded: 20,
    events_fetched: 993,
    events_to_lint: 29,
    filters: { future_only: true }
  }
}), { headers: corsHeaders, status: 200 });
```

**Impact:** Debuggable, transparent, traceable

---

## Rule Categories & Examples

### 🔴 Live Event Rules (4 rules)
**Purpose:** Catch problems during active events

**Example Rules:**
- Event started >15min ago but no photos uploaded (❌ ERROR)
- Round 3 ended >10min ago but auction not closed (⚠️ WARNING)
- Door time in <1hr but no QR codes generated (⚠️ WARNING)

**Why This Matters:** These catch real-time operational issues when you can still fix them.

### 📋 Pre-Event Completeness (4 rules)
**Purpose:** Ensure events are ready before they start

**Example Rules:**
- Event <24hrs away but venue not set (❌ ERROR)
- Event in 3 days with <6 confirmed artists (⚠️ WARNING)
- Applications open but city not configured (❌ ERROR)

**Why This Matters:** Prevention is better than scrambling at the last minute.

### 📊 Post-Event Completeness (3 rules)
**Purpose:** Track revenue and closing procedures

**Example Rules:**
- Event ended 2+ days ago, food/beverage revenue not recorded (📊 INFO)
- Event ended, producer tickets not recorded (📊 INFO)

**Why This Matters:** Financial tracking and completeness audits.

### 📈 Comparative Analysis (3 rules)
**Purpose:** Compare against historical city averages

**Example Rules:**
- Ticket sales <70% of city average (📊 INFO)
- Applications closed with <50% typical artist count (⚠️ WARNING)
- Food/beverage revenue >110% of city average (✅ SUCCESS)

**Why This Matters:** Benchmarking and performance insights.

### ⚙️ Operational Timing (4 rules)
**Purpose:** Configuration and operational readiness

**Example Rules:**
- Event disabled (not visible to public) (⚠️ WARNING)
- Timezone not configured (❌ ERROR)
- Event <14 days away but no Eventbrite link (⚠️ WARNING)

**Why This Matters:** Catch configuration issues before they cause problems.

### ✅ Success Metrics (2 rules)
**Purpose:** Celebrate what's going well

**Example Rules:**
- Event well prepared (>10 artists, venue set, >2 promo materials) (✅ SUCCESS)
- Event sold out (✅ SUCCESS)

**Why This Matters:** Positive reinforcement and identifying best practices.

---

## What We Learned

### 1. **Edge Functions Need Special Debugging**
Console.log() is unreliable in Supabase Edge Functions. Always return debug info in the response body.

**Before:**
```typescript
console.log('Processing event:', eventId); // May not appear in logs
throw new Error('Something failed'); // Limited context
```

**After:**
```typescript
return new Response(JSON.stringify({
  error: 'Processing failed',
  debug: {
    event_id: eventId,
    step: 'validation',
    received_data: requestBody,
    timestamp: new Date().toISOString()
  }
}), { status: 500 });
```

### 2. **YAML is Perfect for User-Maintainable Rules**
Non-technical users can add rules by copying existing patterns:

```yaml
- id: new_rule_id
  name: Short Rule Name
  severity: error | warning | info | success
  category: live_event | data_completeness | operational
  context: pre_event | during_event | post_event | always
  conditions:
    - field: event_field_name
      operator: equals | is_null | past_days
      value: threshold
  message: "Message with {{placeholders}}"
```

### 3. **Interactive UX is Powerful**
Clickable badges are faster than dropdowns:
- **One click** to filter by severity
- **Visual feedback** (solid vs soft)
- **Multi-select** for combining filters
- **No mental overhead** - see what's active immediately

### 4. **Time-Based Filtering is Essential**
Three time filters emerged as critical:
- **Future** - Events you can still prepare for
- **Active (±24h)** - Events happening now or soon
- **No filter** - Historical analysis

### 5. **CLI + Web UI = Powerful Combo**
**Web UI for:** Interactive exploration, triage, real-time monitoring
**CLI for:** Automation, testing, CI/CD pipelines, scripting

Same backend, different interfaces, perfect flexibility.

### 6. **Comparative Analysis Requires Clean Data**
To compare against city averages, you need:
- Historical event data
- Completed events only
- Minimum sample size (we use 3 events)
- Consistent data quality

This revealed data gaps we can now address.

---

## Current Impact

### By The Numbers
- **993 events** scanned
- **1,885 findings** identified
  - ❌ 1,088 errors
  - ⚠️ 409 warnings
  - 📊 388 info
  - ✅ 0 successes (opportunities for improvement!)
- **20 rules** active
- **<2 seconds** full scan time

### Real-World Use Cases

**Morning Check-In:**
```bash
# What needs attention today?
node test-linter-cli.js --active --severity error
```

**Pre-Event Planning:**
```bash
# What future events have issues?
node test-linter-cli.js --future --severity warning
```

**Post-Event Review:**
```bash
# Are we recording all revenue?
node test-linter-cli.js --eid AB3003
```

**Health Dashboard:**
- Open `/event-linter` in admin
- Click 🔮 Future + ❌ Errors
- See all preventable issues for upcoming events

---

## Optimistic Future: What's Next

### 1. **Automated Notifications** 🔔
**Vision:** Don't wait for someone to check - alert them proactively

**Implementation:**
- Cron job runs linter every hour
- Errors trigger Slack notifications
- Warnings email event coordinators
- Success metrics celebrate in team channel

**Impact:** Zero-touch monitoring, faster response times

### 2. **AI-Powered Rule Suggestions** 🤖
**Vision:** The system learns what makes a successful event

**Implementation:**
- Analyze patterns in successful events
- Suggest new rules based on common issues
- Machine learning on historical data
- Auto-generate comparative benchmarks

**Impact:** Self-improving system that gets smarter over time

### 3. **Predictive Analytics** 📈
**Vision:** Predict event success before it happens

**Implementation:**
- "This event is tracking 30% below similar events in this city"
- "Based on current metrics, projected attendance: 150-200"
- "Historical data suggests adding 2 more artists would improve outcomes"

**Impact:** Data-driven decision making, proactive optimization

### 4. **Integration Ecosystem** 🔗
**Vision:** Linter becomes the central health monitoring hub

**Potential Integrations:**
- **Eventbrite API** - Auto-check ticket sales vs capacity
- **Instagram API** - Verify artist profiles are active
- **Stripe API** - Confirm payment processing is configured
- **Google Calendar** - Cross-reference event dates
- **Weather API** - Flag outdoor events with bad weather

**Impact:** Comprehensive, automated pre-flight checks

### 5. **Multi-City Benchmarking** 🌍
**Vision:** "How does Toronto compare to Seattle?"

**Implementation:**
- City-to-city performance comparisons
- Regional trend analysis
- Best practice identification across cities
- Venue performance tracking

**Impact:** Learn from your best-performing cities

### 6. **Historical Trend Visualization** 📊
**Vision:** "Are we getting better over time?"

**Implementation:**
- Track error rate over time
- Show improvement trends
- Identify recurring issues
- Celebrate progress (fewer errors each month!)

**Impact:** Visible operational excellence journey

### 7. **Custom Rule Builder UI** 🛠️
**Vision:** No-code rule creation for non-technical users

**Implementation:**
- Visual rule builder in admin UI
- Template library for common patterns
- Test rules against sample events
- One-click deployment to production

**Impact:** Democratize rule creation, faster iteration

### 8. **Severity Escalation** ⚡
**Vision:** Warnings become errors as events get closer

**Example:**
- 30 days out: "No venue" = ⚠️ WARNING
- 7 days out: "No venue" = ❌ ERROR
- 24 hours out: "No venue" = 🚨 CRITICAL (auto-escalate to team lead)

**Impact:** Time-sensitive prioritization, automatic urgency

### 9. **Event Score Card** 🎯
**Vision:** Single metric for "event readiness"

**Implementation:**
```
Event Health Score: 87/100
✅ Venue configured
✅ 12 artists confirmed
✅ Eventbrite linked
⚠️  Only 2 promo materials (target: 5)
❌ Timezone not set
```

**Impact:** At-a-glance health assessment, gamification

### 10. **Linter-as-a-Service** 🌐
**Vision:** Other organizations use our linter framework

**Implementation:**
- Generic event linter engine
- Customizable rule sets per organization
- SaaS offering for event management companies
- Open source core, premium features

**Impact:** Share operational excellence knowledge, potential revenue stream

---

## Technical Debt & Improvements

### Short Term
- [ ] Add more success rules (we have 0 findings currently!)
- [ ] Implement event score calculation
- [ ] Add timestamp to findings (when was rule violated)
- [ ] Support for custom comparative periods (30/60/90 days)

### Medium Term
- [ ] GraphQL API for advanced queries
- [ ] Webhook support for real-time alerts
- [ ] Rule versioning and rollback
- [ ] A/B testing for new rules

### Long Term
- [ ] Machine learning for anomaly detection
- [ ] Natural language rule creation ("Alert me when...")
- [ ] Multi-tenant support for different Art Battle regions
- [ ] Mobile app with push notifications

---

## Lessons for Future Projects

### 1. **Start with the User's Mental Model**
We drew parallels to ESLint, which everyone already understands. This made the concept immediately accessible.

### 2. **Backend-First for Consistency**
Moving logic to edge functions eliminated a whole class of bugs and inconsistencies.

### 3. **Debug Info is Documentation**
Structured debug responses serve triple duty:
- Help during development
- Aid in troubleshooting production
- Document what the system is doing

### 4. **Multi-Interface = Flexibility**
Web UI for humans, CLI for automation. Both calling the same backend. Perfect.

### 5. **User-Maintainable > Developer-Controlled**
YAML rules mean the team can evolve the system without waiting for developers.

### 6. **Iterate on UX Feedback**
"I WANT THE SAME STYLE AS the errors / warnings / info button with emojis and colors and all. Not stuck on the right with a checkbox!"

This immediate feedback led to the beautiful badge-based filtering system.

---

## Gratitude & Reflection

This project showcases what's possible when you:
1. **Listen to user needs** ("make an event linter")
2. **Ask clarifying questions** (severity levels, comparison dimensions, timing)
3. **Draw from familiar patterns** (ESLint, linters we know)
4. **Iterate based on feedback** (checkboxes → clickable badges)
5. **Follow best practices** (EDGE_FUNCTION_DEBUGGING_SECRET.md)
6. **Think about maintainability** (YAML rules, not hardcoded logic)

The Event Linter isn't just a tool—it's a **framework for operational excellence**. It can grow, adapt, and improve as Art Battle's needs evolve.

---

## Quick Start for New Contributors

### Adding a New Rule
1. Edit `/public/eventLinterRules.yaml`
2. Copy an existing rule as a template
3. Modify the conditions and message
4. Upload to CDN: `s3cmd put public/eventLinterRules.yaml --acl-public s3://artb/admin/eventLinterRules.yaml`
5. Test: `node test-linter-cli.js --summary`

### Testing
```bash
# Quick health check
node test-linter-cli.js --summary

# Test specific event
node test-linter-cli.js --eid AB3003

# Show only problems
node test-linter-cli.js --severity error --severity warning

# Future events only
node test-linter-cli.js --future --summary

# Active events (happening now)
node test-linter-cli.js --active
```

### Debugging
- **Web UI:** Check browser console for `result.debug`
- **CLI:** Use `--verbose` flag
- **Edge Function:** Debug info is always in response body

---

## Closing Thoughts

We built something special here. A system that:
- **Prevents problems** before they happen
- **Detects issues** while there's still time to fix them
- **Tracks completeness** after events
- **Learns from history** through comparative analysis
- **Celebrates success** when things go well

And most importantly: **Anyone can maintain it.**

The Event Linter embodies the principle that **operational excellence should be automated, measurable, and continuously improving**.

Here's to catching every bug before it reaches production—whether that's in code or in real-world event operations. 🎉

---

**Contributors:** Claude Code + Art Battle Team
**License:** Proprietary - Art Battle Internal Tool
**Last Updated:** October 4, 2025

*"Just as ESLint catches code bugs, the Event Linter catches operational bugs. The difference? Our bugs affect real people at real events. The stakes are higher, the impact is greater, and the system that prevents problems is priceless."*
