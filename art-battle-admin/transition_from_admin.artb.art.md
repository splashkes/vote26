

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
4. **Loyalty** 👥 (full person management and history interface with RFM)
5. **Health** 💊
6. **Settings** ⚙️
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

### 5. HEALTH 💊 - **CRITICAL SYSTEM**

The Health system is the **most sophisticated and important component** of the Admin-25 platform. It provides AI-powered event analysis, multivariate health scoring, and automated recommendations with integrated Slack notifications.

#### **Core Components:**
- `HealthSearch.js` - Event health discovery and filtering
- `HealthDetail.js` - Comprehensive health dashboard with AI insights
- `HealthAllRecommendations.js` - AI recommendation management interface
- `HealthTimeline.js` - Historical health trend visualization
- `HealthEmailSms.js` - Communication system health monitoring

#### **AI-Powered Health Analysis System** 🧠

**API Endpoints:**
- `/api/v1/health-md6/{eventId}?template=template_health_report_3.md` - Markdown health reports
- `/api/v1/events/{eventId}/marketing-recommendations` - AI marketing analysis  
- `/api/v1/events/{eventId}/health-analysis` - Multivariate health scoring

**Health Analysis Service** (`health_analysis_service.go`):
- **OpenAI Integration**: GPT-4 powered analysis with 120-second timeout
- **Contextual Feedback**: Database-stored feedback improves AI responses over time
- **Template-Based Reports**: Customizable markdown report generation
- **Caching System**: Efficient AI response caching with metadata tracking
- **Business Rules Engine**: Built-in rules (100+ guests target, 11+1 artists acceptable)

#### **Multivariate Health Scoring System** 📊

**Four Critical Health Areas:**
1. **Ticket Sales Health**
   - Minimum 100 guests target
   - Registration velocity tracking
   - Revenue projections and trends
   - Waitlist and capacity analysis

2. **Artist Management Health**  
   - 11 artists + 1 wildcard formula
   - Confirmation timing and rates
   - Artist replacement needs tracking
   - Portfolio quality assessment

3. **Event Operations Health**
   - Venue logistics and setup status
   - Staff assignments and coverage
   - Equipment and technical readiness
   - Timeline and milestone tracking

4. **Marketing Performance Health**
   - Campaign effectiveness metrics
   - Social media engagement rates
   - Ad spend efficiency and ROI
   - Audience reach and conversion

**Health Score Structure:**
```json
{
  "score": 85,
  "status": "excellent|good|needs-attention|critical", 
  "summary": "Brief assessment",
  "key_metrics": ["100% confirmation rate", "142 tickets sold"],
  "suggestions": ["Specific actionable recommendations"],
  "data_sources": ["Days until event", "Registration data"]
}
```

#### **AI Marketing Recommendation Engine** 🎯

**Recommendation System Features:**
- **10 Targeted Recommendations**: Always provides exactly 10 actionable suggestions
- **Priority Categorization**: "urgent", "important", "nice-to-have" classifications
- **Impact Scoring**: 1-10 scale where 10 = highest ticket sales impact
- **Timeline Awareness**: Considers days until event for realistic suggestions
- **Data-Driven**: All recommendations reference specific health metrics

**Dynamic Time-Based Logic:**
- **Day of Event (0 days)**: Only same-day executable actions
- **Within 7 days**: Focus on immediate digital marketing
- **7+ days**: Comprehensive campaign strategies
- **Never suggests**: Artist replacements or backup artists (business rule)

**Recommendation Structure:**
```json
{
  "id": 1,
  "suggestion": "Increase Meta Ads budget to $200 today",
  "category": "urgent",
  "score": 9,
  "reasoning": "Current registration velocity below target",
  "timeline": "immediate",
  "data_sources": ["Days until event", "Registration velocity"]
}
```

#### **Integrated Slack Notification System** 📢

**SlackService** (`slack_service.go`):
- **Multi-Channel Support**: #ab-apps (system), #offers (redemptions), custom channels
- **Rich Attachments**: Color-coded messages with structured field data
- **Event-Driven Notifications**: Startup, shutdown, errors, recommendations
- **Offer Integration**: Real-time redemption notifications with user details
- **Error Handling**: Comprehensive error notifications with context

