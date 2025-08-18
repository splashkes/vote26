#!/usr/bin/env python3
"""
Art Battle User Experience Monitor
Monitors database query performance, edge function execution times, 
and user experience metrics that affect voting/bidding performance.

Usage: python3 monitor-user-experience.py [--verbose] [--interval=30] [--alert-threshold=5000]
"""

import psycopg2
import json
import time
import argparse
import sys
from datetime import datetime, timedelta
from collections import defaultdict

# Database configuration
DB_CONFIG = {
    'host': 'db.xsqdkubgyqwpyvfltnrf.supabase.co',
    'port': 5432,
    'database': 'postgres',
    'user': 'postgres',
    'password': '6kEtvU9n0KhTVr5'
}

# ANSI color codes
class Colors:
    RED = '\033[0;31m'
    YELLOW = '\033[1;33m'
    GREEN = '\033[0;32m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color
    BOLD = '\033[1m'

def get_db_connection():
    """Create database connection with timeout"""
    try:
        conn = psycopg2.connect(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            database=DB_CONFIG['database'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            connect_timeout=10
        )
        return conn
    except Exception as e:
        print(f"{Colors.RED}Error connecting to database: {e}{Colors.NC}")
        return None

def format_duration(ms):
    """Format milliseconds to human readable format"""
    if ms < 1000:
        return f"{ms:.1f}ms"
    elif ms < 60000:
        return f"{ms/1000:.1f}s"
    else:
        return f"{ms/60000:.1f}m"

def format_bytes(bytes_val):
    """Format bytes to human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.1f}{unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.1f}TB"

def get_query_performance_stats(conn):
    """Get slow query statistics from pg_stat_statements"""
    cursor = conn.cursor()
    
    # Get slowest queries affecting user experience
    slow_queries = """
    SELECT 
        substring(query, 1, 100) as query_preview,
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time,
        rows/calls as avg_rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) as hit_ratio
    FROM pg_stat_statements 
    WHERE query ILIKE ANY(ARRAY['%vote%', '%bid%', '%art%', '%get_%', '%cast_%'])
    AND calls > 10
    ORDER BY mean_exec_time DESC 
    LIMIT 10;
    """
    
    cursor.execute(slow_queries)
    results = cursor.fetchall()
    
    return {
        'slow_queries': results,
        'timestamp': datetime.now()
    }

def get_function_performance_stats(conn):
    """Get edge function and stored procedure performance"""
    cursor = conn.cursor()
    
    # Check for function call statistics
    function_stats = """
    SELECT 
        schemaname,
        funcname,
        calls,
        total_time,
        self_time,
        CASE WHEN calls > 0 THEN total_time / calls ELSE 0 END as mean_time,
        CASE WHEN calls > 0 THEN self_time / calls ELSE 0 END as mean_self_time
    FROM pg_stat_user_functions 
    WHERE schemaname = 'public'
    AND calls > 0
    ORDER BY (CASE WHEN calls > 0 THEN total_time / calls ELSE 0 END) DESC 
    LIMIT 15;
    """
    
    cursor.execute(function_stats)
    results = cursor.fetchall()
    
    return {
        'function_stats': results,
        'timestamp': datetime.now()
    }

def get_table_performance_stats(conn):
    """Get table-level performance metrics"""
    cursor = conn.cursor()
    
    # Critical tables performance
    table_stats = """
    SELECT 
        schemaname,
        relname,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch,
        n_tup_ins,
        n_tup_upd,
        n_tup_del,
        n_live_tup,
        n_dead_tup,
        last_vacuum,
        last_autovacuum,
        vacuum_count,
        autovacuum_count
    FROM pg_stat_user_tables 
    WHERE relname IN ('votes', 'bids', 'art', 'round_contestants', 'events', 'people')
    ORDER BY seq_scan DESC;
    """
    
    cursor.execute(table_stats)
    results = cursor.fetchall()
    
    return {
        'table_stats': results,
        'timestamp': datetime.now()
    }

def get_connection_and_lock_stats(conn):
    """Get database connection and locking statistics"""
    cursor = conn.cursor()
    
    # Active connections
    connection_stats = """
    SELECT 
        state,
        COUNT(*) as connection_count,
        AVG(EXTRACT(EPOCH FROM (now() - query_start))) as avg_query_duration
    FROM pg_stat_activity 
    WHERE datname = 'postgres'
    GROUP BY state
    ORDER BY connection_count DESC;
    """
    
    cursor.execute(connection_stats)
    connection_results = cursor.fetchall()
    
    # Lock waits
    lock_stats = """
    SELECT 
        mode,
        COUNT(*) as lock_count
    FROM pg_locks 
    WHERE NOT granted
    GROUP BY mode;
    """
    
    cursor.execute(lock_stats)
    lock_results = cursor.fetchall()
    
    # Database size and cache hit ratio
    db_stats = """
    SELECT 
        pg_size_pretty(pg_database_size('postgres')) as database_size,
        (SELECT sum(blks_hit)*100/sum(blks_hit+blks_read) 
         FROM pg_stat_database 
         WHERE datname = 'postgres') as cache_hit_ratio;
    """
    
    cursor.execute(db_stats)
    db_results = cursor.fetchone()
    
    return {
        'connections': connection_results,
        'locks': lock_results,
        'database': db_results,
        'timestamp': datetime.now()
    }

def get_user_experience_metrics(conn):
    """Get specific user experience metrics for voting/bidding"""
    cursor = conn.cursor()
    
    # Recent voting activity and response times
    voting_metrics = """
    SELECT 
        COUNT(*) as votes_last_hour,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_vote_processing_time,
        MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) as max_vote_processing_time
    FROM votes 
    WHERE created_at > NOW() - INTERVAL '1 hour';
    """
    
    cursor.execute(voting_metrics)
    vote_results = cursor.fetchone()
    
    # Recent bidding activity
    bidding_metrics = """
    SELECT 
        COUNT(*) as bids_last_hour,
        AVG(amount) as avg_bid_amount,
        MAX(amount) as max_bid_amount
    FROM bids 
    WHERE created_at > NOW() - INTERVAL '1 hour';
    """
    
    cursor.execute(bidding_metrics)
    bid_results = cursor.fetchone()
    
    # Active events and rounds
    event_metrics = """
    SELECT 
        COUNT(DISTINCT e.id) as active_events,
        COUNT(DISTINCT r.id) as active_rounds,
        COUNT(DISTINCT a.id) as artworks_in_current_rounds
    FROM events e
    LEFT JOIN rounds r ON e.id = r.event_id
    LEFT JOIN round_contestants rc ON r.id = rc.round_id
    LEFT JOIN art a ON rc.art_id = a.id
    WHERE e.enabled = true AND e.show_in_app = true;
    """
    
    cursor.execute(event_metrics)
    event_results = cursor.fetchone()
    
    return {
        'voting': vote_results,
        'bidding': bid_results,
        'events': event_results,
        'timestamp': datetime.now()
    }

def print_header(interval):
    """Print monitoring header"""
    print(f"{Colors.BOLD}{'='*80}{Colors.NC}")
    print(f"{Colors.BOLD}Art Battle User Experience Monitor{Colors.NC}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Interval: {interval}s")
    print(f"Monitoring: Database queries, functions, user experience metrics")
    print(f"{Colors.BOLD}{'='*80}{Colors.NC}")

def print_query_performance(stats, verbose=False):
    """Print query performance statistics"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}📊 Query Performance (Top Slow Queries){Colors.NC}")
    print(f"{'Query Preview':<50} {'Calls':<8} {'Avg Time':<10} {'Max Time':<10} {'Hit%':<8}")
    print("-" * 90)
    
    for query in stats['slow_queries']:
        query_preview, calls, total_time, mean_time, max_time, avg_rows, hit_ratio = query
        
        # Color code based on performance
        if mean_time > 1000:  # > 1 second
            color = Colors.RED
            status = "CRITICAL"
        elif mean_time > 500:  # > 500ms
            color = Colors.YELLOW
            status = "WARNING"
        else:
            color = Colors.GREEN
            status = "OK"
        
        hit_ratio_str = f"{hit_ratio:.1f}%" if hit_ratio else "N/A"
        
        print(f"{color}{query_preview[:50]:<50} {calls:<8} {format_duration(mean_time):<10} {format_duration(max_time):<10} {hit_ratio_str:<8}{Colors.NC}")
        
        if verbose and mean_time > 100:  # Show details for queries > 100ms
            print(f"  └─ Total time: {format_duration(total_time)}, Avg rows: {avg_rows:.1f}")

