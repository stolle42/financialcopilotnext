import { askFinanceChat } from "@/ai/chat";
import { modelInUse } from "@/ai/models";
import type { AiRefusalCode } from "@/ai/openai";
import {
  addTurn,
  chatContext,
  chatSources,
  clearConversation as decideClearConversation,
} from "@/domain/chat";
import type { ChatTurn, Refusal, RefusalDetails } from "@/domain/types";
import { todayLocal } from "./clock";
import { aiFeaturesOn } from "./settings";
import type { Store, StoreRefusalCode } from "./store";

// The finance chat's session: the question being answered and its answer so far, held in memory
// outside any screen, so an answer goes on while the user is elsewhere. Only finished turns are
// stored (FR-104, FR-107, FR-108, R-26).

export type ChatFailureCode = AiRefusalCode | StoreRefusalCode | "ai-features-off";

export interface ChatSession {
  /** The question being answered, and its answer as far as it has arrived. */
  asking: { question: string; answer: string } | null;
  /** The last failure, with the question it failed on, which goes back into the field. */
  failure: { code: ChatFailureCode; details?: RefusalDetails; question: string } | null;
}

interface Running {
  session: ChatSession;
  listeners: Set<() => void>;
  controller: AbortController | null;
  /** The question being answered, until its turn is stored. */
  answering: Promise<unknown> | null;
}

const runs = new WeakMap<Store, Running>();

function runningOf(store: Store): Running {
  let running = runs.get(store);
  if (!running) {
    running = {
      session: { asking: null, failure: null },
      listeners: new Set(),
      controller: null,
      answering: null,
    };
    runs.set(store, running);
  }
  return running;
}

function show(running: Running, session: ChatSession) {
  running.session = session;
  running.listeners.forEach((listener) => listener());
}

/** The chat's session now; the same object until it changes. */
export function chatSession(store: Store): ChatSession {
  return runningOf(store).session;
}

/** Calls `listener` on every change of the session; returns the way to stop. */
export function subscribeChat(store: Store, listener: () => void): () => void {
  const running = runningOf(store);
  running.listeners.add(listener);
  return () => running.listeners.delete(listener);
}

async function answer(
  store: Store,
  running: Running,
  question: string,
  controller: AbortController,
): Promise<Refusal<ChatFailureCode> | null> {
  const state = store.getState();
  // Turning AI features off stops the answer as Stop does (FR-108).
  const unsubscribe = store.subscribe(() => {
    if (!aiFeaturesOn(store.getState())) controller.abort();
  });
  let answered;
  try {
    answered = await askFinanceChat(
      chatContext(state, todayLocal()),
      state.conversation,
      question,
      // The key and the model in use when the question is asked, kept until it is answered.
      { apiKey: state.apiKey!, model: modelInUse(state.settings).model },
      controller.signal,
      (soFar) => show(running, { ...running.session, asking: { question, answer: soFar.answer } }),
    );
  } finally {
    unsubscribe();
  }

  let turn: ChatTurn;
  if (answered === null) {
    turn = { question, answer: running.session.asking?.answer ?? "", stopped: true, sources: [] };
  } else if ("code" in answered) {
    show(running, { asking: null, failure: { ...answered, question } });
    return answered;
  } else if (!answered.inScope) {
    turn = { question, answer: "", outOfScope: true, sources: [] };
  } else {
    const sources = chatSources(store.getState(), answered.sources);
    // A turn without follow-ups has no key for them (data-model.md, conversation).
    const followUps = answered.followUps.length > 0 ? { followUps: answered.followUps } : {};
    turn = { question, answer: answered.answer, sources, ...followUps };
  }

  const refused = await store.run<never>((current) => addTurn(current, turn));
  show(running, {
    asking: null,
    failure: refused ? { code: refused.code, question } : null,
  });
  return refused;
}

/**
 * Asks the finance chat `question` with the stored conversation and today's data, shows the
 * answer as it arrives, and stores the turn once it is complete, out of scope or stopped. A
 * failure stores nothing. While a question is answered, another sends nothing (FR-104).
 */
export async function askChat(
  store: Store,
  question: string,
): Promise<Refusal<ChatFailureCode> | null> {
  const running = runningOf(store);
  if (running.session.asking) return null;
  // Checked here too, so no screen can send data with AI features off (FR-061, FR-106).
  if (!aiFeaturesOn(store.getState())) return { code: "ai-features-off" };

  const controller = new AbortController();
  running.controller = controller;
  show(running, { asking: { question, answer: "" }, failure: null });
  const answering = answer(store, running, question, controller);
  running.answering = answering;
  try {
    return await answering;
  } finally {
    running.controller = null;
    running.answering = null;
  }
}

/** Ends the answer at once and stores its text so far, marked as stopped (FR-108). */
export async function stopChat(store: Store): Promise<void> {
  const running = runningOf(store);
  running.controller?.abort();
  await running.answering;
}

/** Empties the conversation, and the last failure with it (FR-104). */
export async function clearConversation(store: Store): Promise<Refusal<StoreRefusalCode> | null> {
  const refused = await store.run<never>((state) => decideClearConversation(state));
  if (!refused) show(runningOf(store), { ...runningOf(store).session, failure: null });
  return refused;
}
