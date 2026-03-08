# 🚨 Art Battle Live Event - Quick Reference Commands

## 🎯 **Critical Status Checks (Copy-Paste Ready)**

### **Event Health Dashboard**
```sql
-- OVERALL EVENT STATUS
SELECT 
  e.eid,
  e.name,
  e.enabled,
  e.event_start_datetime,
  e.event_end_datetime,
  CASE 
    WHEN e.event_start_datetime <= NOW() AND e.event_end_datetime >= NOW() THEN '🟢 LIVE'
    WHEN e.event_start_datetime > NOW() THEN '🟡 UPCOMING'
    ELSE '🔴 ENDED'
  END as status,
  COUNT(DISTINCT a.id) as art_count,
  COUNT(DISTINCT er.person_id) as registered_people
FROM events e
LEFT JOIN art a ON e.id = a.event_id
LEFT JOIN event_registrations er ON e.id = er.event_id
WHERE e.eid = 'AB3046'  -- CHANGE EVENT ID HERE
GROUP BY e.id, e.eid, e.name, e.enabled, e.event_start_datetime, e.event_end_datetime;
```

### **Authentication Crisis Check**
```sql
-- AUTH HEALTH (Last 30 minutes)
SELECT * FROM get_auth_activity_summary(30);

-- UNLINKED USERS COUNT
SELECT COUNT(*) as unlinked_confirmed_users
FROM auth.users au
WHERE au.phone_confirmed_at IS NOT NULL
  AND au.id NOT IN (SELECT auth_user_id FROM people WHERE auth_user_id IS NOT NULL);
```

### **Voting System Status**
```sql
-- VOTE COUNT CONSISTENCY CHECK
WITH vote_counts AS (
  SELECT art_uuid, COUNT(*) as actual_votes
  FROM votes WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
  GROUP BY art_uuid
)
SELECT 
  a.art_code,
  a.easel,
  a.round,
  a.vote_count as stored,
  COALESCE(vc.actual_votes, 0) as actual,
  CASE 
    WHEN a.vote_count != COALESCE(vc.actual_votes, 0) THEN '❌ MISMATCH'
    ELSE '✅ OK'
  END as status
FROM art a
LEFT JOIN vote_counts vc ON a.id = vc.art_uuid
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
ORDER BY a.round, a.easel;
```

### **QR System Health**
```sql
-- QR ACTIVITY SUMMARY
SELECT 
  COUNT(DISTINCT pqs.person_id) as unique_scanners,
  COUNT(*) as total_scans,
  COUNT(CASE WHEN pqs.is_valid THEN 1 END) as valid_scans,
  ROUND(COUNT(CASE WHEN pqs.is_valid THEN 1 END)::numeric / COUNT(*)::numeric * 100, 2) as success_rate
FROM people_qr_scans pqs
WHERE pqs.event_id = (SELECT id FROM events WHERE eid = 'AB3046');  -- CHANGE EVENT

-- RECENT QR ACTIVITY
SELECT 
  pqs.scan_timestamp,
  p.phone,
  p.name,
  pqs.qr_code,
  pqs.is_valid,
  EXTRACT(MINUTES FROM (NOW() - pqs.scan_timestamp)) as minutes_ago
FROM people_qr_scans pqs
JOIN people p ON pqs.person_id = p.id
WHERE pqs.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
ORDER BY pqs.scan_timestamp DESC
LIMIT 10;
```

### **Auction System Health**
```sql
-- RECENT BIDDING ACTIVITY
SELECT 
  a.art_code,
  a.easel,
  b.amount,
  p.phone as bidder_phone,
  mask_name(p.name) as bidder_name,
  b.created_at as bid_time,
  EXTRACT(MINUTES FROM (NOW() - b.created_at)) as minutes_ago
FROM bids b
JOIN art a ON b.art_id = a.id
JOIN people p ON b.person_id = p.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
ORDER BY b.created_at DESC
LIMIT 10;

-- PAYMENT PROCESSING STATUS
SELECT 
  pp.status,
  COUNT(*) as count,
  MIN(pp.created_at) as oldest,
  MAX(pp.created_at) as newest
FROM payment_processing pp
WHERE pp.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
GROUP BY pp.status;
```

---

## 🚨 **Emergency Fix Commands**

### **CRITICAL: Only Run After Manual Validation**

#### **Fix Unlinked Users**
```sql
-- STEP 1: PREVIEW WHAT WILL BE FIXED (SAFE)
SELECT 
  au.id as auth_user_id,
  au.phone,
  au.created_at,
  au.phone_confirmed_at
FROM auth.users au
WHERE au.phone_confirmed_at IS NOT NULL
  AND au.id NOT IN (SELECT auth_user_id FROM people WHERE auth_user_id IS NOT NULL)
LIMIT 5;

-- STEP 2: EXECUTE FIX (ONLY AFTER APPROVAL)
-- SELECT * FROM emergency_fix_unlinked_users();
```

#### **Vote Count Recalculation**
```sql
-- PREVIEW VOTE COUNT ISSUES
SELECT 
  a.art_code,
  a.vote_count as stored_count,
  COUNT(v.id) as actual_count,
  COUNT(v.id) - COALESCE(a.vote_count, 0) as difference
FROM art a
LEFT JOIN votes v ON a.id = v.art_uuid
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
GROUP BY a.id, a.art_code, a.vote_count
HAVING COUNT(v.id) != COALESCE(a.vote_count, 0);

-- FIX VOTE COUNTS (ONLY AFTER APPROVAL)
-- UPDATE art SET vote_count = (
--   SELECT COUNT(*) FROM votes WHERE art_uuid = art.id
-- ) WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3046');
```

