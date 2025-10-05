# JWT Authentication Patterns for Art Battle Admin

## Overview

This document explains how to properly handle JWT authentication between the Art Battle Admin frontend and Supabase Edge Functions.

## Key Concepts

### 1. Storage Location

The admin app uses a **custom storage key** for authentication:
- **Storage Key**: `artbattle-admin-auth` (defined in `/art-battle-admin/src/lib/supabase.js`)
- **NOT** the default `sb-<project-ref>-auth-token`

To access the session in browser console:
```javascript
JSON.parse(localStorage.getItem('artbattle-admin-auth'))
```

### 2. Frontend: Getting and Passing JWT

#### ✅ CORRECT Pattern

```javascript
// 1. Get the session FIRST
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  throw new Error('Not authenticated');
}

// 2. Pass the token explicitly in headers
const { data, error } = await supabase.functions.invoke('admin-function-name', {
  body: {
    // your data
  },
  headers: {
    Authorization: `Bearer ${session.access_token}`
  }
});
```

#### ❌ INCORRECT Pattern

```javascript
// DON'T rely on automatic auth header passing
const { data, error } = await supabase.functions.invoke('admin-function-name', {
  body: { /* data */ }
  // Missing headers!
});
```

**Why**: The Supabase JS client doesn't automatically pass the auth session to edge functions in all cases. Always pass it explicitly.

### 3. Edge Function: Receiving and Validating JWT

#### ✅ CORRECT Pattern

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Get Authorization header FIRST (before creating client)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. Extract JWT from "Bearer <token>"
    const jwt = authHeader.replace('Bearer ', '');

    // 3. Create client with anon key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // 4. Validate JWT by passing it directly to getUser()
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 5. Now you have authenticated user!
    console.log('Authenticated user:', user.id, user.email);

    // Continue with your function logic...
  }
});
```

#### ❌ INCORRECT Patterns

**Wrong #1: Creating client with header before checking it exists**
```typescript
// DON'T DO THIS - client creation will fail if header is null
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  {
    global: {
      headers: { Authorization: req.headers.get('Authorization')! }, // Could be null!
    },
  }
);
```

**Wrong #2: Not passing JWT to getUser()**
```typescript
// DON'T DO THIS - getUser() needs the JWT passed as parameter
const { data: { user }, error } = await supabaseClient.auth.getUser();
// This returns "Auth session missing!" error
```

**Correct**: Pass the JWT directly:
```typescript
const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
```

### 4. Bypassing RLS with Service Role

When you need to bypass RLS (after verifying user permissions):

```typescript
// Verify user is authenticated and authorized
const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);

// Check if user is ABHQ admin
const supabaseService = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const { data: adminCheck } = await supabaseService
  .from('abhq_admin_users')
  .select('active')
  .eq('user_id', user.id)
  .eq('active', true)
  .single();

if (!adminCheck) {
  return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 });
}

// NOW use service role for the actual operation to bypass RLS timeouts
const { data, error } = await supabaseService
  .from('artist_profiles')
  .update({ abhq_bio: 'Updated bio' })
  .eq('id', profile_id)
  .select()
  .single();
```

**Why**: RLS policies can cause timeouts on complex queries. After verifying the user has permission, use service role to bypass RLS.

## Common Errors and Solutions

### Error: "Auth session missing!"

**Cause**: JWT not passed correctly to `getUser()`

**Solution**: Extract JWT from header and pass it directly:
```typescript
const jwt = authHeader.replace('Bearer ', '');
const { data: { user } } = await supabaseClient.auth.getUser(jwt);
```

### Error: "permission denied for table"

**Cause**: Using authenticated client with RLS that doesn't allow the operation

**Solution**: After verifying permissions, use service role client:
```typescript
const { data, error } = await supabaseService.from('table').update({...});
```

### Error: "canceling statement due to statement timeout"

**Cause**: RLS policy is too slow (complex subqueries)

**Solution**: Same as above - verify permissions, then use service role to bypass RLS

## Complete Working Example

See these files for reference:
- **Frontend**: `/art-battle-admin/src/components/EventDetail.jsx`
  - Search for `fetchSampleWorks` and `saveBio` functions
- **Edge Functions**:
  - `/supabase/functions/admin-get-sample-works/index.ts`
  - `/supabase/functions/admin-update-abhq-bio/index.ts`

## Security Checklist

✅ Always check auth header exists before creating client
✅ Always validate JWT with `getUser(jwt)`
✅ Always verify user permissions before performing operations
✅ Use service role only AFTER verifying permissions
✅ Return detailed error messages in development (but sanitize in production)
✅ Include debug info in error responses (see `EDGE_FUNCTION_DEBUGGING_SECRET.md`)

## Testing Auth Flow

Use browser console to check session:
```javascript
// Check if session exists
const session = JSON.parse(localStorage.getItem('artbattle-admin-auth'));
console.log('Session:', session);
console.log('Access Token:', session?.access_token);
console.log('Expires at:', new Date(session?.expires_at * 1000));
```

If session is missing or expired, log out and back in to get a fresh token.
