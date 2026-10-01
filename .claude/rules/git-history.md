---
description: Keep git history clean; commit each completed work step
alwaysApply: true
---

# Clean git history

- **One step, one commit**: When a work step is finished, create a git commit immediately. Do not batch many steps into a single large commit.
- **Work steps**: For feature work, treat each finished item in `tasks.md` as a step. For ad-hoc work, commit when the change is coherent and reviewable on its own (bug fix, single refactor, one endpoint, etc.).
- **Do not ask first**: Completing a step includes committing it; do not wait for the user to request a commit for that step.
- **Branches**: Use a branch when it keeps `main` clean or when work spans multiple commits that belong together.
- **Portable checkout**: The repo must stay cloneable and developable on another machine. Put generated or local-only artifacts in `.gitignore`; never commit secrets (`.env`, credentials, keys).

Commit messages: short, focused on *why* the step matters; match recent history in the repo.
