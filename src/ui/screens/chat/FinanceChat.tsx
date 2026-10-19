import { MessageCircle } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { ChatSource, ChatTurn } from "@/domain/types";
import {
  askChat,
  chatSession,
  clearConversation,
  stopChat,
  subscribeChat,
  type ChatSession,
} from "@/store/chat";
import { aiFeaturesOn } from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import { transactionsPath } from "@/ui/app/router";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/ui/components/ui/sheet";
import { financeChat, messageFor } from "@/ui/messages";

/** The chat's session from the store, kept up to date (R-26). */
function useChatSession(): ChatSession {
  const store = useStoreApi();
  return useSyncExternalStore(
    (listener) => subscribeChat(store, listener),
    () => chatSession(store),
  );
}

/** A source as a link to the transaction list with its filters, or its name once it cannot be. */
function Source({ source }: { source: ChatSource }) {
  const usable = useStore(
    (state) =>
      (source.categoryId === null || state.categories.some((c) => c.id === source.categoryId)) &&
      (source.accountId === null || state.accounts.some((a) => a.id === source.accountId)),
  );
  if (!usable) return <span className="text-muted-foreground">{source.name}</span>;
  const path = transactionsPath({
    category: source.categoryId ?? undefined,
    account: source.accountId ?? undefined,
    from: source.from,
    to: source.to,
  });
  return (
    <a href={`#${path}`} className="font-medium underline">
      {source.name}
    </a>
  );
}

/** An answer of the conversation: its text, its mark when stopped, and its sources (FR-110). */
function Answer({ turn }: { turn: ChatTurn }) {
  if (turn.outOfScope) return <li className="whitespace-pre-wrap">{financeChat.outOfScope}</li>;
  return (
    <li className="flex flex-col gap-2">
      {turn.answer && <p className="whitespace-pre-wrap">{turn.answer}</p>}
      {turn.stopped && <p className="text-xs text-muted-foreground">{financeChat.stopped}</p>}
      {turn.sources.length > 0 && (
        <nav aria-label={financeChat.sources} className="flex flex-col items-start gap-1 text-xs">
          <p className="text-muted-foreground">{financeChat.sources}</p>
          {turn.sources.map((source, index) => (
            <Source key={index} source={source} />
          ))}
        </nav>
      )}
    </li>
  );
}

const question = "self-end rounded-2xl bg-muted px-3 py-2";

/**
 * The suggested questions while no answer is awaited: the examples while the conversation is empty
 * or its latest question was out of scope, and otherwise the latest answer's follow-ups, none
 * after a stopped answer (FR-101, FR-111).
 */
function suggestedQuestions(conversation: readonly ChatTurn[]): readonly string[] {
  const latest = conversation.at(-1);
  if (!latest || latest.outOfScope) return financeChat.examples;
  return latest.stopped ? [] : (latest.followUps ?? []);
}

/** The chat's width where it opens, its least, and a step of the arrow keys (FR-117). */
const chatWidth = { start: 384, least: 320, step: 16 };

/** The chat's greatest width in a window this wide: three quarters of it, yet never under the least. */
function greatestChatWidth(windowWidth: number): number {
  return Math.max(chatWidth.least, Math.floor(windowWidth * 0.75));
}

/** The window's width, kept up to date, since it bounds the chat's (R-28). */
function useWindowWidth(): number {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("resize", listener);
      return () => window.removeEventListener("resize", listener);
    },
    () => window.innerWidth,
  );
}

/**
 * The left edge of the chat's sheet: a separator, as WAI-ARIA's window splitter pattern has it,
 * that sets the chat's width by pointer and with the arrow keys (contracts/ui.md, finance chat;
 * FR-117, R-28). It hands `onResize` the width asked for, which may lie beyond the bounds.
 */
function ChatEdge({
  width,
  greatest,
  onResize,
}: {
  width: number;
  greatest: number;
  onResize: (width: number) => void;
}) {
  // Where the drag took hold, so the edge moves by as much as the pointer, wherever it was grabbed.
  const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-label="Resize the chat"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={chatWidth.least}
      aria-valuemax={greatest}
      tabIndex={0}
      data-dragging={drag ? "" : undefined}
      className="group/edge absolute inset-y-0 -left-1.5 flex w-3 cursor-ew-resize touch-none items-center justify-center outline-none select-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ x: event.clientX, width });
      }}
      onPointerMove={(event) => {
        if (drag) onResize(drag.width + drag.x - event.clientX);
      }}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(width + chatWidth.step);
        else if (event.key === "ArrowRight") onResize(width - chatWidth.step);
        else return;
        event.preventDefault();
      }}
    >
      <span
        aria-hidden
        className="h-10 w-1 rounded-full bg-foreground/20 transition-colors group-hover/edge:bg-primary group-focus-visible/edge:bg-primary group-data-dragging/edge:bg-primary"
      />
    </div>
  );
}

/**
 * The finance chat (contracts/ui.md, finance chat; FR-100 – FR-110): a button fixed at the bottom
 * right of every screen, which opens the chat beside the screen. The app shell renders it once, so
 * it outlasts every screen; the conversation is stored, and the question being answered lives in
 * the store (FR-104, FR-108).
 */
