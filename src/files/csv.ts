import Papa from "papaparse";
import type { Encoding, Refusal } from "@/domain/types";

// Bank files at the boundary: bytes become text, and text becomes records of cells. Mapping,
// parsing and flagging are domain rules (contracts/csv-import.md, pipeline steps 2–3; R-09).

export type DecodingRefusal = Refusal<"import-decoding-failed">;

/**
 * The file's text in `encoding`, or a refusal when any byte sequence is invalid in it. A leading
 * byte-order mark is dropped.
 */
export function decodeFile(bytes: Uint8Array, encoding: Encoding): string | DecodingRefusal {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return { code: "import-decoding-failed", details: { encoding } };
  }
}

/**
 * The text's records, with the delimiter detected among `,`, `;`, tab and `|`. Blank lines stay
 * as records, so the domain can skip them without losing the file's row numbers.
 */
export function tokenise(text: string): string[][] {
  // Detection skips blank lines, which would otherwise count as one-cell records and make a
  // narrow file look as if it had no delimiter at all.
  const { delimiter } = Papa.parse(text, {
    delimitersToGuess: [",", ";", "\t", "|"],
    skipEmptyLines: "greedy",
    preview: 10,
  }).meta;
  return Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false }).data;
}
