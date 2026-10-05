import { useContext } from "react";
import { Button } from "@/ui/components/ui/button";
import { OpenTransactionFormContext } from "@/ui/screens/transactions/formContext";

/** What a section of Insights says when its period holds nothing to draw: one sentence, one action. */
export function EmptySection({ children }: { children: string }) {
  const openForm = useContext(OpenTransactionFormContext);
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground">{children}</p>
      <Button variant="outline" onClick={() => openForm(null)}>
        Add transaction
      </Button>
    </div>
  );
}
