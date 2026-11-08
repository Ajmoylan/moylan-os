import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMotion, type MotionSetting } from "./policy";
import {
  REDUCED_MOTION_QUERY,
  resetMotionStore,
  setMotionSetting,
  setSystemPrefersReduced,
  startMotionSync,
  useEffectiveMotion,
  useMotionStore,
} from "./store";

/** A controllable stand-in for `matchMedia("(prefers-reduced-motion: reduce)")`. */
function fakeMediaQuery(initial: boolean, { legacy = false } = {}) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches: initial,
    media: REDUCED_MOTION_QUERY,
    ...(legacy
      ? {
          addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
          removeListener: (listener: (event: { matches: boolean }) => void) =>
            listeners.delete(listener),
        }
      : {
          addEventListener: (_: "change", listener: (event: { matches: boolean }) => void) =>
            listeners.add(listener),
          removeEventListener: (_: "change", listener: (event: { matches: boolean }) => void) =>
            listeners.delete(listener),
        }),
  };
  return {
    query,
    listeners,
    /** Simulate the visitor changing their OS setting. */
    change(matches: boolean) {
      query.matches = matches;
      for (const listener of [...listeners]) listener({ matches });
    },
  };
}

function fakeWindow(matchMedia: unknown): Window {
  return { matchMedia, document } as unknown as Window;
}

const html = () => document.documentElement;

beforeEach(() => resetMotionStore());
afterEach(() => html().removeAttribute("data-motion"));

describe("resolveMotion (policy table, ARCHITECTURE §10)", () => {
  it.each<[MotionSetting, boolean, string]>([
    ["system", false, "full"],
    ["system", true, "reduced"],
    ["full", true, "full"],
    ["full", false, "full"],
    ["reduced", false, "reduced"],
    ["reduced", true, "reduced"],
    ["off", false, "off"],
    ["off", true, "off"],
  ])("%s with OS reduced=%s → %s", (setting, osReduced, expected) => {
    expect(resolveMotion(setting, osReduced)).toBe(expected);
  });
});

describe("motion store", () => {
  it("starts on System with full motion, identical to the prerendered HTML", () => {
    expect(useMotionStore.getState()).toEqual({
      setting: "system",
      systemPrefersReduced: false,
      effective: "full",
    });
  });

  it("follows OS changes while the setting is System", () => {
    setSystemPrefersReduced(true);
    expect(useMotionStore.getState().effective).toBe("reduced");
    setSystemPrefersReduced(false);
    expect(useMotionStore.getState().effective).toBe("full");
  });

  it("lets explicit choices override the OS, and System return to following it", () => {
    setSystemPrefersReduced(true);
    setMotionSetting("full");
    expect(useMotionStore.getState().effective).toBe("full");

    setSystemPrefersReduced(false);
    setMotionSetting("reduced");
    setSystemPrefersReduced(false);
    expect(useMotionStore.getState().effective).toBe("reduced");

    setMotionSetting("off");
    setSystemPrefersReduced(true);
    expect(useMotionStore.getState().effective).toBe("off");

    setMotionSetting("system");
    expect(useMotionStore.getState()).toMatchObject({ setting: "system", effective: "reduced" });
  });

  it("never notifies subscribers for no-op updates", () => {
    const listener = vi.fn();
    const unsubscribe = useMotionStore.subscribe(listener);
    setMotionSetting("system");
    setSystemPrefersReduced(false);
    expect(listener).not.toHaveBeenCalled();
    setSystemPrefersReduced(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("re-renders a subscriber only when its own slice changes", () => {
    let renders = 0;
    function Probe() {
      renders += 1;
      return <span>{useEffectiveMotion()}</span>;
    }
    const { container } = render(<Probe />);
    expect(renders).toBe(1);

    act(() => setMotionSetting("full"));
    // Effective motion stays "full", so no re-render, even though the setting changed…
    expect(renders).toBe(1);
    // …and OS changes are ignored while an explicit choice is in effect.
    act(() => setSystemPrefersReduced(true));
    act(() => setSystemPrefersReduced(false));
    expect(renders).toBe(1);

    act(() => setMotionSetting("off"));
    expect(renders).toBe(2);
    expect(container).toHaveTextContent("off");
  });

  it("never writes to cookies or web storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setMotionSetting("reduced");
    setMotionSetting("off");
    setMotionSetting("system");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
    setItem.mockRestore();
  });
});

describe("startMotionSync", () => {
  it("reads the OS preference on start and follows live changes", () => {
    const media = fakeMediaQuery(true);
    const matchMedia = vi.fn(() => media.query);
    const stop = startMotionSync(fakeWindow(matchMedia));

    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(useMotionStore.getState().effective).toBe("reduced");
    expect(html()).toHaveAttribute("data-motion", "reduced");

    media.change(false);
    expect(useMotionStore.getState().effective).toBe("full");
    expect(html()).toHaveAttribute("data-motion", "full");
    stop();
  });

  it("mirrors explicit choices onto <html data-motion>", () => {
    const stop = startMotionSync(fakeWindow(() => fakeMediaQuery(false).query));
    setMotionSetting("off");
    expect(html()).toHaveAttribute("data-motion", "off");
    setMotionSetting("reduced");
    expect(html()).toHaveAttribute("data-motion", "reduced");
    stop();
  });

  it("removes its listener, subscription and attribute on cleanup", () => {
    const media = fakeMediaQuery(false);
    const stop = startMotionSync(fakeWindow(() => media.query));
    expect(media.listeners.size).toBe(1);

    stop();
    expect(media.listeners.size).toBe(0);
    expect(html()).not.toHaveAttribute("data-motion");

    // Changes after cleanup no longer reach the store or the document.
    media.change(true);
    expect(useMotionStore.getState().systemPrefersReduced).toBe(false);
    setMotionSetting("off");
    expect(html()).not.toHaveAttribute("data-motion");
  });

  it("supports the legacy addListener API (older Safari)", () => {
    const media = fakeMediaQuery(false, { legacy: true });
    const stop = startMotionSync(fakeWindow(() => media.query));
    media.change(true);
    expect(useMotionStore.getState().effective).toBe("reduced");
    stop();
    expect(media.listeners.size).toBe(0);
  });

  it("falls back to System/full without matchMedia, or when it throws", () => {
    for (const matchMedia of [
      undefined,
      () => {
        throw new Error("unsupported");
      },
    ]) {
      resetMotionStore();
      const stop = startMotionSync(fakeWindow(matchMedia));
      expect(useMotionStore.getState().effective).toBe("full");
      expect(html()).toHaveAttribute("data-motion", "full");
      stop();
    }
  });
});
