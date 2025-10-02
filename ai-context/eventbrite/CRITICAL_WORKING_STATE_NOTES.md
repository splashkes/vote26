# CRITICAL: Eventbrite Integration - Working vs Broken State
**Date:** October 2, 2025
**Issue:** Function went from WORKING PERFECTLY to BOOT_ERROR after refactoring

---

## ✅ WORKING STATE (Before Breaking Changes)

### What Was Working Perfectly

**Test Result (AB2938 Toronto):**
```bash
curl "https://www.eventbriteapi.com/v3/organizations/263333410230/reports/sales/?event_ids=1451316880859" \
  -H "Authorization: Bearer 7LME6RSW6TFLEFBDS6DU"
```

**Response:**
```json
{
  "totals": {
    "currency": "CAD",
    "gross": "5071.97",
    "net": "4569.28",
    "quantity": 249,
    "fees": "502.69"
  }
}
```

**✅ This matched Eventbrite dashboard perfectly!** ($4,569.28 net deposit)

### Correct Configuration

**Supabase Secrets:**
```bash
EVENTBRITE_ACCESS_TOKEN=7LME6RSW6TFLEFBDS6DU
EB_ORG_ID=263333410230
```

**API Endpoint Used:**
```
https://www.eventbriteapi.com/v3/organizations/{EB_ORG_ID}/reports/sales/?event_ids={eventbrite_id}
```

**Why This Works:**
- Organization-level Sales Report API (user-level is deprecated)
- Returns aggregated totals (no pagination issues)
- Complete financial breakdown in ONE API call
- Billing-accurate data directly from Eventbrite

---

## ❌ BREAKING CHANGES (What Went Wrong)

### User Request
> "please remove all the fallback code - not helping anyone to get incomplete inf, also you can remove the warning about it on the UI"

### What I Did (Mistakes Made)

1. **Removed Orders API fallback code** ← This was correct
2. **BUT introduced variable scoping errors:**
   - Declared `netDeposit` variable twice (lines 269 and 307)
   - Removed `orders` array but left references to `orders.length`
   - Created `processed.net_deposit` in one place but referenced `netDeposit` variable in another

3. **Result:** Function returns `BOOT_ERROR` - won't even start

### Current Broken State

**Error:** `{"code":"BOOT_ERROR","message":"Function failed to start (please check logs)"}`

**Root Cause:** Syntax/reference errors prevent Deno from compiling the function

---

## 🔧 HOW TO FIX (Get Back to Working State)

### Option 1: Revert to Last Known Working Version

The last working deployment had:
- Organization Sales Report API endpoint working
- Proper token (`7LME6RSW6TFLEFBDS6DU`)
- Clean data processing without variable conflicts

### Option 2: Fix Current Version

**Key fixes needed:**

1. **Remove duplicate `netDeposit` declarations:**
   - Keep ONLY `processed.net_deposit` in the processed object
   - Remove standalone `const netDeposit` declaration

2. **Remove all references to `orders` array:**
   - Remove `orders.length` in sales_summary
   - Remove any conditional checks on `orders`

