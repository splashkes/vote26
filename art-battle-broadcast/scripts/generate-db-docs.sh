#!/bin/bash

# Art Battle Database Documentation Generator
# Generates comprehensive database schema and data documentation
# Usage: ./scripts/generate-db-docs.sh [options]
# Options:
#   --tables-only     Only show table structure, no sample data
#   --sample-data     Include sample data from all tables
#   --summary-only    Only show database summary
#   --help           Show this help message

# Database connection settings
DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASS="6kEtvU9n0KhTVr5"

# Configuration
INCLUDE_SAMPLE_DATA=true
INCLUDE_TABLES=true
INCLUDE_SUMMARY=true
SAMPLE_ROWS=5

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tables-only)
      INCLUDE_SAMPLE_DATA=false
      shift
      ;;
    --sample-data)
      INCLUDE_SAMPLE_DATA=true
      shift
      ;;
    --summary-only)
      INCLUDE_TABLES=false
      INCLUDE_SAMPLE_DATA=false
      shift
      ;;
    --help)
      echo "Art Battle Database Documentation Generator"
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --tables-only     Only show table structure, no sample data"
      echo "  --sample-data     Include sample data from all tables (default)"
      echo "  --summary-only    Only show database summary"
      echo "  --help           Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 > database-docs.txt"
      echo "  $0 --tables-only > table-structure.txt"
      echo "  $0 --summary-only > db-summary.txt"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Function to execute SQL and handle errors
execute_sql() {
  local sql="$1"
  local description="$2"
  local timeout_secs="${3:-30}"
  
  echo "  [EXECUTING: $description...]" >&2
  
  local start_time=$(date +%s)
  timeout "$timeout_secs" bash -c "PGPASSWORD='$DB_PASS' psql -h '$DB_HOST' -p '$DB_PORT' -d '$DB_NAME' -U '$DB_USER' -t -c \"$sql\"" 2>/dev/null
  local exit_code=$?
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  
  if [[ $exit_code -eq 124 ]]; then
    echo "  [TIMEOUT: $description after ${timeout_secs}s]" >&2
    echo "ERROR: Query timed out after ${timeout_secs} seconds: $description"
    return 1
  elif [[ $exit_code -ne 0 ]]; then
    echo "  [FAILED: $description after ${duration}s]" >&2
    echo "ERROR: Failed to execute $description"
    return 1
  else
    echo "  [COMPLETED: $description in ${duration}s]" >&2
  fi
}

