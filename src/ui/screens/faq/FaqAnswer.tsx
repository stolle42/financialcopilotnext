import type { ReactNode } from "react";

// An answer of FAQ as elements (contracts/ui.md, FAQ): paragraphs separated by a blank line; a
// paragraph whose lines all start "1. ", "2. " and so on is a numbered list, and one whose lines
// all start "- " is a list. A link `[label](target)` is a hash link inside the app, in the same
// tab, and opens in a new tab with no referrer outside it.

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const NUMBERED = /^\d+\. /;
const BULLET = /^- /;

const linkClass = "text-primary underline underline-offset-3";

/** A line's text, each link as an `<a>`. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, target] = match;
    parts.push(text.slice(last, match.index));
    parts.push(
      target!.startsWith("#") ? (
        <a key={match.index} href={target} className={linkClass}>
          {label}
        </a>
      ) : (
        <a
          key={match.index}
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {label}
        </a>
      ),
    );
    last = match.index + whole.length;
  }
  parts.push(text.slice(last));
  return parts;
}

function block(text: string, key: number): ReactNode {
  const lines = text.split("\n");
  if (lines.every((line) => NUMBERED.test(line))) {
    return (
      <ol key={key} className="flex list-decimal flex-col gap-1 pl-6">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.replace(NUMBERED, ""))}</li>
        ))}
      </ol>
    );
  }
  if (lines.every((line) => BULLET.test(line))) {
    return (
      <ul key={key} className="flex list-disc flex-col gap-1 pl-6">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.replace(BULLET, ""))}</li>
        ))}
      </ul>
    );
  }
  return <p key={key}>{inline(lines.join(" "))}</p>;
}

/** An answer of FAQ, its paragraphs and lists as elements. */
export function FaqAnswer({ answer }: { answer: string }) {
  return (
    <div className="flex flex-col gap-3 pb-4 text-sm">
      {answer
        .split(/\n\s*\n/)
        .map((text) => text.trim())
        .filter((text) => text !== "")
        .map(block)}
    </div>
  );
}
