# Art Battle Vote App

A beautiful, mobile-optimized web application for Art Battle voting and bidding, built with React, Radix UI Themes, and Supabase.

## Features

- **Mobile-First Design**: Optimized for mobile devices with touch-friendly interfaces
- **Event Management**: View active, recent, and upcoming Art Battle events
- **Real-time Voting**: Vote for your favorite artists in each round
- **Live Bidding**: Place bids on artwork during auctions
- **Beautiful UI**: Built with Radix UI Themes for a consistent, accessible design

## Tech Stack

- **Frontend**: React 18 with Vite
- **UI Library**: Radix UI Themes
- **Database**: Supabase (PostgreSQL)
- **Routing**: React Router v6
- **Styling**: CSS with Radix UI Themes

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Add your Supabase URL and anon key

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173) in your browser

## Project Structure

```
src/
├── components/
│   ├── EventList.jsx      # Main event listing page
│   └── EventDetails.jsx   # Event details with art/voting
├── lib/
│   └── supabase.js       # Supabase client configuration
├── App.jsx               # Main app component with routing
├── App.css              # Custom styles
└── main.jsx             # App entry point
```

## Features Overview

### Event List View
- Displays events categorized as:
  - **Active Events**: Currently happening (12 hours before to 18 hours after start)
  - **Recent Events**: Past 10 days
  - **Future Events**: Next 2 months
- Expandable cards show event details
- One-click navigation to event details

### Event Details View
- View all rounds and artworks
- See artist information and bios
- Vote for favorite artworks
- Place bids during auctions
- Filter by round using tabs
- Real-time vote counts and bid amounts

## Mobile Optimizations

- Viewport meta tags prevent zooming
- Touch-optimized button sizes (44px minimum)
- Sticky headers for easy navigation
- Smooth scrolling with momentum
- Pull-to-refresh prevention
- Safe area insets for modern phones

## Database Schema

The app uses the following main tables from Supabase:
- `events`: Event information
- `rounds`: Competition rounds
- `art`: Artwork entries
- `artist_profiles`: Artist information
- `votes`: User votes
- `bids`: Auction bids
- `media_files`: Artwork images

## Future Enhancements

- User authentication for persistent voting
- Push notifications for live events
- Artist profile pages
- Social sharing features
- Offline support with service workers