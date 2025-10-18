# Auction Closing Process Improvement Plan

## Current State Analysis
The current auction system has a single global timer for all artworks across all rounds. When the admin starts a 12-minute auction timer, it sets the closing time for ALL active artworks in the event simultaneously.

### Current Issues:
1. **Lack of granularity**: Cannot control auction timing per round
2. **All-or-nothing approach**: All paintings close at once, regardless of round
3. **No round-specific countdown displays**: Admin panel shows only one global timer
4. **Confusing for multi-round events**: Later rounds may need different timing

### Current Function Behavior:
- `manage_auction_timer(p_event_id, p_action, p_duration_minutes)` operates on ALL artworks
- Updates all active artworks with the same closing time
- No round filtering capability

## Proposed Improvements

### 1. Per-Round Auction Control
**Implementation**: Modify the auction timer system to support round-specific operations

#### Database Changes:
```sql
-- New function: manage_auction_timer_by_round
CREATE OR REPLACE FUNCTION public.manage_auction_timer_by_round(
    p_event_id UUID,
    p_round_number INTEGER,
    p_action TEXT,
    p_duration_minutes INTEGER DEFAULT 12,
    p_admin_phone TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_closing_time TIMESTAMP WITH TIME ZONE;
    v_updated_count INT := 0;
BEGIN
    -- Validate inputs
    IF p_action NOT IN ('start', 'extend', 'cancel', 'close_now') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid action'
        );
    END IF;

    CASE p_action
        WHEN 'start' THEN
            v_closing_time := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;

            -- Update only artworks in the specified round
            UPDATE art
            SET
                closing_time = v_closing_time,
                auction_extended = false,
                extension_count = 0,
                updated_at = NOW()
            WHERE
                event_id = p_event_id
                AND round = p_round_number
                AND status = 'active'
                AND closing_time IS NULL;

            GET DIAGNOSTICS v_updated_count = ROW_COUNT;

            RETURN jsonb_build_object(
                'success', true,
                'message', format('Started %s minute timer for Round %s',
                    p_duration_minutes, p_round_number),
                'closing_time', v_closing_time,
                'artworks_updated', v_updated_count,
                'round', p_round_number
            );

        -- Similar implementations for extend, cancel, close_now...
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Frontend AdminPanel.jsx Updates

#### A. Round-Specific Timer Buttons
Replace the single global timer button with per-round controls:

```jsx
// In AuctionItemsList component
const AuctionRoundControls = ({ round, artworks }) => {
  const activeArtworks = artworks.filter(a =>
    a.round === round && a.status === 'active' && a.artist_id
  );
  const timedArtworks = activeArtworks.filter(a => a.closing_time);
  const untimedArtworks = activeArtworks.filter(a => !a.closing_time);

  // Calculate earliest closing time for this round
  const earliestClosing = timedArtworks.reduce((min, artwork) => {
    const closeTime = new Date(artwork.closing_time);
    return !min || closeTime < min ? closeTime : min;
  }, null);

  const timeRemaining = earliestClosing ?
    Math.max(0, earliestClosing - localTime) : 0;

  return (
    <Card size="2" style={{ marginBottom: '1rem' }}>
      <Flex justify="between" align="center">
        <Box>
          <Text size="4" weight="bold">Round {round}</Text>
          <Text size="2" color="gray">
            {activeArtworks.length} artworks
            ({timedArtworks.length} with timers)
          </Text>
        </Box>

        {timedArtworks.length > 0 ? (
          <Box>
            <Text size="5" weight="bold" style={{
              color: timeRemaining < 60000 ? 'var(--red-11)' : 'var(--green-11)'
            }}>
              {(() => {
                const minutes = Math.floor(timeRemaining / 60000);
                const seconds = Math.floor((timeRemaining % 60000) / 1000);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
              })()}
            </Text>
            <Flex gap="2" mt="2">
              <Button
                size="1"
                variant="soft"
                onClick={() => handleRoundTimerAction(round, 'extend', 5)}
                disabled={timerActionLoading}
              >
                +5 min
              </Button>
              <Button
                size="1"
                color="red"
                variant="soft"
                onClick={() => setConfirmCancelRoundTimer(round)}
                disabled={timerActionLoading}
              >
                Cancel
              </Button>
            </Flex>
          </Box>
        ) : (
          untimedArtworks.length > 0 && (
            <Button
              size="2"
              variant="solid"
              onClick={() => handleRoundTimerAction(round, 'start', 12)}
              disabled={timerActionLoading}
            >
              Start 12min Auction
            </Button>
          )
        )}
      </Flex>
    </Card>
  );
};
```

#### B. Update Main Auction Tab Content
```jsx
<Tabs.Content value="auction">
  <Flex direction="column" gap="4">
    {/* Overview Statistics */}
    <Card size="2">
      <Heading size="3" mb="3">Auction Overview</Heading>
      <Grid columns="4" gap="3">
        <Box>
          <Text size="5" weight="bold">{auctionArtworks.length}</Text>
          <Text size="1" color="gray">Total Artworks</Text>
        </Box>
        <Box>
          <Text size="5" weight="bold" color="green">
            {auctionArtworks.filter(a => a.status === 'active').length}
          </Text>
          <Text size="1" color="gray">Active</Text>
        </Box>
        <Box>
          <Text size="5" weight="bold" color="blue">
            {auctionArtworks.filter(a => a.closing_time).length}
          </Text>
          <Text size="1" color="gray">With Timers</Text>
        </Box>
        <Box>
          <Text size="5" weight="bold" color="orange">
            {Object.keys(auctionBids).length}
          </Text>
          <Text size="1" color="gray">With Bids</Text>
        </Box>
      </Grid>
    </Card>

    {/* Round-Specific Controls */}
    <Card size="2">
      <Heading size="3" mb="3">Round Auction Controls</Heading>
      {/* Group artworks by round and display controls */}
      {Object.entries(
        auctionArtworks.reduce((acc, artwork) => {
          const round = artwork.round || 'Unassigned';
          if (!acc[round]) acc[round] = [];
          acc[round].push(artwork);
          return acc;
        }, {})
      )
      .sort(([a], [b]) => {
        // Sort rounds numerically, with 'Unassigned' at the end
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return Number(a) - Number(b);
      })
      .map(([round, artworks]) => (
        <AuctionRoundControls
          key={round}
          round={round}
          artworks={artworks}
        />
      ))}
    </Card>

    {/* CSV Export */}
    <Card size="2">
      {/* Existing CSV export content */}
    </Card>

    {/* Auction Items List */}
    <Card size="2">
      <AuctionItemsList
        eventId={eventId}
        currentTime={localTime}
        roundTimers={roundTimers} // Pass round-specific timer data
      />
    </Card>
  </Flex>
