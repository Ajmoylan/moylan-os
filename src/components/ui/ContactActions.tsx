import { useEffect, useRef, useState } from "react";
import { site } from "~/content/site";

/**
 * Copies a value to the clipboard and confirms it in place ("Copied"), announced politely to
 * screen readers. If the Clipboard API isn't available or is refused, it says so and the visitor
 * can still select the text beside it (it's plain, selectable text).
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = window.setTimeout(() => setState("idle"), 2500);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-steel px-4 text-sm text-text-muted transition-colors hover:border-nex/60 hover:text-text"
    >
      <span className="sr-only">{label}: </span>
      <span aria-live="polite">
        {state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy" : "Copy"}
      </span>
    </button>
  );
}

/** The site's pill buttons and inline links (shared with the homepage). */
export const buttonClass = {
  primary:
    "inline-flex min-h-11 items-center rounded-full bg-nex px-6 font-medium text-obsidian transition-colors hover:bg-text",
  secondary:
    "inline-flex min-h-11 items-center rounded-full border border-steel px-6 text-text transition-colors hover:border-nex/60",
  link: "inline-flex min-h-11 min-w-11 items-center text-(--accent) underline underline-offset-4",
};
const { primary, secondary } = buttonClass;

/** Call Me, Email Me and Download CV, as buttons. */
export function ContactButtons({ className = "" }: { className?: string }) {
  const { phone, email, cv } = site.links;
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {phone && (
        <a href={phone.href} className={primary}>
          Call me
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={phone ? secondary : primary}>
          Email me
        </a>
      )}
      {cv && (
        <a href={cv} download className={secondary}>
          Download CV <span className="sr-only">(PDF)</span>
        </a>
      )}
    </div>
  );
}

/** Alex's telephone number and email as selectable text, each with a copy button. */
export function ContactDetails({ className = "" }: { className?: string }) {
  const { phone, email } = site.links;
  const rows = [
    phone && { label: "Telephone", text: phone.display },
    email && { label: "Email", text: email },
  ].filter((row): row is { label: string; text: string } => Boolean(row));
  return (
    <dl className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      {rows.map((row) => (
        <div key={row.label} className="os-panel p-5">
          <dt className="os-label">{row.label}</dt>
          <dd className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {/* Plain text (not a link), so it's easy to select; the actions are the buttons. */}
            <span className="min-w-0 font-mono text-lg text-text wrap-anywhere">{row.text}</span>
            <CopyButton value={row.text} label={`Copy ${row.label.toLowerCase()}`} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
