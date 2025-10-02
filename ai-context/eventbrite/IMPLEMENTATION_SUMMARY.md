# Eventbrite Billing Integration - Implementation Summary
**Created:** October 2, 2025

---

## 📋 What We're Building

A **billing-accurate ticket sales reporting system** that:
- Fetches complete financial data directly from Eventbrite API
- Shows fees, taxes, and net deposit (what organizer receives)
- Caches results for 6 hours to minimize API calls
- Validates data quality before using for billing
- Falls back to existing cached data if API unavailable

---

## 🎯 Key Requirements Met

✅ **Gross Revenue** - Total charged to buyers
✅ **Ticket Revenue** - Face value of tickets
✅ **Eventbrite Fees** - Service fees (3.7% + $1.79/ticket)
✅ **Payment Processing Fees** - Gateway fees (~2.9%)
✅ **Taxes Collected** - Sales tax/VAT
✅ **Net Deposit** - 💰 **What organizer receives** (THE critical number)
✅ **6-hour caching** - API call only if stale
✅ **Data quality scoring** - Don't use bad data for billing

---

## 🏗️ Architecture

```
Admin requests post-event summary
         ↓
get-event-post-summary function
         ↓
Check eventbrite_api_cache table
         ↓
   Data < 6 hours old?
    ↙           ↘
  YES           NO
   ↓             ↓
Return      Call Eventbrite
cached    → Sales Report API
data        (/reports/sales/)
              ↓
         Store in cache
              ↓
         Return fresh data
```

---

## 📊 Financial Breakdown Example

```
Event: Art Battle Toronto
Date: Oct 1, 2025
Tickets: 150 sold / 200 capacity (75%)

┌─────────────────────────────────────────┐
│  Ticket Sales (150 @ $35.00):  $5,250.00│
│  Sales Tax (8%):                  $420.00│
│  ────────────────────────────────────────│
│  Subtotal:                      $5,670.00│
│                                          │
│  Eventbrite Fees:                $678.00 │
│  Payment Processing:             $152.25 │
│  ────────────────────────────────────────│
│  Total Fees:                    ($830.25)│
│                                          │
│  ════════════════════════════════════════│
│  NET DEPOSIT TO ORGANIZER:     $4,419.75 │
│  ════════════════════════════════════════│
│                                          │
│  Avg per ticket: $35.00                  │
│  Avg net/ticket: $29.46                  │
└─────────────────────────────────────────┘
```

---

## 🗄️ Database: `eventbrite_api_cache`

**Key columns:**
- `event_id`, `eid`, `eventbrite_id` - Identifiers
- `gross_revenue` - Total charged
- `ticket_revenue` - Face value
- `taxes_collected` - Sales tax
- `eventbrite_fees` - EB fees
- `payment_processing_fees` - Payment gateway fees
- `net_deposit` - **Calculated: ticket_revenue - fees**
- `fetched_at`, `expires_at` - Cache management
- `data_quality_score` - 0-100 validation score
- `is_stale` - Auto-calculated: expires_at < NOW()

**Full schema:** See `EVENTBRITE_API_INTEGRATION_PLAN.md` section "Phase 1"

---

## 🔌 Primary API Endpoint

```
GET https://www.eventbriteapi.com/v3/reports/sales/?event_ids={eventbrite_id}
```

**Why this endpoint?**
- ✅ Gives complete financial breakdown in one call
- ✅ Includes net sales calculation (after fees)
- ✅ Aggregated totals (no need to process individual orders)
- ✅ Most accurate for billing purposes

**Response includes:**
- `gross_sales` - Total charged
- `net_sales` - Net to organizer
- `fees.eventbrite_fees` - EB service fees
- `fees.payment_processing_fees` - Payment fees
- `tax` - Sales tax collected
- `quantity_sold` - Tickets sold

**Full API details:** See `EVENTBRITE_FINANCIAL_ENDPOINTS.md`

---

## 🔄 Cache Logic

```typescript
// 1. Check cache first
const cached = await getCachedData(eventbriteId);
if (cached && !cached.is_stale && cached.data_quality_score >= 70) {
  return cached; // Use cached data (< 6 hours old)
}

// 2. Fetch fresh data from API
const freshData = await fetchEventbriteSalesReport(eventbriteId);

// 3. Validate data quality
const quality = validateFinancials(freshData);
if (quality.score < 70) {
  // Alert admin - data quality issue
  logQualityAlert(eventbriteId, quality.issues);
}

// 4. Store in cache with 6-hour expiry
await storeCache({
  ...freshData,
  expires_at: NOW() + 6 hours,
  data_quality_score: quality.score
});

// 5. Return fresh data
return freshData;
```

