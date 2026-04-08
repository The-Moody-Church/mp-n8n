# Git Workflow

## Branch Before Committing
- **Never commit code changes directly to `main`** — always branch and merge via PR.
- **Documentation-only changes** (`.md`, `.claude/`, `docs/`) may go directly to `main`.
- **Always push immediately** after committing — no unpushed commits.
- **Merge commits** (not squash) to preserve full history.

## Pre-PR Steps
1. Update `docs/status.md` to reflect completed work.
2. Update `docs/ideas.md` — mark completed items.
3. Create session summary in `docs/sessions/` if substantial work was done.
4. Ensure all context files are included in the commit.

## Commit Hygiene
- Keep `.env.example` in sync when env vars change.
- Auto-commit `.claude/settings.local.json` changes are gitignored.
- Use merge commits: `gh pr merge --merge`, never squash.
