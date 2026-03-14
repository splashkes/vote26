# Telnyx Send SMS Hook Setup

Date: March 13, 2026

This replaces Supabase Auth's built-in SMS delivery with a project edge function while keeping the existing phone auth flow unchanged.

## What stays the same

- `art-battle-broadcast` continues to call `supabase.auth.signInWithOtp()` and `supabase.auth.verifyOtp()`.
- The custom access token hook remains configured exactly as before.
- Person linking still happens after `phone_confirmed_at` changes.

## What changes

Supabase Auth should call the new edge function:

- Function: `auth-send-sms`
- Path: `supabase/functions/auth-send-sms/index.ts`

The function verifies the signed Supabase hook payload using `SEND_SMS_HOOK_SECRET` and sends the OTP through Telnyx.

It also falls back to `AUTH_HOOK_SECRET` if your project already standardizes auth-hook verification under that name.

## Required secrets

Add these in Supabase Dashboard -> Settings -> Edge Functions -> Secrets:

```text
SEND_SMS_HOOK_SECRET=copy from Authentication > Hooks > Send SMS
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_FROM_NUMBER=+18887111857
```

Optional instead of `TELNYX_FROM_NUMBER`:

```text
TELNYX_MESSAGING_PROFILE_ID=your_telnyx_messaging_profile_id
```

## Deploy

```bash
npx supabase functions deploy auth-send-sms --project-ref xsqdkubgyqwpyvfltnrf
```

## Supabase dashboard configuration

Go to Supabase Dashboard -> Authentication -> Hooks.

Configure:

1. Hook: `Send SMS`
2. Type: `HTTP Request`
3. URL: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-send-sms`
4. Copy the generated secret into the `SEND_SMS_HOOK_SECRET` edge-function secret
5. Enable the hook

Do not change the existing `Custom Access Token` hook.

## Smoke test

1. Open an incognito window.
2. Trigger phone login in the broadcast app.
3. Confirm the OTP SMS arrives from Telnyx.
4. Enter the code and complete login.
5. Verify person linking still occurs as usual.

## Failure modes

- Missing both `SEND_SMS_HOOK_SECRET` and `AUTH_HOOK_SECRET`: hook requests fail signature verification.
- Missing `TELNYX_API_KEY`: SMS hook returns 500 before send.
- Missing both `TELNYX_FROM_NUMBER` and `TELNYX_MESSAGING_PROFILE_ID`: Telnyx has no sender.
- Reusing `send-marketing-sms` for auth is not safe because it includes marketing opt-out and duplicate-suppression logic.
