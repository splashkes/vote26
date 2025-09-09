# Art Battle Timer System

A full-screen countdown timer application designed for Art Battle live events. Displays round-based auction timers on projectors and mobile devices for event management.

## Overview

The Art Battle Timer provides a clean, professional countdown display for auction rounds during live Art Battle events. It features automatic data synchronization, full-screen optimization, and real-time countdown functionality.

## Features

### 🎯 **Core Functionality**
- **Full-screen countdown display** optimized for projectors and mobile devices
- **Real-time updates** with 5-second data refresh and 1-second countdown precision
- **Automatic activation** when auction rounds end within 30 minutes
- **Round-based timing** using database-driven closing times
- **No authentication required** - public display system

### 🎨 **Display Elements**
- **Event header** showing EID, city, venue, and participant count
- **Large round indicator** (e.g., "ROUND 2")
- **Massive countdown timer** (MM:SS format) with red styling
- **Progress bar** showing visual time remaining
- **Responsive design** for various screen sizes

### 📱 **Device Support**
- **Projectors** - Ultra-wide screen optimization
- **Mobile devices** - Admin carry-around displays
- **Tablets** - Medium screen responsive design
- **High contrast mode** for better projector visibility

## URL Structure

Access the timer using the event ID (EID):

```
https://artb.art/timer/AB3344
```

Replace `AB3344` with any valid Art Battle event ID.

## System Architecture

### Frontend (React SPA)
- **Framework**: React + Vite + Radix UI
- **Routing**: React Router with `/timer/:eid` pattern  
- **Styling**: Full-screen CSS optimized for projector display
- **Deployment**: CDN-hosted at `https://artb.art/timer/`

### Backend (Supabase Edge Function)
- **API Endpoint**: `/functions/v1/timer-data/:eid`
- **Authentication**: Public access (no JWT verification)
- **Database**: PostgreSQL with real-time round data
- **Response**: JSON with event, rounds, and timing information

### Database Schema
```sql
-- Events table
events: {
  id: uuid,
  eid: text,           -- External ID (e.g., "AB3344")
  name: varchar,       -- Event name
  venue: varchar,      -- Venue name
  city_id: uuid,       -- Links to cities table
  current_round: int   -- Active round number
}

-- Rounds table (with timer extension)
rounds: {
  id: uuid,
  event_id: uuid,      -- Links to events table
  round_number: int,   -- Round sequence (1, 2, 3...)
  closing_time: timestamptz  -- When round ends
}

-- Cities table
cities: {
  id: uuid,
  name: varchar        -- City name (e.g., "Omaha")
}
```

## Data Flow

1. **URL Access** → React Router extracts EID from `/timer/AB3344`
2. **API Call** → Frontend calls `/timer-data/AB3344` every 5 seconds  
3. **Database Query** → Edge function queries events, rounds, cities tables
4. **Timer Logic** → Finds rounds ending within 30 minutes
5. **Display Update** → React updates countdown and progress bar every second

## API Response Format

```json
{
  "event": {
    "eid": "AB3344",
    "name": "AB3344 - Chicago",  
    "city": "Chicago",
    "venue": "Spin Chicago",
    "current_round": 2
  },
  "rounds": [
    {
      "round": 1,
      "closing_time": "2025-09-08T23:45:00Z",
      "artists": 6
    }
  ],
  "active_round": {
    "round": 1, 
    "closing_time": "2025-09-08T23:45:00Z",
    "artists": 6
  },
  "has_active_timers": true,
  "timestamp": "2025-09-08T23:30:00Z"
}
```

## Timer States

### 🕐 **Waiting State**
- Displays when no rounds are within 30 minutes of closing
- Shows event info with "Waiting for Active Timers" message

### ⏱️ **Active Timer State**  
- Large countdown display with progress bar
- Updates every second for precise timing
- Red color scheme for urgency

### ⏰ **Timer Activation Logic**
- Automatically shows when `round.closing_time` is within 30 minutes
- Switches between rounds as their end times approach the window
- Handles multiple rounds with different closing times

## Setup & Deployment

