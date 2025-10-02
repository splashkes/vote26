# Post-Event Admin Experience Implementation Plan
**Date:** September 27, 2025
**Status:** Phase 1 Complete (UI Framework)
**Next:** Data Integration

## Overview

Transform the EventDetail admin interface to provide distinct pre-event and post-event experiences, with collapsible sections and comprehensive post-event metrics focusing on auction sales, payment status, and ticket sales.

---

## Phase 1: UI Framework ✅ COMPLETED

### Completed Work
- [x] Added collapsible "Pre-Event Information" section
  - Contains: Basic Info, Date & Time, Location cards
  - Collapsible with ChevronUp/ChevronDown icons
  - State managed via `preEventCollapsed`

- [x] Created "Post-Event Summary" section (shown only for completed events)
  - Conditionally renders based on `status.label === 'Completed'`
  - Collapsible with `postEventCollapsed` state
  - Contains placeholder UI for:
    - Auction Sales Summary card
    - Unpaid Paintings card
    - No Bid Paintings card
    - Ticket Sales summary row

---

## Phase 2: Data Integration (IN PROGRESS)

### 2.1 Create Edge Function: `get-event-post-summary`

**Purpose:** Single endpoint to fetch all post-event metrics

**Location:** `/root/vote_app/vote26/supabase/functions/get-event-post-summary/`

**Input Parameters:**
```typescript
{
  event_id: UUID  // or event_eid: string
}
```

**Expected Output:**
```typescript
{
  success: boolean,
  event_id: UUID,
  event_eid: string,

  auction_summary: {
    total_artworks: number,
    artworks_with_bids: number,
    artworks_without_bids: number,

    total_top_bids_amount: number,        // Sum of all winning bids
    total_paid_online: number,            // Stripe payments
    total_paid_partner: number,           // Partner/cash payments

    tax_collected_online: number,
    tax_collected_partner: number,

    currency_code: string,
    currency_symbol: string
  },

  unpaid_paintings: {
    count: number,
    list: [
      {
        art_code: string,
        art_id: UUID,
        artist_name: string,
        winning_bid: number,
        buyer_name: string,
        buyer_email: string,
        buyer_phone: string,
        payment_status: string,
        days_since_bid: number
      }
    ]
  },

  no_bid_paintings: {
    count: number,
    list: [
      {
        art_code: string,
        art_id: UUID,
        artist_name: string,
        round: number,
        easel: number
      }
    ]
  },

  ticket_sales: {
    total_sold: number,
    total_revenue: number,
    online_sales: number,
    door_sales: number,
    // Note: May need Eventbrite API integration
  }
}
```

**Existing Database Functions to Reference:**
- `get_admin_auction_details(p_event_id, p_admin_phone)` - Bidder and auction info
- `get_payment_logs_admin(p_event_id)` - Payment logs
- `get_payment_statuses_admin(p_event_id)` - Payment status descriptions
- Existing query in `auction-csv-export` function shows how to join artworks + payments

**Key Database Tables:**
```sql
-- Core artwork and bids
art (id, event_id, art_code, round, easel, status, current_bid, artist_id)
bids (art_id, amount, person_id, created_at)

-- Payment tracking
payment_processing (art_id, status, metadata, stripe_payment_intent_id)
payment_logs (art_id, payment_method, actual_amount_collected, actual_tax_collected)
payment_statuses (id, description)

-- Artist info
artist_profiles (id, name, entry_id)

-- Ticket sales (TBD - may be in separate system)
```

**Implementation Steps:**
1. Create function skeleton with CORS headers
2. Fetch event details and validate
3. Query artworks with bids using existing patterns from auction-csv-export
4. Calculate auction summary metrics:
   - Group by payment method (online/partner)
   - Sum tax collections
   - Identify unpaid (has bid, no completed payment)
   - Identify no-bid (current_bid null or 0, no bids in bids table)
