import type { Page, Route } from "@playwright/test";
import { CATEGORISER_URL } from "../../src/categoriser/endpoint";
import type { SuggestionRequest } from "../../src/domain/import/suggestions";
import { expect } from "./test";

// Category suggestions without n8n or a key (R-23): a stand-in answers at the workflow's address in
// its place. Page routes take precedence over the network guard's context route, so the guard still
// fails a test on any other request outside the app's origin (FR-061).

/** What the stand-in does with one request: answer with a status and a body, or refuse the connection. */
export type Reply = (
  request: SuggestionRequest,
) => { status?: number; json: unknown } | "unreachable";

/** Suggests nothing, the shortest valid answer (contracts/categoriser.md, answer). */
export const suggestNothing: Reply = () => ({ json: { suggestions: [] } });

/** Suggests `expense` for every money-out row and `income` for every money-in row. */
export const suggestBySide =
  (expense: string, income: string): Reply =>
  (request) => ({
    json: {
      suggestions: request.rows.map((row) => ({
        rowNumber: row.rowNumber,
        category: row.side === "expense" ? expense : income,
      })),
    },
  });

export interface StandIn {
  /** The bodies of the requests the app sent, in order. */
  bodies: SuggestionRequest[];
  /** Holds every answer from now on, until `release`. */
  hold(): void;
  release(): void;
}

/** Answers at the workflow's address with `reply`, recording each request (contracts/categoriser.md). */
export async function standInCategoriser(page: Page, reply: Reply = suggestNothing) {
  const bodies: SuggestionRequest[] = [];
  let held: Promise<void> = Promise.resolve();
  let release = () => {};

  await page.route(CATEGORISER_URL, async (route: Route) => {
    const body = route.request().postDataJSON() as SuggestionRequest;
    bodies.push(body);
    await held;
    const answer = reply(body);
    // The app may have cancelled the request while it was held; then there is no one to answer.
    try {
      if (answer === "unreachable") await route.abort("connectionrefused");
      else
        await route.fulfill({
          status: answer.status ?? 200,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(answer.json),
        });
    } catch {
      // The request is gone.
    }
  });

  const standIn: StandIn = {
    bodies,
    hold() {
      held = new Promise((resolve) => (release = resolve));
    },
    release: () => release(),
  };
  return standIn;
}

/** The button in review's Suggestions section (contracts/ui.md, review). */
export const suggestButton = (page: Page) =>
  page
    .getByRole("region", { name: "Suggestions" })
    .getByRole("button", { name: /^(Suggest categories|Asking Claude)/ });

/** The AI features switch on the Settings screen (contracts/ui.md, settings). */
export const aiFeaturesSwitch = (page: Page) =>
  page.getByRole("main").getByRole("switch", { name: "AI features" });

/** The warning that turning AI features on shows first (FR-095). */
export const sharingWarning = (page: Page) =>
  page.getByRole("alertdialog", { name: "Turn on AI features?" });

/**
 * Turns AI features on in Settings and agrees to the data-sharing warning (FR-095), then returns
 * to the screen the page was on, if any.
 */
export async function turnOnAiFeatures(page: Page) {
  const from = page.url().startsWith("http") ? page.url() : null;
  await page.goto("/#/settings");
  await aiFeaturesSwitch(page).click();
  await sharingWarning(page).getByRole("button", { name: "Turn on" }).click();
  await expect(aiFeaturesSwitch(page)).toBeChecked();
  if (from) await page.goto(from);
}

/** Selects Suggest categories, which sends at once while AI features are on (FR-090). */
export async function suggestCategories(page: Page) {
  await suggestButton(page).click();
}
