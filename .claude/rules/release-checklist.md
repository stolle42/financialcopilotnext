# Release checklist

- **Every phase starts with a check of the previous release**: when writing a phase's tasks, add a
  task, owned by the project owner with Claude, that checks every step of the previous release's
  [release checklist](../../specs/001-finance-tracker-v1/quickstart.md#release-checklist) was done
  (merged, tag pushed on `main`, CI green, checks walked at the web address), and does any step
  that was not.
- **Tasks stay tickable on the branch**: steps that can only happen around or after the merge
  (tag, checks at the web address, the Update from the old version) belong in the release
  checklist, not in a task of `tasks.md`.
