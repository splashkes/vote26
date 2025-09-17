                                                                             pg_get_functiondef                                                                              
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.validate_input(input_text text, min_length integer DEFAULT 1, max_length integer DEFAULT 1000, allow_special_chars boolean DEFAULT false)+
  RETURNS boolean                                                                                                                                                           +
  LANGUAGE plpgsql                                                                                                                                                          +
  SET search_path TO 'public'                                                                                                                                               +
 AS $function$                                                                                                                                                              +
 BEGIN                                                                                                                                                                      +
     -- Check for null or empty                                                                                                                                             +
     IF input_text IS NULL OR LENGTH(trim(input_text)) = 0 THEN                                                                                                             +
         RETURN false;                                                                                                                                                      +
     END IF;                                                                                                                                                                +
                                                                                                                                                                            +
     -- Check length constraints                                                                                                                                            +
     IF LENGTH(input_text) < min_length OR LENGTH(input_text) > max_length THEN                                                                                             +
         RAISE EXCEPTION 'Input length must be between % and % characters', min_length, max_length;                                                                         +
     END IF;                                                                                                                                                                +
                                                                                                                                                                            +
     -- Check for SQL injection patterns                                                                                                                                    +
     IF input_text ~* '(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript|<script|onerror|onload)' THEN                                    +
         RAISE EXCEPTION 'Invalid input detected';                                                                                                                          +
     END IF;                                                                                                                                                                +
                                                                                                                                                                            +
     -- Check for special characters if not allowed                                                                                                                         +
     IF NOT allow_special_chars AND input_text ~ '[<>&"\''();--]' THEN                                                                                                      +
         RAISE EXCEPTION 'Special characters not allowed';                                                                                                                  +
     END IF;                                                                                                                                                                +
                                                                                                                                                                            +
     RETURN true;                                                                                                                                                           +
 END;                                                                                                                                                                       +
 $function$                                                                                                                                                                 +
 
(1 row)