</Tabs.Content>
```

#### C. Handler Functions
```jsx
const handleRoundTimerAction = async (roundNumber, action, duration = 12) => {
  try {
    setTimerActionLoading(true);

    const eventUuid = await getEventUuidFromEid(eventData.eid);

    const { data, error } = await supabase
      .rpc('manage_auction_timer_by_round', {
        p_event_id: eventUuid,
        p_round_number: roundNumber,
        p_action: action,
        p_duration_minutes: duration,
        p_admin_phone: null
      });

    if (error) throw error;

    if (data?.success) {
      showAdminMessage('success', data.message);
      // Update round-specific timer state
      setRoundTimers(prev => ({
        ...prev,
        [roundNumber]: {
          closing_time: data.closing_time,
          artworks_count: data.artworks_updated
        }
      }));
      fetchAuctionData();
    } else {
      showAdminMessage('error', data?.error || 'Failed to update timer');
    }
  } catch (error) {
    console.error('Timer action error:', error);
    showAdminMessage('error', 'Failed to update auction timer');
  } finally {
    setTimerActionLoading(false);
  }
};
```

### 3. Visual Enhancements

#### A. Round-Based Countdown Display
- Each round shows its own countdown timer
- Color coding:
  - Green: > 5 minutes remaining
  - Orange: 2-5 minutes remaining
  - Red: < 2 minutes remaining
  - Flashing red: < 30 seconds

#### B. Status Indicators
- Clear visual separation between rounds
- Show number of active/timed/sold artworks per round
- Visual progress bars for auction completion

### 4. Benefits of This Approach

1. **Granular Control**: Admins can manage each round's auction independently
2. **Better Event Flow**: Can start Round 1 auction while Round 2 is still painting
3. **Clearer UI**: Each round has its own timer and status
4. **Reduced Confusion**: Artists and bidders know exactly when their round closes
5. **Flexibility**: Different rounds can have different durations if needed

### 5. Migration Path

1. **Phase 1**: Add new database function without removing old one
2. **Phase 2**: Update frontend to use per-round controls
3. **Phase 3**: Test thoroughly with staging events
4. **Phase 4**: Deprecate old global timer function
5. **Phase 5**: Clean up old code and database functions

### 6. Testing Requirements

- Test with single-round events (should work like current system)
- Test with multi-round events (3+ rounds)
- Test edge cases:
  - Starting Round 2 timer while Round 1 is active
  - Extending specific round timers
  - Canceling one round's timer without affecting others
  - Closing all rounds simultaneously

### 7. Future Enhancements

- Add "Start All Rounds" button for convenience
- Allow custom duration per round
- Add notification preferences per round
- Create round-specific bidding analytics
- Support staggered round closings (e.g., 2-minute intervals)

## Implementation Timeline

- **Week 1**: Database function development and testing
- **Week 2**: Frontend UI updates and integration
- **Week 3**: Testing and bug fixes
- **Week 4**: Production deployment and monitoring

## Notes

- Remove the "Note: button may have errors..." warning text as requested
- Ensure backward compatibility during transition
- Consider adding feature flags for gradual rollout
- Monitor performance with multiple concurrent round timers