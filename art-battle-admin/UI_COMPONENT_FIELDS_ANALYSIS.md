# UI Component Fields Analysis - Admin-25 System
## Complete Field Inventory for Migration to Art-Battle-Admin

Based on detailed analysis of all UI component files in `/root/vote_app/admin-25/cdn/js/features/`

---

## MISSING CRITICAL SYSTEMS

### 1. HEALTH REPORT SYSTEM 💊 (health-md6 endpoint)
**API Endpoint**: `/api/v1/health-md6/{eventId}?template=template_health_report_3.md`
**Description**: AI-powered event health analysis system that generates markdown reports
**Handler**: `internal/handlers/stub_handlers.go:124` - `HealthMD6` function
**Features**:
- **Template-based reporting**: Uses customizable markdown templates
- **Real-time health metrics**: Event status, performance indicators
- **AI-generated recommendations**: Automated insights and suggestions  
- **Historical tracking**: Health trends over time
- **Integration points**: Links to prefetch system, health monitoring
- **Output format**: Markdown reports for easy display and sharing

### 2. PDF PAPERWORK SYSTEM 📄 (event-pdf endpoint)
**API Endpoint**: `/api/v1/event-pdf/{eid}` 
**Description**: Automated PDF generation for event documentation
**Handler**: `internal/handlers/paperwork_handler.go:47` - `GeneratePublicPaperwork` function
**Features**:
- **Public access**: No authentication required for public PDFs
- **Event-specific**: Generated per event EID (e.g., AB2935)
- **Template-driven**: Customizable PDF layouts
- **Bulk generation**: Support for multiple event formats
- **Integration**: Links to lot service, event service
- **Use cases**: Registration forms, artist info, event schedules

---

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

## ANALYTICS COMPONENTS 📈

### AnalysisSandbox.js - Custom Analytics Workspace
**Workspace Fields**: queryBuilder, dataSourceSelection, visualizationType, customFilters, timeRange

**Code Editor**: sqlQuery, javascriptCode, pythonScript, resultFormat, executionStatus

### BookingAnalysisPanel.js - Booking Pattern Analysis
**Booking Metrics**: bookingTrends, seasonalPatterns, geographicDistribution, priceElasticity, cancellationRates

**Forecasting**: predictedBookings, capacityUtilization, revenueProjections, demandPatterns

### PeakRateChart.js - Peak Activity Analysis
**Peak Data**: peakTimes, peakDates, activityLevels, userConcurrency, systemLoad, responseMetrics

**Visualization**: timeSeriesData, heatMapData, distributionCharts, comparativeAnalysis

---

## PAYMENT COMPONENTS 💳

### PaymentDetail.js - Transaction Management
**Payment Fields**: transactionId, amount, currency, paymentMethod, paymentDate, paymentStatus, customerId

**Processing**: processorResponse, authorizationCode, merchantFee, netAmount, refundStatus, chargebackData

### PaymentsList.js - Financial Overview
**Transaction List**: payments, filters, searchTerm, dateRange, amountRange, statusFilter, customerFilter

**Financial Metrics**: totalRevenue, refundAmount, feeAmount, netRevenue, transactionCount

---

## SETTINGS COMPONENTS ⚙️

### SettingsDetail.js - System Configuration
**System Settings**: applicationName, defaultTimezone, defaultCurrency, maxUploadSize, sessionTimeout

**Email Settings**: smtpServer, smtpPort, fromAddress, replyToAddress, emailTemplates

**Payment Settings**: stripePublicKey, paymentGateway, processingFees, refundPolicy

**Security Settings**: passwordRequirements, twoFactorAuth, sessionSecurity, apiRateLimits

---

## LOGGING COMPONENTS 📊

### SystemLogsView.js - System Activity
**Log Fields**: timestamp, logLevel, component, message, userId, sessionId, ipAddress, userAgent

**Log Categories**: authentication, dataModification, systemErrors, performanceAlerts, securityEvents

### AuthDebugLogsView.js - Authentication Debugging
**Auth Data**: loginAttempts, authenticationStatus, sessionManagement, permissionChecks, securityViolations

**Debug Info**: tokenValidation, permissionResolution, roleAssignment, accessDenialReasons

---

*This comprehensive field analysis covers all major UI components and their data requirements for the Admin-25 to Art-Battle-Admin migration. Each component section lists the specific form fields, state variables, and data structures used in the original system.*