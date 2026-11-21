import { describe, expect, test } from "vitest";
import { parseRoute } from "@/ui/app/router";
// Namespace imports, so the tests load before faq.ts and the URL exist.
import * as faqModule from "./faq";
import * as openai from "./openai";

// FR-139 – FR-141, R-37, contracts/ui.md FAQ: the questions and answers of FAQ, which the guide to
// the app holds too.

interface Question {
  question: string;
  answer: string;
}
interface Topic {
  topic: string;
  questions: readonly Question[];
}

const FAQ = (faqModule as Record<string, unknown>).FAQ as readonly Topic[];
const faqAsText = (faqModule as Record<string, unknown>).faqAsText as () => string;
const OPENAI_API_KEYS_URL = (openai as Record<string, unknown>).OPENAI_API_KEYS_URL as string;

/** Every `[label](target)` of a text. */
function links(text: string): { label: string; target: string }[] {
  return [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(([, label, target]) => ({
    label: label!,
    target: target!,
  }));
}

const answers = () => FAQ.flatMap((topic) => topic.questions.map((entry) => entry.answer));

describe("FAQ", () => {
  test("holds the twelve questions of FR-140 under its four topics, in order and in its words", () => {
    expect(
      FAQ.map((topic) => [topic.topic, topic.questions.map((entry) => entry.question)]),
    ).toEqual([
      [
        "Getting started",
        [
          "Where do I start?",
          "Entering every bank transaction by hand is a lot of work. How can I make it easier?",
          "Can the app connect to my bank directly?",
          "Where is my data, and who can see it?",
        ],
      ],
      [
        "Importing bank files",
        [
          "My bank's file doesn't import, or the preview looks wrong. What do I do?",
          "Why are some rows marked as duplicates?",
          "Can I undo an import?",
        ],
      ],
      [
        "Accounts and budgets",
        [
          "A payment to my credit card or savings account counts as spending. How do I fix it?",
          "Why does an account's balance differ from my bank's?",
          "How do budgets work? Does money I don't spend carry over?",
        ],
      ],
      [
        "Your data and AI features",
        ["Can I lose my data?", "What do the AI features do, and what do they cost?"],
      ],
    ]);
  });

  test("links inside the app only to screens it has, and outside it only to OpenAI's page for API keys", () => {
    const targets = answers().flatMap((answer) => links(answer).map((link) => link.target));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      if (target === OPENAI_API_KEYS_URL) continue;
      expect(target).toMatch(/^#\//);
      // An unknown route reads as Transactions, so only "#/" itself may lead there.
      if (target !== "#/") expect(parseRoute(target).name).not.toBe("transactions");
    }
    expect(targets).toContain(OPENAI_API_KEYS_URL);
  });

  test("gives the steps of an import as a numbered list, with a link to Import", () => {
    const [, importing] = FAQ[0]!.questions;
    expect(importing!.answer).toMatch(/^1\. /m);
    expect(importing!.answer).toMatch(/^2\. /m);
    expect(links(importing!.answer).map((link) => link.target)).toContain("#/import");
    for (const step of [/Import CSV/, /New account…/, /Create new bank CSV format/, /Confirm/]) {
      expect(importing!.answer).toMatch(step);
    }
  });

  test("says what FR-140 lists in the answers on the key, the balance and budgets", () => {
    const text = answers().join("\n");
    for (const part of [
      /your own OpenAI API key/,
      /Turn on AI features/,
      /Reconcile/,
      /Unaccounted/,
      /opening balance/i,
      /carries over|carry over/,
      /backup/i,
      /duplicate/i,
      /Invert the sign/,
      /Discard/,
    ]) {
      expect(text).toMatch(part);
    }
  });

  test('never says "profile"', () => {
    for (const answer of answers()) expect(answer).not.toMatch(/profile/i);
  });

  // v1.8 adds no question (Assumptions): the answer on importing, whose last step is review,
  // tells what review now does by itself.
  test("keeps twelve questions and names, in the answer on importing, what review of v1.8 does", () => {
    expect(FAQ.flatMap((topic) => topic.questions)).toHaveLength(12);
    const [, importing] = FAQ[0]!.questions;
    expect(importing!.answer).toMatch(/suggested transfers?/i);
    expect(importing!.answer).toContain("From earlier");
    expect(importing!.answer).toContain("Skip rows under");
    expect(importing!.answer).toContain("Skip none");
    expect(importing!.answer).toMatch(/still imported/i);
    expect(importing!.answer).not.toMatch(/set aside|Bring back/i);
  });
});

describe("faqAsText", () => {
  test("holds every question and answer, each link as its label", () => {
    const text = faqAsText();
    expect(text).not.toContain("](");
    for (const topic of FAQ) {
      expect(text).toContain(topic.topic);
      for (const { question, answer } of topic.questions) {
        expect(text).toContain(question);
        for (const { label } of links(answer)) expect(text).toContain(label);
        // The answer's words without its link targets.
        const plain = answer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        for (const line of plain.split("\n").filter((line) => line.trim() !== "")) {
          expect(text).toContain(line.trim());
        }
      }
    }
  });
});
