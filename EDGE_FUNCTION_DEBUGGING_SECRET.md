# Edge Function Debugging Secret 🕵️

## The Problem
Edge function console.log() outputs **DO NOT** reliably appear in Supabase logs. This has caused massive debugging headaches across multiple functions.

## The Secret Solution ✨

**NEVER rely on console.log for debugging edge functions.** Instead, return detailed debug information in the response body.

### ❌ What Doesn't Work
```typescript
// This console output often doesn't show up in logs
console.log('Debug info:', someData);
throw new Error('Something failed');
```

### ✅ What Actually Works
```typescript
// Return detailed debug info in the response body
return new Response(
  JSON.stringify({ 
    error: 'Detailed error message',
    success: false,
    debug: {
      timestamp: new Date().toISOString(),
      error_type: error.constructor.name,
      stack: error.stack,
      received_data: requestBody,
      query_results: queryData,
      function_name: 'your-function-name',
      // Add any other debug info you need
      validation_details: {
        confirmation_id: confirmation_id,
        confirmation_id_type: typeof confirmation_id,
        body_keys: Object.keys(body || {})
      }
    }
  }),
  { 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 400  // or appropriate error status
  }
)
```

### Client-Side Parsing
```javascript
if (error && error.context && error.context.text) {
  try {
    const responseText = await error.context.text();
    console.log('Raw edge function response:', responseText);
    const parsed = JSON.parse(responseText);
    
    if (parsed.debug) {
      console.log('Edge function debug info:', parsed.debug);
    }
  } catch (e) {
    console.log('Could not parse error response:', e);
  }
}
```

## Key Principles

1. **Return debug info in response body** - not console.log
2. **Use structured JSON responses** with debug objects
3. **Include timestamps** for timing issues
4. **Show received data** to verify what's being sent
5. **Include query results** to debug database issues
6. **Use appropriate HTTP status codes** (400, 401, 500, etc.)
7. **Parse the response on client side** to see the debug info

## Examples of Good Debug Info

### Database Query Failures
```typescript
debug: {
  confirmation_id: confirmation_id,
  get_error: getError,
  confirmation_found: !!confirmation,
  query_details: {
    table: 'artist_confirmations',
    filter_id: confirmation_id,
    filter_status: 'confirmed'
  }
}
```

### Validation Failures
```typescript
debug: {
  received_body: body,
  confirmation_id_value: confirmation_id,
  confirmation_id_type: typeof confirmation_id,
  body_keys: Object.keys(body || {}),
  required_fields: ['confirmation_id', 'reason']
}
```

### Authentication Issues
```typescript
debug: {
  auth_header_present: !!authHeader,
  user_id: user?.id,
  person_id: user?.user_metadata?.person_id,
  auth_error: authError?.message
}
```

## This Technique Saved Us

This approach finally revealed that our cancel-confirmation function was failing because:
- The database query couldn't find the confirmation 
- The confirmation status filter was wrong
- The joins were malformed

Without this technique, we were flying blind with edge functions.

## Recent Success: Timezone Bug (Sept 2, 2025)

**Problem**: Event datetime updates returning "Edge Function returned a non-2xx status code" with no details.

**Debug Strategy Used:**
```typescript
// Added comprehensive debug logging to admin-update-event function
return new Response(JSON.stringify({
  error: 'Failed to update event',
  success: false,
  debug: {
    timestamp: new Date().toISOString(),
    function_name: 'admin-update-event', 
    update_error: updateError.message,
    update_error_details: updateError.details,
    update_error_hint: updateError.hint,
    update_error_code: updateError.code,
    received_data: eventData,
    processed_timestamps: {
      start_datetime: startDateTime,
      end_datetime: endDateTime,
      timezone: eventData.timezone_icann
    },
    update_data_sent: updateData
  }
}), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  status: 500
});
```

**Result**: Immediately revealed the exact error: `Invalid datetime/timezone combination: 2025-09-06T18:00:00 America/Los_Angeles`

**Key Learning**: Added timezone-specific debug info showing:
- Raw received datetime strings
- Processed timestamp conversions  
- Timezone names vs numeric offsets
- Complete update payload being sent to database

This debug pattern helped identify that JavaScript Date() constructor doesn't accept timezone name format, leading to the proper `Intl.DateTimeFormat` solution.

## Fast Debug Pattern for Complex Functions

For functions with multiple failure points, add debug info at each stage:

```typescript
const debugInfo = {
  timestamp: new Date().toISOString(),
  function_name: 'your-function-name',
  auth_check: { user_id: user?.id, has_permissions: !!adminUser },
  validation_results: { missing_fields: missingFields, format_checks: validationStatus },
  data_processing: { input_data: eventData, processed_data: updateData },
  database_operation: { query_type: 'UPDATE', affected_table: 'events' }
};

// Return debug info in ALL error responses
if (updateError) {
  return new Response(JSON.stringify({
    error: 'Operation failed',
    success: false,
    debug: { ...debugInfo, error_details: updateError }
  }), { headers: corsHeaders, status: 500 });
}
```

## Remember: Console.log() is Unreliable in Edge Functions!

Always use response body debugging for edge functions. Save yourself hours of frustration.