# Repo and Source Triage (AB)

## Goal
Find the authoritative SPA source tree before debugging UI behavior.

## Steps
1. Inspect current workspace contents and confirm SPA directories exist.
2. If missing, search common locations for `vote26` and `art-battle-admin`.
3. Compare candidates by checking:
- `git rev-parse --is-inside-work-tree`
- `git remote -v`
- `git status -sb`
- `git rev-parse --abbrev-ref HEAD`
4. Prefer clones with:
- configured `origin`
- branch tracking (`main...origin/main`)
- minimal local drift

## Critical AB Learning
A workspace can contain only backend fragments (for example, just `supabase/`) while the actual SPA lives in another clone. Always verify before patching.

## Quick Checks
```bash
find /Users/splash -maxdepth 5 -type d -iname 'art-battle-admin' 2>/dev/null

git -C /path/to/repo remote -v
git -C /path/to/repo status -sb
git -C /path/to/repo rev-parse --abbrev-ref HEAD
```