**Notification Types:**
- **System Health Alerts**: API status, database connectivity, performance issues
- **Event Health Updates**: Critical health score changes, milestone warnings
- **AI Recommendation Delivery**: New recommendation sets with priority flagging
- **Offer Redemptions**: Customer activity with RFM context
- **Error Notifications**: System failures with detailed diagnostic information

**Slack Integration Features:**
- **Formatted Messages**: Professional attachment-based formatting
- **User Context**: Links recommendations to specific events and users
- **Historical Tracking**: Message threading and conversation continuity
- **Feedback Loop**: Slack responses can influence future AI recommendations

#### **Health Data Pipeline** 🔄

**Data Sources Integration:**
- **Event Registration Data**: Ticket sales velocity and patterns
- **Artist Management**: Confirmation status and timeline tracking
- **Marketing Metrics**: Campaign performance from multiple channels
- **Operational Data**: Venue, staff, and logistics information
- **Historical Performance**: Past event outcomes for trend analysis

**Health Report Generation Process:**
1. **Data Aggregation**: Collect multivariate health metrics from all systems
2. **Template Processing**: Apply markdown templates for structured reporting
3. **AI Analysis**: Submit health data to OpenAI for intelligent interpretation
4. **Scoring Calculation**: Generate numerical health scores across 4 dimensions
5. **Recommendation Generation**: Create prioritized, time-aware action items
6. **Caching & Storage**: Store results with metadata
7. **Slack Notification**: Alert teams of critical findings and urgent recommendations

#### **Advanced Features:**

**AI Feedback System** (`ai_feedback_service.go`):
- **Learning Loop**: User feedback improves future AI recommendations
- **Feedback Types**: Positive, negative, sent to Slack, deleted
- **Context Retention**: Feedback influences prompt engineering for better results
- **Quality Improvement**: Continuous refinement of recommendation accuracy

**Caching & Performance**:
- **AI Response Caching**: Prevents redundant expensive OpenAI calls
- **Metadata Tracking**: Request timing, costs, and performance metrics
- **Cache Invalidation**: Force refresh capabilities for critical updates
- **Cost Optimization**: Intelligent caching reduces API costs significantly

**Business Intelligence:**
- **Trend Analysis**: Historical health patterns and seasonal adjustments  
- **Predictive Insights**: Early warning systems for potential event issues
- **Benchmarking**: Compare event health against historical successful events
- **ROI Tracking**: Measure recommendation implementation success rates

#### **Critical Business Rules** ⚠️

**Hard-Coded Business Logic:**
- **Minimum Viable Event**: 100+ guests target for all events
- **Artist Formula**: 11 confirmed artists + 1 wildcard = acceptable
- **Timeline Constraints**: All recommendations must be executable within available time
- **No Artist Backup Suggestions**: System never recommends artist replacements
- **Data-Driven Decisions**: Every recommendation requires specific health metric justification

**Integration Points:**
- **Database**: Event data, artist status, registration metrics
- **Supabase**: Modern data pipeline and real-time updates  
- **OpenAI**: GPT-4 analysis and natural language recommendation generation
- **Slack**: Team notifications and collaborative health monitoring
- **Email/SMS Systems**: Communication effectiveness tracking

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

root@VoteZ:~/vote_app/admin-25# cat ../vote26/art-battle-admin/UI_COMPONENT_FIELDS_ANALYSIS.md
# UI Component Fields Analysis - Admin-25 System
## Complete Field Inventory for Migration to Art-Battle-Admin

Based on detailed analysis of all UI component files in `/root/vote_app/admin-25/cdn/js/features/`


## EVENT MANAGEMENT COMPONENTS 📅

### EventEditPage.js - Event Configuration Form
**Primary Fields**: name, venue, city, country, eventbriteId, timezone, startTime, endTime, enableAuction, registrationEnabled, votingEnabled, currentRound, partnerBackground, eventStrategy

**Contestant Management**: contestantId, artistName, easelNumber, participating, entryId, competitionPoints, videoUrl, voteEndTime

**Round Structure**: roundNumber, contestants, competitionPoints, videoUrl, voteEndTime, participating status

### EventEditView.js - Quick Edit Interface  
**Form Fields**: name, venue, eventbriteId, status, currentRound, enableAuction, startTime, endTime

