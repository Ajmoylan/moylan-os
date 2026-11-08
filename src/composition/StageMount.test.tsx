import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Capabilities from "~/experience/capabilities";
import type { StageProps } from "~/experience/Stage";

/**
 * StageMount regression tests (ARCHITECTURE §9.4, §10). Deterministic controls only:
 * - the idle callback is a manual queue (or fake timers for the setTimeout fallback);
 * - capability signals come from a spy, so probes can be counted;
 * - the lazy Stage module is replaced per test (success, failed import, render failure).
 */

const mocks = vi.hoisted(() => ({
  readCapabilitySignals: vi.fn(() => ({
    webgl2: true,
    saveData: false,
    coarsePointer: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
  })),
}));

vi.mock("~/experience/capabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof Capabilities>()),
  readCapabilitySignals: mocks.readCapabilitySignals,
}));

/** Manual requestIdleCallback: callbacks run only when the test calls `runIdle()`. */
const idle = {
  nextId: 1,
  queue: new Map<number, () => void>(),
  request: vi.fn((callback: IdleRequestCallback) => {
    const id = idle.nextId++;
    idle.queue.set(id, () => callback({ didTimeout: false, timeRemaining: () => 50 }));
    return id;
  }),
  cancel: vi.fn((id: number) => {
    idle.queue.delete(id);
  }),
};

function runIdle() {
  const tasks = [...idle.queue.values()];
  idle.queue.clear();
  act(() => tasks.forEach((task) => task()));
}

const stageRenders = vi.fn();

function WorkingStage({ agent, plan }: StageProps) {
  stageRenders();
  return (
    <div
      data-testid="stage"
      data-agent={agent}
      data-tier={plan.tier}
      data-motion={plan.motion}
      data-pointer={String(plan.pointerEffects)}
    />
  );
}

function ThrowingStage(): never {
  stageRenders();
  throw new Error("render failed");
}

/**
 * Load a fresh StageMount (and its motion store) with the given Stage module, so each test gets
 * a new lazy() component rather than one cached by an earlier test.
 */
async function load(stageModule: () => Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("~/experience/Stage", stageModule);
  const [{ StageMount }, motion] = await Promise.all([
    import("./StageMount"),
    import("~/motion/store"),
  ]);
  const view = render(
    <MemoryRouter initialEntries={["/engineering"]}>
      <StageMount />
    </MemoryRouter>,
  );
  const setMotion = (setting: Parameters<typeof motion.setMotionSetting>[0]) =>
    act(() => motion.setMotionSetting(setting));
  return { view, setMotion };
}

/** Wait (by polling, not by fixed delays) until the stage's error boundary has caught a failure. */
const stageFailed = (warn: ReturnType<typeof vi.spyOn>) =>
  vi.waitFor(() =>
    expect(warn).toHaveBeenCalledWith("[MOYLAN//OS] WebGL stage disabled:", expect.any(Error)),
  );

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  idle.nextId = 1;
  idle.queue.clear();
  window.requestIdleCallback = idle.request;
  window.cancelIdleCallback = idle.cancel;
  // Expected failures are logged by React and by the boundary; keep test output readable.
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  // @ts-expect-error: jsdom has no idle callbacks; remove the test doubles again.
  delete window.requestIdleCallback;
  // @ts-expect-error: as above
  delete window.cancelIdleCallback;
  vi.doUnmock("~/experience/Stage");
});

describe("StageMount", () => {
  it("probes the device once when idle, then re-plans on motion changes without re-probing", async () => {
    const { setMotion } = await load(() => ({ default: WorkingStage }));
    expect(idle.request).toHaveBeenCalledTimes(1);
    expect(mocks.readCapabilitySignals).not.toHaveBeenCalled();

    runIdle();
    const stage = await screen.findByTestId("stage");
    expect(stage.dataset).toMatchObject({ agent: "forge", tier: "3", motion: "full" });
    expect(stage).toHaveAttribute("data-pointer", "true");

    setMotion("reduced");
    expect(screen.getByTestId("stage").dataset).toMatchObject({ tier: "1", pointer: "false" });

    setMotion("off");
    expect(screen.queryByTestId("stage")).not.toBeInTheDocument();

    setMotion("full");
    expect(await screen.findByTestId("stage")).toHaveAttribute("data-tier", "3");
    expect(mocks.readCapabilitySignals).toHaveBeenCalledTimes(1);
    expect(idle.request).toHaveBeenCalledTimes(1);
  });

  it("selecting Off before the idle probe cancels it; nothing is probed or loaded until motion returns", async () => {
    const importStage = vi.fn(() => ({ default: WorkingStage }));
    const { setMotion } = await load(importStage);
    expect(idle.queue.size).toBe(1);

    setMotion("off");
    expect(idle.cancel).toHaveBeenCalledWith(1);
    expect(idle.queue.size).toBe(0);
    runIdle();
    expect(mocks.readCapabilitySignals).not.toHaveBeenCalled();
    expect(importStage).not.toHaveBeenCalled();
    expect(screen.queryByTestId("stage")).not.toBeInTheDocument();

    setMotion("reduced");
    expect(idle.request).toHaveBeenCalledTimes(2);
    runIdle();
    expect(await screen.findByTestId("stage")).toHaveAttribute("data-tier", "1");
    expect(mocks.readCapabilitySignals).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending probe on unmount", async () => {
    const { view } = await load(() => ({ default: WorkingStage }));
    view.unmount();
    expect(idle.cancel).toHaveBeenCalledWith(1);
    expect(idle.queue.size).toBe(0);
    expect(mocks.readCapabilitySignals).not.toHaveBeenCalled();
  });

  it("uses a cancellable setTimeout when requestIdleCallback is unavailable", async () => {
    // @ts-expect-error: simulate browsers without requestIdleCallback (e.g. older Safari)
    delete window.requestIdleCallback;
    // @ts-expect-error: as above
    delete window.cancelIdleCallback;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { setMotion } = await load(() => ({ default: WorkingStage }));

    setMotion("off");
    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.readCapabilitySignals).not.toHaveBeenCalled();

    setMotion("full");
    act(() => vi.advanceTimersByTime(200));
    expect(mocks.readCapabilitySignals).toHaveBeenCalledTimes(1);
  });

  it("a failed lazy Stage import leaves the static design and is never retried in the visit", async () => {
    const importStage = vi.fn(() => {
      throw new Error("chunk failed to load");
    });
    const { view, setMotion } = await load(importStage);
    runIdle();
    await stageFailed(warn);
    expect(view.container).toBeEmptyDOMElement();

    for (const setting of ["off", "full", "reduced", "system"] as const) setMotion(setting);
    await act(async () => {});
    expect(view.container).toBeEmptyDOMElement();
    expect(importStage).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(mocks.readCapabilitySignals).toHaveBeenCalledTimes(1);
  });

  it("a Stage render failure stays failed after switching Off and back on", async () => {
    const { view, setMotion } = await load(() => ({ default: ThrowingStage }));
    runIdle();
    await stageFailed(warn);
    const rendersAtFailure = stageRenders.mock.calls.length;
    expect(rendersAtFailure).toBeGreaterThan(0);
    expect(view.container).toBeEmptyDOMElement();

    setMotion("off");
    setMotion("full");
    setMotion("reduced");
    await act(async () => {});
    expect(stageRenders).toHaveBeenCalledTimes(rendersAtFailure);
    expect(view.container).toBeEmptyDOMElement();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled(); // React reported the caught error once, not per toggle
  });
});
