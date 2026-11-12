import { ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { MorphPrograms, type MorphCompiler, type StageEpochs } from "./programs";

/** The bounded, epoch-guarded morph-program compiler (2.4b.2 stage D; proposal §6.3). */

function setup(capacity = 2) {
  const calls: { key: string; material: ShaderMaterial; resolve(ok: boolean): void }[] = [];
  const keys = new Map<ShaderMaterial, string>();
  const compiler: MorphCompiler = {
    compile: (material) =>
      new Promise<boolean>((resolve) =>
        calls.push({ key: keys.get(material)!, material, resolve }),
      ),
    warm: () => Promise.resolve(true),
    verify: () => true,
  };
  const epochs: StageEpochs = { owner: 1, context: 0 };
  const programs = new MorphPrograms(compiler, epochs, 1, capacity);
  const built: string[] = [];
  const build = (key: string) => () => {
    built.push(key);
    const material = new ShaderMaterial();
    keys.set(material, key);
    return material;
  };
  const want = (key: string, request = 0) => programs.want(key, build(key), request);
  return { calls, epochs, programs, built, want };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MorphPrograms", () => {
  it("A → B → C → A: the latest want is the compiling A, so C is dropped and never compiled", async () => {
    const s = setup();
    expect(s.want("a", 1).status).toBe("compiling");
    expect(s.want("b", 2).status).toBe("queued");
    expect(s.want("c", 3).status).toBe("queued"); // replaces b (latest only)
    expect(s.programs.pending).toBe("c");
    expect(s.want("a", 4).status).toBe("compiling"); // supersedes c
    expect(s.programs.pending).toBeNull();
    s.calls[0]!.resolve(true);
    await flush();
    expect(s.built).toEqual(["a"]); // neither b nor c was ever built
    expect(s.calls).toHaveLength(1);
    expect(s.programs.compiling).toBeNull();
    expect(s.want("a", 4)).toMatchObject({ status: "ready" });
    expect(s.programs.stats.dropped).toBe(2);
  });

  it("one active, one queued: the queued pair starts only while it is still the latest want", async () => {
    const s = setup();
    s.want("a", 1);
    s.want("b", 2);
    s.calls[0]!.resolve(true);
    await flush();
    expect(s.built).toEqual(["a", "b"]); // b was the latest want when a finished
    expect(s.programs.compiling).toBe("b");
  });

  it("a cache hit supersedes the queued pair; repeated selection of one pair compiles it once", async () => {
    const s = setup();
    s.want("a", 1);
    s.calls[0]!.resolve(true);
    await flush();
    s.want("b", 2); // compiling
    s.want("c", 3); // queued
    expect(s.want("a", 4).status).toBe("ready"); // cached: c is no longer wanted
    expect(s.programs.pending).toBeNull();
    for (let i = 5; i < 10; i++) expect(s.want("a", i).status).toBe("ready");
    s.calls[1]!.resolve(true);
    await flush();
    expect(s.built).toEqual(["a", "b"]);
    expect(s.programs.cached).toEqual(["a", "b"]); // b kept: room, nothing evicted
  });

  it("cancellation: with no preparation the queued pair is dropped unbuilt", async () => {
    const s = setup();
    s.want("a", 1);
    s.want("b", 2);
    s.programs.unwant();
    expect(s.programs.pending).toBeNull();
    s.calls[0]!.resolve(true);
    await flush();
    expect(s.built).toEqual(["a"]);
    expect(s.programs.cached).toEqual(["a"]); // a completed while unwanted: kept (room)
  });

  it("a stale completion is never cached at the expense of a pinned or wanted program", async () => {
    const s = setup();
    const complete = async (key: string, request: number) => {
      s.want(key, request);
      s.calls.at(-1)!.resolve(true);
      await flush();
      return s.want(key, request).material!;
    };
    const a = await complete("a", 1);
    await complete("b", 2);
    s.programs.pin(a); // a morph is using a
    s.want("c", 3); // compiling c
    s.want("b", 4); // the latest want is b (cached)
    const c = s.calls.at(-1)!;
    const dispose = vi.spyOn(c.material, "dispose");
    c.resolve(true); // c completes, no longer wanted; the cache holds a (pinned) and b (wanted)
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(s.programs.cached).toEqual(["a", "b"]);
    expect(s.programs.stats.discarded).toBe(1);
  });

  it("keeps at most two completed programs, least recently used evicted, pinned ones kept", async () => {
    const s = setup();
    const complete = async (key: string) => {
      s.want(key);
      s.calls.at(-1)!.resolve(true);
      await flush();
      return s.want(key).material!;
    };
    const a = await complete("a");
    const b = await complete("b");
    s.programs.pin(a);
    const disposeA = vi.spyOn(a, "dispose");
    const disposeB = vi.spyOn(b, "dispose");
    await complete("c");
    expect(s.programs.size).toBe(2);
    expect(disposeA).not.toHaveBeenCalled(); // in use by the current morph
    expect(disposeB).toHaveBeenCalledTimes(1);
    expect(s.programs.stats.evicted).toBe(1);
    s.programs.unpin(a);
    expect(s.programs.size).toBe(2);
  });

  it("a failed pair is remembered (no recompile) and its material released", async () => {
    const s = setup();
    s.want("a");
    const dispose = vi.spyOn(s.calls[0]!.material, "dispose");
    s.calls[0]!.resolve(false);
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(s.want("a").status).toBe("failed");
    expect(s.built).toEqual(["a"]);
  });

  it("a build that throws fails at once; a compiler that throws or rejects fails the pair", async () => {
    const s = setup();
    expect(
      s.programs.want("x", () => {
        throw new Error("bad shader");
      }).status,
    ).toBe("failed");
    const programs = new MorphPrograms(
      {
        compile: () => Promise.reject(new Error("lost")),
        warm: () => Promise.resolve(true),
        verify: () => true,
      },
      { owner: 1, context: 0 },
      1,
    );
    programs.want("y", () => new ShaderMaterial());
    await flush();
    expect(programs.want("y", () => new ShaderMaterial()).status).toBe("failed");
  });

  it("results after a context change or a newer owner are stale: dropped, released once", async () => {
    const s = setup();
    s.want("a");
    const material = s.calls[0]!.material;
    const dispose = vi.spyOn(material, "dispose");
    s.epochs.context++;
    s.calls[0]!.resolve(true);
    await flush();
    expect(s.programs.stats.stale).toBe(1);
    expect(s.programs.size).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(1);

    const t = setup();
    t.want("a");
    t.epochs.owner++; // a newer AgentCore exists
    t.calls[0]!.resolve(true);
    await flush();
    expect(t.programs.stats.stale).toBe(1);
    expect(t.programs.size).toBe(0);
  });

  it("dispose releases the compiling and completed materials; a late result changes nothing", async () => {
    const s = setup();
    s.want("a");
    s.calls[0]!.resolve(true);
    await flush();
    s.want("b");
    const ready = s.want("a").material!;
    const disposeReady = vi.spyOn(ready, "dispose");
    const disposeActive = vi.spyOn(s.calls[1]!.material, "dispose");
    s.programs.dispose();
    expect(disposeReady).toHaveBeenCalledTimes(1);
    expect(disposeActive).toHaveBeenCalledTimes(1);
    s.calls[1]!.resolve(true);
    await flush();
    expect(disposeActive).toHaveBeenCalledTimes(1);
    expect(s.want("a").status).toBe("failed");
  });
});
