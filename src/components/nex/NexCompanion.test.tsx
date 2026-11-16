import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexCompanion, SCROLL_LEAVE_PX, SCROLL_RETURN_PX } from "./NexCompanion";
import { NexSlot } from "./NexSlot";
import { setNexMinimised, setNexPlacement } from "./placement";

/** Companion mode: the route's own NEX spot while in view, else the dock; minimise; one launcher. */

let observe: (ratio: number) => void = () => {};
let observers = 0;
class FakeObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe() {
    observers++;
    observe = (ratio) =>
      this.callback(
        [{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
  }
  disconnect() {}
}

function page(dockOnScroll?: string) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <>
          <NexSlot id="hero" poster dockOnScroll={dockOnScroll} />
          <NexCompanion />
        </>
      ),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}
const anchor = () =>
  document.querySelector('[data-stage-anchor="nex"]')?.getAttribute("data-nex-slot");
let width: ReturnType<typeof vi.spyOn>;
/** A viewport change that shows or hides the page's spot (e.g. a rotation across 64rem). */
const relayout = async (spotWidth: number) => {
  width.mockReturnValue(spotWidth);
  await act(async () => window.dispatchEvent(new Event("resize")));
};
const launchers = () => screen.queryAllByRole("button", { name: "NEX: open site navigation" });

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  // jsdom has no layout: the spot reports a size.
  width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
  observers = 0;
  setNexMinimised(false);
  setNexPlacement("page");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Scrolls the window to `y` (jsdom doesn't scroll) and reports it. */
const scrollTo = async (y: number) => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  await act(async () => window.dispatchEvent(new Event("scroll")));
};
const narrow = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (media: string) => ({ matches, media }) as MediaQueryList);

describe("NexCompanion: the opening on phones docks NEX as soon as the visitor scrolls", () => {
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("leaves at the first real scroll (never riding the page), returns at the top", async () => {
    narrow(true);
    page("(max-width: 63.99rem)");
    expect(anchor()).toBe("hero");
    expect(observers).toBe(0); // no visibility threshold to wait for
    await scrollTo(SCROLL_LEAVE_PX - 4); // a nudge
    expect(anchor()).toBe("hero");
    await scrollTo(SCROLL_LEAVE_PX + 16); // the first frame of a flick
    expect(anchor()).toBe("dock");
    await scrollTo(SCROLL_RETURN_PX + 4); // between the thresholds: no flapping
    expect(anchor()).toBe("dock");
    await scrollTo(0);
    expect(anchor()).toBe("hero");
  });

  it("a page opened already scrolled starts with NEX docked", async () => {
    narrow(true);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 900 });
    page("(max-width: 63.99rem)");
    await act(async () => {});
    expect(anchor()).toBe("dock");
  });

  it("wide screens keep the visibility thresholds (the query doesn't match)", async () => {
    narrow(false);
    page("(max-width: 63.99rem)");
    expect(observers).toBe(1);
    await scrollTo(400);
    expect(anchor()).toBe("hero"); // only the observer decides
    await act(async () => observe(0.2));
    expect(anchor()).toBe("dock");
  });
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

  it("minimise hides NEX for the visit; Show NEX brings him back to the page's spot when it is in view", async () => {
    page();
    await act(async () => observe(0));
    fireEvent.click(screen.getByRole("button", { name: "Minimise NEX" }));
    expect(anchor()).toBeUndefined();
    expect(launchers()).toHaveLength(0);
    await act(async () => observe(0.9));
    expect(anchor()).toBeUndefined(); // stays minimised while scrolling
    fireEvent.click(screen.getByRole("button", { name: "Show NEX" }));
    expect(anchor()).toBe("hero"); // the spot is in view: not the dock
  });

  it("Show NEX brings him back to the dock when the page's spot is scrolled away", async () => {
    page();
    await act(async () => observe(0));
    fireEvent.click(screen.getByRole("button", { name: "Minimise NEX" }));
    await act(async () => observe(0.9));
    await act(async () => observe(0.1)); // scrolled away again while minimised
    fireEvent.click(screen.getByRole("button", { name: "Show NEX" }));
    expect(anchor()).toBe("dock");
  });

  it("rotating to a layout that shows the page's spot moves NEX there; hiding it docks him", async () => {
    width.mockReturnValue(0); // narrow layout: the dedicated page hides its spot
    page();
    expect(anchor()).toBe("dock");
    expect(observers).toBe(0);
    await relayout(300); // wide layout: the spot is laid out
    expect(observers).toBe(1);
    await act(async () => observe(0.8));
    expect(anchor()).toBe("hero");
    await relayout(0); // back to narrow
    expect(anchor()).toBe("dock");
  });

  describe("keyboard focus across Minimise and Show NEX", () => {
    const minimiseButton = () => screen.getByRole("button", { name: "Minimise NEX" });
    const showButton = () => screen.getByRole("button", { name: "Show NEX" });
    const dockLauncher = () =>
      document.querySelector<HTMLElement>(
        '[data-nex-dock] [aria-label="NEX: open site navigation"]',
      );
    /** jsdom has no layout: report the launcher as shown (as once the stage draws NEX again). */
    const launcherShown = () =>
      vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
        return (this.classList.contains("nex-launcher") ? [{}] : []) as unknown as DOMRectList;
      });
    const frames = () => act(async () => new Promise((resolve) => setTimeout(resolve, 60)));

    it("keyboard (or screen reader): Minimise focuses Show NEX; Show NEX focuses NEX's launcher", async () => {
      launcherShown();
      page();
      await act(async () => observe(0));
      minimiseButton().focus();
      fireEvent.keyDown(minimiseButton(), { key: "Enter" });
      fireEvent.click(minimiseButton());
      expect(showButton()).toHaveFocus();
      fireEvent.click(showButton());
      await frames();
      expect(dockLauncher()).not.toBeNull();
      expect(dockLauncher()).toHaveFocus();
    });

    it("pointer or touch presses never move focus", async () => {
      launcherShown();
      page();
      await act(async () => observe(0));
      fireEvent.pointerDown(minimiseButton());
      fireEvent.click(minimiseButton());
      expect(showButton()).not.toHaveFocus();
      fireEvent.pointerDown(showButton());
      fireEvent.click(showButton());
      await frames();
      expect(dockLauncher()).not.toHaveFocus();
    });

    it("waits for the launcher to be shown, but never takes focus back from the visitor", async () => {
      const shown = launcherShown();
      shown.mockReturnValue([] as unknown as DOMRectList); // NEX not drawn yet
      page();
      await act(async () => observe(0));
      fireEvent.click(minimiseButton());
      fireEvent.click(showButton());
      await frames();
      expect(dockLauncher()).not.toHaveFocus(); // not shown yet: nothing to focus
      const elsewhere = document.createElement("button");
      document.body.append(elsewhere);
      elsewhere.focus(); // the visitor moves on
      shown.mockImplementation(function (this: Element) {
        return (this.classList.contains("nex-launcher") ? [{}] : []) as unknown as DOMRectList;
      });
      await frames();
      expect(elsewhere).toHaveFocus();
    });
  });

  it("an ordinary resize moves nothing (NEX stays docked while the spot is scrolled away)", async () => {
    page();
    await act(async () => observe(0));
    expect(anchor()).toBe("dock");
    await relayout(320); // still laid out: same decision, no new observer
    expect(anchor()).toBe("dock");
    expect(observers).toBe(1);
  });
});
