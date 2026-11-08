import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_STEP_SECONDS, dissipationFor, selectFlowFormat } from "./policy";
import { MAX_POINTER_SPEED, PointerTracker } from "./PointerTracker";

describe("selectFlowFormat (ADR-004 fallback order)", () => {
  it("prefers half-float when the extension exists and the target is renderable", () => {
    const probe = vi.fn(() => true);
    expect(selectFlowFormat(true, probe)).toBe("half-float");
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("falls back to RGBA8 when half-float is missing or incomplete", () => {
    const probe = vi.fn((format: string) => format === "rgba8");
    expect(selectFlowFormat(true, probe)).toBe("rgba8");
    expect(probe.mock.calls.map(([format]) => format)).toEqual(["half-float", "rgba8"]);

    const noExtension = vi.fn(() => true);
    expect(selectFlowFormat(false, noExtension)).toBe("rgba8");
    expect(noExtension).toHaveBeenCalledWith("rgba8");
    expect(noExtension).not.toHaveBeenCalledWith("half-float");
  });

  it("falls back to the analytic pointer falloff when no target works", () => {
    expect(selectFlowFormat(true, () => false)).toBe("analytic");
  });
});

describe("dissipationFor (frame-rate independent decay)", () => {
  it("decays by the configured factor per 60 Hz frame", () => {
    expect(dissipationFor(0.95, 1 / 60)).toBeCloseTo(0.95, 10);
  });

  it("decays equally per second at 30, 60 and 120 fps", () => {
    const perSecond = (fps: number) => dissipationFor(0.95, 1 / fps) ** fps;
    expect(perSecond(30)).toBeCloseTo(perSecond(60), 10);
    expect(perSecond(120)).toBeCloseTo(perSecond(60), 10);
  });

  it("clamps long steps (a stall or a hidden tab) and negative steps", () => {
    expect(dissipationFor(0.95, 5)).toBeCloseTo(0.95 ** (MAX_STEP_SECONDS * 60), 10);
    expect(dissipationFor(0.95, -1)).toBe(1);
  });
});

describe("PointerTracker", () => {
  afterEach(() => vi.restoreAllMocks());

  const move = (x: number, y: number) =>
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y }));

  it("attaches listeners only while attached, and detach removes every one", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const tracker = new PointerTracker(window);
    expect(add).not.toHaveBeenCalled();

    tracker.attach();
    tracker.attach(); // idempotent
    const added = add.mock.calls.map(([type]) => type);
    expect(added).toEqual(["pointermove", "blur"]);

    tracker.detach();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(["pointermove", "blur"]);
    expect(tracker.isAttached).toBe(false);
  });

  it("turns movement into NDC velocity per frame, then rests", () => {
    const tracker = new PointerTracker(window);
    tracker.attach();
    const width = window.innerWidth;
    move(0, 0);
    move(width * 0.1, 0); // 0.1 UV = 0.2 NDC to the right
    const sample = tracker.update(0.1);
    expect(sample.active).toBe(true);
    expect(sample.vx).toBeCloseTo(2, 5); // 0.2 NDC / 0.1 s
    expect(sample.vy).toBe(0);
    expect(sample.u).toBeCloseTo(0.1, 5);

    expect(tracker.update(0.1).vx).toBe(0); // no movement since the last frame
    tracker.detach();
  });

  it("caps velocity so a flick can't blow the field apart", () => {
    const tracker = new PointerTracker(window);
    tracker.attach();
    move(0, 0);
    move(window.innerWidth, 0);
    expect(tracker.update(1 / 60).vx).toBe(MAX_POINTER_SPEED);
    tracker.detach();
  });

  it("smoothed velocity eases back to rest after movement stops", () => {
    const tracker = new PointerTracker(window);
    tracker.attach();
    move(0, 0);
    move(window.innerWidth * 0.05, 0);
    tracker.update(1 / 60);
    const peak = tracker.sample.smoothVx;
    for (let i = 0; i < 120; i++) tracker.update(1 / 60);
    expect(peak).toBeGreaterThan(0);
    expect(Math.abs(tracker.sample.smoothVx)).toBeLessThan(peak * 0.01);
    tracker.detach();
  });

  it("goes inactive when the pointer leaves or the window loses focus, and on detach", () => {
    const tracker = new PointerTracker(window);
    tracker.attach();
    move(10, 10);
    window.dispatchEvent(new Event("blur"));
    expect(tracker.sample.active).toBe(false);
    move(10, 10);
    tracker.detach();
    expect(tracker.sample).toMatchObject({ active: false, vx: 0, vy: 0, smoothVx: 0 });
  });
});
