import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEX_PARAMS } from "./params";
import { AnchorTracker } from "./anchor";
import { placeNex, type Placement } from "./placement";

/**
 * Regression for the Milestone 2.3 review: NEX read the anchor's layout with
 * getBoundingClientRect() on every animation frame. The tracker measures only after events that
 * can move or resize the anchor, and NEX recomputes its placement only when the box changes.
 */

type ObserverCallback = () => void;
const observers: { callback: ObserverCallback; observed: Element[]; disconnected: boolean }[] = [];

class FakeResizeObserver {
  private readonly entry: (typeof observers)[number];
  constructor(callback: ObserverCallback) {
    this.entry = { callback, observed: [], disconnected: false };
    observers.push(this.entry);
  }
  observe(element: Element) {
    this.entry.observed.push(element);
  }
  unobserve(element: Element) {
    this.entry.observed = this.entry.observed.filter((e) => e !== element);
  }
  disconnect() {
    this.entry.disconnected = true;
  }
}

let rect = { left: 600, top: 200, width: 400, height: 400 };
function anchorElement() {
  const element = document.createElement("div");
  document.body.append(element);
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({ ...rect }) as DOMRect);
  return element;
}

beforeEach(() => {
  observers.length = 0;
  rect = { left: 600, top: 200, width: 400, height: 400 };
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("AnchorTracker", () => {
  it("measures once, then serves the cached box on every later frame", () => {
    const tracker = new AnchorTracker(window, () => {});
    tracker.attach();
    const element = anchorElement();
    tracker.setElement(element);
    for (let frame = 0; frame < 120; frame++) tracker.read();
    expect(element.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(tracker.box).toMatchObject({ ...rect, present: true });
    tracker.detach();
  });

  it("re-measures after scrolling, resizing, observed size changes and font loading", () => {
    const changes = vi.fn();
    const tracker = new AnchorTracker(window, changes);
    tracker.attach();
    const element = anchorElement();
    tracker.setElement(element);
    tracker.read();

    const triggers: (() => void)[] = [
      () => window.dispatchEvent(new Event("scroll")),
      () => window.dispatchEvent(new Event("resize")),
      () => observers[0]!.callback(), // enlarged text or responsive reflow resizes the page
    ];
    triggers.forEach((trigger, index) => {
      rect = { ...rect, top: rect.top - 50 };
      trigger();
      tracker.read();
      tracker.read();
      expect(element.getBoundingClientRect).toHaveBeenCalledTimes(index + 2);
      expect(tracker.box.top).toBe(rect.top);
    });
    expect(changes).toHaveBeenCalled();
    tracker.detach();
  });

  it("observes the anchor and the page body, and follows a new anchor after navigation", () => {
    const tracker = new AnchorTracker(window, () => {});
    tracker.attach();
    const first = anchorElement();
    tracker.setElement(first);
    expect(observers[0]!.observed).toEqual([document.body, first]);

    first.remove();
    expect(tracker.read().present).toBe(false);

    const second = anchorElement();
    tracker.setElement(second);
    expect(observers[0]!.observed).toEqual([document.body, second]);
    expect(tracker.read().present).toBe(true);
    tracker.detach();
  });

  it("removes every listener and observer on detach", () => {
    const changes = vi.fn();
    const tracker = new AnchorTracker(window, changes);
    tracker.attach();
    changes.mockClear();
    tracker.detach();
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(changes).not.toHaveBeenCalled();
    expect(observers[0]!.disconnected).toBe(true);
  });

  describe("web font loading (document.fonts 'loadingdone')", () => {
    /** A FontFaceSet stand-in that counts its live 'loadingdone' listeners. */
    function stubFonts() {
      const fonts = new EventTarget();
      const live = new Set<EventListenerOrEventListenerObject>();
      const add = fonts.addEventListener.bind(fonts);
      const remove = fonts.removeEventListener.bind(fonts);
      fonts.addEventListener = (type: string, listener, options) => {
        if (type === "loadingdone" && listener) live.add(listener);
        add(type, listener, options);
      };
      fonts.removeEventListener = (type: string, listener, options) => {
        if (type === "loadingdone" && listener) live.delete(listener);
        remove(type, listener, options);
      };
      Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
      return { fonts, live, loaded: () => fonts.dispatchEvent(new Event("loadingdone")) };
    }

    afterEach(() => {
      Reflect.deleteProperty(document, "fonts");
    });

    it("re-measures the anchor once fonts finish loading", () => {
      const { live, loaded } = stubFonts();
      const changes = vi.fn();
      const tracker = new AnchorTracker(window, changes);
      tracker.attach();
      const element = anchorElement();
      tracker.setElement(element);
      tracker.read();
      expect(live.size).toBe(1);

      // A web font reflows the heading the anchor sits under.
      rect = { ...rect, top: rect.top + 24, height: rect.height + 8 };
      changes.mockClear();
      loaded();
      expect(changes).toHaveBeenCalledTimes(1); // the demand loop is asked for a frame
      tracker.read();
      tracker.read();
      expect(element.getBoundingClientRect).toHaveBeenCalledTimes(2);
      expect(tracker.box).toMatchObject({ ...rect, present: true });
      tracker.detach();
    });

    it("removes the listener on detach: later font loads do nothing", () => {
      const { live, loaded } = stubFonts();
      const changes = vi.fn();
      const tracker = new AnchorTracker(window, changes);
      tracker.attach();
      const element = anchorElement();
      tracker.setElement(element);
      tracker.read();
      tracker.detach();
      expect(live.size).toBe(0);

      changes.mockClear();
      rect = { ...rect, top: 0 };
      loaded();
      expect(changes).not.toHaveBeenCalled();
      tracker.read();
      expect(element.getBoundingClientRect).toHaveBeenCalledTimes(1);
    });

    it("repeated attach/detach cycles never accumulate listeners", () => {
      const { live, loaded } = stubFonts();
      const changes = vi.fn();
      const tracker = new AnchorTracker(window, changes);
      for (let cycle = 0; cycle < 5; cycle++) {
        tracker.attach();
        tracker.attach(); // idempotent
        expect(live.size).toBe(1);
        changes.mockClear();
        loaded();
        expect(changes).toHaveBeenCalledTimes(1);
        tracker.detach();
        tracker.detach(); // idempotent
        expect(live.size).toBe(0);
      }
      // Two trackers (StrictMode remount) each own exactly one listener and release only their own.
      const other = new AnchorTracker(window, () => {});
      tracker.attach();
      other.attach();
      expect(live.size).toBe(2);
      other.detach();
      expect(live.size).toBe(1);
      tracker.detach();
      expect(live.size).toBe(0);
    });
  });

  it("bumps its version only when the box actually changes", () => {
    const tracker = new AnchorTracker(window, () => {});
    tracker.attach();
    tracker.setElement(anchorElement());
    tracker.read();
    const version = tracker.version;
    window.dispatchEvent(new Event("scroll"));
    tracker.read();
    expect(tracker.version).toBe(version);
    rect = { ...rect, left: 100 };
    window.dispatchEvent(new Event("scroll"));
    tracker.read();
    expect(tracker.version).toBe(version + 1);
    tracker.detach();
  });
});

describe("placement from the cached box", () => {
  it("moves NEX with its anchor and reuses one placement object", () => {
    const viewport = { width: 1200, height: 800 };
    const out: Placement = { x: 0, y: 0, scale: 0, onScreen: false };
    const before = placeNex(
      { left: 600, top: 200, width: 400, height: 400 },
      viewport,
      NEX_PARAMS.fov,
      out,
    );
    const { x, y, scale } = before;
    const after = placeNex(
      { left: 600, top: 100, width: 400, height: 400 },
      viewport,
      NEX_PARAMS.fov,
      out,
    );
    expect(after).toBe(out);
    expect(after.x).toBeCloseTo(x);
    expect(after.y).toBeGreaterThan(y); // scrolled up the page: NEX moves up
    expect(after.scale).toBeCloseTo(scale);
  });
});