# Function to print section header
print_header() {
  local title="$1"
  local length=${#title}
  local border=$(printf "%*s" $((length + 20)) | tr ' ' '=')
  
  echo ""
  echo "$border"
  echo "          $title"
  echo "$border"
  echo ""
}

# Function to print sub-header
print_subheader() {
  local title="$1"
  local length=${#title}
  local border=$(printf "%*s" $((length + 4)) | tr ' ' '-')
  
  echo ""
  echo "  $title"
  echo "  $border"
  echo ""
}

# Generate database summary
generate_summary() {
  print_header "ART BATTLE DATABASE DOCUMENTATION"
  
  echo "Generated: $(date)"
  echo "Database: $DB_NAME@$DB_HOST"
  echo ""
  
  # Database overview
  execute_sql "
    SELECT 
      'Tables: ' || COUNT(*) 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  " "table count"
  
  execute_sql "
    SELECT 
      'Views: ' || COUNT(*) 
    FROM information_schema.views 
    WHERE table_schema = 'public';
  " "view count"
  
  execute_sql "
    SELECT 
      'Functions: ' || COUNT(*) 
    FROM information_schema.routines 
    WHERE routine_schema = 'public';
  " "function count"
  
  execute_sql "
    SELECT 
      'Total Database Size: ' || pg_size_pretty(pg_database_size('$DB_NAME'));
  " "database size"
  
  echo ""
}

# Generate table inventory
generate_table_inventory() {
  print_subheader "TABLE INVENTORY"
  
  execute_sql "
    SELECT 
      RPAD(t.table_name, 30) || ' | ' ||
      LPAD(COALESCE(s.n_live_tup::text, 'N/A'), 10) || ' rows | ' ||
      LPAD(COALESCE(pg_size_pretty(pg_total_relation_size('public.'||t.table_name)), 'N/A'), 12) || ' | ' ||
      COALESCE(s.last_autovacuum::date::text, 'Never')
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
    WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
    ORDER BY COALESCE(s.n_live_tup, 0) DESC;
  " "table inventory"
  
  echo ""
  echo "Format: TABLE_NAME | ROWS | SIZE | LAST_VACUUM"
  echo ""
}

# Generate detailed table structure
generate_table_structure() {
  if [[ "$INCLUDE_TABLES" != "true" ]]; then
    return
  fi
  
  print_subheader "TABLE STRUCTURES"
  
  # Get list of tables
  local tables=$(execute_sql "
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE' 
    ORDER BY table_name;
  " "table list")
  
  while IFS= read -r table; do
    table=$(echo "$table" | xargs) # trim whitespace
    if [[ -n "$table" ]]; then
      echo ""
      echo "TABLE: $table"
      echo "$(printf "%*s" ${#table} | tr ' ' '-')------"
      echo ""
      
      # Column details
      execute_sql "
        SELECT 
          '  ' || RPAD(column_name, 25) || ' | ' ||
          RPAD(data_type || 
            CASE 
              WHEN character_maximum_length IS NOT NULL 
              THEN '(' || character_maximum_length || ')'
              WHEN numeric_precision IS NOT NULL 
              THEN '(' || numeric_precision || 
                CASE WHEN numeric_scale > 0 THEN ',' || numeric_scale ELSE '' END || ')'
              ELSE ''
            END, 20) || ' | ' ||
          CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END || ' | ' ||
          COALESCE('DEFAULT ' || column_default, '')
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = '$table' 
        ORDER BY ordinal_position;
      " "columns for $table"
      
      echo ""
      echo "  Format: COLUMN_NAME | DATA_TYPE | NULLABLE | DEFAULT"
      echo ""
      
      # Foreign keys
      local fk_info=$(execute_sql "
        SELECT 
          '  FK: ' || kcu.column_name || ' -> ' || 
          ccu.table_name || '.' || ccu.column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name='$table'
        AND tc.table_schema = 'public';
      " "foreign keys for $table")
      
      if [[ -n "$fk_info" ]]; then
        echo "  Foreign Keys:"
        echo "$fk_info"
        echo ""
      fi
      
      # Indexes
      local index_info=$(execute_sql "
        SELECT 
          '  IDX: ' || i.relname || ' (' || string_agg(a.attname, ', ' ORDER BY a.attnum) || ')' ||
          CASE WHEN ix.indisunique THEN ' UNIQUE' ELSE '' END
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = '$table'
        AND t.relkind = 'r'
        AND i.relname NOT LIKE '%_pkey'
        GROUP BY i.relname, ix.indisunique
        ORDER BY i.relname;
      " "indexes for $table")
      
      if [[ -n "$index_info" ]]; then
        echo "  Indexes:"
        echo "$index_info"
        echo ""
      fi
    fi
  done
}

# Generate sample data
generate_sample_data() {
  if [[ "$INCLUDE_SAMPLE_DATA" != "true" ]]; then
    return
  fi
  
  print_subheader "SAMPLE DATA"
  
  # Get list of tables with row counts
  local tables_with_data=$(execute_sql "
    SELECT 
      t.table_name || '|' || COALESCE(s.n_live_tup, 0)
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
    WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
    AND COALESCE(s.n_live_tup, 0) > 0
    ORDER BY t.table_name;
  " "tables with data")
  
  while IFS='|' read -r table row_count; do
    table=$(echo "$table" | xargs)
    row_count=$(echo "$row_count" | xargs)
    
    if [[ -n "$table" && "$row_count" -gt 0 ]]; then
      echo ""
      echo "SAMPLE DATA: $table ($row_count rows)"
      echo "$(printf "%*s" $((${#table} + 20)) | tr ' ' '-')"
      echo ""
      
      echo "  [PROCESSING: Starting sample data for table: $table]" >&2
      
      # Get column names for header
      local columns=$(execute_sql "
        SELECT string_agg(column_name, ' | ' ORDER BY ordinal_position)
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = '$table';
      " "columns for $table" 10)
      
      echo "  $columns"
      echo "  $(printf "%*s" ${#columns} | tr ' ' '-')"
      echo ""
      
      # Simple fallback query for sample data
      echo "  [PROCESSING: Getting sample data for $table (timeout: 20s)]" >&2
      local sample_result=$(execute_sql "
        SELECT 
          '  ' || string_agg(
            CASE 
              WHEN length(col_val::text) > 50 THEN substring(col_val::text from 1 for 47) || '...'
              ELSE col_val::text
            END, 
            ' | '
          )
        FROM (
          SELECT row_to_json(t.*)::text as json_row
          FROM (
            SELECT * FROM $table 
            ORDER BY 
              CASE WHEN '$table' IN ('system_logs', 'artist_profiles') THEN random() ELSE 1 END
            LIMIT $SAMPLE_ROWS
          ) t
        ) sample
        CROSS JOIN LATERAL jsonb_each_text(json_row::jsonb) AS kv(col_name, col_val)
        WHERE col_name NOT ILIKE '%password%' 
        AND col_name NOT ILIKE '%secret%'
        GROUP BY json_row
        LIMIT $SAMPLE_ROWS;
      " "sample data for $table" 20)
      
      if [[ $? -eq 0 ]]; then
        echo "$sample_result"
      else
        echo "  [Sample data query failed or timed out for $table]"
        echo "  [Trying simple row count...]" >&2
        execute_sql "SELECT '  Table has ' || COUNT(*) || ' total rows' FROM $table;" "row count for $table" 5
      fi
      
      echo ""
    fi
  done < <(echo "$tables_with_data")
}

# Generate foreign key relationships
generate_relationships() {
  print_subheader "FOREIGN KEY RELATIONSHIPS"
  
  execute_sql "
    SELECT 
      '  ' || tc.table_name || '.' || kcu.column_name || 
      ' -> ' || ccu.table_name || '.' || ccu.column_name
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name;
  " "foreign key relationships"
  
  echo ""
}

# Generate functions and procedures
generate_functions() {
  print_subheader "STORED FUNCTIONS & PROCEDURES"
  
  execute_sql "
    SELECT 
      '  ' || routine_name || '(' || 
      COALESCE(
        string_agg(
          parameter_name || ' ' || data_type, 
          ', ' ORDER BY ordinal_position
        ), 
        ''
      ) || ') -> ' || 
      CASE 
        WHEN data_type = 'USER-DEFINED' THEN udt_name
        ELSE data_type 
      END
    FROM information_schema.routines r
    LEFT JOIN information_schema.parameters p 
      ON r.specific_name = p.specific_name 
      AND p.parameter_mode = 'IN'
    WHERE r.routine_schema = 'public'
    AND r.routine_type = 'FUNCTION'
    GROUP BY r.routine_name, r.data_type, r.udt_name
    ORDER BY r.routine_name;
  " "functions and procedures"
  
  echo ""
}

# Main execution
main() {
  # Test database connection
  if ! execute_sql "SELECT 1;" "connection test" >/dev/null 2>&1; then
    echo "ERROR: Cannot connect to database. Please check connection settings."
    exit 1
  fi
  
  # Generate documentation sections
  if [[ "$INCLUDE_SUMMARY" == "true" ]]; then
    generate_summary
    generate_table_inventory
    generate_relationships
    generate_functions
  fi
  
  if [[ "$INCLUDE_TABLES" == "true" ]]; then
    generate_table_structure
  fi
  
  if [[ "$INCLUDE_SAMPLE_DATA" == "true" ]]; then
    generate_sample_data
  fi
  
  echo ""
  echo "Documentation generated successfully!"
  echo "For help: $0 --help"
  echo ""
}

# Run main function
main