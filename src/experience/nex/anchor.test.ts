import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEX_PARAMS } from "./params";
import { AnchorTracker } from "./anchor";
import {
  CONTAIN_MARGIN_PX,
  CONTAIN_TOP_PX,
  FILL,
  placeNex,
  REACH,
  type Placement,
} from "./placement";

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

  it("an anchor that isn't laid out (display: none) is absent, measured once until it is again", () => {
    const tracker = new AnchorTracker(window, () => {});
    tracker.attach();
    rect = { left: 0, top: 0, width: 0, height: 0 };
    const element = anchorElement();
    tracker.setElement(element);
    for (let frame = 0; frame < 60; frame++) tracker.read();
    expect(element.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(tracker.box.present).toBe(false);
    // Laid out again (e.g. the viewport widened): its ResizeObserver reports it.
    rect = { left: 600, top: 200, width: 400, height: 400 };
    observers[0]!.callback();
    expect(tracker.read()).toMatchObject({ ...rect, present: true });
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

describe("containment inside the viewport (launch sprint)", () => {
  const viewport = { width: 1280, height: 800 };
  const fov = NEX_PARAMS.fov;
  const unitsPerPx = (2 * 7.8 * Math.tan((fov * Math.PI) / 360)) / viewport.height;
  const screenY = (p: Placement) => viewport.height / 2 - p.y / unitsPerPx;
  const box = (top: number, contain: boolean) => ({
    left: 900,
    top,
    width: 300,
    height: 300,
    contain,
  });
  const reach = 150 * FILL * REACH;

  it("keeps the whole footprint below the header and inside the viewport while scrolling", () => {
    let previous: number | null = null;
    for (let top = 600; top >= -900; top -= 7) {
      const p = placeNex(box(top, true), viewport, fov);
      const y = screenY(p);
      expect(y - reach).toBeGreaterThanOrEqual(CONTAIN_TOP_PX + CONTAIN_MARGIN_PX - 1e-6);
      expect(y + reach).toBeLessThanOrEqual(viewport.height - CONTAIN_MARGIN_PX + 1e-6);
      expect(p.onScreen).toBe(true);
      // Continuous: a 7 px scroll never moves NEX by more than 7 px.
      if (previous !== null) expect(Math.abs(y - previous)).toBeLessThanOrEqual(7 + 1e-6);
      previous = y;
    }
  });

  it("an uncontained anchor scrolls NEX away as before", () => {
    const p = placeNex(box(-900, false), viewport, fov);
    expect(p.onScreen).toBe(false);
    const contained = placeNex(box(200, true), viewport, fov);
    expect(contained).toEqual(placeNex(box(200, false), viewport, fov)); // in view: untouched
  });

  it("NEX larger than the space is centred in it rather than jumping", () => {
    const short = { width: 1280, height: 500 };
    const big = { left: 700, top: 0, width: 500, height: 500, contain: true };
    const a = placeNex({ ...big, top: -300 }, short, fov);
    const b = placeNex({ ...big, top: 300 }, short, fov);
    expect(a.y).toBe(b.y);
  });

  it("with browser toolbars shown, keeps NEX above them (the visible viewport, not the stage's 100lvh)", () => {
    // iPad Safari: the stage is 800 px tall (large viewport); toolbars leave 720 px visible.
    const visible = 720;
    for (let top = 600; top >= -900; top -= 50) {
      const y = screenY(placeNex({ ...box(top, true), viewHeight: visible }, viewport, fov));
      expect(y + reach).toBeLessThanOrEqual(visible - CONTAIN_MARGIN_PX + 1e-6);
    }
    // No toolbar (or no measurement): the stage's own height, exactly as before.
    expect(placeNex({ ...box(600, true), viewHeight: 0 }, viewport, fov)).toEqual(
      placeNex(box(600, true), viewport, fov),
    );
    expect(placeNex({ ...box(600, true), viewHeight: 900 }, viewport, fov)).toEqual(
      placeNex(box(600, true), viewport, fov),
    );
  });

  it("the tracker records the visible viewport's height, re-measured when toolbars change it", () => {
    const tracker = new AnchorTracker(window, () => {});
    tracker.attach();
    const height = vi.spyOn(window, "innerHeight", "get").mockReturnValue(720);
    tracker.setElement(anchorElement());
    const first = tracker.version;
    expect(tracker.read().viewHeight).toBe(720);
    height.mockReturnValue(780); // the toolbar collapses: a window resize
    window.dispatchEvent(new Event("resize"));
    expect(tracker.read().viewHeight).toBe(780);
    expect(tracker.version).toBeGreaterThan(first);
    tracker.detach();
  });

  it("the tracker reads the anchor's containment media query when it measures", () => {
    const tracker = new AnchorTracker(window, () => {});
    tracker.attach();
    const element = anchorElement();
    element.setAttribute("data-nex-contain", "(min-width: 64rem)");
    const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    vi.stubGlobal("matchMedia", matchMedia);
    window.matchMedia = matchMedia;
    tracker.setElement(element);
    expect(tracker.read().contain).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 64rem)");
    matchMedia.mockReturnValue({ matches: false } as MediaQueryList);
    window.dispatchEvent(new Event("resize"));
    expect(tracker.read().contain).toBe(false);
    tracker.detach();
  });
});
