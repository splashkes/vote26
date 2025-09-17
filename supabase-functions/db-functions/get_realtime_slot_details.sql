                                                          pg_get_functiondef                                                          
--------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_realtime_slot_details()                                                                       +
  RETURNS TABLE(slot_name text, slot_type text, active boolean, wal_lag_bytes bigint, confirmed_flush_lsn pg_lsn, restart_lsn pg_lsn)+
  LANGUAGE plpgsql                                                                                                                   +
  SECURITY DEFINER                                                                                                                   +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                    +
 AS $function$                                                                                                                       +
  BEGIN                                                                                                                              +
    RETURN QUERY                                                                                                                     +
    SELECT                                                                                                                           +
      rs.slot_name::text,                                                                                                            +
      rs.slot_type::text,                                                                                                            +
      rs.active,                                                                                                                     +
      COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), rs.confirmed_flush_lsn), 0) as wal_lag_bytes,                                   +
      rs.confirmed_flush_lsn,                                                                                                        +
      rs.restart_lsn                                                                                                                 +
    FROM pg_replication_slots rs                                                                                                     +
    WHERE rs.slot_name LIKE 'supabase_realtime%'                                                                                     +
    ORDER BY rs.slot_name;                                                                                                           +
  END;                                                                                                                               +
  $function$                                                                                                                         +
 
(1 row)

