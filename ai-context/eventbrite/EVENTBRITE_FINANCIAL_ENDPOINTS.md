# Eventbrite API Financial Endpoints for Billing
**Created:** October 2, 2025
**Purpose:** Complete financial breakdown including fees, taxes, and net deposit

---

## 🎯 Critical Financial Data Requirements

For accurate billing, we need:
1. **Gross Revenue** - Total ticket sales before any fees
2. **Eventbrite Fees** - Service fees charged by Eventbrite
3. **Payment Processing Fees** - Credit card/payment gateway fees
4. **Taxes Collected** - Sales tax, VAT, GST, etc.
5. **Net Deposit** - Actual amount paid out to organizer
6. **Per-Order Breakdown** - Individual transaction details

---

## 📡 Key API Endpoints

### 1. **Orders Endpoint** (PRIMARY FOR FINANCIALS)
```
GET https://www.eventbriteapi.com/v3/events/{event_id}/orders/
```

**Query Parameters:**
- `status=placed` - Only completed orders
- `expand=attendees,event` - Include detailed info
- `changed_since=2025-01-01T00:00:00Z` - Incremental updates

**Response Structure:**
```json
{
  "pagination": {...},
  "orders": [
    {
      "id": "123456789",
      "created": "2025-10-01T14:30:00Z",
      "changed": "2025-10-01T14:30:05Z",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "placed",

      "costs": {
        "base_price": {
          "currency": "USD",
          "major_value": "35.00",
          "value": 3500,
          "display": "$35.00"
        },
        "eventbrite_fee": {
          "currency": "USD",
          "major_value": "3.09",
          "value": 309,
          "display": "$3.09"
        },
        "payment_fee": {
          "currency": "USD",
          "major_value": "1.42",
          "value": 142,
          "display": "$1.42"
        },
        "tax": {
          "currency": "USD",
          "major_value": "2.80",
          "value": 280,
          "display": "$2.80"
        },
        "gross": {
          "currency": "USD",
          "major_value": "42.31",
          "value": 4231,
          "display": "$42.31"
        }
      },

      "attendees": [
        {
          "ticket_class_name": "General Admission",
          "quantity": 2,
          "costs": {...}
        }
      ]
    }
  ]
}
```

**Key Financial Fields:**
- `costs.base_price` - Face value of tickets
- `costs.eventbrite_fee` - EB service fee (typically 3.7% + $1.79 per ticket in US)
- `costs.payment_fee` - Payment processing (typically 2.9% of total)
- `costs.tax` - Sales tax/VAT collected
- `costs.gross` - Total charged to buyer (base + fees + tax)

**Net Calculation:**
```
Net Deposit = base_price - eventbrite_fee - payment_fee
            = $35.00 - $3.09 - $1.42
            = $30.49 per ticket
```

---

### 2. **Event Report Endpoint** (AGGREGATED SUMMARY)
```
GET https://www.eventbriteapi.com/v3/reports/sales/?event_ids={event_id}
```

**Response Structure:**
```json
{
  "events": [
    {
      "event": {
        "id": "123456789",
        "name": "Art Battle Toronto"
      },
      "sales": {
        "quantity_sold": 150,
        "gross_sales": {
          "currency": "CAD",
          "major_value": "5250.00",
          "value": 525000,
          "display": "$5,250.00"
        },
        "net_sales": {
          "currency": "CAD",
          "major_value": "4572.00",
          "value": 457200,
          "display": "$4,572.00"
        },
        "tax": {
          "currency": "CAD",
          "major_value": "420.00",
          "value": 42000,
          "display": "$420.00"
        },
        "fees": {
          "eventbrite_fees": {
            "currency": "CAD",
            "major_value": "678.00",
            "value": 67800,
            "display": "$678.00"
          },
          "payment_processing_fees": {
            "currency": "CAD",
            "major_value": "152.25",
            "value": 15225,
            "display": "$152.25"
          }
        }
      }
    }
  ]
}
```

**This is the IDEAL endpoint for billing - aggregated totals with complete fee breakdown!**

---

### 3. **Ticket Classes** (For Capacity & Pricing)
```
GET https://www.eventbriteapi.com/v3/events/{event_id}/ticket_classes/
```

**Response Structure:**
```json
{
  "ticket_classes": [
    {
      "id": "123456",
      "name": "General Admission",
      "description": "Standard entry",
      "cost": {
        "currency": "USD",
        "major_value": "35.00",
        "value": 3500,
        "display": "$35.00"
      },
      "fee": {
        "currency": "USD",
        "major_value": "3.09",
        "value": 309,
        "display": "$3.09"
      },
      "tax": {
        "currency": "USD",
        "major_value": "2.80",
        "value": 280,
        "display": "$2.80"
      },
      "quantity_total": 200,
      "quantity_sold": 150,
      "sales_start": "2025-08-01T00:00:00Z",
      "sales_end": "2025-10-01T23:59:59Z",
      "on_sale_status": "SOLD_OUT"
    }
  ]
}
```