def print_function_performance(stats, verbose=False):
    """Print function performance statistics"""
    if not stats['function_stats']:
        return
        
    print(f"\n{Colors.BOLD}{Colors.CYAN}⚡ Function Performance{Colors.NC}")
    print(f"{'Function Name':<30} {'Calls':<8} {'Mean Time':<12} {'Self Time':<12}")
    print("-" * 65)
    
    for func in stats['function_stats']:
        schema, funcname, calls, total_time, self_time, mean_time, mean_self_time = func
        
        # Color code based on performance
        if mean_time > 1000:
            color = Colors.RED
        elif mean_time > 200:
            color = Colors.YELLOW
        else:
            color = Colors.GREEN
        
        print(f"{color}{funcname[:30]:<30} {calls:<8} {format_duration(mean_time):<12} {format_duration(mean_self_time):<12}{Colors.NC}")

def print_table_performance(stats, verbose=False):
    """Print table performance statistics"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}🗂️  Table Performance (Critical Tables){Colors.NC}")
    print(f"{'Table':<15} {'SeqScans':<10} {'IdxScans':<10} {'Live Tuples':<12} {'Dead Tuples':<12}")
    print("-" * 65)
    
    for table in stats['table_stats']:
        (schema, relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, 
         n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup, 
         last_vacuum, last_autovacuum, vacuum_count, autovacuum_count) = table
        
        # Color code based on sequential scan ratio
        if seq_scan > idx_scan and seq_scan > 100:
            color = Colors.RED  # Too many sequential scans
        elif seq_scan > idx_scan:
            color = Colors.YELLOW
        else:
            color = Colors.GREEN
        
        dead_ratio = n_dead_tup / max(n_live_tup, 1) if n_live_tup else 0
        dead_color = Colors.RED if dead_ratio > 0.1 else Colors.GREEN
        
        print(f"{color}{relname:<15}{Colors.NC} {seq_scan:<10} {idx_scan:<10} {n_live_tup:<12} {dead_color}{n_dead_tup:<12}{Colors.NC}")
        
        if verbose:
            print(f"  └─ Inserts: {n_tup_ins}, Updates: {n_tup_upd}, Deletes: {n_tup_del}")

def print_user_experience_metrics(stats):
    """Print user experience specific metrics"""
    print(f"\n{Colors.BOLD}{Colors.GREEN}👥 User Experience Metrics{Colors.NC}")
    
    voting = stats['voting']
    bidding = stats['bidding']
    events = stats['events']
    
    # Voting metrics
    votes_last_hour = voting[0] or 0
    avg_vote_time = voting[1] or 0
    max_vote_time = voting[2] or 0
    
    vote_color = Colors.RED if avg_vote_time > 2 else (Colors.YELLOW if avg_vote_time > 1 else Colors.GREEN)
    
    print(f"Votes (last hour): {vote_color}{votes_last_hour}{Colors.NC}")
    print(f"Avg vote processing: {vote_color}{avg_vote_time:.2f}s{Colors.NC}")
    if max_vote_time > 5:
        print(f"Max vote processing: {Colors.RED}{max_vote_time:.2f}s{Colors.NC}")
    
    # Bidding metrics
    bids_last_hour = bidding[0] or 0
    avg_bid = bidding[1] or 0
    max_bid = bidding[2] or 0
    
    print(f"Bids (last hour): {bids_last_hour}")
    if avg_bid > 0:
        print(f"Avg bid amount: ${avg_bid:.2f}")
    
    # Event metrics
    active_events = events[0] or 0
    active_rounds = events[1] or 0
    artworks = events[2] or 0
    
    print(f"Active events: {active_events}")
    print(f"Active rounds: {active_rounds}")
    print(f"Artworks in play: {artworks}")

def print_system_health(stats):
    """Print system health metrics"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}🔧 System Health{Colors.NC}")
    
    # Connection stats
    total_connections = sum(conn[1] for conn in stats['connections'])
    active_connections = next((conn[1] for conn in stats['connections'] if conn[0] == 'active'), 0)
    
    conn_color = Colors.RED if total_connections > 200 else (Colors.YELLOW if total_connections > 100 else Colors.GREEN)
    print(f"Total connections: {conn_color}{total_connections}{Colors.NC}")
    print(f"Active connections: {active_connections}")
    
    # Lock waits
    if stats['locks']:
        total_locks = sum(lock[1] for lock in stats['locks'])
        if total_locks > 0:
            print(f"{Colors.RED}Lock waits: {total_locks}{Colors.NC}")
    else:
        print(f"{Colors.GREEN}No lock waits{Colors.NC}")
    
    # Database stats
    db_size, cache_hit_ratio = stats['database']
    cache_color = Colors.RED if cache_hit_ratio < 90 else (Colors.YELLOW if cache_hit_ratio < 95 else Colors.GREEN)
    
    print(f"Database size: {db_size}")
    print(f"Cache hit ratio: {cache_color}{cache_hit_ratio:.1f}%{Colors.NC}")

