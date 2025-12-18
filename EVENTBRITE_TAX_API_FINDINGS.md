# Eventbrite Tax API Findings

**Date:** 2025-12-18
**Investigation:** Tax breakdown in Eventbrite API responses

## Summary

The Eventbrite Sales Report API does **not** return tax breakdown. Tax data is only available through the Orders API with the `?expand=costs` parameter.

---

## API Endpoints Compared

### 1. Sales Report API (Currently Used)
```
GET /v3/organizations/{org_id}/reports/sales/?event_ids={event_id}
```

**Returns:**
```json
{
  "totals": {
    "currency": "CAD",
    "gross": "2468.88",
    "net": "2232.76",
    "quantity": 100,
    "fees": "236.12"
  }
}
```

**Fields:**
- `gross` - Total charged to customers (includes base price + organizer tax)
- `net` - Amount deposited to organizer (gross - fees, **includes tax organizer must remit**)
- `fees` - Eventbrite fees + payment processing fees
- `quantity` - Number of tickets sold

**Missing:** No tax breakdown. Tax is embedded in gross/net but not separated.

---

### 2. Orders API (Has Tax Data)
```
GET /v3/events/{event_id}/orders/?expand=costs
```

**Returns per order:**
```json
{
  "costs": {
    "base_price": {
      "display": "CA$40.00",
      "major_value": "40.00"
    },
    "eventbrite_fee": {
      "display": "CA$3.98",
      "major_value": "3.98"
    },
    "payment_fee": {
      "display": "CA$1.16",
      "major_value": "1.16"
    },
    "tax": {
      "display": "CA$5.86",
      "major_value": "5.86"
    },
    "gross": {
      "display": "CA$51.00",
      "major_value": "51.00"
    },
    "has_gts_tax": false,
    "fee_components": [],
    "tax_components": []
  }
}
```

**Fields:**
- `base_price` - Ticket price before tax
- `tax` - **Organizer tax** (sales tax collected on behalf of organizer)
- `eventbrite_fee` - Eventbrite's service fee
- `payment_fee` - Payment processing fee
- `gross` - Total paid by customer
- `has_gts_tax` - Whether Eventbrite's tax service is used
- `tax_components` - Breakdown of tax types (empty in sample)

---

## Math Breakdown (Sample Order)

| Component | Amount |
|-----------|--------|
| Base Price | $40.00 |
| Organizer Tax | $5.86 |
| Eventbrite Fee | $3.98 |
| Payment Fee | $1.16 |
| **Gross (Customer Pays)** | **$51.00** |
| **Fees (EB + Payment)** | **$5.14** |
| **Net Deposit** | **$45.86** |

**Important:** Net deposit ($45.86) **includes** the $5.86 tax that the organizer must remit to tax authorities.

---

## Current vs Required Data Flow

### Current (fetch-eventbrite-data)
```
Sales Report API → Cache → Display
- Shows: gross, net, fees
- Missing: tax breakdown
```

### Required
```
Sales Report API + Orders API → Aggregate tax → Cache → Display
- Shows: gross, net, fees, organizer_tax
```

---

## Implementation Options

### Option A: Aggregate from Orders (Accurate)
- Fetch all orders with `?expand=costs`
- Sum `costs.tax.value` across all orders
- Store in cache as `taxes_collected`
- **Pros:** Accurate, handles varied ticket types
- **Cons:** More API calls (paginated, ~50 orders per page)

### Option B: Calculate from Tax Rate (Estimate)
- Sample first few orders to determine tax rate
- Apply rate to gross revenue
- **Pros:** Fast, fewer API calls
- **Cons:** Inaccurate if tax rates vary by ticket class

### Option C: Use `tax_components` (If Available)
- Some events may have `tax_components` array populated
- Would give breakdown by tax type (HST, GST, PST, etc.)
- **Pros:** Most detailed
- **Cons:** Not always populated

---

## Database Schema Impact

Current `eventbrite_api_cache` table has:
- `taxes_collected` column (always 0 currently)

Need to populate this from Orders API aggregation.

---

## Tax Types in Eventbrite

1. **Organizer Tax** (`costs.tax`)
   - Sales tax configured by event organizer
   - Collected from customer, passed to organizer
   - Organizer responsible for remitting to government
   - **Included in net_deposit**

2. **Eventbrite Tax** (if applicable)
   - Tax on Eventbrite's fees (varies by jurisdiction)
   - Would appear in `fee_components` or separate field
   - **Not observed in sample data**

3. **GTS Tax** (`has_gts_tax`)
   - Eventbrite's Tax Service
   - When true, Eventbrite handles tax remittance
   - Was `false` in all samples checked

---

## Sample Event: Ottawa (AB3087)

| Metric | Value |
|--------|-------|
| Tickets Sold | 100 |
| Gross Revenue | $2,468.88 |
| Total Fees | $236.12 |
| Net Deposit | $2,232.76 |
| **Estimated Tax** | ~$290* |

*Estimated: 100 tickets at avg ~$2.90 tax per ticket based on sample orders

---

## Next Steps

1. Modify `fetch-eventbrite-data` to fetch orders with costs
2. Aggregate `costs.tax.value` across all orders
3. Store in `taxes_collected` column
4. Display in admin UI as "Tax: $X.XX" under Net Deposit

---

## Files Referenced

- `/root/vote_app/vote26/supabase/functions/fetch-eventbrite-data/index.ts`
- `/root/vote_app/vote26/supabase/functions/get-event-post-summary/index.ts`
- `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx`