export function FinanceChat() {
  const store = useStoreApi();
  const on = useStore(aiFeaturesOn);
  const conversation = useStore((state) => state.conversation);
  const session = useChatSession();
  const [open, setOpen] = useState(false);
  // A question that failed goes back into the field, also when it failed while the chat was closed
  // or another screen was open (FR-104).
  const [draft, setDraft] = useState(() => session.failure?.question ?? "");
  const [clearing, setClearing] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  // The width the user gave the chat, which lasts while the app stays open, and the width it shows:
  // that one, within the bounds of the window as it is now (FR-117, R-28).
  const [chosenWidth, setChosenWidth] = useState(chatWidth.start);
  const greatestWidth = greatestChatWidth(useWindowWidth());
  const width = Math.min(chosenWidth, greatestWidth);
  const fieldId = useId();
  const suggestionsId = useId();
  const log = useRef<HTMLDivElement>(null);
  const asking = session.asking !== null;

  // The newest line stays in view while the answer grows.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [conversation, session.asking, open]);

  // Another screen opening, by a link or by going back, closes the chat so that screen shows
  // (FR-100).
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);

  async function send(text: string) {
    if (asking || text.trim() === "") return;
    setDraft("");
    const refusal = await askChat(store, text);
    // The question goes back into the field, unless the user has typed the next one meanwhile.
    if (refusal) setDraft((current) => (current === "" ? text : current));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  async function clear() {
    setClearing(false);
    setClearFailed((await clearConversation(store)) !== null);
  }

  const showsLog = conversation.length > 0 || asking;
  const suggested = asking ? [] : suggestedQuestions(conversation);

  return (
    <>
      <Button
        size="lg"
        className="fixed right-6 bottom-6 z-40 h-10 rounded-full px-4"
        onClick={() => setOpen(true)}
      >
        <MessageCircle aria-hidden />
        {financeChat.title}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="data-[side=right]:w-(--chat-width) data-[side=right]:sm:max-w-none"
          style={{ "--chat-width": `${width}px` } as CSSProperties}
          onClick={(event) => {
            // A link to the address already open raises no hashchange, yet still opens that screen.
            if ((event.target as Element).closest("a[href]")) setOpen(false);
          }}
        >
          <SheetHeader className="flex-row items-center justify-between gap-2 pr-12">
            <SheetTitle>{financeChat.title}</SheetTitle>
            {conversation.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={asking}
                onClick={() => setClearing(true)}
              >
                {financeChat.clear}
              </Button>
            )}
          </SheetHeader>
          <div ref={log} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            {showsLog && (
              <div role="log" aria-label="Conversation">
                <ol className="flex flex-col gap-3">
                  {conversation.map((turn, index) => [
                    <li key={`q${index}`} className={question}>
                      {turn.question}
                    </li>,
                    <Answer key={`a${index}`} turn={turn} />,
                  ])}
                  {session.asking && [
                    <li key="asking" className={question}>
                      {session.asking.question}
                    </li>,
                    <li key="answering" className="whitespace-pre-wrap">
                      {session.asking.answer || (
                        <span className="text-muted-foreground">{financeChat.thinking}</span>
                      )}
                    </li>,
                  ]}
                </ol>
              </div>
            )}
            {!on && (
              <p className="text-muted-foreground">
                {financeChat.needsAiFeatures}{" "}
                <a href="#/settings" className="font-medium text-foreground underline">
                  Open Settings
                </a>
              </p>
            )}
            {on && suggested.length > 0 && (
              <div role="group" aria-labelledby={suggestionsId} className="flex flex-col gap-2">
                <p id={suggestionsId} className="text-xs text-muted-foreground">
                  {financeChat.suggestions}
                </p>
                <div className="flex flex-col items-start gap-2">
                  {suggested.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      className="h-auto text-left whitespace-normal"
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {on && (
            <form onSubmit={submit} className="flex flex-col gap-2 border-t p-4">
              {(session.failure || clearFailed) && (
                <p role="alert" className="text-sm text-destructive">
                  {messageFor({ code: session.failure?.code ?? "save-failed" })}
                </p>
              )}
              <div className="flex gap-2">
                <label htmlFor={fieldId} className="sr-only">
                  Your question
                </label>
                <Input
                  id={fieldId}
                  value={draft}
                  autoComplete="off"
                  onChange={(event) => setDraft(event.target.value)}
                />
                {asking ? (
                  <Button type="button" variant="outline" onClick={() => void stopChat(store)}>
                    {financeChat.stop}
                  </Button>
                ) : (
                  <Button type="submit" disabled={draft.trim() === ""}>
                    Send
                  </Button>
                )}
              </div>
            </form>
          )}
          {/* Last, so that it takes focus after the chat's own controls, not when the chat opens. */}
          <ChatEdge
            width={width}
            greatest={greatestWidth}
            onResize={(asked) =>
              setChosenWidth(Math.min(Math.max(Math.round(asked), chatWidth.least), greatestWidth))
            }
          />
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={clearing}
        title="Clear the conversation?"
        description={financeChat.clearWarning}
        confirmLabel={financeChat.clear}
        onConfirm={() => void clear()}
        onCancel={() => setClearing(false)}
      />
    </>
  );
}
