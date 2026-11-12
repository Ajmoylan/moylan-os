import { describe, expect, it } from "vitest";
import type { AgentId } from "~/agents/registry";
import {
  DEFAULT_MACHINE_TIMING,
  easeInOutCubic,
  TransitionMachine,
  type MachineEnvironment,
} from "./machine";

/**
 * The transition state machine (Milestone 2.4b.2; proposal §8.3), pure: every row of the agreed
 * table, plus random event sequences. "A", "B", "C" are nex, forge and syn.
 */

const A: AgentId = "nex";
const B: AgentId = "forge";
const C: AgentId = "syn";
const { morph, settle, prepareCap } = DEFAULT_MACHINE_TIMING;

function machine(env: Partial<MachineEnvironment> = {}, start: AgentId = A) {
  const e: MachineEnvironment = {
    supported: (agent) => agent !== "cipher",
    full: true,
    hidden: false,
    ...env,
  };
  return { m: new TransitionMachine(start, e), env: e };
}

/** Runs the timeline for `seconds` in 16 ms steps. */
const run = (m: TransitionMachine, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.016) m.tick(0.016);
};

/** Brings a fresh machine to morphing(A → B) at the given phase. */
function morphing(phase = 0.5) {
  const { m, env } = machine();
  m.select(B);
  m.report(m.request, "ready");
  m.tick((phase * morph) / 1);
  return { m, env };
}

