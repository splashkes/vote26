root@VoteZ:~/vote_app# cat ./vote26/art-battle-admin/ADMIN25_FEATURE_DOCUMENTATION.md
# Admin-25 Feature Documentation
## Complete Analysis of Original Admin System for Migration to Art-Battle-Admin

Based on analysis of `/root/vote_app/admin-25/` codebase.

---

## Navigation Tree Structure

The admin system is organized around a **three-column layout** with the following navigation tree:

### Main Categories (Left Sidebar)
1. **Events** 📅 (Live data indicator available)
2. **Artists** 🎨 (Live data indicator available) 
3. **Art** 🖼️
4. **Loyalty** 👥
5. **Health** 💊
6. **Settings** ⚙️
7. **Migration** 🔄
8. **Logging** 📊
9. **Analysis** 📈
10. **Users** 👤 (Admin permission required)
11. **Payments** 💳 (Admin permission required)
12. **Offers** 🎁 (POV System)

### Permission-Based Access Control
- **Admin users**: See all categories
- **Regular users**: Categories filtered by permissions:
  - `viewEvents` → Events
  - `viewArtists` → Artists + Art
  - `viewAnalytics` → Analysis
  - `manageSettings` → Settings
  - `viewUsers` → Users
  - `viewPayments` → Payments
  - `viewActivityLogs` → Health (partial)

---

## Feature Analysis by Category

### 1. EVENTS 📅

**Core Components:**
- `EventSearch.js` - Search and filter events
- `EventDetail.js` - Comprehensive event management
- `EventHeader.js` - Event status and quick info
- `EventRounds.js` - Round-by-round management
- `EventStats.js` - Real-time statistics
- `EventArtGallery.js` - Art display and management
- `EventActions.js` - Bulk operations
- `EventUpdates.js` - Recent changes tracking
- `VoteFactorBar.js` - Visual voting metrics
- `EventAuctionBox.js` - Auction integration
- `EventAssignedUsers.js` - Staff assignments
- `EventEditPage.js` - Event configuration
- `EventEditView.js` - Quick edit interface

**Key Features:**
- **Live Status Tracking**: Active/Upcoming/Completed with real-time updates
- **Round Management**: Multi-round tournament structure
- **Artist Assignment**: Contestant management per round/easel
- **Voting Analytics**: Real-time vote factor visualization
- **Auction Integration**: Bidding and auction management
- **Staff Management**: User role assignments per event
- **Gallery View**: Art display with progress tracking
- **Batch Operations**: Bulk event updates
- **Edit Mode**: Full event configuration panel

### 2. ARTISTS 🎨

**Core Components:**
- `ArtistSearch.js` - Artist discovery and search
- `ArtistDetail.js` - Complete artist profile
- `ArtistEventsPanel.js` - Event participation history
- `ArtistArtworksPanel.js` - Portfolio management
- `ArtistAuctionInfoPanel.js` - Auction performance
- `ArtistArtworkThumbnails.js` - Visual portfolio grid
- `EventArtistComparisonPanel.js` - Multi-artist analytics

**Key Features:**
- **Profile Management**: Contact info, social media, bio
- **Event History**: All events participated in
- **Portfolio View**: Artwork thumbnails and details
- **Performance Analytics**: Win rates, auction results
- **Comparison Tools**: Side-by-side artist metrics
- **Social Integration**: Instagram/social media links
- **Search & Filter**: By name, location, performance

### 3. ART 🖼️

**Core Components:**
- `ArtSearch.js` - Artwork search and filtering  
- `ArtworkDetail.js` - Individual artwork management

**Key Features:**
- **Search Interface**: By title, artist, event
- **Detail View**: High-res images, metadata
- **Progress Tracking**: Creation stages/timestamps
- **Auction Integration**: Bidding history, final prices
- **Category Filters**: By event, round, status

### 4. LOYALTY 👥

