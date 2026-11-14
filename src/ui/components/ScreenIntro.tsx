import type { ReactNode } from "react";

/**
 * The sentence under a screen's heading that says what the screen is for, in the secondary ink.
 * It is always shown and never takes an empty state's place (FR-137, contracts/ui.md).
 */
export function ScreenIntro({ children }: { children: ReactNode }) {
  return (
    <p data-slot="screen-intro" className="text-muted-foreground">
      {children}
    </p>
  );
}
