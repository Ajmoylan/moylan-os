import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEX_ATTENTION_EVENT } from "~/lib/nex-events";
import { NexTransmission, pauseAfter, schedule } from "./NexTransmission";

/** NEX // TRANSMISSION: typing, pauses, skipping, Reduced Motion and assistive technology. */

const MESSAGE = "Hello. I'm NEX. Welcome to MOYLAN//OS, Alex's world.";
const visual = (container: HTMLElement) =>
  container.querySelector("blockquote [aria-hidden]")!.firstElementChild!.textContent;
const state = (container: HTMLElement) => container.querySelector("figure")!.dataset.state;

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.setAttribute("data-motion", "full");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-motion");
});

describe("NexTransmission", () => {
  it("types the message out quickly, with longer pauses at sentences, clauses and NEX's names", async () => {
    const { container } = render(<NexTransmission message={MESSAGE} />);
    expect(state(container)).toBe("typing");
    expect(visual(container)).toBe("");
    await act(async () => vi.advanceTimersByTime(800));
    expect(visual(container)!.length).toBeGreaterThan(0);
    expect(pauseAfter(MESSAGE, MESSAGE.indexOf("."))).toBeGreaterThanOrEqual(250);
    expect(pauseAfter(MESSAGE, MESSAGE.indexOf(","))).toBeGreaterThanOrEqual(120);
    expect(pauseAfter(MESSAGE, MESSAGE.indexOf("m"))).toBeGreaterThanOrEqual(80); // "I'm" → NEX
    expect(pauseAfter(MESSAGE, 1)).toBeLessThanOrEqual(30);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(visual(container)).toBe(MESSAGE);
    expect(state(container)).toBe("done");
  });

  it("finishes in a few seconds: nobody waits long for a short message", async () => {
    const { container } = render(<NexTransmission message={MESSAGE} />);
    await act(async () => vi.advanceTimersByTime(600 + 2500));
    expect(state(container)).toBe("done");
    const intro =
      "Hello. I'm NEX. Welcome to MOYLAN//OS, Alex Moylan's digital world. Scroll to discover his work, or select me and I'll guide you.";
    expect(schedule(intro).at(-1)!).toBeLessThan(3800); // the homepage message: under 4 s
  });

  it("keeps time on a busy device: late timers reveal everything due, not one character", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { container } = render(<NexTransmission message={MESSAGE} />);
    await act(async () => vi.advanceTimersByTime(600)); // typing starts at now = 0
    // The next tick runs very late (the main thread was busy for 1.5 s): everything due appears.
    now = 1500;
    await act(async () => vi.advanceTimersByTime(40));
    const due = schedule(MESSAGE).filter((t) => t <= 1500).length;
    expect(visual(container)!.length).toBeGreaterThanOrEqual(due - 1);
  });

  it("any key, click or scroll completes it at once, without preventing the default action", async () => {
    for (const fire of [
      () => fireEvent.keyDown(window, { key: "Tab" }),
      () => fireEvent.pointerDown(window),
      () => fireEvent.scroll(window),
    ]) {
      const { container, unmount } = render(<NexTransmission message={MESSAGE} />);
      await act(async () => vi.advanceTimersByTime(900));
      const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
      await act(async () => fire());
      expect(visual(container)).toBe(MESSAGE);
      expect(state(container)).toBe("done");
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      unmount();
    }
  });

  it("Reduced Motion shows the whole message at once", () => {
    document.documentElement.setAttribute("data-motion", "reduced");
    const { container } = render(<NexTransmission message={MESSAGE} />);
    expect(visual(container)).toBe(MESSAGE);
    expect(state(container)).toBe("done");
  });

  it("assistive technology gets the whole message once, never the letters", () => {
    const { container } = render(<NexTransmission id="msg" message={MESSAGE} />);
    expect(screen.getByText(MESSAGE, { selector: ".sr-only" })).toBeInTheDocument();
    expect(container.querySelector("blockquote [aria-hidden]")).not.toBeNull();
    expect(screen.getByText("NEX // TRANSMISSION")).toBeInTheDocument();
  });

  it("NEX's core responds: attention held while transmitting, pulses at sentences, released", async () => {
    const kinds: string[] = [];
    const listen = (event: Event) => kinds.push((event as CustomEvent<string>).detail);
    window.addEventListener(NEX_ATTENTION_EVENT, listen);
    render(<NexTransmission message={MESSAGE} />);
    await act(async () => vi.advanceTimersByTime(6000));
    window.removeEventListener(NEX_ATTENTION_EVENT, listen);
    expect(kinds[0]).toBe("hold");
    expect(kinds.filter((k) => k === "pulse").length).toBeGreaterThanOrEqual(2);
    expect(kinds.at(-1)).toBe("release");
  });
});
