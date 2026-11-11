import { describe, expect, it, vi } from "vitest";
import { Resources } from "./resources";

describe("Resources (transactional ownership)", () => {
  it("releases in reverse order of acquisition, exactly once", () => {
    const order: string[] = [];
    const r = new Resources();
    r.defer(() => order.push("canvas"));
    r.own({ dispose: () => order.push("renderer") });
    r.defer(() => order.push("listener"));
    r.release();
    r.release();
    expect(order).toEqual(["listener", "renderer", "canvas"]);
    expect(r.isReleased).toBe(true);
  });

  it("runs every release even if one throws, then rethrows the first error raised (newest first)", () => {
    const later = vi.fn();
    const r = new Resources();
    r.defer(later);
    r.defer(() => {
      throw new Error("older");
    });
    r.defer(() => {
      throw new Error("newest");
    });
    expect(() => r.release()).toThrow("newest");
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("releases anything acquired after release at once (nothing outlives its owner)", () => {
    const r = new Resources();
    r.release();
    const late = vi.fn();
    r.defer(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("rollback releases everything and returns the original error, not a release error", () => {
    const released = vi.fn();
    const r = new Resources();
    r.defer(released);
    r.defer(() => {
      throw new Error("release failure");
    });
    const cause = new Error("construction failure");
    expect(r.rollback(cause)).toBe(cause);
    expect(released).toHaveBeenCalledTimes(1);
  });
});
