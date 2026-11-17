import { useRef, useState, type ReactNode } from "react";
import { SmartLink } from "~/components/ui/SmartLink";
import {
  GUIDE_START,
  type GuideChoice,
  type GuideNode,
  type GuideNodeId,
} from "~/content/nex-guide-start";
import { NexTransmission } from "./NexTransmission";

const loadScript = () => import("~/content/nex-guide").then((m) => m.GUIDE);

const choiceClass =
  "nex-guide-choice inline-flex min-h-11 items-center rounded-full border border-nex/40 px-4 text-sm text-text transition-colors hover:border-nex hover:bg-nex/10";

/**
 * NEX's guide (Phase 1): his speech and choices in a panel attached beneath the orb (the
 * transmission's trace connects them), never over it. A scripted, deterministic conversation:
 * each choice shows another step or opens a page. The greeting is prerendered; the rest of the
 * script loads on the first choice (and is warmed on hover or focus), keeping it off the initial
 * page load.
 */
export function NexGuide({
  id = "nex-guide",
  messageId = `${id}-message`,
  children,
}: {
  id?: string;
  /** Id of NEX's message (the voice preview marks it while NEX speaks: "nex-intro"). */
  messageId?: string;
  children?: ReactNode;
}) {
  const [node, setNode] = useState<GuideNode>(GUIDE_START);
  const [pending, setPending] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const go = async (next: GuideNodeId) => {
    setPending(true);
    try {
      setNode(next === "start" ? GUIDE_START : (await loadScript())[next]);
      // Move focus to the new message, so keyboard and screen-reader users hear NEX's reply.
      requestAnimationFrame(() => messageRef.current?.focus({ preventScroll: true }));
    } finally {
      setPending(false);
    }
  };

  const renderChoice = (choice: GuideChoice) => {
    if (choice.next !== undefined) {
      return (
        <button
          type="button"
          className={choiceClass}
          disabled={pending}
          onPointerEnter={() => void loadScript()}
          onFocus={() => void loadScript()}
          onClick={() => void go(choice.next!)}
        >
          {choice.label}
        </button>
      );
    }
    return (
      <SmartLink target={choice} className={choiceClass}>
        {choice.label}
      </SmartLink>
    );
  };

  return (
    <div id={id} className="nex-guide" data-node={node.id}>
      <div ref={messageRef} tabIndex={-1} className="nex-guide-message">
        <NexTransmission id={messageId} label="NEX // GUIDE" message={node.message}>
          {children}
        </NexTransmission>
      </div>
      <ul className="nex-guide-choices" aria-label="Choose where NEX takes you">
        {node.choices.map((choice) => (
          <li key={choice.label}>{renderChoice(choice)}</li>
        ))}
      </ul>
      <p className="nex-guide-note">Scripted guide: NEX follows a hand-written script.</p>
    </div>
  );
}
