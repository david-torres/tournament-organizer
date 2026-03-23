# Agent Instructions

This project uses `tk` for issue tracking. Tickets live in `.tickets/`.

## Quick Reference

```bash
tk ready              # Find available work
tk show <id>          # View ticket details
tk start <id>         # Claim work
tk close <id>         # Complete work
tk create "title"     # File follow-up work
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create tickets for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update ticket status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- Ticket changes in `.tickets/` must be committed and pushed with the code they track
- If push fails, resolve and retry until it succeeds
