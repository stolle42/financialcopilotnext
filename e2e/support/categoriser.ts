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

/** Turns data sharing on with the header's switch (FR-095). */
export async function turnOnDataSharing(page: Page) {
  const sharing = page.getByRole("banner").getByRole("switch", { name: "Data sharing" });
  await sharing.click();
  await expect(sharing).toBeChecked();
}