---

## 💾 Updated Database Schema

Add financial breakdown fields to `eventbrite_api_cache`:

```sql
-- Add these columns to eventbrite_api_cache table
ALTER TABLE eventbrite_api_cache
  -- Gross financials (what buyers paid)
  ADD COLUMN gross_revenue NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN ticket_revenue NUMERIC(10,2) DEFAULT 0,  -- Face value only

  -- Fees breakdown
  ADD COLUMN eventbrite_fees NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN payment_processing_fees NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN total_fees NUMERIC(10,2) DEFAULT 0,

  -- Taxes
  ADD COLUMN taxes_collected NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN tax_rate NUMERIC(5,4),  -- e.g., 0.0800 for 8%

  -- Net (what organizer receives)
  ADD COLUMN net_deposit NUMERIC(10,2) GENERATED ALWAYS AS
    (ticket_revenue - COALESCE(eventbrite_fees, 0) - COALESCE(payment_processing_fees, 0)) STORED,

  -- Additional details
  ADD COLUMN fee_structure JSONB,  -- Detailed breakdown by ticket class
  ADD COLUMN payout_status VARCHAR(50),  -- 'pending', 'processing', 'completed'
  ADD COLUMN payout_date TIMESTAMP,

  -- Validation
  ADD CONSTRAINT check_gross_calculation CHECK (
    gross_revenue = ticket_revenue + COALESCE(total_fees, 0) + COALESCE(taxes_collected, 0)
    OR gross_revenue = 0
  );

-- Add comment
COMMENT ON COLUMN eventbrite_api_cache.net_deposit IS
  'Calculated net amount paid to organizer after all fees (ticket_revenue - eventbrite_fees - payment_processing_fees)';
```

---

## 🔄 Updated API Integration Logic

```typescript
async function fetchEventbriteFinancials(eventbriteId: string) {

  // OPTION 1: Use Sales Report (RECOMMENDED - most accurate)
  const salesReport = await fetch(
    `https://www.eventbriteapi.com/v3/reports/sales/?event_ids=${eventbriteId}`,
    {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_API_TOKEN}`
      }
    }
  );

  const reportData = await salesReport.json();
  const eventSales = reportData.events[0]?.sales;

  if (eventSales) {
    return {
      // From sales report - most reliable
      tickets_sold: eventSales.quantity_sold,

      // Revenue breakdown
      gross_revenue: parseFloat(eventSales.gross_sales.major_value),
      net_revenue: parseFloat(eventSales.net_sales.major_value),
      ticket_revenue: parseFloat(eventSales.gross_sales.major_value) -
                     parseFloat(eventSales.tax.major_value),

      // Fees
      eventbrite_fees: parseFloat(eventSales.fees.eventbrite_fees.major_value),
      payment_processing_fees: parseFloat(eventSales.fees.payment_processing_fees.major_value),
      total_fees: parseFloat(eventSales.fees.eventbrite_fees.major_value) +
                 parseFloat(eventSales.fees.payment_processing_fees.major_value),

      // Tax
      taxes_collected: parseFloat(eventSales.tax.major_value),

      // Net deposit (what organizer gets)
      net_deposit: parseFloat(eventSales.net_sales.major_value),

      currency_code: eventSales.gross_sales.currency,

      data_source: 'eventbrite_sales_report'
    };
  }

  // OPTION 2: Fallback to Orders aggregation
  const orders = await fetchAllOrders(eventbriteId);
  return aggregateOrdersFinancials(orders);
}

function aggregateOrdersFinancials(orders) {
  let totals = {
    tickets_sold: 0,
    gross_revenue: 0,
    ticket_revenue: 0,
    eventbrite_fees: 0,
    payment_processing_fees: 0,
    taxes_collected: 0
  };

  orders.forEach(order => {
    if (order.status === 'placed') {
      totals.tickets_sold += order.attendees.length;
      totals.gross_revenue += parseFloat(order.costs.gross.major_value);
      totals.ticket_revenue += parseFloat(order.costs.base_price.major_value);
      totals.eventbrite_fees += parseFloat(order.costs.eventbrite_fee.major_value);
      totals.payment_processing_fees += parseFloat(order.costs.payment_fee.major_value);
      totals.taxes_collected += parseFloat(order.costs.tax.major_value);
    }
  });

  totals.total_fees = totals.eventbrite_fees + totals.payment_processing_fees;
  totals.net_deposit = totals.ticket_revenue - totals.total_fees;

  return totals;
}
```

---

## 📊 Updated Response Format

