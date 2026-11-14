# Specs

- **One folder per feature**: from v1.8 on, every feature gets its own branch and its own spec
  folder with the same name, such as branch `018-review-queue` and `specs/018-review-queue/`.
  Number them after the highest branch so far; branches `001`–`017` hold v1.0–v1.7. Create the
  branch before running `/speckit-specify`, which does not create branches in this repo, and have
  it use `specs/<branch name>` as `SPECIFY_FEATURE_DIRECTORY`. Otherwise it numbers after the
  folders in `specs/` and would pick `002`, not `018`.
- **Check the active folder**: the other speckit commands (plan, tasks, implement, …) find the
  folder through `.specify/feature.json`, which is not in git. Before running one, check that it
  names the current branch's folder; on another machine, or after switching branches, it may
  name another.
- **001 gets no new requirements**:
  [`001-finance-tracker-v1`](../../specs/001-finance-tracker-v1/spec.md) holds v1.0–v1.7. A new
  spec states only what its feature adds or changes and links to 001 for the rest, so speckit
  reads one feature instead of the whole app.
- **Changed requirements**: when a feature changes an FR of an earlier folder, its spec gets a new
  FR that states the whole requirement as it now is. The old FR keeps its number and anchor, but
  its text becomes a link to the new one, such as
  `Replaced in v1.8 by [FR-150](../018-review-queue/spec.md#fr-150).` This way requirements and
  software always agree, and each requirement is stated once
  ([constitution](../../.specify/memory/constitution.md), Principle I). Code and tests the
  feature touches cite the new FR. Sections of the data model and contracts are replaced the
  same way.
- **Numbers never restart**: FRs, SCs, user stories, R-items and task IDs continue after the
  highest number in any earlier folder, although the templates start at 1, because code, tests,
  e2e file names and commit messages cite them. Each FR gets an anchor as in 001
  (`<a id="fr-142"></a>**FR-142**: …`), so links to it work.
- **Requirements, not Q/As**: a change the owner asks for is specified as an FR, never as a Q/A
  under Clarifications.
- **Fixes need no spec**: a change that makes the app do what an FR already says needs no spec
  folder. It is released as a change made outside a feature (constitution, Principle IX).