### EventDetail.js - Comprehensive Event Display
**State Variables**: fullEventData, loadingStats, dataTimestamp, isRefreshing, registrationStats, votingStats, peakVotingStats, expandedRounds, artistStats, latestEventbriteChart, loadingEventbriteChart, eventbriteData, eventbriteChartLoadTime

**Status Management**: active, completed, upcoming with associated color coding

### EventSearch.js - Event Discovery Interface
**Search Fields**: searchTerm, filterMode (all, live, upcoming, completed), sortBy, searchResults, loading, error, lastSearchTime

**Filter Options**: status-based filtering, date range selection, venue filtering

### EventRounds.js - Round Management System
**Round Data**: liveVotingStats, roundTurnout, roundNumber, contestants, easelNumber, artistName, votes, percentage, totalVotes

**Voting Metrics**: realtime vote tracking, turnout calculations, contestant performance

### EventStats.js - Statistics Dashboard
**Metrics Fields**: totalRegistrations, totalVotes, averageVotes, peakVotingTime, topArtist, auctionTotal, bidCount

### EventActions.js - Bulk Operations
**Action Types**: bulk status updates, round management, contestant assignments, data export functions

### VoteFactorBar.js - Voting Visualization
**Visual Data**: voteFactors, percentages, color coding, realtime updates, bar chart rendering

---

## ARTIST MANAGEMENT COMPONENTS 🎨

### ArtistDetail.js - Artist Profile Management
**Profile Fields**: name, email, phone, instagram, bio, location, profileImage, socialMedia, contactInfo, emergencyContact

**Performance Data**: totalEvents, winRate, averageVotes, auctionEarnings, topPlacement, recentEvents

**Portfolio Info**: artworkCount, featuredPieces, galleryImages, artistStatement

### ArtistSearch.js - Artist Discovery
**Search Parameters**: searchTerm, filterLocation, filterPerformance, sortBy (name, performance, recent), searchResults, loading, pagination

**Filter Options**: location-based, performance metrics, availability status, event history

### ArtistEventsPanel.js - Event Participation History
**Event Data**: eventName, eventDate, placement, votes, earnings, status, participation details

**Historical Metrics**: performance trends, win/loss ratios, improvement tracking

### ArtistArtworksPanel.js - Portfolio Management
**Artwork Fields**: title, description, medium, dimensions, creationDate, eventContext, salePrice, status

**Gallery Data**: thumbnails, fullSize images, artwork metadata, display order

### ArtistAuctionInfoPanel.js - Auction Performance
**Auction Metrics**: totalEarnings, averageSalePrice, highestSale, bidCount, soldPercentage, unsoldCount

**Bidding Data**: startingBid, finalBid, bidderCount, auctionDate, paymentStatus

---

## ARTWORK COMPONENTS 🖼️

### ArtworkDetail.js - Individual Artwork Management
**Artwork Fields**: title, artist, description, medium, dimensions, creationDate, estimatedValue, startingBid, finalPrice, status

**Image Management**: originalImage, thumbnailImage, progressImages, imageMetadata, uploadDate, imageQuality

**Auction Integration**: biddingHistory, currentBid, bidIncrement, auctionEndTime, winningBidder

### ArtSearch.js - Artwork Discovery
**Search Criteria**: searchTerm, artistFilter, eventFilter, mediumFilter, priceRange, statusFilter, dateRange

**Sort Options**: by price, by date, by artist, by popularity, by auction performance

---

## LOYALTY MANAGEMENT COMPONENTS 👥

### LoyaltyGuestDetail.js - Customer Profile
**Personal Info**: firstName, lastName, email, phone, preferredName, dateOfBirth, location, registrationDate

**Engagement Data**: totalEvents, totalVotes, totalSpent, avgSpentPerEvent, lastActivity, loyaltyTier

**Communication**: emailOptIn, smsOptIn, marketingPreferences, communicationHistory, preferredChannel

### LoyaltyRFMDisplay.js - RFM Analysis
**RFM Metrics**: recencyScore (0-5), frequencyScore (0-5), monetaryScore (0-5), rfmSegment, lifetimeValue, churnRisk

**Scoring Factors**: daysSinceLastEvent, eventFrequency, totalRevenue, avgTransactionValue, engagementTrend

### LoyaltyEventHistory.js - Attendance Tracking
**Event Data**: eventName, attendanceDate, ticketType, spentAmount, votingActivity, friendsInvited

