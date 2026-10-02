// Helpers for domain tests only; production code never imports this file.
import { applyChanges, isRefusal, type Changes, type Context } from "./changes";
import { checkInvariants } from "./invariants";
import type { Refusal, State } from "./types";

/** Ids `id-1`, `id-2`, … so tests can name the records they create. */
export function idCounter(prefix = "id"): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export function testContext(today = "2026-09-03"): Context {
  return { today, newId: idCounter("new") };
}

/** The changes of a decision that a test expects to succeed. */
export function changesOf(decision: Changes | Refusal): Changes {
  if (isRefusal(decision)) throw new Error(`Refused: ${JSON.stringify(decision)}`);
  return decision;
}

/** Applies `changes` and throws if the result breaks an invariant (data-model.md). */
export function applyValid(state: State, changes: Changes): State {
  const next = applyChanges(state, changes);
  const broken = checkInvariants(next);
  if (broken) throw new Error(`Invariant broken: ${JSON.stringify(broken)}`);
  return next;
}