3. **Data flow should be:**
   ```typescript
   // 1. Fetch Sales Report API
   const salesReportResponse = await fetch(
     `https://www.eventbriteapi.com/v3/organizations/${eventbriteOrgId}/reports/sales/?event_ids=${event.eventbrite_id}`,
     { headers: { 'Authorization': `Bearer ${eventbriteToken}` } }
   );

   // 2. Parse response
   const reportJson = await salesReportResponse.json();

   // 3. Extract totals
   const totals = reportJson.totals;

   // 4. Store in processed object
   processed.total_tickets_sold = totals.quantity || 0;
   processed.gross_revenue = parseFloat(totals.gross || '0');
   processed.total_fees = parseFloat(totals.fees || '0');
   processed.net_deposit = parseFloat(totals.net || '0');  // ← CRITICAL
   processed.ticket_revenue = processed.net_deposit + processed.total_fees;
   processed.currency_code = totals.currency || 'USD';

   // 5. Use processed.net_deposit everywhere (NOT a separate netDeposit variable)
   ```

---

## 📊 Working Data Structure

### Sales Report API Response
```json
{
  "timezone": "America/Toronto",
  "event_ids": ["1451316880859"],
  "data": [
    // Daily breakdowns...
  ],
  "totals": {
    "currency": "CAD",
    "gross": "5071.97",      // Total charged to buyers
    "net": "4569.28",        // What organizer receives ← THE KEY NUMBER
    "quantity": 249,         // Total tickets
    "fees": "502.69"         // Total fees (EB + payment processing)
  }
}
```

### How to Process
```typescript
processed = {
  total_tickets_sold: totals.quantity,
  gross_revenue: parseFloat(totals.gross),
  total_fees: parseFloat(totals.fees),
  net_deposit: parseFloat(totals.net),  // ← Store directly from API
  ticket_revenue: parseFloat(totals.net) + parseFloat(totals.fees),  // Calculate

  // Note: Organization API doesn't break down fees/taxes separately
  eventbrite_fees: parseFloat(totals.fees),  // Attribute all fees to EB
  payment_processing_fees: 0,
  taxes_collected: 0,

  currency_code: totals.currency
};
```

---

## 🚨 CRITICAL LESSONS LEARNED

### DO NOT DO THIS:
1. **Don't declare `netDeposit` as a separate variable**
   - Use `processed.net_deposit` consistently throughout

2. **Don't reference removed code**
   - If you remove Orders API, remove ALL references to `orders` array

3. **Don't make assumptions about working code**
   - The Sales Report API structure is different from Orders API
   - Organization endpoint is different from user endpoint

### DO THIS:
1. **Use Sales Report API totals directly**
   - `totals.net` = net deposit (THE answer we need)
   - `totals.gross` = gross revenue
   - `totals.fees` = total fees
   - `totals.quantity` = tickets sold

2. **Store in processed object immediately**
   - No intermediate variables
   - Use `processed.net_deposit` everywhere

3. **Test after EVERY change**
   - Deploy
   - Test with curl
   - Verify response before moving on

---

## 🎯 Expected Working Response

```json
{
  "success": true,
  "source": "api",
  "event_eid": "AB2938",
  "ticket_data": {
    "total_sold": 249,
    "gross_revenue": 5071.97,
    "total_fees": 502.69,
    "net_deposit": 4569.28,  // ← MATCHES EVENTBRITE DASHBOARD
    "currency_code": "CAD",
    "average_ticket_price": "20.37",
    "average_net_per_ticket": "18.35"
  },
  "debug": {
    "api_method_used": "sales_report",
    "sales_report_api_success": true,
    "sales_report_status_code": 200,
    "organization_id": "263333410230"
  }
}
```

---

## 📝 Quick Recovery Steps

1. **Verify secrets are still set:**
   ```bash
   supabase secrets list | grep -E "EVENTBRITE|EB_ORG"
   ```

2. **Test API directly first:**
   ```bash
   curl "https://www.eventbriteapi.com/v3/organizations/263333410230/reports/sales/?event_ids=1451316880859" \
     -H "Authorization: Bearer 7LME6RSW6TFLEFBDS6DU" | jq '.totals'
   ```

   Should return:
   ```json
   {
     "currency": "CAD",
     "gross": "5071.97",
     "net": "4569.28",
     "quantity": 249,
     "fees": "502.69"
   }
   ```

3. **Fix the edge function:**
   - Remove duplicate variable declarations
   - Use `processed.net_deposit` consistently
   - Remove all `orders` references
   - Deploy

4. **Test the edge function:**
   ```bash
   curl -X POST 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/fetch-eventbrite-data' \
     -H 'Authorization: Bearer {JWT}' \
     -d '{"eid": "AB2938", "force_refresh": true}' | jq '.ticket_data.net_deposit'
   ```

   Should return: `4569.28`

---

## 🔑 Key Files

- **Edge Function:** `/root/vote_app/vote26/supabase/functions/fetch-eventbrite-data/index.ts`
- **Database Migration:** `/root/vote_app/vote26/migrations/20251002_eventbrite_api_cache.sql`
- **Admin UI:** `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx` (lines 1894-1990)

---

## ✅ Success Criteria

When it's working again:
1. API test returns correct totals (249 tickets, $4,569.28 net)
2. Edge function returns `success: true`
3. `net_deposit` matches Eventbrite dashboard
4. No BOOT_ERROR
5. Admin UI displays complete financial breakdown

---

**REMEMBER:** The Sales Report API was working perfectly. We just need to fix the variable scoping issues introduced during refactoring.
