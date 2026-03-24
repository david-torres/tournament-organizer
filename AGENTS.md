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
4. **Verify** - All changes committed
5. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Ticket changes in `.tickets/` must be committed with the code they track
