---
name: ab-spa-webapp-interactions
description: Diagnose and fix Art Battle SPA interaction bugs across frontend components, edge functions, and Supabase data paths. Use when an admin/user flow behaves incorrectly (missing dropdown options, broken modals, wrong records shown, failed actions), when the true SPA source directory is unclear, or when a clean fast-forward sync is required before patching.
---

# AB SPA Webapp Interactions

## Overview
Run a UI-first but data-backed workflow for Art Battle SPA issues: locate the real codebase, trace the interaction path end-to-end, patch the smallest reliable fix, and verify behavior with repository hygiene.

## Workflow
1. Confirm the correct repository and working tree before editing.
2. Reproduce the exact interaction and identify the failing UI state.
3. Trace the data path from component to API to DB/RPC.
4. Apply minimal changes at the right layer.
5. Validate touched files and report residual risks.

## 1) Locate The Real SPA Source
- Verify the current workspace contains the expected SPA folders.
- If not, search likely roots for the project (`art-battle-admin`, `vote26`, sibling checkouts).
- Prefer the clone with a valid remote and upstream tracking for `main`.
- Record absolute paths before any edits.

Use: [references/repo-and-source-triage.md](references/repo-and-source-triage.md)

## 2) Reproduce The Interaction Failure
- Identify the exact route and UI control (page, modal, dropdown, CTA).
- Confirm which component renders the control.
- Capture the filtering/query logic currently used by that control.
- Check for list truncation, date-window filtering, and sort-direction mismatches.

Use: [references/spa-interaction-debug-playbook.md](references/spa-interaction-debug-playbook.md)

## 3) Trace Data Path End-To-End
- Start at the UI component query.
- Follow calls to edge function/RPC/table access.
- Verify whether the bug is caused by frontend filtering, backend filtering, permissions, or stale environment.
- For write flows, inspect the exact payload fields sent by the SPA before assuming the backend received what the UI displayed.
- Distinguish display-only derived values from canonical backend fields. A visible currency selector may not be the event payment currency.
- Prefer direct code and query evidence over assumptions.

## 4) Patch Minimally
- Edit only components/functions proven to be part of the failing path.
- Keep fixes local and reversible.
- For event-selection regressions, favor explicit date window + larger bounded limit + deterministic ordering.
- Apply equivalent fixes to parallel UI surfaces (for example, duplicate invite modals).
- When backend is the source of truth, prefer displaying the backend field directly over adding new frontend fallback logic.

## 5) Sync And Verify Safely
- If the user requests clean sync, ensure no local drift before pull.
- Use fast-forward-only pulls and report blockers explicitly.
- If case-collision files exist on macOS, handle with controlled mitigation, then re-verify status.
- Run focused validation on touched files when full repo checks are noisy.

Use: [references/clean-sync-fast-forward.md](references/clean-sync-fast-forward.md)

## Output Requirements
- Name the exact files/lines changed.
- State whether the repo is clean or has remaining local modifications.
- Distinguish new issues from pre-existing repo issues.
- Include concrete reproduction checks for the user to run in the UI.