describe("TransitionMachine (proposal §8.3)", () => {
  it("idle(A): selecting A is a no-op; selecting B prepares A → B with a new request", () => {
    const { m } = machine();
    m.select(A);
    expect([m.kind, m.source, m.request, m.swaps]).toEqual(["idle", A, 0, 0]);
    m.select(B);
    expect([m.kind, m.source, m.target]).toEqual(["preparing", A, B]);
    expect(m.request).toBeGreaterThan(0);
  });

  it("preparing: ready → morphing from phase 0; failed → swap to B; stale answers ignored", () => {
    const { m } = machine();
    m.select(B);
    const request = m.request;
    m.report(request + 1, "ready"); // stale
    expect(m.kind).toBe("preparing");
    m.report(request, "ready");
    expect([m.kind, m.phase, m.direction]).toEqual(["morphing", 0, 1]);

    const other = machine().m;
    other.select(B);
    other.report(other.request, "failed");
    expect([other.kind, other.source, other.swaps]).toEqual(["idle", B, 1]);
  });

  it("preparing(A → B): B no-op; A cancels to idle(A); C retargets with a new request", () => {
    const { m } = machine();
    m.select(B);
    const first = m.request;
    m.select(B);
    expect(m.request).toBe(first);
    m.select(C);
    expect([m.kind, m.target]).toEqual(["preparing", C]);
    expect(m.request).toBeGreaterThan(first);
    m.report(first, "ready"); // B's work is stale now
    expect(m.kind).toBe("preparing");
    m.select(A);
    expect([m.kind, m.source, m.target, m.request]).toEqual(["idle", A, A, 0]);
  });

  it("preparing longer than the cap swaps to the destination (a slow compile never strands the visitor)", () => {
    const { m } = machine();
    m.select(B);
    run(m, prepareCap - 0.05);
    expect(m.kind).toBe("preparing");
    run(m, 0.1);
    expect([m.kind, m.source, m.swaps]).toEqual(["idle", B, 1]);
  });

  it("morphing(A → B): B is a no-op; A reverses from the current phase; reaching 0 → idle(A)", () => {
    const { m } = morphing(0.5);
    const phase = m.phase;
    m.select(B);
    expect([m.direction, m.phase]).toEqual([1, phase]);
    m.select(A);
    expect(m.direction).toBe(-1);
    run(m, morph);
    expect([m.kind, m.source, m.target, m.phase]).toEqual(["idle", A, A, 0]);
    expect(m.swaps).toBe(0);
  });

  it("morphing(A → B) reversing: selecting B resumes forward", () => {
    const { m } = morphing(0.5);
    m.select(A);
    m.tick(0.1);
    m.select(B);
    expect([m.direction, m.pending]).toEqual([1, null]);
  });

  it("morphing: 'failed' for the current request (its resources aborted) shows the latest at once", () => {
    const { m } = morphing(0.4);
    const request = m.request;
    const swaps = m.swaps;
    m.report(request + 1, "failed"); // another request's answer: stale
    m.report(request, "ready"); // the earlier answer, read again: no-op
    expect(m.kind).toBe("morphing");
    m.report(request, "failed");
    expect(m.kind).toBe("idle");
    expect(m.source).toBe(B);
    expect(m.swaps).toBe(swaps + 1);
    const reversed = morphing(0.4).m;
    reversed.select(A);
    reversed.report(reversed.request, "failed");
    expect(reversed.source).toBe(A); // the latest destination when reversing is the source
  });

  it("remaining: the morph's time left in its direction (at the current speed)", () => {
    const { m } = morphing(0.25);
    expect(m.remaining).toBeCloseTo(0.75 * morph, 9);
    m.select(A);
    expect(m.remaining).toBeCloseTo(0.25 * morph, 9);
    expect(machine().m.remaining).toBe(0);
  });

  it("a forward morph reaching 1 settles into B, then idles", () => {
    const { m } = morphing(0.9);
    run(m, morph * 0.2);
    expect([m.kind, m.source, m.target]).toEqual(["settling", B, B]);
    run(m, settle + 0.05);
    expect([m.kind, m.source]).toEqual(["idle", B]);
    expect(m.swaps).toBe(0);
  });

  it("morphing(A → B) + C: only the latest pending is kept, the rest finishes within ≤ 300 ms", () => {
    const { m } = morphing(0.2);
    m.select(C);
    m.select("atlas");
    expect(m.pending).toBe("atlas");
    run(m, DEFAULT_MACHINE_TIMING.boost + 0.02);
    // B was reached (no settle window) and the next transition B → atlas began at once.
    expect([m.kind, m.source, m.target]).toEqual(["preparing", B, "atlas"]);
  });

  it("settling(B): B is a no-op; another agent starts a new transition from B", () => {
    const { m } = morphing(0.99);
    run(m, 0.05);
    expect(m.kind).toBe("settling");
    m.select(B);
    expect(m.kind).toBe("settling");
    m.select(C);
    expect([m.kind, m.source, m.target]).toEqual(["preparing", B, C]);
  });

  it("an unsupported agent is swapped to (no morph), and swapped away from", () => {
    const { m } = machine();
    m.select("cipher");
    expect([m.kind, m.source, m.swaps]).toEqual(["unsupported", "cipher", 1]);
    m.select("cipher");
    expect(m.swaps).toBe(1);
    m.select(B);
    expect([m.kind, m.source, m.swaps]).toEqual(["idle", B, 2]);
  });

  it("without Full Motion every change is an immediate swap (one still frame, no morph)", () => {
    const { m } = machine({ full: false });
    m.select(B);
    expect([m.kind, m.source, m.swaps]).toEqual(["idle", B, 1]);
    m.select(B);
    expect(m.swaps).toBe(1);
  });

  it("Reduced Motion becoming active mid-morph snaps to the latest destination", () => {
    const { m, env } = morphing(0.4);
    m.select(C);
    env.full = false;
    m.snap();
    expect([m.kind, m.source, m.pending]).toEqual(["idle", C, null]);
  });

  it("while hidden, selections are applied as one swap at the first visible frame", () => {
    const { m, env } = machine();
    env.hidden = true;
    m.select(B);
    m.select(C);
    expect([m.kind, m.source]).toEqual(["idle", A]);
    env.hidden = false;
    m.tick(0.016);
    expect([m.kind, m.source, m.swaps]).toEqual(["idle", C, 1]);
  });

  it("the latest destination is what a restore or snap shows", () => {
    const { m } = morphing(0.3);
    expect(m.latest).toBe(B);
    m.select(A);
    expect(m.latest).toBe(A);
    m.select(C);
    expect(m.latest).toBe(C);
  });

  it("eased is a pure, symmetric function of the phase", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 12);
    const { m } = morphing(0.37);
    expect(m.eased).toBe(easeInOutCubic(m.phase));
  });

  it("random event sequences always end at the latest selection, with at most one pending", () => {
    const agents: AgentId[] = [A, B, C, "atlas", "cipher"];
    let seed = 12345;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let trial = 0; trial < 300; trial++) {
      const { m, env } = machine();
      let latest: AgentId = A;
      for (let event = 0; event < 40; event++) {
        const r = random();
        if (r < 0.35) {
          latest = agents[Math.floor(random() * agents.length)]!;
          m.select(latest);
        } else if (r < 0.55) {
          m.report(m.request, random() < 0.7 ? "ready" : "failed");
        } else if (r < 0.6) {
          env.full = !env.full;
          if (!env.full) m.snap();
        } else if (r < 0.63) {
          env.hidden = true;
        } else {
          env.hidden = false;
          m.tick(random() * 0.3);
        }
        expect(m.pending === null || m.kind === "morphing").toBe(true);
      }
      env.hidden = false;
      // Quiescence: at least one visible frame (a selection made while hidden applies there),
      // then answer every request and let time run.
      m.tick(0.016);
      for (let i = 0; i < 400 && m.kind !== "idle" && m.kind !== "unsupported"; i++) {
        if (m.kind === "preparing") m.report(m.request, "ready");
        m.tick(0.05);
      }
      expect(m.source).toBe(latest);
      expect(m.target).toBe(latest);
      expect(m.kind).toBe(latest === "cipher" ? "unsupported" : "idle");
    }
  });

  describe("unsupported destinations resolve at once (Codex finding 2)", () => {
    const U: AgentId = "cipher"; // unsupported in these tests
    /** A machine with a counting allocator: no request may be issued for an unsupported agent. */
    function counted(env: Partial<MachineEnvironment> = {}) {
      let issued = 0;
      const e: MachineEnvironment = {
        supported: (agent) => agent !== U,
        full: true,
        hidden: false,
        ...env,
      };
      const m = new TransitionMachine(A, e, DEFAULT_MACHINE_TIMING, () => ++issued);
      return { m, env: e, issued: () => issued };
    }
    const expectFallback = (m: TransitionMachine) => {
      expect([m.kind, m.source, m.target, m.request, m.pending, m.phase]).toEqual([
        "unsupported",
        U,
        U,
        0,
        null,
        0,
      ]);
    };

    it("from idle: no preparation, same step", () => {
      const { m, issued } = counted();
      m.select(U);
      expectFallback(m);
      expect(issued()).toBe(0);
    });

    it("from preparing: the preparation is dropped in the same step; its late answer is stale", () => {
      const { m, issued } = counted();
      m.select(B);
      const request = m.request;
      m.select(U);
      expectFallback(m);
      expect(issued()).toBe(1);
      m.report(request, "ready");
      expectFallback(m);
    });

    it("from a forward morph: no pending entry, the morph is dropped in the same step", () => {
      const { m } = counted();
      m.select(B);
      m.report(m.request, "ready");
      m.tick(0.5);
      expect(m.kind).toBe("morphing");
      m.select(U);
      expectFallback(m);
    });

    it("from a reverse morph, in the same step", () => {
      const { m } = counted();
      m.select(B);
      m.report(m.request, "ready");
      m.tick(0.5);
      m.select(A);
      expect(m.direction).toBe(-1);
      m.select(U);
      expectFallback(m);
    });

    it("from a morph with a pending selection: the pending one is dropped too", () => {
      const { m } = counted();
      m.select(B);
      m.report(m.request, "ready");
      m.tick(0.3);
      m.select(C);
      expect(m.pending).toBe(C);
      m.select(U);
      expectFallback(m);
    });

    it("from settling, in the same step", () => {
      const { m } = counted();
      m.select(B);
      m.report(m.request, "ready");
      run(m, morph + 0.05);
      expect(m.kind).toBe("settling");
      m.select(U);
      expectFallback(m);
    });

    it("already unsupported: the same agent is a no-op; another unsupported agent swaps", () => {
      const { m } = counted({ supported: (agent) => agent !== U && agent !== "atlas" });
      m.select(U);
      const swaps = m.swaps;
      m.select(U);
      expect(m.swaps).toBe(swaps);
      m.select("atlas");
      expect([m.kind, m.source, m.swaps]).toEqual(["unsupported", "atlas", swaps + 1]);
      m.select(B); // a supported agent from unsupported: swap (no morph from nothing)
      expect([m.kind, m.source]).toEqual(["idle", B]);
    });

    it("while hidden: nothing changes until the first visible frame, where the latest wins", () => {
      const { m, env, issued } = counted();
      m.select(B);
      const before = m.request;
      env.hidden = true;
      m.select(C);
      m.select(U);
      expect([m.kind, m.target, m.request]).toEqual(["preparing", B, before]);
      expect(m.latest).toBe(U);
      env.hidden = false;
      m.tick(0.016);
      expectFallback(m);
      expect(issued()).toBe(1); // no request for C or U
    });

    it("the latest route selection stays authoritative after an unsupported one", () => {
      const { m } = counted();
      m.select(U);
      m.select(B);
      expect([m.kind, m.source]).toEqual(["idle", B]); // from unsupported: a swap
      m.select(U);
      m.select(A);
      expect([m.kind, m.source]).toEqual(["idle", A]);
    });
  });
});
