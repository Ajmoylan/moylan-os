import { afterEach, describe, expect, it } from "vitest";
import { PointerTracker } from "./PointerTracker";

/** A pointermove of the given type (jsdom has no PointerEvent constructor). */
function move(pointerType: string, clientX = 100, clientY = 100) {
  const event = new MouseEvent("pointermove", { clientX, clientY });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  window.dispatchEvent(event);
}

describe("PointerTracker", () => {
  const tracker = new PointerTracker(window);
  afterEach(() => tracker.detach());

  it("tells a mouse or pen (fine) from a finger: a touch is never an approach", () => {
    tracker.attach();
    move("mouse");
    expect(tracker.sample).toMatchObject({ active: true, fine: true });
    move("touch");
    expect(tracker.sample).toMatchObject({ active: true, fine: false });
    move("pen");
    expect(tracker.sample.fine).toBe(true);
  });
});
