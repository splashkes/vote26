#!/usr/bin/env python3
"""
Artist Profile Link Health Monitor

This script monitors the health of artist_profile_id foreign key relationships
across applications, invitations, and confirmations tables.

Usage:
  python monitor_artist_profile_links.py                    # Full report
  python monitor_artist_profile_links.py --recent           # Recent records only
  python monitor_artist_profile_links.py --alert-threshold 5 # Alert if >5% broken
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import argparse
import sys
from datetime import datetime, timedelta

supabase_config = {
    'host': 'db.xsqdkubgyqwpyvfltnrf.supabase.co',
    'port': 5432,
    'user': 'postgres',
    'password': '6kEtvU9n0KhTVr5',
    'database': 'postgres'
}

def get_table_health(cursor, table_name, days_back=None):
    """Get health statistics for a specific table"""
    
    date_filter = ""
    date_field = {
        'artist_applications': 'applied_at',
        'artist_invitations': 'created_at', 
        'artist_confirmations': 'created_at'
    }.get(table_name, 'created_at')
    
    if days_back:
        date_filter = f"WHERE {date_field} >= NOW() - INTERVAL '{days_back} days'"
    
    # Get basic statistics
    cursor.execute(f"""
        SELECT COUNT(*) as total_records,
               COUNT(CASE WHEN artist_profile_id IS NOT NULL THEN 1 END) as linked_records,
               COUNT(CASE WHEN artist_profile_id IS NULL THEN 1 END) as broken_records,
               ROUND((COUNT(CASE WHEN artist_profile_id IS NOT NULL THEN 1 END)::numeric / COUNT(*)) * 100, 2) as linked_pct,
               MIN({date_field}) as oldest_record,
               MAX({date_field}) as newest_record
        FROM {table_name}
        {date_filter}
    """)
    
    basic_stats = cursor.fetchone()
    
    # Get fixability statistics
    date_filter_fixability = date_filter.replace(date_field, f't.{date_field}') if date_filter else ""
    cursor.execute(f"""
        SELECT COUNT(*) as broken_records,
               COUNT(CASE WHEN ap.id IS NOT NULL THEN 1 END) as fixable_records,
               ROUND((COUNT(CASE WHEN ap.id IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as fixable_pct
        FROM {table_name} t
        LEFT JOIN artist_profiles ap ON ap.entry_id::text = t.artist_number 
                                     OR ap.form_17_entry_id::text = t.artist_number
        WHERE t.artist_profile_id IS NULL
        {date_filter_fixability.replace('WHERE', 'AND') if date_filter_fixability else ''}
    """)
    
    fixability_stats = cursor.fetchone()
    
    # Get daily breakdown for recent records
    cursor.execute(f"""
        SELECT DATE({date_field}) as record_date,
               COUNT(*) as daily_total,
               COUNT(CASE WHEN artist_profile_id IS NOT NULL THEN 1 END) as daily_linked,
               COUNT(CASE WHEN artist_profile_id IS NULL THEN 1 END) as daily_broken
        FROM {table_name}
        WHERE {date_field} >= NOW() - INTERVAL '7 days'
        GROUP BY DATE({date_field})
        ORDER BY record_date DESC
    """)
    
    daily_breakdown = cursor.fetchall()
    
    return {
        'table_name': table_name,
        'basic_stats': basic_stats,
        'fixability_stats': fixability_stats,
        'daily_breakdown': daily_breakdown
    }

def check_recent_broken_records(cursor):
    """Check for any recently created records with broken links"""
    
    recent_broken = []
    
    for table_name in ['artist_applications', 'artist_invitations', 'artist_confirmations']:
        date_field = {
            'artist_applications': 'applied_at',
            'artist_invitations': 'created_at', 
            'artist_confirmations': 'created_at'
        }.get(table_name, 'created_at')
        
        cursor.execute(f"""
            SELECT id, artist_number, event_eid, {date_field} as record_date
            FROM {table_name}
            WHERE artist_profile_id IS NULL
            AND {date_field} >= NOW() - INTERVAL '24 hours'
            ORDER BY {date_field} DESC
            LIMIT 5
        """)
        
        broken_records = cursor.fetchall()
        if broken_records:
            recent_broken.append({
                'table': table_name,
                'records': broken_records
            })
    
    return recent_broken

def print_health_report(table_stats, recent_broken, args):
    """Print comprehensive health report"""
    
    print("=" * 80)
    print("🔗 ARTIST PROFILE LINK HEALTH MONITOR")
    print("=" * 80)
    print(f"Report generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    
    if args.recent:
        print(f"📊 Scope: Records from last {args.recent} days")
    else:
        print("📊 Scope: All historical records")
    
    print()
    
    # Summary table
    print("📋 SUMMARY TABLE")
    print("-" * 80)
    print(f"{'Table':<15} {'Total':<8} {'Linked':<8} {'Broken':<8} {'Link %':<8} {'Status':<10}")
    print("-" * 80)
    
    alert_tables = []
    
    for stats in table_stats:
        basic = stats['basic_stats']
        table_name = stats['table_name'].replace('artist_', '').title()
        
        # Determine status
        if basic['linked_pct'] >= 95:
            status = "✅ Good"
        elif basic['linked_pct'] >= 85:
            status = "⚠️  Warning" 
        else:
            status = "🚨 Alert"
            alert_tables.append(stats['table_name'])
        
        if args.alert_threshold and basic['linked_pct'] < (100 - args.alert_threshold):
            alert_tables.append(stats['table_name'])
        
        print(f"{table_name:<15} {basic['total_records']:<8,} {basic['linked_records']:<8,} "
              f"{basic['broken_records']:<8,} {basic['linked_pct']:<8}% {status:<10}")
    
    print()
    
    # Detailed breakdown
    for stats in table_stats:
        basic = stats['basic_stats']
        fixability = stats['fixability_stats'] 
        daily = stats['daily_breakdown']
        
        print(f"🔍 DETAILED: {stats['table_name'].upper()}")
        print("-" * 50)
        print(f"  Total Records: {basic['total_records']:,}")
        print(f"  Linked (Good): {basic['linked_records']:,} ({basic['linked_pct']}%)")
        print(f"  Broken Links:  {basic['broken_records']:,}")
        
        if fixability['broken_records'] > 0:
            print(f"  Fixable:       {fixability['fixable_records']:,} ({fixability['fixable_pct']}% of broken)")
            print(f"  Unfixable:     {fixability['broken_records'] - fixability['fixable_records']:,}")
        
        print(f"  Date Range:    {basic['oldest_record']} to {basic['newest_record']}")
        
        if daily and len(daily) > 0:
            print("  📅 Last 7 Days:")
            for day in daily:
                day_pct = (day['daily_linked'] / day['daily_total']) * 100 if day['daily_total'] > 0 else 0
                status = "✅" if day_pct == 100 else "⚠️" if day_pct >= 95 else "🚨"
                print(f"    {day['record_date']}: {day['daily_linked']}/{day['daily_total']} linked ({day_pct:.1f}%) {status}")
        
        print()
    
    # Recent broken records alert
    if recent_broken:
        print("🚨 RECENT BROKEN RECORDS (Last 24 Hours)")
        print("-" * 50)
        for item in recent_broken:
            print(f"📋 {item['table'].upper()}:")
            for record in item['records']:
                print(f"  • ID: {record['id']} | Artist: {record['artist_number']} | Event: {record['event_eid']} | Date: {record['record_date']}")
        print()
    
    # Alerts and recommendations
    if alert_tables:
        print("🚨 ALERTS & RECOMMENDATIONS")
        print("-" * 50)
        print(f"⚠️  Tables with linking issues: {', '.join(alert_tables)}")
        print("💡 Recommended actions:")
        print("   1. Run fixability analysis: Check which broken records can be auto-fixed")
        print("   2. Run bulk fix script: Fix linkable records using entry_id matching")
        print("   3. Investigate unfixable records: Check if artist_profiles are missing")
        print("   4. Monitor new record creation: Ensure UUID setting logic is working")
        print()
    else:
        print("✅ ALL SYSTEMS HEALTHY - No alerts detected")
        print()

def main():
    parser = argparse.ArgumentParser(description='Monitor artist profile link health')
    parser.add_argument('--recent', type=int, help='Only check records from last N days')
    parser.add_argument('--alert-threshold', type=float, default=5.0, 
                       help='Alert if broken percentage exceeds this threshold (default: 5%%)')
    parser.add_argument('--quiet', action='store_true', help='Only show alerts and errors')
    
    args = parser.parse_args()
    
    try:
        conn = psycopg2.connect(**supabase_config)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get health statistics for all tables
        table_stats = []
        for table_name in ['artist_applications', 'artist_invitations', 'artist_confirmations']:
            stats = get_table_health(cursor, table_name, args.recent)
            table_stats.append(stats)
        
        # Check for recent broken records
        recent_broken = check_recent_broken_records(cursor)
        
        if not args.quiet:
            print_health_report(table_stats, recent_broken, args)
        
        # Exit with error code if alerts detected
        alert_detected = False
        for stats in table_stats:
            if stats['basic_stats']['linked_pct'] < (100 - args.alert_threshold):
                alert_detected = True
                break
        
        if recent_broken:
            alert_detected = True
        
        if alert_detected:
            if args.quiet:
                print("🚨 ALERT: Artist profile linking issues detected")
            sys.exit(1)
        else:
            if args.quiet:
                print("✅ All artist profile links healthy")
            sys.exit(0)
            
    except Exception as e:
        print(f"💥 Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(2)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()