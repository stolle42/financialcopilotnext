import { useMemo } from "react";
import { profileOf, type ProfileDraft } from "@/domain/import/profiles";
import { parseRecords } from "@/domain/import/rows";
import type { DecodingRefusal } from "@/files/csv";
import { formatAmount, formatDate } from "@/ui/format";
import { messageFor } from "@/ui/messages";

const PREVIEW_ROWS = 10;

/** A sample file as the editor read it: its records, or why its bytes could not be decoded. */
export type SampleRecords = string[][] | DecodingRefusal | null;

/**
 * The first data rows of the sample file as the import will read them, through the same parsing
 * (FR-021, contracts/csv-import.md, preview). It refreshes whenever the draft changes.
 */
export function ProfilePreview({ draft, sample }: { draft: ProfileDraft; sample: SampleRecords }) {
  const profile = useMemo(() => profileOf(draft, "preview"), [draft]);
  const parsed = useMemo(
    () => (Array.isArray(sample) && !("code" in profile) ? parseRecords(sample, profile) : null),
    [sample, profile],
  );

  let content;
  if (sample === null) {
    content = (
      <p className="text-muted-foreground">Choose a sample file to see how its rows read.</p>
    );
  } else if (!Array.isArray(sample)) {
    content = <p role="alert">{messageFor(sample)}</p>;
  } else if ("code" in profile) {
    content = <p className="text-muted-foreground">{messageFor(profile)}</p>;
  } else if (parsed && !Array.isArray(parsed)) {
    content = <p role="alert">{messageFor(parsed)}</p>;
  } else {
    const counterparty = draft.counterpartyColumn !== null;
    content = (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Row</th>
            <th className="py-2 font-medium">Date</th>
            <th className="py-2 text-right font-medium">Amount</th>
            <th className="py-2 pl-4 font-medium">Description</th>
            {counterparty && <th className="py-2 font-medium">Counterparty</th>}
          </tr>
        </thead>
        <tbody>
          {(parsed ?? []).slice(0, PREVIEW_ROWS).map((row) => (
            <tr key={row.rowNumber} className="border-b">
              <td className="py-2 text-muted-foreground">Row {row.rowNumber}</td>
              {row.status === "parsed" ? (
                <>
                  <td className="py-2">{formatDate(row.date)}</td>
                  <td className="py-2 text-right tabular-nums">{formatAmount(row.amountCents)}</td>
                  <td className="py-2 pl-4">{row.description}</td>
                  {counterparty && <td className="py-2">{row.counterparty}</td>}
                </>
              ) : (
                <td colSpan={counterparty ? 4 : 3} className="py-2 text-destructive">
                  {messageFor(row.failure)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section aria-label="Preview" className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-xl font-semibold">Preview</h2>
      {content}
    </section>
  );
}
