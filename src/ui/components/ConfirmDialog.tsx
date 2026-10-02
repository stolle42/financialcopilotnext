import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The consequence, stated plainly (FR-069). */
  description: string;
  /** Names the action, such as "Delete category" (contracts/ui.md, shared patterns). */
  confirmLabel: string;
  /** The danger style of severe confirmations (FR-001, FR-071). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A modal that states the consequence of an action and asks before it happens. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={danger ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
