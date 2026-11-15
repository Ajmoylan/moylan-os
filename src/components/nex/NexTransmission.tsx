import { useEffect, useRef, type ReactNode } from "react";
import { signalNex } from "~/lib/nex-events";

/**
 * Per-character rhythm: quick, natural typing with deliberate pauses after sentences, clauses and
 * around NEX's own names (milliseconds before the next character appears).
 */
export function pauseAfter(text: string, index: number): number {
  const char = text[index]!;
  const next = text.slice(index + 1);
  if (char === "." || char === "?" || char === "!") return next.startsWith(" ") ? 300 : 18;
  if (char === "," || char === ";" || char === ":") return 150;
  if (next.startsWith(" NEX") || next.startsWith(" MOYLAN//OS")) return 90;
  // A light, deterministic unevenness so it never feels mechanical.
  return 12 + ((index * 7) % 5) * 3;
}

/** When each character appears (ms after typing starts): the running sum of the pauses. */
export function schedule(text: string): number[] {
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < text.length; i++) {
    times.push(t);
    t += pauseAfter(text, i);
  }
  return times;
}

/** Reduced or Off Motion (the site's setting, else the OS preference before hydration). */
function reducedMotion(): boolean {
  const setting = document.documentElement.getAttribute("data-motion");
  if (setting) return setting !== "full";
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface NexTransmissionProps {
  /** The full message: always in the document (assistive technology reads it once, whole). */
  message: string;
  /** Id of the message text (e.g. for `aria-describedby`, or to mark it while NEX speaks). */
  id?: string;
  label?: string;
  /** Optional controls under the message (e.g. NEX's voice). */
  children?: ReactNode;
  className?: string;
}

/**
 * NEX // TRANSMISSION (launch sprint): NEX's own way of communicating, reusable wherever he speaks.
 * A holographic transmission rather than a chat box: a small label with a signal indicator, a
 * light trace up towards NEX, teal-lit type and a blinking cursor while the message types out.
 *
 * - The whole message is in the page from the first render (prerendered HTML, screen readers and
 *   copy see it complete); only its visual layer types. The part not yet typed keeps its space
 *   (transparent), so nothing shifts.
 * - Typing is quick, with pauses at sentences, clauses and NEX's names; NEX's core glows while he
 *   transmits and pulses at each sentence (the shared attention signal).
 * - Any click, tap, key or scroll completes it at once (nothing else happens: no default prevented,
 *   no focus moved). Reduced or Off Motion shows it complete. Without JavaScript the text appears
 *   after a few seconds anyway (CSS failsafe), or at once with reduced motion.
 */
export function NexTransmission({
  message,
  id,
  label = "NEX // TRANSMISSION",
  children,
  className = "",
}: NexTransmissionProps) {
  const root = useRef<HTMLElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const figure = root.current;
    const shown = typed.current;
    const hidden = rest.current;
    if (!figure || !shown || !hidden) return;
    let index = 0;
    let timer = 0;
    let done = false;
    let start = 0;
    // Time-based: each tick shows every character due by now, so a busy device (late timers)
    // never makes the message slower; it always completes on schedule.
    const times = schedule(message);
    const render = () => {
      shown.textContent = message.slice(0, index);
      hidden.textContent = message.slice(index);
    };
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      index = message.length;
      render();
      figure.setAttribute("data-state", "done");
      signalNex("release", "transmission");
      remove();
    };
    const step = () => {
      if (done) return;
      const elapsed = performance.now() - start;
      const before = index;
      while (index < message.length && times[index]! <= elapsed) index++;
      if (index >= message.length) return finish();
      render();
      for (let i = before; i < index; i++) {
        if (/[.?!]/.test(message[i]!) && message[i + 1] === " ") signalNex("pulse");
      }
      timer = window.setTimeout(step, Math.max(8, times[index]! - elapsed));
    };
    const events = ["pointerdown", "keydown", "wheel", "touchmove", "scroll"] as const;
    const remove = () => events.forEach((type) => window.removeEventListener(type, finish));

    if (reducedMotion()) {
      finish();
      return;
    }
    index = 0;
    render();
    figure.setAttribute("data-state", "typing");
    events.forEach((type) => window.addEventListener(type, finish, { passive: true }));
    signalNex("hold", "transmission");
    timer = window.setTimeout(() => {
      start = performance.now();
      step();
    }, 600);
    return () => {
      done = true;
      window.clearTimeout(timer);
      remove();
      signalNex("release", "transmission");
    };
  }, [message]);

  return (
    <figure ref={root} data-state="pending" className={`nex-tx ${className}`}>
      <figcaption className="nex-tx-label">
        <span aria-hidden="true" className="nex-tx-signal">
          <i />
          <i />
          <i />
        </span>
        {label}
      </figcaption>
      <blockquote id={id} className="nex-tx-body nex-speech">
        <p>
          <span className="sr-only">{message}</span>
          <span aria-hidden="true">
            <span ref={typed}>{message}</span>
            <span className="nex-tx-cursor" />
            <span ref={rest} className="nex-tx-rest" />
          </span>
        </p>
      </blockquote>
      {children}
    </figure>
  );
}
