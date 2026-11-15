import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Engine } from "../engine/Engine";
import { createTransition } from "../transition/StageTransition";
import { CompanionMirror } from "./mirror";

/**
 * The companion mirror (launch sprint): its one-time copy set-up happens in the background, it never
 * shows NEX while he is still gliding into the dock, and it fades in once he has arrived.
 */

let now = 0;
const drawImage = vi.fn();
const clearRect = vi.fn();

function setup() {
  document.body.innerHTML = '<canvas data-nex-mirror data-active="false"></canvas>';
  const target = document.querySelector<HTMLCanvasElement>("canvas")!;
  vi.spyOn(target, "getContext").mockReturnValue({
    drawImage,
    clearRect,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    left: 300,
    top: 700,
    width: 120,
    height: 120,
  } as DOMRect);
  const source = document.createElement("canvas");
  source.width = 780;
  Object.defineProperty(source, "clientWidth", { value: 390 });
  const engine = { renderer: { domElement: source } } as unknown as Engine;
  const transition = createTransition("nex");
  const mirror = new CompanionMirror(transition.placement);
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) {
      now += 16;
      mirror.afterRender(engine);
    }
  };
  return { target, transition, mirror, frames };
}

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  drawImage.mockClear();
  clearRect.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("CompanionMirror", () => {
  it("measures and warms the copy in the background, before any handover", () => {
    const { target, frames } = setup();
    frames(1);
    expect(target.width).toBe(240); // sized at once (device pixels), not at the first handover
    expect(drawImage).not.toHaveBeenCalled();
    frames(60);
    expect(drawImage).toHaveBeenCalledTimes(1); // one hidden warm-up copy, then cleared
    expect(target.hasAttribute("data-visible")).toBe(false);
  });

  it("never shows NEX while he is still gliding into the dock; fades in once he has arrived", () => {
    const { target, transition, frames } = setup();
    frames(60);
    drawImage.mockClear();
    target.dataset.active = "true";
    transition.placement.gliding = true;
    frames(30);
    expect(target.hasAttribute("data-visible")).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
    transition.placement.gliding = false;
    frames(1);
    expect(target.hasAttribute("data-visible")).toBe(true);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("leaving the dock: fades out while still copying, then stops", () => {
    const { target, transition, frames } = setup();
    frames(60);
    target.dataset.active = "true";
    transition.placement.gliding = false;
    frames(5);
    target.dataset.active = "false";
    drawImage.mockClear();
    frames(10); // 160 ms: inside the 450 ms fade
    expect(target.hasAttribute("data-visible")).toBe(false);
    expect(drawImage).toHaveBeenCalledTimes(10);
    drawImage.mockClear();
    frames(40);
    expect(drawImage.mock.calls.length).toBeLessThan(25);
    drawImage.mockClear();
    frames(10);
    expect(drawImage).not.toHaveBeenCalled();
  });
});
