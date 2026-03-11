# Clean Sync Fast-Forward (AB)

## Goal
Bring a repo fully in sync with remote when user requires no local changes.

## Standard Sequence
```bash
git fetch origin
git checkout main
git reset --hard origin/main
git clean -fd
git stash clear
git status -sb
```

## Fast-Forward Pull Sequence (when preserving local work)
```bash
git pull --ff-only
```
If blocked by local changes, decide with user whether to:
- stash and re-apply targeted files
- or discard all local changes with `reset --hard`

## Critical AB Learning: Case-Collision on macOS
Repositories containing both case variants (for example `DELETE_...sql` and `delete_...sql`) can cause persistent dirty states and pull blocks on case-insensitive filesystems.

Practical mitigations:
- Prefer pulling a commit that resolves the collision (rename to unique filename).
- Use temporary index/worktree mitigations only if necessary and then restore normal state.
- Re-check `git status -sb` and ensure `HEAD == origin/main` after sync.

## Reporting Contract
Always report:
- exact branch and commit hash
- whether working tree is clean
- any residual environment/file-system caveats
