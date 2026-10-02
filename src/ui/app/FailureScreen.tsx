import { messageFor, type ShellFailureCode } from "@/ui/messages";

/** A failure that stops the app from running, shown on its own screen instead of the shell. */
export function FailureScreen({ code }: { code: ShellFailureCode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-3 rounded-lg border p-6">
        <span className="text-lg font-semibold">Financial Copilot</span>
        <p role="alert">{messageFor({ code })}</p>
      </div>
    </div>
  );
}
