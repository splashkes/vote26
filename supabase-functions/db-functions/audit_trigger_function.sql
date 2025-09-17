                                                   pg_get_functiondef                                                    
-------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.audit_trigger_function()                                                             +
  RETURNS trigger                                                                                                       +
  LANGUAGE plpgsql                                                                                                      +
  SECURITY DEFINER                                                                                                      +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                       +
 AS $function$                                                                                                          +
  DECLARE                                                                                                               +
      old_data JSONB;                                                                                                   +
      new_data JSONB;                                                                                                   +
      operation_type TEXT;                                                                                              +
      sensitive_fields TEXT[] := ARRAY['phone', 'email', 'password', 'token', 'secret'];                                +
      clean_old JSONB;                                                                                                  +
      clean_new JSONB;                                                                                                  +
  BEGIN                                                                                                                 +
      -- Determine operation type                                                                                       +
      operation_type := TG_OP;                                                                                          +
                                                                                                                        +
      -- Handle different operation types                                                                               +
      IF TG_OP = 'DELETE' THEN                                                                                          +
          old_data := to_jsonb(OLD);                                                                                    +
          new_data := NULL;                                                                                             +
      ELSIF TG_OP = 'INSERT' THEN                                                                                       +
          old_data := NULL;                                                                                             +
          new_data := to_jsonb(NEW);                                                                                    +
      ELSIF TG_OP = 'UPDATE' THEN                                                                                       +
          old_data := to_jsonb(OLD);                                                                                    +
          new_data := to_jsonb(NEW);                                                                                    +
      END IF;                                                                                                           +
                                                                                                                        +
      -- Clean sensitive data from logs (keep audit secure but not overly detailed)                                     +
      IF old_data IS NOT NULL THEN                                                                                      +
          clean_old := old_data;                                                                                        +
          -- Remove sensitive fields                                                                                    +
          FOR i IN 1..array_length(sensitive_fields, 1) LOOP                                                            +
              IF clean_old ? sensitive_fields[i] THEN                                                                   +
                  clean_old := clean_old - sensitive_fields[i] || jsonb_build_object(sensitive_fields[i], '[REDACTED]');+
              END IF;                                                                                                   +
          END LOOP;                                                                                                     +
      END IF;                                                                                                           +
                                                                                                                        +
      IF new_data IS NOT NULL THEN                                                                                      +
          clean_new := new_data;                                                                                        +
          -- Remove sensitive fields                                                                                    +
          FOR i IN 1..array_length(sensitive_fields, 1) LOOP                                                            +
              IF clean_new ? sensitive_fields[i] THEN                                                                   +
                  clean_new := clean_new - sensitive_fields[i] || jsonb_build_object(sensitive_fields[i], '[REDACTED]');+
              END IF;                                                                                                   +
          END LOOP;                                                                                                     +
      END IF;                                                                                                           +
                                                                                                                        +
      -- Log the audit event                                                                                            +
      INSERT INTO security_audit_logs (                                                                                 +
          table_name,                                                                                                   +
          operation,                                                                                                    +
          user_id,                                                                                                      +
          user_role,                                                                                                    +
          old_data,                                                                                                     +
          new_data,                                                                                                     +
          function_name                                                                                                 +
      ) VALUES (                                                                                                        +
          TG_TABLE_NAME,                                                                                                +
          operation_type,                                                                                               +
          auth.uid(),                                                                                                   +
          CASE                                                                                                          +
              WHEN auth.uid() IN (SELECT user_id FROM abhq_admin_users WHERE active = true) THEN 'admin'                +
              WHEN auth.uid() IS NOT NULL THEN 'authenticated'                                                          +
              ELSE 'anonymous'                                                                                          +
          END,                                                                                                          +
          clean_old,                                                                                                    +
          clean_new,                                                                                                    +
          'audit_trigger'                                                                                               +
      );                                                                                                                +
                                                                                                                        +
      -- Return appropriate record                                                                                      +
      IF TG_OP = 'DELETE' THEN                                                                                          +
          RETURN OLD;                                                                                                   +
      ELSE                                                                                                              +
          RETURN NEW;                                                                                                   +
      END IF;                                                                                                           +
  END;                                                                                                                  +
  $function$                                                                                                            +
 
(1 row)