### Prerequisites
- Node.js and npm
- Supabase CLI
- s3cmd for CDN deployment
- Database with Art Battle schema

### Initial Setup
```bash
# Clone and navigate to timer directory
cd /path/to/art-battle-timer

# Install dependencies  
npm install

# Development server
npm run dev
```

### Database Setup
```sql
-- Add closing_time column to rounds table
ALTER TABLE rounds ADD COLUMN closing_time TIMESTAMP WITH TIME ZONE;

-- Create index for efficient queries
CREATE INDEX idx_rounds_closing_time ON rounds(closing_time) 
WHERE closing_time IS NOT NULL;
```

### Edge Function Deployment
```bash
# Deploy timer API function
supabase functions deploy timer-data --no-verify-jwt
```

### Frontend Deployment
```bash
# Build and deploy to CDN
npm run build
./deploy.sh
```

## Configuration Files

### **config.toml** - Supabase function configuration
```toml
[functions.timer-data]
verify_jwt = false
```

### **vite.config.js** - Build configuration
```javascript
export default defineConfig({
  plugins: [react()],
  base: '/timer/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${timestamp}-[hash].js`
      }
    }
  }
})
```

## Testing Data Setup

Create test rounds for development/testing:

```sql
-- Example: Create test rounds for event AB2900
INSERT INTO rounds (id, event_id, round_number, closing_time) VALUES
  (gen_random_uuid(), 'EVENT_UUID_HERE', 1, NOW() + INTERVAL '10 minutes'),
  (gen_random_uuid(), 'EVENT_UUID_HERE', 2, NOW() + INTERVAL '30 minutes'),
  (gen_random_uuid(), 'EVENT_UUID_HERE', 3, NOW() + INTERVAL '45 minutes');
```

## Usage Scenarios

### 🎪 **Live Event Display**
1. Set up projector displaying timer URL
2. Event staff sets round closing times in admin system
3. Timer automatically activates as rounds approach end
4. Provides visual countdown for audience and participants

### 📱 **Mobile Admin Tool**
1. Event coordinator accesses timer on mobile device
2. Carries device around venue for timing reference  
3. Monitors multiple rounds and their status
4. Coordinates with other staff using shared timing display

### 🖥️ **Staff Coordination**
1. Multiple staff members can access same timer URL
2. Synchronized countdown across all devices
3. Real-time updates when round times are modified
4. No login required for immediate access

## Customization

### Display Styling
- **Colors**: Modify CSS variables for brand colors
- **Fonts**: Update font sizes in responsive breakpoints
- **Layout**: Adjust component spacing and positioning

### Timing Logic
- **Activation Window**: Change 30-minute threshold in API
- **Refresh Rate**: Modify 5-second data refresh interval
- **Countdown Precision**: Currently updates every second

### API Extensions
- Add artist information display
- Include auction bid data
- Implement custom notification sounds
- Add multi-language support

## Troubleshooting

### Common Issues

**Timer not loading (401 error)**
- Verify edge function deployed with `--no-verify-jwt` flag
- Check `config.toml` has `verify_jwt = false` for timer-data function

**City showing as "Unknown"**
- Ensure event has valid `city_id` in events table
- Verify cities table contains matching city record

**No active timers showing**
- Check rounds table has `closing_time` values set
- Ensure closing times are within 30 minutes of current time
- Verify event ID (EID) is correct in URL

**Timer display issues**
- Clear browser cache (CDN caching may show old version)
- Check responsive CSS media queries for device type
- Verify CDN deployment completed successfully

### Debug API Directly
```bash
# Test API endpoint directly
curl "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/timer-data/AB3344"
```

## Security & Performance

- **No authentication required** for timer display
- **CDN-hosted assets** with aggressive caching
- **Service worker ready** for offline capability
- **Optimized queries** with database indexing
- **Real-time updates** without polling overhead

## Future Enhancements

- **Audio alerts** for final countdown
- **Multi-event support** on single display  
- **Custom branding** per event
- **Integration** with auction bidding system
- **Analytics** for timer usage and effectiveness