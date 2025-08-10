# Art Battle Admin Interface

A modern admin interface for managing Art Battle events, built with React, Vite, and Supabase.

## Features

- **Email-based Authentication**: Secure admin login using Supabase Auth
- **Event Management**: View, search, and manage Art Battle events
- **Artist Management**: Manage artists and event contestants
- **Real-time Data**: Live updates using Supabase subscriptions
- **Debug Mode**: Built-in tools for troubleshooting missing data
- **Responsive Design**: Works on desktop and mobile devices

## Architecture

This admin interface is part of the vote26 ecosystem and follows the same architectural patterns:

- **Frontend**: React 19 + Vite
- **UI Components**: Radix UI Themes
- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth (email-based)
- **Deployment**: DigitalOcean Spaces CDN

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to the Art Battle Supabase instance

### Installation

```bash
# Navigate to the admin directory
cd /root/vote_app/vote26/art-battle-admin

# Install dependencies
npm install

# Start development server
npm run dev
```

The development server will start on `http://localhost:3002`.

### Building for Production

```bash
# Build the application
npm run build

# Deploy to DigitalOcean Spaces
./deploy.sh
```

## Authentication

The admin interface uses email-based authentication (unlike the main voting app which uses SMS). Admin users must be:

1. Added to the Supabase Auth users table
2. Assigned to events in the `event_admins` table with appropriate permission levels

### Permission Levels

- **voting**: Basic event access, can view data
- **photo**: Can manage artwork and media
- **producer**: Full event management capabilities  
- **super**: System-wide admin access

## Debug Mode

The interface includes a built-in debug system to help identify missing data:

1. **Visual Indicators**: Missing fields show as `[fieldName]` in debug mode
2. **Debug Panel**: View raw object data in the context panel
3. **Console Logging**: Detailed logging of API responses
4. **Toggle Controls**: Enable/disable debug mode from the UI

To enable debug mode:
- Use the toggle buttons in the context panel
- Or run `window.ADMIN_DEBUG_MODE = true` in the browser console

## Data Access Patterns

The admin interface uses direct Supabase queries with proper Row Level Security (RLS):

```javascript
// Fetch events with related data
const { data } = await supabase
  .from('events')
  .select(`
    *,
    cities(name),
    countries(name),
    event_admins(level, email)
  `)
  .in('id', adminEventIds);
```

## Shared Components

Several components are shared with other vote26 applications:

- **supabase.js**: Database connection configuration
- **adminHelpers.js**: Permission checking utilities
- **AuthContext**: Authentication state management

## Deployment

The application is deployed to DigitalOcean Spaces CDN:

- **URL**: https://artb.tor1.cdn.digitaloceanspaces.com/admin/
- **Build Process**: Vite with cache-busting
- **CDN**: DigitalOcean Spaces with public access

### Deployment Command

```bash
./deploy.sh
```

This script will:
1. Build the application with Vite
2. Add cache-busting parameters
3. Upload to DigitalOcean Spaces with proper headers
4. Provide deployment confirmation

## Development Notes

### Missing Data Handling

The interface is designed to handle incomplete data gracefully:

- Fields show debug placeholders when data is missing
- Null/undefined values are handled safely
- Database query errors are displayed with helpful messages

### Component Structure

```
src/
├── components/          # React components
│   ├── AdminLayout.jsx     # Main layout with 3-column design
│   ├── LoginPage.jsx       # Email authentication
│   ├── EventDashboard.jsx  # Event listing and management
│   ├── EventDetail.jsx     # Individual event details
│   └── ArtistManagement.jsx # Artist and contestant management
├── contexts/           # React contexts
│   └── AuthContext.jsx    # Authentication state
├── lib/               # Utility libraries
│   ├── supabase.js       # Database connection
│   ├── adminHelpers.js   # Permission utilities
│   └── debugHelpers.js   # Debug utilities
└── App.jsx            # Main application component
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure user exists in Supabase and has event_admin permissions
2. **Missing Data**: Enable debug mode to identify which fields are missing
3. **Permission Denied**: Check RLS policies and admin permission levels
4. **Build Failures**: Ensure all dependencies are installed with `npm install`

### Debug Steps

1. Open browser developer tools
2. Enable debug mode from the context panel
3. Check console for detailed error messages
4. Use the debug object viewer to inspect raw data
5. Verify Supabase queries in the Network tab

## Contributing

This admin interface follows the same patterns as other vote26 applications. When adding new features:

1. Use Radix UI components for consistency
2. Include debug helpers for new data fields
3. Follow the existing authentication patterns
4. Test with incomplete/missing data scenarios
5. Update this README with new features

## Related Applications

- **art-battle-vote**: Main voting and auction interface
- **art-battle-qr**: QR code generation and management  
- **art-battle-artists**: Artist profile and application management