**Participation**: checkInTime, votingCount, auctionBids, merchandise purchases, social sharing

### LoyaltyAuctionHistory.js - Bidding Behavior
**Bidding Data**: eventName, artworkTitle, bidAmount, bidTime, bidStatus (won/lost), finalPrice, paymentStatus

**Preferences**: preferredCategories, bidingPatterns, maximumBidLimits, paymentMethods

### LoyaltyMessageHistory.js - Communication Log
**Message Data**: messageDate, messageType (sms/email), messageContent, deliveryStatus, responseAction, campaignId

**Engagement**: openRate, clickRate, responseTime, conversionAction, unsubscribeStatus

### VisibleOffersSection.js - Active Promotions
**Offer Data**: offerTitle, offerDescription, offerValue, offerType, validUntil, redemptionLimit, usageCount

**Targeting**: eligibilityRules, geographicScope, rfmRequirements, inventoryRemaining

---

## OFFERS (POV) SYSTEM COMPONENTS 🎁

### OfferDetail.js - Offer Configuration
**Basic Info**: name, description, terms, type (ticket/merchandise/auction_credit/discount), value, currency

**Targeting**: geographyScope, minRecencyScore, maxRecencyScore, minFrequencyScore, maxFrequencyScore, minMonetaryScore, maxMonetaryScore, rfmSegments

**Management**: totalInventory, startDate, endDate, active, displayOrder, tileColor, redemptionLink, redemptionMessage, imageUrl

**Analytics**: redemptionCount, viewCount, clickRate, conversionRate, remainingInventory

### OfferSearch.js - Offer Management Interface
**Search Parameters**: searchQuery, filterActive (active/inactive/all), offerType, dateRange, geographicFilter

**Display Data**: offersList, loading, error, lastFetch, sortBy, pagination

### POV.html - Public Offer Interface
**User Data**: userHash, userInfo, eligibleOffers, ineligibleOffers, topCities, debugInfo, rfmScore

**Interaction**: selectedOffer, showRedemptionModal, redemptionResult, reservations, countdowns

**Debug Mode**: debugExpanded, detailed analytics, offer testing, redemption simulation

---

## USER MANAGEMENT COMPONENTS 👤

### UserDetail.js - User Profile Management
**Profile Fields**: firstName, lastName, email, phone, username, password, profileImage, timezone, language

**Authorization**: permissions, roles, adminLevel, accessLevel, departmentAccess, eventAccess

**Activity**: lastLogin, loginCount, createdDate, lastModified, accountStatus, sessionData

### UsersList.js - User Administration
**List Management**: usersList, searchTerm, filterRole, filterStatus, sortBy, pagination, bulkActions

**User Data**: displayName, email, role, status, lastActivity, permissions, createdDate

### CreateUserForm.js - New User Creation
**Required Fields**: firstName, lastName, email, initialPassword, role, permissions, notificationPreferences

**Optional Fields**: phone, department, directManager, accessNotes, temporaryAccess, expirationDate

### PermissionToggle.js - Access Control
**Permission Types**: viewEvents, editEvents, viewArtists, editArtists, viewUsers, editUsers, viewPayments, viewAnalytics, manageSettings, systemAdmin

**Scope Controls**: eventScope, geographicScope, departmentScope, temporalScope

---

## HEALTH MONITORING COMPONENTS 💊

### HealthDetail.js - System Health Dashboard  
**System Metrics**: apiStatus, databaseStatus, responseTime, uptime, errorRate, memoryUsage, diskSpace

**Event Health**: registrationRate, votingActivity, technicalIssues, performanceMetrics, alertStatus

**AI Recommendations**: healthScore, riskFactors, recommendedActions, trendAnalysis, predictiveAlerts

### HealthAllRecommendations.js - AI Insights
**Recommendation Types**: performanceOptimization, securityAlerts, capacityPlanning, userExperience, businessInsights

**Metrics**: confidenceScore, urgencyLevel, implementationEffort, expectedImpact, historicalTrends

### HealthTimeline.js - Historical Health Trends
**Timeline Data**: healthEvents, performanceMarkers, systemChanges, incidentTracking, recoveryTimes

**Visualization**: trendLines, anomalyDetection, correlationAnalysis, seasonalPatterns

---
