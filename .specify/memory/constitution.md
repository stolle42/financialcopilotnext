# FinancialCopilotNext Constitution

## Core Principles

### I. Single Source of Truth

Information MUST exist in exactly one markdown file. Any other document that needs it MUST link
to the original instead of restating it. A task links to its requirement in the spec; it does
not restate it.

Rationale: restated text drifts from its source. One source means one place to change and read.

### II. KISS

Every change MUST be the smallest change that satisfies the current requirement. Code for a
requirement that does not yet exist MUST NOT be written.

### III. DRY

Shared code MUST be extracted only on the second real use. A single or merely anticipated use is
not grounds for an abstraction.

### IV. SOLID

A module has one reason to change. An interface MUST be introduced only at a boundary that is
actually swapped, such as a database or an external API. Elsewhere, call the concrete code.

### V. Clean Architecture

Dependencies MUST point inward. Business rules MUST NOT import from the web framework, the UI,
or the persistence layer; those outer layers depend on the business rules. A layer boundary
becomes an explicit interface only under Principle IV.

Rationale: business rules that run without a database or HTTP request are cheap to test, which
makes Principle VII affordable.

### VI. Clean Code

Names say what the value is. A function does one thing. Comments explain why, not what.

### VII. Test-Driven Development

For a behavior change: write a failing test, then the minimum code that passes, then refactor.
Production behavior MUST NOT be added without a test that fails if that behavior breaks.

### VIII. User Experience & Defensive Error Handling

- The UI MUST feel modern and be easy to use.
- Errors that can reasonably be expected (invalid input, network failures, missing data) MUST be
  caught and handled.
- Every user-facing error MUST state in plain language what went wrong and what the user can do.
- Diagnosing a failure MUST NOT normally require the browser console; that is reserved for the
  truly unexpected.

## Development Workflow

1. Specify and plan the feature; tasks link to spec requirements (Principle I).
2. Implement each task test-first (Principle VII) with the smallest passing change (Principle II).
3. Refactor only once tests are green, applying Principles III–VI.

## Quality Gates

A change is mergeable only when:

- All tests pass, and new behavior has a test that fails without it.
- No business-rule module imports framework, UI, or persistence code.
- No duplicated documentation or speculative abstraction was introduced.
- Expected error paths are handled and show a clear message to the user.

## Governance

This constitution supersedes other practices. Plans and reviews MUST verify compliance; any
deviation MUST be justified in the plan and approved before implementation.

Amendments are made by editing this file and bumping the version:
MAJOR for removed or redefined principles, MINOR for added or materially expanded principles or
sections, PATCH for wording fixes.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
