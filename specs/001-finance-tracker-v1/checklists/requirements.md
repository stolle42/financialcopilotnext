# Specification Quality Checklist: Getting started (v1.7)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-22
**Feature**: [spec.md](../spec.md), [User Story 11](../spec.md#user-story-11),
[FR-132](../spec.md#fr-132) – [FR-141](../spec.md#fr-141)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Clarified 2026-10-22: the screens call a mapping profile a "bank CSV format"
  ([FR-138](../spec.md#fr-138)); the spec keeps the name mapping profile.
- The spec names encodings, date formats and example column names. These are facts of the bank
  files the app reads, already part of [FR-021](../spec.md#fr-021) and
  [csv-import.md](../contracts/csv-import.md), not implementation. How the app reads a file's
  layout, and the full list of column names it recognises, are left to the plan.
- Existing requirements that v1.7 changes are updated in place and name the change: FR-021,
  FR-084, FR-095 and FR-100. [User Story 8](../spec.md#user-story-8) scenario 1 now leads to
  [FR-135](../spec.md#fr-135).
- Added 2026-10-22 at the owner's request: the screen FAQ ([FR-139](../spec.md#fr-139) –
  [FR-141](../spec.md#fr-141)). [FR-140](../spec.md#fr-140) lists the questions FAQ must hold
  and what each answer must say, each tied to the requirements it explains; the wording of the
  answers is left to the plan. The guide to the app holds FAQ, so the chat and FAQ cannot
  disagree.
- [FR-136](../spec.md#fr-136) corrects the guide to the app, which through v1.6 said that AI
  features work only on the user's own computer, against [FR-128](../spec.md#fr-128).
- Of the ideas weighed for v1.7, a getting-started checklist, sample data, a backup reminder and a
  layout for narrow windows were left out; [Out of Scope](../spec.md#out-of-scope) lists them.
- For the plan: the ui.md contract needs New account on Import, the chat's state while AI features
  are off, the sign hint, each screen's sentence, every label and message renamed from profile
  to bank CSV format, and the FAQ screen with its route and sidebar entry; csv-import.md needs the
  rules of [FR-133](../spec.md#fr-133) and the column names; ai.md and `appGuide.ts` need the
  corrected guide, which holds FAQ; [SC-023](../spec.md#sc-023) needs five bank exports rebuilt
  with made-up data.
