#!/bin/bash

# Event Linter Rule Validation Tool
# Usage: ./validate-rule.sh 14

RULE=$1
DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
PGPASSWORD="6kEtvU9n0KhTVr5"

export PGPASSWORD

if [ -z "$RULE" ]; then
  echo "Usage: ./validate-rule.sh <rule_number>"
  echo "Available rules: 2, 14, 19, 37"
  exit 1
fi

echo "============================================================"
echo "Validating Rule #$RULE"
echo "============================================================"
echo ""

case $RULE in
  14)
    echo "Rule: artist_payment_overdue - Artist Payment Overdue"
    echo ""

    echo "📋 Check art table has sale tracking"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        COUNT(*) as total_art,
        COUNT(CASE WHEN sold = true THEN 1 END) as sold_count,
        COUNT(sold_datetime) as has_sold_datetime,
        COUNT(CASE WHEN sold_datetime < NOW() - INTERVAL '14 days' THEN 1 END) as old_sales
      FROM art;
    "
    echo ""

    echo "📋 Check payment tracking exists"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        COUNT(DISTINCT a.id) as sold_art,
        COUNT(DISTINCT pa.id) as payment_attempts
      FROM art a
      LEFT JOIN payment_attempts pa ON pa.artist_id = a.artist_id
      WHERE a.sold = true;
    "
    echo ""

    echo "📋 Sample overdue payments"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        a.id,
        a.code,
        a.sold_datetime,
        EXTRACT(DAY FROM (NOW() - a.sold_datetime))::integer as days_overdue,
        ap.name as artist_name
      FROM art a
      LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
      WHERE a.sold = true
        AND a.sold_datetime < NOW() - INTERVAL '14 days'
      ORDER BY a.sold_datetime ASC
      LIMIT 5;
    "
    ;;

  2)
    echo "Rule: live_event_ended_no_results - Event Ended But No Results"
    echo ""

    echo "📋 Check events table structure"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        COUNT(*) as total_events,
        COUNT(event_end_datetime) as has_end_datetime,
        COUNT(CASE WHEN event_end_datetime < NOW() THEN 1 END) as completed_events
      FROM events;
    "
    echo ""

    echo "📋 Sample events without results"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        eid,
        name,
        event_end_datetime,
        EXTRACT(HOUR FROM (NOW() - event_end_datetime))::integer as hours_since_end
      FROM events
      WHERE event_end_datetime < NOW() - INTERVAL '30 minutes'
        AND event_end_datetime > NOW() - INTERVAL '7 days'
      LIMIT 5;
    "
    ;;

  19)
    echo "Rule: no_ad_campaign_for_event - No Marketing Campaign Found"
    echo ""

    echo "📋 Check Meta ads cache exists"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        COUNT(*) as total_cached,
        COUNT(DISTINCT event_id) as unique_events,
        MAX(created_at) as last_updated
      FROM ai_analysis_cache
      WHERE analysis_type = 'meta_ads';
    "
    echo ""

    echo "📋 Sample upcoming events"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        e.eid,
        e.name,
        e.event_start_datetime,
        EXTRACT(DAY FROM (e.event_start_datetime - NOW()))::integer as days_until
      FROM events e
      WHERE e.event_start_datetime > NOW()
        AND e.event_start_datetime < NOW() + INTERVAL '14 days'
      ORDER BY e.event_start_datetime
      LIMIT 5;
    "
    ;;

  37)
    echo "Rule: ticket_revenue_success - Ticket Revenue Exceeded Last Event"
    echo ""

    echo "📋 Check events have ticket revenue data"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      SELECT
        COUNT(*) as total_completed_events,
        COUNT(ticket_revenue) as events_with_revenue,
        COUNT(DISTINCT cities_id) as cities_count,
        ROUND(AVG(ticket_revenue)::numeric, 2) as avg_revenue
      FROM events
      WHERE event_end_datetime < NOW();
    "
    echo ""

    echo "📋 Cities with multiple events for comparison"
    psql -h $DB_HOST -p $DB_PORT -d $DB_NAME -U $DB_USER -c "
      WITH ranked_events AS (
        SELECT
          cities_id,
          eid,
          ticket_revenue,
          event_end_datetime,
          ROW_NUMBER() OVER (PARTITION BY cities_id ORDER BY event_end_datetime DESC) as rank
        FROM events
        WHERE event_end_datetime < NOW()
          AND ticket_revenue IS NOT NULL
      )
      SELECT
        cities_id,
        COUNT(*) as events_in_city,
        MAX(CASE WHEN rank = 1 THEN ticket_revenue END) as last_revenue,
        MAX(CASE WHEN rank = 2 THEN ticket_revenue END) as previous_revenue
      FROM ranked_events
      GROUP BY cities_id
      HAVING COUNT(*) >= 2
      ORDER BY events_in_city DESC
      LIMIT 5;
    "
    ;;

  *)
    echo "❌ Rule $RULE not found"
    echo "Available rules: 2, 14, 19, 37"
    exit 1
    ;;
esac

echo ""
echo "============================================================"
echo "✅ Validation complete for Rule #$RULE"
echo "============================================================"
