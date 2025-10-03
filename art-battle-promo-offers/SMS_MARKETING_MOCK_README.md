# SMS Marketing Opt-In Mock Component

## Purpose
This component (`SmsMarketingOptIn.jsx`) is a **mock UI for screenshot purposes only**. It demonstrates the SMS marketing preferences interface without any backend functionality.

## Usage

### To Enable (for screenshots):
1. Open `src/components/PublicOfferViewer.jsx`
2. Add import at the top:
   ```javascript
   import SmsMarketingOptIn from './SmsMarketingOptIn'
   ```
3. Add the component in the render, for example after the greeting:
   ```javascript
   {/* MOCK UI - Remove after screenshot */}
   <SmsMarketingOptIn />
   ```
4. Deploy: `./deploy.sh`

### To Disable (normal operation):
1. Remove the import line from `PublicOfferViewer.jsx`
2. Remove the `<SmsMarketingOptIn />` component usage
3. Deploy: `./deploy.sh`

## File Location
`src/components/SmsMarketingOptIn.jsx`

## Features Shown
- Name input field
- Phone number input field
- Three toggle switches:
  - **Upcoming Events**: Get notified about Art Battle events in your area
  - **Special Offers**: Receive exclusive discounts and promotional offers
  - **Only Critical Transaction Messages**: Only receive important account and transaction updates
- Italic disclaimer text about preference changes and unsubscribe option

## Notes
- No backend integration
- No state persistence
- Purely for visual/marketing purposes
- Can be kept in codebase for future use
- Clean separation allows easy enable/disable