---

## 📊 **Real-Time Monitoring**

### **Live Event Dashboard**
```sql
-- CURRENT ACTIVITY PULSE
SELECT 
  'Last 5 minutes activity:' as timeframe,
  
  (SELECT COUNT(*) FROM votes 
   WHERE created_at >= NOW() - INTERVAL '5 minutes' 
   AND event_id = (SELECT id FROM events WHERE eid = 'AB3046')) as votes_cast,
   
  (SELECT COUNT(*) FROM bids 
   WHERE created_at >= NOW() - INTERVAL '5 minutes'
   AND art_id IN (SELECT id FROM art WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3046'))) as bids_placed,
   
  (SELECT COUNT(*) FROM people_qr_scans 
   WHERE scan_timestamp >= NOW() - INTERVAL '5 minutes'
   AND event_id = (SELECT id FROM events WHERE eid = 'AB3046')) as qr_scans,
   
  (SELECT COUNT(*) FROM event_registrations 
   WHERE registered_at >= NOW() - INTERVAL '5 minutes'
   AND event_id = (SELECT id FROM events WHERE eid = 'AB3046')) as new_registrations;
```

### **Error Detection**
```sql
-- RECENT SYSTEM ERRORS
SELECT 
  timestamp,
  service,
  operation,
  level,
  message,
  EXTRACT(MINUTES FROM (NOW() - timestamp)) as minutes_ago
FROM recent_errors
WHERE timestamp >= NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC
LIMIT 10;

-- FAILED AUTH ATTEMPTS
SELECT 
  COUNT(*) as failed_attempts,
  array_agg(DISTINCT phone) as phone_numbers
FROM event_auth_logs
WHERE created_at >= NOW() - INTERVAL '30 minutes'
  AND success = false
  AND event_id = (SELECT id FROM events WHERE eid = 'AB3046');  -- CHANGE EVENT
```

---

## 🎯 **User Troubleshooting**

### **Find User Issues**
```sql
-- USER LOOKUP BY PHONE
SELECT 
  p.phone,
  p.name,
  p.verified,
  p.created_at,
  au.phone_confirmed_at,
  er.registered_at as event_registration,
  COUNT(v.id) as votes_cast
FROM people p
LEFT JOIN auth.users au ON p.auth_user_id = au.id
LEFT JOIN event_registrations er ON p.id = er.person_id 
  AND er.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
LEFT JOIN votes v ON p.id = v.person_id 
  AND v.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
WHERE p.phone LIKE '%PHONE_NUMBER%'  -- REPLACE WITH ACTUAL PHONE
GROUP BY p.phone, p.name, p.verified, p.created_at, au.phone_confirmed_at, er.registered_at;

-- CHECK USER VOTE ELIGIBILITY  
SELECT cast_vote_secure('AB3046', 1, 1);  -- CHANGE EVENT, ROUND, EASEL
```

### **Art Piece Analysis**
```sql
-- ART PIECE DETAILS
SELECT 
  a.art_code,
  a.easel,
  a.round,
  a.status,
  ap.name as artist_name,
  a.vote_count,
  a.current_bid,
  a.bid_count,
  COUNT(v.id) as actual_votes
FROM art a
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN votes v ON a.id = v.art_uuid
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB3046')  -- CHANGE EVENT
GROUP BY a.id, a.art_code, a.easel, a.round, a.status, ap.name, a.vote_count, a.current_bid, a.bid_count
ORDER BY a.round, a.easel;
```

---

## 📱 **Quick Status Updates**

### **System Health Summary**
```sql
-- ONE-LINE HEALTH CHECK
SELECT 
  (SELECT COUNT(*) FROM slack_queue_health_check() WHERE health_status != 'OK') as queue_issues,
  (SELECT COUNT(*) FROM recent_errors WHERE timestamp >= NOW() - INTERVAL '15 minutes') as recent_errors,
  (SELECT COUNT(*) FROM auth.users WHERE phone_confirmed_at IS NOT NULL AND id NOT IN (SELECT auth_user_id FROM people WHERE auth_user_id IS NOT NULL)) as unlinked_users,
  'System Health Check' as status;
```

### **Event Progress Tracker**
```sql
-- CURRENT EVENT STATE
SELECT 
  e.eid,
  e.current_round,
  COUNT(DISTINCT v.person_id) as unique_voters,
  COUNT(v.id) as total_votes,
  COUNT(DISTINCT b.person_id) as unique_bidders,
  COUNT(b.id) as total_bids,
  MAX(b.amount) as highest_bid
FROM events e
LEFT JOIN votes v ON e.id = v.event_id
LEFT JOIN art a ON e.id = a.event_id
LEFT JOIN bids b ON a.id = b.art_id
WHERE e.eid = 'AB3046'  -- CHANGE EVENT
GROUP BY e.eid, e.current_round;
```

---

## 🎪 **Event ID Quick Change**

**To monitor a different event, simply replace `'AB3046'` with the target event EID throughout all queries.**

**Active Events:**
- AB3046 - Art Battle Philadelphia  
- AB3053 - Art Battle Wilmington
- AB3029 - Art Battle Berkeley
- AB3039 - Art Battle Lancaster

---

## 🚨 **Emergency Contacts**

**CRITICAL ISSUES:**
1. Run diagnostic queries first
2. Identify scope and impact
3. Get approval for any data modifications  
4. Execute fixes with monitoring
5. Verify resolution

**Remember: Always SELECT before UPDATE/DELETE!**