5. Format response with proper currency handling
6. Add comprehensive error handling and logging

**Authentication:**
- Requires JWT token
- Admin-level access check
- Use service role key for data queries

---

### 2.2 Update EventDetail Component

**File:** `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx`

**Add State:**
```javascript
const [postEventData, setPostEventData] = useState(null);
const [postEventLoading, setPostEventLoading] = useState(false);
const [unpaidModalOpen, setUnpaidModalOpen] = useState(false);
const [noBidModalOpen, setNoBidModalOpen] = useState(false);
```

**Add Data Fetching:**
```javascript
const fetchPostEventData = async () => {
  if (status.label !== 'Completed') return;

  setPostEventLoading(true);
  try {
    const { data, error } = await supabase.functions.invoke('get-event-post-summary', {
      body: { event_id: event.id }
    });

    if (error) throw error;
    setPostEventData(data);
  } catch (err) {
    console.error('Error fetching post-event data:', err);
  } finally {
    setPostEventLoading(false);
  }
};

useEffect(() => {
  if (event && status.label === 'Completed') {
    fetchPostEventData();
  }
}, [event, status]);
```

**Update Render - Replace Placeholders:**

**Auction Summary Card:**
```jsx
<Flex justify="between">
  <Text size="2" color="gray">Total Top Bids:</Text>
  <Text size="2" weight="bold">
    {postEventData?.auction_summary?.currency_symbol}
    {postEventData?.auction_summary?.total_top_bids_amount?.toFixed(2) || '0.00'}
  </Text>
</Flex>
// ... similar for other metrics
```

**Unpaid Paintings Card:**
```jsx
<Badge color="orange" size="2">
  {postEventData?.unpaid_paintings?.count || 0} paintings unpaid
</Badge>
<Button size="1" variant="soft" mt="2" onClick={() => setUnpaidModalOpen(true)}>
  View List
</Button>
```

**No Bid Paintings Card:**
```jsx
<Badge color="gray" size="2">
  {postEventData?.no_bid_paintings?.count || 0} paintings
</Badge>
<Button size="1" variant="soft" mt="2" onClick={() => setNoBidModalOpen(true)}>
  View List
</Button>
```

---

### 2.3 Add Detail Modals

**Unpaid Paintings Modal:**
```jsx
<Dialog.Root open={unpaidModalOpen} onOpenChange={setUnpaidModalOpen}>
  <Dialog.Content maxWidth="800px">
    <Dialog.Title>Unpaid Paintings</Dialog.Title>
    <ScrollArea>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Art Code</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Winning Bid</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Buyer</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Days Unpaid</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {postEventData?.unpaid_paintings?.list?.map(painting => (
            <Table.Row key={painting.art_id}>
              <Table.Cell>{painting.art_code}</Table.Cell>
              <Table.Cell>{painting.artist_name}</Table.Cell>
              <Table.Cell>
                {postEventData.auction_summary.currency_symbol}{painting.winning_bid}
              </Table.Cell>
              <Table.Cell>
                <Flex direction="column" gap="1">
                  <Text size="2">{painting.buyer_name}</Text>
                  <Text size="1" color="gray">{painting.buyer_email}</Text>
                  <Text size="1" color="gray">{painting.buyer_phone}</Text>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Badge color={painting.days_since_bid > 7 ? 'red' : 'orange'}>
                  {painting.days_since_bid} days
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Button size="1" variant="soft">Send Reminder</Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
```

**No Bid Paintings Modal:**
```jsx
<Dialog.Root open={noBidModalOpen} onOpenChange={setNoBidModalOpen}>
  <Dialog.Content maxWidth="600px">
    <Dialog.Title>Paintings With No Bids</Dialog.Title>
    <ScrollArea>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Art Code</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Round</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Easel</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {postEventData?.no_bid_paintings?.list?.map(painting => (
            <Table.Row key={painting.art_id}>
              <Table.Cell>{painting.art_code}</Table.Cell>
              <Table.Cell>{painting.artist_name}</Table.Cell>
              <Table.Cell>{painting.round}</Table.Cell>
              <Table.Cell>{painting.easel}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
```

