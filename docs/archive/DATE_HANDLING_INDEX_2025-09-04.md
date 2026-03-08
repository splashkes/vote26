# Date Handling Index - Timezone Fix Requirements
**Created**: September 4, 2025  
**Issue**: Event dates stored in UTC but need to display in local venue time

## ROOT CAUSE
- PostgreSQL correctly stores timestamptz as UTC internally
- Issue is in **presentation layer** - need to convert UTC back to local venue time for display
- All locations below are currently showing UTC time instead of proper local venue time

---

## CRITICAL EMAIL TEMPLATE FIXES

### 1. **Email Templates - HIGHEST PRIORITY**
**File**: `/supabase/functions/_shared/emailTemplates.ts`
- **Issue**: Templates expect `eventDate: string` but it's formatted as UTC
- **Impact**: All artist emails show wrong times with timezone confusion
- **Fix Needed**: Update all email senders to convert UTC to local venue time

### 2. **Accept-Invitation Function**  
**File**: `/supabase/functions/accept-invitation/index.ts:251`
- **Current**: `new Date(eventData.event_start_datetime).toLocaleDateString('en-US', {...})`
- **Issue**: Shows UTC date, no time, no timezone conversion
- **Fix**: Convert to local venue time with proper AM/PM formatting

---

## ARTIST PORTAL FIXES

### 3. **EventApplications Component**
**File**: `/art-battle-artists/src/components/EventApplications.jsx:374-396`
- **Functions**: `formatDate()`, `formatDateTime()`
- **Locations**: Lines 574, 656, 702, 798
- **Issue**: All event times display in UTC instead of venue local time
- **Fix**: Add timezone conversion based on event city

### 4. **Home Component**
**File**: `/art-battle-artists/src/components/Home.jsx`
- **Usage**: Event date display in confirmations and invitations
- **Issue**: UTC time display
- **Fix**: Convert to local time with AM/PM

### 5. **InvitationAcceptanceModal**
**File**: `/art-battle-artists/src/components/InvitationAcceptanceModal.jsx`
- **Usage**: Event details in invitation modal
- **Issue**: UTC time display
- **Fix**: Local time conversion

---

## ADMIN INTERFACE FIXES

### 6. **Admin CreateEvent Component**
**File**: `/art-battle-admin/src/components/CreateEvent.jsx:156`
- **Function**: `formatDateTimeForInput()`
- **Issue**: May be formatting for admin display incorrectly
- **Fix**: Ensure admin sees local venue time during editing

### 7. **Admin EventDetail Component**
**File**: `/art-battle-admin/src/components/EventDetail.jsx`
- **Usage**: Event detail display in admin
- **Issue**: Likely showing UTC time
- **Fix**: Convert to local venue time

### 8. **Admin EventDashboard**
**File**: `/art-battle-admin/src/components/EventDashboard.jsx`
- **Usage**: Event listings and management
- **Issue**: UTC time display
- **Fix**: Local venue time conversion

---

## PUBLIC API FIXES

### 9. **Public Events API**
**File**: `/supabase/functions/v2-public-events/index.ts`
- **Usage**: Public API endpoint for events
- **Issue**: Returns UTC times to consumers
- **Fix**: Convert to local venue time or provide both UTC + local

### 10. **Public Event Detail API**
**File**: `/supabase/functions/v2-public-event/index.ts`  
- **Usage**: Single event API endpoint
- **Issue**: Returns UTC time
- **Fix**: Convert to local venue time

---

## BROADCAST SYSTEM FIXES

### 11. **Broadcast EventList**
**File**: `/art-battle-broadcast/src/components/EventList.jsx`
- **Usage**: Event selection and display
- **Issue**: UTC time display
- **Fix**: Local venue time

### 12. **Broadcast EventDetails**
**File**: `/art-battle-broadcast/src/components/EventDetails.jsx`
- **Usage**: Live event management
- **Issue**: UTC time in event details
- **Fix**: Local venue time conversion

---

## RESULTS SYSTEM FIXES

### 13. **Results EventResults Component**
**File**: `/art-battle-results/src/components/EventResults.jsx`
- **Usage**: Event results display
- **Issue**: UTC time in results
- **Fix**: Local venue time

---

## SOLUTION STRATEGY

### **Phase 1: Core Email Templates (URGENT)**
1. Fix `/supabase/functions/accept-invitation/index.ts` date formatting
2. Update email template data passed to include proper local times
3. Test with AB2938, AB3030, AB3023 events

### **Phase 2: Artist Portal**
1. Update `formatDateTime()` functions in EventApplications
2. Add timezone lookup by city/event
3. Convert all UTC displays to local venue time

### **Phase 3: Admin Interface**
1. Ensure admin sees local venue times during editing
2. Update all admin displays to show local venue time
3. Maintain UTC in database, convert for display only

### **Phase 4: APIs & Broadcast**
1. Update public APIs to return local times
2. Fix broadcast system displays
3. Fix results system displays

---

## TIMEZONE MAPPING REQUIRED

**Need function to map cities to timezones**:
```sql
-- Example mapping logic needed
CASE 
  WHEN city_name = 'Toronto' THEN 'America/Toronto'
  WHEN city_name = 'Amsterdam' THEN 'Europe/Amsterdam'  
  WHEN city_name = 'Bangkok' THEN 'Asia/Bangkok'
  WHEN city_name = 'San Francisco' THEN 'America/Los_Angeles'
  -- etc.
END
```

**Or better**: Add timezone field to cities table and use that for conversion.

---

## TESTING STRATEGY

**Test Events**:
- AB2938 Toronto (EDT -04:00) - Should show 7:30 PM
- AB3030 Amsterdam (CEST +02:00) - Should show 7:00 PM  
- AB3023 Bangkok (ICT +07:00) - Should show 7:00 PM

**Test Locations**:
1. Email templates (invitation, confirmation, application)
2. Artist portal event listings
3. Admin interface event management
4. Public API responses
5. Broadcast system
6. Results system

**Success Criteria**:
- All times display in correct local venue time
- AM/PM format used consistently  
- No timezone abbreviations (EDT, CEST, etc.) in display
- UTC maintained in database for consistency

**END OF INDEX**