**Core Components:**
This is from people table
- `LoyaltySearch.js` - Customer search and discovery
- `LoyaltyGuestDetail.js` - Individual guest profiles  
- `LoyaltyEventHistory.js` - Event participation tracking
- `LoyaltyAuctionHistory.js` - Bidding/purchase history
- `LoyaltyMessageHistory.js` - Communication logs
- `LoyaltyStats.js` - Engagement metrics
- `LoyaltyRFMDisplay.js` - RFM score visualization
- `LoyaltyContextPanel.js` - Quick reference panel
- `VisibleOffersSection.js` - Active promotions

**Key Features:**
- **Customer Profiles**: Complete guest information
- **RFM Analysis**: Recency/Frequency/Monetary scoring
- **Event Tracking**: Attendance and participation
- **Purchase History**: Auction wins and payments
- **Message Logs**: SMS/email communication history
- **Segmentation**: Customer category classification
- **Offer Management**: Targeted promotions
- **Engagement Metrics**: Lifetime value calculations

**Data Sources:**
- MongoDB: `registrations`, `payments`, `messages` collections
- RFM calculations via API

### 5. HEALTH 💊

**Core Components:**
- `HealthSearch.js` - System health monitoring
- `HealthDetail.js` - Detailed health reports
- `HealthAllRecommendations.js` - AI-generated insights
- `HealthTimeline.js` - Historical health trends
- `HealthEmailSms.js` - Communication system health

**Key Features:**
- **System Monitoring**: API status, database health
- **Performance Metrics**: Response times, uptime
- **AI Recommendations**: Automated health insights
- **Communication Health**: Email/SMS delivery rates
- **Historical Trends**: Health metrics over time
- **Alert System**: Issue notifications
- **Version Tracking**: System version and updates

### 6. SETTINGS ⚙️

**Core Components:**
- `SettingsDetail.js` - System configuration

**Key Features:**
- **System Configuration**: Global app settings
- **User Preferences**: Individual customization
- **Integration Settings**: Third-party services
- **Security Settings**: Access controls
- **Notification Settings**: Alert preferences

### 7. MIGRATION 🔄

**Core Components:**
- `MigrationDetail.js` - Data migration tools

### 10. USERS 👤 (Admin Only)

**Core Components:**
- `UsersList.js` - User management interface
- `UserDetail.js` - Individual user profiles
- `UserEditPanel.js` - User modification tools
- `CreateUserForm.js` - New user creation
- `PermissionToggle.js` - Permission management

**Key Features:**
- **User Management**: Create, edit, delete users
- **Permission Control**: Role-based access control
- **Profile Management**: User information
- **Authentication**: Login credentials
- **Activity Tracking**: User action logs

### 12. OFFERS 🎁 (POV System)

**Core Components:**
- `OfferSearch.js` - Offer management interface
- `OfferDetail.js` - Individual offer configuration
- `OfferContextPanel.js` - Quick offer info

**POV.html Features:**
- **Personalized Offers**: Customer-specific promotions
- **RFM Targeting**: Audience segmentation
- **Offer Redemption**: Digital coupon system
- **Analytics Tracking**: Offer performance metrics
- **Geographic Targeting**: Location-based offers
- **Inventory Management**: Limited quantity tracking
- **Visual Customization**: Branded offer tiles
- **Countdown Timers**: Time-sensitive offers
- **Debug Mode**: Testing and troubleshooting

**POV Offer Types:**
- `ticket` - Free event tickets
- `merchandise` - Art Battle merchandise
- `auction_credit` - Bidding credits
- `discount` - Percentage/dollar discounts
- Custom offer types

**POV Targeting Criteria:**
- **RFM Scores**: Recency, Frequency, Monetary values
- **Geographic Scope**: City-based targeting
- **Inventory Limits**: Quantity management
- **Time Windows**: Start/end dates
- **User Segmentation**: Custom audience targeting

---

## Reports & Analytics

**Chart Components:**
- `ArtistConfirmationChart.js` - Artist booking confirmations
- `AveragedCumulativeChart.js` - Average metrics over time
- `CumulativeChart.js` - Cumulative data visualization
- `LiveEventMonitor.js` - Real-time event tracking
- `PeakRateChart.js` - Peak activity periods
- `PeakRateCityChart.js` - City-based peak analysis
- `PeakTimelineChart.js` - Timeline visualization
- `PeakRateAverageChart.js` - Average peak calculations