---

## Phase 3: Ticket Sales Integration

### Research Needed:
1. **Where is ticket data stored?**
   - Eventbrite API integration?
   - Local database table?
   - Check `events` table for eventbrite_id field usage

2. **Data Sources to Investigate:**
   - Check if there's an existing Eventbrite integration function
   - Look for ticket-related tables in database
   - Check if ticket data is manually entered or automatically synced

3. **Implementation Options:**
   - **Option A:** Eventbrite API integration
     - Use event.eventbrite_id to fetch ticket data
     - Cache results to avoid rate limits
   - **Option B:** Manual entry system
     - Add UI for admins to enter ticket sales data
     - Store in new `event_ticket_summary` table
   - **Option C:** Existing data integration
     - Find and use existing ticket data if already stored

---

## Phase 4: Additional Enhancements

### 4.1 Export Functionality
- Add "Export Post-Event Summary" button
- Generate PDF report with all metrics
- Use existing `auction-csv-export` as reference
- Include charts/visualizations

### 4.2 Comparison Metrics
- Show comparison to event averages
- Highlight above/below average metrics
- Show trends over time for venue/city

### 4.3 Action Items
- Send bulk payment reminders to unpaid buyers
- Generate follow-up reports for artists
- Track follow-up actions and completion

### 4.4 Smart Defaults
- Auto-collapse pre-event section for completed events
- Auto-expand post-event section for recently completed events
- Remember user preferences per event

---

## Technical Notes & Watchouts

### Currency Handling
- Always use event.cities.countries.currency_code
- Display with event.cities.countries.currency_symbol
- Handle null values gracefully

### Performance Considerations
- Post-event summary query may be expensive for large events
- Consider caching results after event completion
- Use service role key for efficient queries without RLS overhead

### Data Accuracy
- Payment status can change after event (late payments)
- Add "Last Updated" timestamp to summary
- Add refresh button for real-time data

### Edge Cases
- Events with no artworks
- Events with no bids at all
- Partial payment scenarios (deposits)
- Refunds and chargebacks

---

## Testing Checklist

- [ ] Test with upcoming event (pre-event only)
- [ ] Test with active event (pre-event only)
- [ ] Test with recently completed event (both sections)
- [ ] Test with old completed event (both sections)
- [ ] Test collapsible behavior
- [ ] Test with event with no bids
- [ ] Test with event with all paintings paid
- [ ] Test with event with mixed payment statuses
- [ ] Test modal interactions
- [ ] Test data refresh functionality
- [ ] Test with different currencies
- [ ] Test error handling (network failures)
- [ ] Test loading states

---

## Future Considerations

1. **Real-time Updates During Event**
   - Show live auction progress
   - Update metrics as bids come in
   - Show payment status changes in real-time

2. **Historical Analytics**
   - Compare current event to past events
   - Show venue/city trends
   - Artist performance over time

3. **Automated Reports**
   - Email summary to event organizers
   - Scheduled follow-ups for unpaid items
   - Artist payment reports

4. **Mobile Optimization**
   - Ensure collapsible sections work on mobile
   - Optimize table views for small screens
   - Add swipe gestures for modal navigation

---

## Questions for Product Owner

1. What ticket sales data sources are available?
2. Should we integrate with Eventbrite API or use manual entry?
3. What actions should be available from unpaid/no-bid lists?
4. Should post-event data be cached or always live?
5. Are there specific report formats needed for partners/venues?
6. Should we track follow-up actions on unpaid paintings?
7. What timeframe defines "recently completed" for auto-expand?

---

**Last Updated:** September 27, 2025
**Implementation Team:** Claude Code
**Next Steps:** Create `get-event-post-summary` edge function