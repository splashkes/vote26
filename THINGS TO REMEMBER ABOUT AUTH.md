# Things to Remember About Auth

## Edge Function Authentication Patterns

### When Using Anon Key with RLS-Protected Tables

**CRITICAL**: When an Edge Function uses the anon key to query RLS-protected tables, you MUST forward the user's Authorization header to maintain proper RLS context.

#### Problem Example:
```typescript
// ❌ WRONG - Will cause 400/401 errors with RLS-protected tables
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''
)
```

#### Solution:
```typescript
// ✅ CORRECT - Forwards auth context for RLS
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') ?? ''
      }
    }
  }
)
```

### Why This Matters:
- Even if tables have `anon` read policies, authenticated users need their auth context passed through
- Without auth forwarding, RLS policies may not match correctly
- This causes mysterious 400/401 errors that are hard to debug
- The error often manifests as "Failed to load resource: the server responded with a status of 400"

### Real-World Example:
In `get-event-details-for-artist-profile`, artists were getting 400 errors when loading their invitations because:
1. Function used anon key without auth forwarding
2. Queried `events` and `cities` tables (both RLS-protected)
3. RLS couldn't properly evaluate policies without user context
4. Resulted in permission errors manifesting as 400 responses

### When to Use Each Pattern:

1. **Service Role**: Use for admin functions or when bypassing RLS entirely
2. **Anon Key + Auth Forwarding**: Use for user-facing functions that need RLS context
3. **Anon Key Only**: Use only for truly public data with no RLS requirements

### Functions Using This Pattern:
- `get-event-details-for-artist-profile` - Fixed 2025-09-19
- `artist-get-my-profile` - Uses dual client pattern (anon for auth verification, service for data)