```typescript
// get-event-post-summary response
{
  ticket_sales: {
    // Quantities
    total_sold: 150,
    total_capacity: 200,

    // Revenue breakdown
    gross_revenue: 6345.00,        // What buyers paid total
    ticket_revenue: 5250.00,       // Face value of tickets
    taxes_collected: 420.00,       // Sales tax

    // Fees
    eventbrite_fees: 678.00,       // EB service fees (3.7% + $1.79/ticket)
    payment_processing_fees: 152.25, // Payment gateway (2.9%)
    total_fees: 830.25,

    // Net (THE CRITICAL NUMBER FOR BILLING)
    net_deposit: 4419.75,          // What organizer receives

    // Breakdown by ticket type
    by_ticket_class: [
      {
        name: "General Admission",
        price: 35.00,
        quantity_sold: 150,
        ticket_revenue: 5250.00,
        fees: 787.50,
        net_revenue: 4462.50
      }
    ],

    // Metadata
    currency_code: "CAD",
    currency_symbol: "$",
    average_ticket_price: 35.00,
    average_net_per_ticket: 29.46,

    // Data quality
    data_source: "Eventbrite Sales Report API",
    data_quality: 95,
    last_updated: "2025-10-02T14:30:00Z",

    // Payment status
    payout_status: "completed",
    payout_date: "2025-10-05T00:00:00Z"
  }
}
```

---

## 🎯 Billing Summary Display

For admin interface, show:

```
┌─────────────────────────────────────────────┐
│         TICKET SALES FINANCIAL SUMMARY       │
├─────────────────────────────────────────────┤
│                                              │
│  Tickets Sold:           150 / 200  (75%)   │
│                                              │
│  REVENUE BREAKDOWN:                          │
│  ├─ Ticket Revenue:           $5,250.00     │
│  ├─ Sales Tax Collected:        $420.00     │
│  └─ Gross Total:               $6,345.00     │
│                                              │
│  FEES DEDUCTED:                              │
│  ├─ Eventbrite Fees:            $678.00     │
│  └─ Payment Processing:         $152.25     │
│      Total Fees:               ($830.25)    │
│                                              │
│  ═══════════════════════════════════════    │
│  NET DEPOSIT TO ORGANIZER:     $4,419.75    │
│  ═══════════════════════════════════════    │
│                                              │
│  Average per ticket:                         │
│  • Face value:                   $35.00     │
│  • After fees:                   $29.46     │
│                                              │
│  Payout Status: ✓ Paid Oct 5, 2025          │
│  Data Source: Eventbrite API (98% quality)  │
└─────────────────────────────────────────────┘
```

---

## ⚠️ Critical Validation Rules

```typescript
function validateFinancialData(data) {
  const issues = [];

  // Rule 1: Gross should equal sum of parts
  const calculated_gross = data.ticket_revenue + data.taxes_collected + data.total_fees;
  if (Math.abs(calculated_gross - data.gross_revenue) > 0.02) {  // Allow 2 cent rounding
    issues.push('GROSS_REVENUE_MISMATCH');
  }

  // Rule 2: Net should equal ticket revenue minus fees
  const calculated_net = data.ticket_revenue - data.total_fees;
  if (Math.abs(calculated_net - data.net_deposit) > 0.02) {
    issues.push('NET_DEPOSIT_CALCULATION_ERROR');
  }

  // Rule 3: Fees should be positive if tickets sold
  if (data.tickets_sold > 0 && data.total_fees === 0) {
    issues.push('MISSING_FEE_DATA');
  }

  // Rule 4: Tax should be reasonable percentage
  if (data.taxes_collected > 0) {
    const tax_rate = data.taxes_collected / data.ticket_revenue;
    if (tax_rate < 0 || tax_rate > 0.25) {  // 0-25% reasonable range
      issues.push('UNUSUAL_TAX_RATE');
    }
  }

  // Rule 5: Net should never be negative
  if (data.net_deposit < 0) {
    issues.push('NEGATIVE_NET_DEPOSIT');
  }

  return {
    valid: issues.length === 0,
    issues,
    quality_score: Math.max(0, 100 - (issues.length * 20))
  };
}
```

---

## 🔑 Key Takeaways

1. **Use Sales Report API** (`/reports/sales/`) as primary source - gives complete breakdown
2. **Always store Net Deposit** - this is what matters for billing/accounting
3. **Track both gross and net** - needed for reconciliation
4. **Validate calculations** - ensure fees + tax + net = gross
5. **Handle currency properly** - Eventbrite uses minor units (cents)
6. **Cache payout status** - important for accounting timing

---

## 📋 Implementation Checklist

- [ ] Get Eventbrite API credentials with `reports:sales` scope
- [ ] Test Sales Report API with sample event
- [ ] Verify fee calculations match Eventbrite dashboard
- [ ] Update schema with all financial fields
- [ ] Implement validation rules
- [ ] Create billing summary UI component
- [ ] Add reconciliation report (compare to Eventbrite payouts)
- [ ] Document fee structure for different regions/currencies

---

**Next Step:** Test the Sales Report API endpoint with a real event to confirm data structure.
