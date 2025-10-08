                                                             pg_get_functiondef                                                             
--------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_get_event_sponsorship_summary(p_event_id uuid)                                                    +
  RETURNS TABLE(total_invites integer, total_views integer, total_purchases integer, total_revenue numeric, invites jsonb, purchases jsonb)+
  LANGUAGE plpgsql                                                                                                                         +
  SECURITY DEFINER                                                                                                                         +
 AS $function$                                                                                                                             +
 BEGIN                                                                                                                                     +
   RETURN QUERY                                                                                                                            +
   SELECT                                                                                                                                  +
     (SELECT COUNT(*)::INTEGER FROM sponsorship_invites WHERE event_id = p_event_id),                                                      +
     (SELECT COALESCE(SUM(view_count), 0)::INTEGER FROM sponsorship_invites WHERE event_id = p_event_id),                                  +
     (SELECT COUNT(*)::INTEGER FROM sponsorship_purchases WHERE event_id = p_event_id AND payment_status = 'paid'),                        +
     (SELECT COALESCE(SUM(total_amount), 0) FROM sponsorship_purchases WHERE event_id = p_event_id AND payment_status = 'paid'),           +
     (                                                                                                                                     +
       SELECT jsonb_agg(                                                                                                                   +
         jsonb_build_object(                                                                                                               +
           'id', invite_data.id,                                                                                                           +
           'hash', invite_data.hash,                                                                                                       +
           'prospect_name', invite_data.prospect_name,                                                                                     +
           'prospect_email', invite_data.prospect_email,                                                                                   +
           'prospect_company', invite_data.prospect_company,                                                                               +
           'discount_percent', invite_data.discount_percent,                                                                               +
           'view_count', invite_data.view_count,                                                                                           +
           'last_viewed_at', invite_data.last_viewed_at,                                                                                   +
           'created_at', invite_data.created_at,                                                                                           +
           'has_purchase', EXISTS(SELECT 1 FROM sponsorship_purchases sp WHERE sp.invite_id = invite_data.id)                              +
         ) ORDER BY invite_data.created_at DESC                                                                                            +
       )                                                                                                                                   +
       FROM sponsorship_invites invite_data                                                                                                +
       WHERE invite_data.event_id = p_event_id                                                                                             +
     ),                                                                                                                                    +
     (                                                                                                                                     +
       SELECT jsonb_agg(                                                                                                                   +
         jsonb_build_object(                                                                                                               +
           'id', purchase_data.id,                                                                                                         +
           'buyer_name', purchase_data.buyer_name,                                                                                         +
           'buyer_email', purchase_data.buyer_email,                                                                                       +
           'buyer_company', purchase_data.buyer_company,                                                                                   +
           'total_amount', purchase_data.total_amount,                                                                                     +
           'currency', purchase_data.currency,                                                                                             +
           'discount_percent', purchase_data.discount_percent,                                                                             +
           'payment_status', purchase_data.payment_status,                                                                                 +
           'logo_url', purchase_data.logo_url,                                                                                             +
           'paid_at', purchase_data.paid_at,                                                                                               +
           'package_details', purchase_data.package_details                                                                                +
         ) ORDER BY purchase_data.created_at DESC                                                                                          +
       )                                                                                                                                   +
       FROM sponsorship_purchases purchase_data                                                                                            +
       WHERE purchase_data.event_id = p_event_id                                                                                           +
     );                                                                                                                                    +
 END;                                                                                                                                      +
 $function$                                                                                                                                +
 
(1 row)

