# Art Battle Analytics Dashboard Documentation

## Overview
The Art Battle Analytics Dashboard provides comprehensive real-time analytics for Art Battle live painting competition events. Built with React and Material-UI, it displays engagement metrics, guest composition, and activity timelines to help event organizers monitor event performance.

## Architecture

### Frontend
- **Framework**: React with Material-UI (MUI) components
- **Charts**: MUI X Charts (LineChart, BarChart)
- **Deployment**: DigitalOcean Spaces CDN
- **URL Structure**: `https://artb.art/analytics/[EVENT_ID]`

### Backend
- **Database**: PostgreSQL (Supabase)
- **API**: Supabase Edge Functions
- **Endpoint**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/public-analytics/[EVENT_ID]`

## Key Features

### 1. Real-time Metrics Dashboard
- **Auto-refresh**: 10-second intervals for live events
- **Summary Cards**: Total participants, QR scans, votes, bids, auction value, new guest percentage
- **Color Synchronization**: Consistent color scheme across all UI components
  - Blue (#1976d2): QR scans
  - Orange (#f57c00): Votes
  - Red (#d32f2f): Bids
  - Green (#388e3c): Auction values

### 2. Activity Timeline Chart
- **Type**: Line chart with time-based x-axis
- **Metrics**: Cumulative QR scans, votes, bids, and auction values over time
- **Features**:
  - Latest values displayed in legend
  - Grid lines for better readability
  - 15-minute minimum time intervals
  - Mobile-responsive design

### 3. Guest Composition Analysis
- **Type**: Stacked bar chart
- **Comparisons**:
  - Current event vs city average vs global average
  - Categories: QR Scan (New), QR Scan (Return), Online (New), Online (Return)
- **Color Scheme**:
  - QR Scan (New): #1976d2 (dark blue)
  - QR Scan (Return): #42a5f5 (light blue)
  - Online (New): #f57c00 (dark orange)
  - Online (Return): #ffb74d (light orange)
- **Data Labels**: Show percentage values ≥5% with 1 decimal place precision

## Database Functions

### Core Analytics Functions
Located in `/root/vote_app/vote26/supabase-functions/db-functions/`

#### `get_guest_composition_with_comparisons(event_id)`
Returns guest composition data comparing current event with historical averages.

#### `get_city_guest_composition_average(city)`
Calculates city-specific guest composition averages from last 10 events.

#### `get_global_guest_composition_average()`
Calculates global guest composition averages from last 10 events across all cities.

#### `get_event_time_series(event_id)`
Returns time-series data for activity timeline charts.

### Migration Files
- `20250922_add_historical_guest_composition_comparison.sql`: Adds guest composition comparison functions

## API Endpoints

### Public Analytics API
**Endpoint**: `/functions/v1/public-analytics/[EVENT_ID]`
**Method**: GET
**Response Structure**:
```json
{
  "event_info": {
    "name": "Event Name",
    "eid": "AB3036",
    "venue": "Venue Name",
    "event_start": "2025-09-22T19:00:00Z",
    "event_end": "2025-09-22T22:00:00Z"
  },
  "summary": {
    "total_participants": 156,
    "total_qr_scans": 89,
    "total_votes": 245,
    "total_bids": 23,
    "total_bid_amount": 1470,
    "new_guest_percentage": 67.3
  },
  "time_series": [
    {
      "time_bucket": "2025-09-22T19:15:00Z",
      "qr_scans_cumulative": 12,
      "votes_cumulative": 5,
      "bids_cumulative": 0,
      "auction_value_cumulative": 0
    }
  ],
  "guest_composition_comparisons": [
    {
      "guest_category": "QR Scan (New)",
      "current_pct": 45.2,
      "city_avg_pct": 52.1,
      "global_avg_pct": 48.7
    }
  ]
}
```

## File Structure

### Main Components
- `/art-battle-mui/src/components/EventAnalytics.jsx`: Main dashboard component
- `/art-battle-mui/deploy.sh`: Deployment script

### Database Functions
- `/supabase-functions/db-functions/get_guest_composition_with_comparisons.sql`
- `/supabase-functions/db-functions/get_city_guest_composition_average.sql`
- `/supabase-functions/db-functions/get_global_guest_composition_average.sql`

### API Functions
- `/supabase/functions/public-analytics/index.ts`: Edge function for analytics API

## Deployment Process

### Automated Deployment
```bash
cd /root/vote_app/vote26/art-battle-mui
./deploy.sh
```

**Process**:
1. Builds React application with Vite
2. Adds cache-busting parameters
3. Uploads to DigitalOcean Spaces CDN
4. Sets appropriate cache headers:
   - `index.html`: no-cache (always fresh)
   - JS/CSS assets: 1 year cache (immutable with hash)
   - Other assets: 1 hour cache

### CDN URLs
- **Primary**: https://artb.art/analytics/
- **Direct CDN**: https://artb.tor1.cdn.digitaloceanspaces.com/analytics/

## Security Considerations

### Identified Issues
1. **Hardcoded Database Credentials**: API functions contain hardcoded PostgreSQL credentials
   - **Risk**: Medium (internal network access only)
   - **Recommendation**: Use environment variables or Supabase service role keys

### Access Control
- Dashboard is publicly accessible but requires knowledge of event IDs
- No authentication layer currently implemented
- Internal network deployment reduces exposure risk

## Mobile Optimization

### Responsive Design Features
- Fluid grid system with Material-UI breakpoints
- Compact margins and padding for mobile devices
- Smaller legend text and icons on small screens
- Stacked layout for summary cards on mobile
- Optimized chart heights and margins

### Breakpoints
- **xs** (0-600px): Single column layout, compact spacing
- **sm** (600-900px): Two-column summary cards
- **md** (900-1200px): Multi-column layout
- **lg** (1200px+): Full desktop layout

## Performance Features

### Optimization Strategies
- Component memoization for expensive calculations
- Conditional auto-refresh (only for live events)
- Efficient time-series data processing
- Responsive image and asset loading

### Caching Strategy
- CDN-level caching with appropriate cache headers
- Browser caching for static assets
- Real-time data fetching for live metrics

## Error Handling

### API Error Responses
- **404**: Event not found
- **500**: Database or server errors
- **Network errors**: Connection timeouts

### User Experience
- Loading skeletons during data fetch
- Retry buttons for failed requests
- Graceful degradation for missing data
- Clear error messages with actionable steps

## Known Limitations

### MUI X Charts Dual Y-Axis
- **Issue**: Dual y-axis configuration not displaying properly
- **Attempted Solutions**: Multiple MUI X Charts configurations tested
- **Current Status**: Single left axis used for all metrics
- **Impact**: All values displayed on same scale, limiting auction value readability

### Future Enhancements
1. Implement proper dual y-axis for auction values
2. Add pre-event and system-wide metrics
3. Implement user authentication
4. Add data export functionality
5. Enhanced mobile gestures and interactions

## Monitoring and Maintenance

### Health Checks
- Verify CDN accessibility: https://artb.art/analytics/
- Test API endpoint responses
- Monitor database function performance
- Check deployment script functionality

### Update Process
1. Modify components in `/art-battle-mui/src/`
2. Test locally with `npm run dev`
3. Deploy with `./deploy.sh`
4. Verify deployment at production URLs

## Development Setup

### Requirements
- Node.js 18+
- npm or yarn
- Access to Supabase database
- DigitalOcean Spaces credentials (for deployment)

### Local Development
```bash
cd /root/vote_app/vote26/art-battle-mui
npm install
npm run dev
```

### Environment Variables
```env
VITE_SUPABASE_URL=https://xsqdkubgyqwpyvfltnrf.supabase.co
VITE_SUPABASE_ANON_KEY=[anon_key]
```

## Support and Troubleshooting

### Common Issues
1. **Charts not loading**: Check API endpoint connectivity
2. **Data discrepancies**: Verify database function calculations
3. **Deployment failures**: Check CDN credentials and network connectivity
4. **Mobile display issues**: Test responsive breakpoints

### Debug Tools
- Browser developer tools for frontend debugging
- Supabase dashboard for database queries
- CDN logs for deployment issues
- Network tab for API request monitoring

---

**Last Updated**: September 22, 2025
**Version**: 1.0
**Maintainer**: Art Battle Development Team