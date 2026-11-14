import { ChevronDownIcon } from "lucide-react";
import { useId } from "react";
import { FAQ, type FaqTopic } from "@/ai/faq";
import { ScreenIntro } from "@/ui/components/ScreenIntro";
import { FaqAnswer } from "./FaqAnswer";

/** One topic of FAQ as a card: its heading, then each question as a disclosure, closed at first. */
function TopicCard({ topic }: { topic: FaqTopic }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="surface flex flex-col px-6 pt-6 pb-2">
      <h2 id={headingId} className="pb-2 text-xl font-semibold">
        {topic.topic}
      </h2>
      <div className="flex flex-col divide-y">
        {topic.questions.map(({ question, answer }) => (
          <details key={question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDownIcon
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <FaqAnswer answer={answer} />
          </details>
        ))}
      </div>
    </section>
  );
}

/**
 * FAQ (contracts/ui.md, FAQ; FR-139, FR-140): the questions users often have, one card per topic,
 * each answer hidden until its question is selected. The text is `FAQ`, which the guide to the
 * app holds too (FR-141). It sends nothing and needs no network.
 */
export function FaqScreen() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">FAQ</h1>
      <ScreenIntro>Answers to questions users often have, with links to where to act.</ScreenIntro>
      {FAQ.map((topic) => (
        <TopicCard key={topic.topic} topic={topic} />
      ))}
    </div>
  );
}
