import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexCompanion } from "./NexCompanion";
import { NexSlot } from "./NexSlot";
import { setNexMinimised } from "./placement";

/** Companion mode: the route's own NEX spot while in view, else the dock; minimise; one launcher. */

let observe: (ratio: number) => void = () => {};
class FakeObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    observe = (ratio) =>
      this.callback(
        [{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
  }
  disconnect() {}
}

function page() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          <NexSlot id="hero" poster />
          <NexCompanion />
        </>
      ),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}
const anchor = () =>
  document.querySelector('[data-stage-anchor="nex"]')?.getAttribute("data-nex-slot");
const launchers = () => screen.queryAllByRole("button", { name: "NEX: open site navigation" });

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  // jsdom has no layout: the spot reports a size.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
  setNexMinimised(false, "page");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NexCompanion", () => {
  it("NEX stays at the page's spot while it is in view, then docks; back again (with hysteresis)", async () => {
    page();
    expect(anchor()).toBe("hero");
    await act(async () => observe(0.5));
    expect(anchor()).toBe("hero"); // between the thresholds: no change
    await act(async () => observe(0.2));
    expect(anchor()).toBe("dock");
    await act(async () => observe(0.5));
    expect(anchor()).toBe("dock"); // hysteresis: it needs 60 % in view to return
    await act(async () => observe(0.8));
    expect(anchor()).toBe("hero");
  });

  it("exactly one NEX launcher at a time, wherever NEX is", async () => {
    page();
    expect(launchers()).toHaveLength(1);
    await act(async () => observe(0));
    expect(launchers()).toHaveLength(1);
    expect(launchers()[0]!.closest("[data-nex-dock]")).not.toBeNull();
  });

  it("minimise hides NEX for the visit (no anchor) and Show NEX brings him back to the dock", async () => {
    page();
    await act(async () => observe(0));
    fireEvent.click(screen.getByRole("button", { name: "Minimise NEX" }));
    expect(anchor()).toBeUndefined();
    expect(launchers()).toHaveLength(0);
    await act(async () => observe(0.9));
    expect(anchor()).toBeUndefined(); // stays minimised while scrolling
    fireEvent.click(screen.getByRole("button", { name: "Show NEX" }));
    expect(anchor()).toBe("dock");
  });
});
