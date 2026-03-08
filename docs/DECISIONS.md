# Architectural Decisions

> **LIVING DOCUMENT — PROVISIONAL**
> Created 2026-03-08 from automated codebase analysis. Treat all content as approximate
> until manually verified. Expected to stabilize after ~12 update cycles. If something
> looks wrong, it probably is — fix it here.

Each decision is recorded with context and rationale. Newest entries at the top.

---

### ADR-010: Repository reorganization (2026-03-08)
**Decision:** Organize 128 loose root files into `docs/`, `scripts/`, `config/` subdirectories.
**Context:** Root had accumulated session logs, SQL scripts, shell scripts, and configs over months of rapid development. Finding anything required knowing the exact filename.
**Alternatives:** Monorepo tooling (Nx/Turborepo) — rejected as overkill for independent SPAs that don't share build artifacts.

### ADR-009: Edge function RPC over raw SQL
**Decision:** Complex queries in edge functions must use dedicated PostgreSQL functions called via `.rpc()`, never `serviceClient.rpc('sql', ...)` or raw query hacks.
**Context:** The `admin-sms-promotion-audience` function broke in production because it called a nonexistent `sql()` RPC. Fixed by creating `get_campaign_responder_person_ids()` as a proper SECURITY DEFINER function.
**Rule:** If an edge function needs a complex query, create a migration with a PostgreSQL function first.

### ADR-008: SPA-per-concern architecture
**Decision:** Each major UI concern gets its own independent SPA with separate build/deploy.
**Context:** Started as a single vote app, grew to 13 SPAs. Each deploys independently to its own CDN path. No shared build pipeline.
**Trade-offs:** Slower cross-app changes, but zero deployment coupling. A bug in admin never breaks the public vote app.

### ADR-007: Supabase Edge Functions over traditional backend
**Decision:** All server-side logic runs as Supabase Edge Functions (Deno).
**Context:** No dedicated backend server. Edge functions handle auth webhooks, payment processing, SMS, email, analytics, and all admin operations.
**Trade-offs:** No persistent connections, no background workers (cron via GitHub Actions instead). Cold starts on rarely-used functions.

### ADR-006: RPC functions for all write operations
**Decision:** All data mutations go through PostgreSQL RPC functions, never direct table inserts from the client.
**Context:** RLS policies protect reads, but writes need business logic validation (bid minimums, vote deduplication, payment state machines). RPC functions centralize this.
**Functions:** `cast_vote_secure()`, `process_bid_secure()`, `manage_auction_timer()`, etc.

### ADR-005: Telnyx as primary SMS provider
**Decision:** Telnyx for all new SMS. Twilio retained as legacy fallback.
**Context:** Cost and API flexibility. Twilio webhooks still active for inbound on legacy numbers.
**Config:** Telnyx credentials in edge function env vars. Docs in `docs/sms/`.

### ADR-004: Response-body debugging for edge functions
**Decision:** Never rely on `console.log()` or `supabase functions logs` for debugging edge functions. Return debug info in JSON response body.
**Context:** Supabase function logs are unreliable — they don't consistently capture output. This was discovered the hard way during live event debugging.
**Reference:** `EDGE_FUNCTION_DEBUGGING_SECRET.md`

### ADR-003: Auth webhook pattern (no auth.users triggers)
**Decision:** Business logic after auth happens via edge function webhooks, never database triggers on `auth.users`.
**Context:** Database triggers on `auth.users` broke OTP verification during live events. BEFORE triggers on auth tables can corrupt the auth flow. AFTER triggers that modify `auth.users` cause infinite loops.
**Rule:** Let Supabase handle auth. React to auth events via webhooks only.

### ADR-002: Phone-based authentication
**Decision:** Phone OTP as the sole authentication method for public users.
**Context:** Art Battle attendees at live events need instant access — no email verification flow. Phone OTP via Supabase Auth with person record linking.
**Trade-off:** Phone number is the de facto identity key, stored in multiple formats requiring normalization.

### ADR-001: DigitalOcean Spaces as CDN
**Decision:** All static assets served from DigitalOcean Spaces (S3-compatible) via tor1 CDN edge.
**Context:** Simple, cheap, reliable. Deploy scripts use `s3cmd` to sync build output. Cache-busting via timestamp query params on `index.html`.
**Domain:** `artb.art` proxies to `artb.tor1.cdn.digitaloceanspaces.com`.
