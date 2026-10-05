import { useId } from "react";

// The 18 swatches of contracts/ui.md, shared patterns: the 14 distinct seed colours in seed order,
// then four more.
export const PALETTE = [
  "#40c057",
  "#fd7e14",
  "#4c6ef5",
  "#15aabf",
  "#228be6",
  "#fa5252",
  "#e64980",
  "#be4bdb",
  "#12b886",
  "#adb5bd",
  "#495057",
  "#37b24d",
  "#fab005",
  "#7950f2",
  "#82c91e",
  "#e8590c",
  "#1098ad",
  "#9c36b5",
] as const;

/** The first palette colour not in `used`, or the first one when every colour is used. */
export function firstFreeColour(used: readonly string[]): string {
  const taken = new Set(used.map((colour) => colour.toLowerCase()));
  return PALETTE.find((colour) => !taken.has(colour)) ?? PALETTE[0];
}

/** The palette as a group of radio buttons, each named by its colour code. */
export function ColourPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (colour: string) => void;
}) {
  const group = useId();
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
      {PALETTE.map((colour) => (
        <input
          key={colour}
          type="radio"
          name={group}
          aria-label={colour}
          checked={value.toLowerCase() === colour}
          // A click reports the colour even when it is already checked, so a picker that closes
          // on a choice also closes on the colour the category has.
          readOnly
          onClick={() => onChange(colour)}
          // Set through a style prop, which the Content-Security-Policy allows (R-19).
          style={{ backgroundColor: colour }}
          className="size-6 shrink-0 cursor-pointer appearance-none rounded-full outline-none checked:ring-2 checked:ring-foreground checked:ring-offset-2 focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ))}
    </div>
  );
}