---

## ✅ Data Quality Validation

**Checks performed (100-point scale):**

1. **Revenue present** (40 pts)
   - Has revenue > 0 OR no tickets sold

2. **Ticket classes detailed** (20 pts)
   - Ticket type breakdown available

3. **Pricing consistency** (20 pts)
   - Calculated revenue matches reported revenue (within $1)

4. **Capacity data** (10 pts)
   - Total capacity specified

5. **Currency specified** (10 pts)
   - Currency code present

**Quality thresholds:**
- **90-100**: Excellent - use for billing
- **70-89**: Good - use with caution
- **<70**: Poor - DO NOT use for billing, alert admin

**See full validation logic:** `EVENTBRITE_FINANCIAL_ENDPOINTS.md` section "Critical Validation Rules"

---

## 🚀 Implementation Steps

### **Phase 1: Setup** (Week 1)
1. Get Eventbrite API credentials (OAuth app)
2. Add `EVENTBRITE_API_TOKEN` to Supabase secrets
3. Create `eventbrite_api_cache` table
4. Test Sales Report API with sample event

### **Phase 2: Core Function** (Week 2)
5. Create `fetch-eventbrite-data` edge function
6. Implement Sales Report API call
7. Add 6-hour caching logic
8. Build data quality validation

### **Phase 3: Integration** (Week 3)
9. Update `get-event-post-summary` to check Eventbrite cache first
10. Add fallback to existing `cached_event_data`
11. Create admin UI for financial breakdown
12. Add quality alerts for poor data

### **Phase 4: Testing** (Week 4)
13. Test with 10+ real events
14. Compare with Eventbrite dashboard (manual verification)
15. Load test cache performance
16. Document accuracy vs old system

### **Phase 5: Rollout** (Week 5)
17. Deploy to production
18. Run parallel with old system for 1 week
19. Gather feedback from billing team
20. Switch over completely

---

## 📈 Expected Benefits

### Accuracy
- **From 86% → 99%+** (eliminates 6 events with $0 revenue issues)
- Direct API = source of truth
- Complete fee breakdown for reconciliation

### Performance
- **6-hour cache** = 4 API calls/day per event
- Well under Eventbrite's 1,000/hour rate limit
- Sub-second response for cache hits

### Reliability
- Graceful fallback to existing cache
- Quality scoring prevents bad data usage
- Historical data preserved in database

### Billing Confidence
- **Net deposit** clearly shown
- All fees itemized and validated
- Can reconcile with Eventbrite payouts

---

## ⚠️ Critical Considerations

1. **API Credentials Required**
   - Need Eventbrite OAuth app with `reports:sales` scope
   - Token must be kept secure in Supabase secrets

2. **First Call Latency**
   - Fresh API call takes ~1-2 seconds
   - Pre-warm cache for upcoming events via cron

3. **Historical Events**
   - Decide: backfill old events or only new ones?
   - API works for past events too

4. **Free Events**
   - Will show $0 revenue (expected)
   - Validation must handle this case

5. **Multi-Currency**
   - Each event in its own currency
   - Don't sum across currencies without conversion

---

## 🎓 Next Actions

**IMMEDIATE:**
1. ✅ Get Eventbrite API credentials
2. ✅ Test `/reports/sales/` endpoint with 3 sample events:
   - One with revenue
   - One with zero revenue
   - One with multiple ticket types
3. ✅ Verify response structure matches documentation
4. ✅ Get approval from billing team on financial breakdown format

**THEN:**
5. Create database migration for `eventbrite_api_cache`
6. Build `fetch-eventbrite-data` function
7. Integrate with `get-event-post-summary`

---

## 📞 Questions to Answer

- [ ] Do we have Eventbrite API app already? (Check with previous dev/admin)
- [ ] What's acceptable data freshness? (6 hours OK or need more frequent?)
- [ ] Should we report gross or net to organizers? (Or both?)
- [ ] Who receives data quality alerts? (Slack channel?)
- [ ] Any events excluded from billing? (Test events, free events?)
- [ ] Need historical backfill? (Past events or only going forward?)

---

**Status:** Planning Complete - Ready for API Testing & Implementation

**Documents:**
- Main Plan: `EVENTBRITE_API_INTEGRATION_PLAN.md`
- Financial Details: `EVENTBRITE_FINANCIAL_ENDPOINTS.md`
- This Summary: `IMPLEMENTATION_SUMMARY.md`