def main():
    parser = argparse.ArgumentParser(description='Monitor Art Battle user experience metrics')
    parser.add_argument('--verbose', action='store_true', help='Show detailed output')
    parser.add_argument('--interval', type=int, default=30, help='Check interval in seconds')
    parser.add_argument('--alert-threshold', type=int, default=5000, 
                       help='Alert threshold for query time in milliseconds')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    
    args = parser.parse_args()
    
    # Test database connection
    print("Testing database connection...")
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to database. Exiting.")
        sys.exit(1)
    conn.close()
    print("Database connection successful.")
    
    if not args.once:
        print_header(args.interval)
    
    try:
        while True:
            conn = get_db_connection()
            if not conn:
                print(f"{Colors.RED}Lost database connection. Retrying...{Colors.NC}")
                time.sleep(5)
                continue
            
            try:
                # Collect all metrics
                query_stats = get_query_performance_stats(conn)
                function_stats = get_function_performance_stats(conn)
                table_stats = get_table_performance_stats(conn)
                connection_stats = get_connection_and_lock_stats(conn)
                ux_stats = get_user_experience_metrics(conn)
                
                # Print results
                if not args.once:
                    print(f"\n{Colors.BOLD}📍 {datetime.now().strftime('%H:%M:%S')} - Performance Check{Colors.NC}")
                
                print_query_performance(query_stats, args.verbose)
                print_function_performance(function_stats, args.verbose)
                print_table_performance(table_stats, args.verbose)
                print_user_experience_metrics(ux_stats)
                print_system_health(connection_stats)
                
                # Check for alerts
                slow_queries = [q for q in query_stats['slow_queries'] if q[3] > args.alert_threshold]
                if slow_queries:
                    print(f"\n{Colors.RED}🚨 ALERT: {len(slow_queries)} queries exceeding {args.alert_threshold}ms threshold{Colors.NC}")
                
            except Exception as e:
                print(f"{Colors.RED}Error collecting metrics: {e}{Colors.NC}")
            finally:
                conn.close()
            
            if args.once:
                break
                
            time.sleep(args.interval)
            
    except KeyboardInterrupt:
        print(f"\n{Colors.BOLD}Monitoring stopped by user{Colors.NC}")
        sys.exit(0)

if __name__ == "__main__":
    main()