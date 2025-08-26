# Stripe Connect Onboarding Issue

## Problem
The `stripe-connect-onboard` edge function is failing with 400 errors because it requires `first_name` and `last_name` fields from the `people` table, but these are often NULL.

## Details
- **Function**: `/supabase/functions/stripe-connect-onboard/index.ts`
- **Error Location**: Lines 108-109 where Stripe account creation expects:
  ```typescript
  individual: {
    first_name: person.first_name,  // Often NULL
    last_name: person.last_name,    // Often NULL
    email: artistProfile.email || person.email,
  }
  ```

## Example Failing Case
- **User**: Oliver Ridgen (auth_user_id: `ac70889f-2da8-4f56-9e76-3bd8f76c981f`)
- **Person Record**: `first_name` and `last_name` are NULL
- **Artist Profile**: Has combined `name` field: "Oliver Ridgen"
- **Result**: Stripe Connect account creation fails

## Potential Solutions

### Option 1: Parse Artist Profile Name
Split `artist_profiles.name` into first/last names:
```typescript
const nameParts = artistProfile.name.split(' ')
const firstName = nameParts[0] || 'Artist'
const lastName = nameParts.slice(1).join(' ') || 'User'
```

### Option 2: Use Combined Name
Use the full name for both fields:
```typescript
individual: {
  first_name: artistProfile.name || 'Artist',
  last_name: artistProfile.name || 'User',
  email: artistProfile.email || person.email,
}
```

### Option 3: Make Fields Optional
Handle NULL values gracefully:
```typescript
individual: {
  first_name: person.first_name || artistProfile.name?.split(' ')[0] || 'Artist',
  last_name: person.last_name || artistProfile.name?.split(' ').slice(1).join(' ') || 'User',
  email: artistProfile.email || person.email,
}
```

## Impact
Artists cannot complete Stripe Connect onboarding to receive payments for their work.

## Priority
**HIGH** - Blocks artist payment functionality

## Status
**PENDING** - Needs implementation and testing