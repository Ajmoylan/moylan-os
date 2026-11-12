import { Group, Points, BufferGeometry, ShaderMaterial, PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Engine } from "../../engine/Engine";
import { rendererCompiler, type StageEpochs } from "./programs";

/**
 * The real compiler's lifecycle against a fake renderer that records every GL call (2.4b.2
 * remediation, Codex findings 2 and 4): warm-ups report genuine success or failure, programs are
 * completed (shaders released), and a compile that resolves after the context was lost (and
 * restored) makes **no GL call at all** with handles from the earlier generation.
 */

type Fake = {
  program: { program: object; getUniforms: () => void };
  linked: boolean;
  shaders: object[];
};

function setup() {
  const epochs: StageEpochs = { owner: 1, context: 5 };
  const calls: string[] = [];
  const programs = new Map<object, Fake>();
  let lost = false;
  const pending: (() => void)[] = [];
  let linkFails: (material: object) => boolean = () => false;
  const programFor = (material: object) => {
    if (!programs.has(material)) {
      const fake: Fake = {
        program: { program: {}, getUniforms: () => calls.push("getUniforms") },
        linked: !linkFails(material),
        shaders: [{}, {}],
      };
      programs.set(material, fake);
    }
    return programs.get(material)!;
  };
  const byProgram = (p: object) => [...programs.values()].find((f) => f.program.program === p)!;
  const gl = {
    LINK_STATUS: 0x8b82,
    isContextLost: () => lost,
    getAttachedShaders: (p: object) => {
      calls.push("getAttachedShaders");
      return byProgram(p).shaders;
    },
    getProgramParameter: (p: object) => {
      calls.push("getProgramParameter");
      return byProgram(p).linked;
    },
    deleteShader: () => calls.push("deleteShader"),
  };
  const disposed = new Set<object>();
  const materialsIn = (object: { traverse(cb: (o: unknown) => void): void }) => {
    const out: object[] = [];
    object.traverse((child) => {
      const m = (child as { material?: object }).material;
      if (m) out.push(m);
    });
    return out;
  };
  const renderer = {
    getContext: () => gl,
    properties: {
      get: (material: object) => ({
        currentProgram: disposed.has(material) ? undefined : programs.get(material)?.program,
      }),
    },
    compile: (object: { traverse(cb: (o: unknown) => void): void }) => {
      for (const m of materialsIn(object)) programFor(m);
    },
    compileAsync: (object: { traverse(cb: (o: unknown) => void): void }) => {
      for (const m of materialsIn(object)) programFor(m);
      return new Promise<void>((resolve) => pending.push(resolve));
    },
  };
  const engine = {
    renderer,
    camera: new PerspectiveCamera(),
    scene: new Scene(),
  } as unknown as Engine;
  return {
    epochs,
    calls,
    compiler: rendererCompiler(engine, epochs),
    resolveAll: async () => {
      for (const r of pending.splice(0)) r();
      await new Promise((r) => setTimeout(r, 0));
    },
    lose: () => {
      lost = true;
      epochs.context++;
    },
    restore: () => {
      lost = false;
      epochs.context++;
    },
    failLinkOf: (fn: (m: object) => boolean) => (linkFails = fn),
    dispose: (m: object) => disposed.add(m),
  };
}

const view = (...materials: ShaderMaterial[]) => {
  const g = new Group();
  for (const m of materials) g.add(new Points(new BufferGeometry(), m));
  return g;
};

describe("rendererCompiler", () => {
  it("warm(): true only when every program linked; each one completed (Three's first use)", async () => {
    const s = setup();
    const warming = s.compiler.warm(view(new ShaderMaterial(), new ShaderMaterial()));
    await s.resolveAll();
    expect(await warming).toBe(true);
    expect(s.calls.filter((c) => c === "getUniforms")).toHaveLength(2);
    expect(s.calls).not.toContain("deleteShader");
  });

  it("warm(): a program that failed to link → false, and its shaders are deleted", async () => {
    const s = setup();
    const bad = new ShaderMaterial();
    s.failLinkOf((m) => m === bad);
    const warming = s.compiler.warm(view(new ShaderMaterial(), bad));
    await s.resolveAll();
    expect(await warming).toBe(false);
    expect(s.calls.filter((c) => c === "deleteShader")).toHaveLength(2);
  });

  it("verify(): the same check synchronously", () => {
    const s = setup();
    const bad = new ShaderMaterial();
    expect(s.compiler.verify(view(new ShaderMaterial()))).toBe(true);
    s.failLinkOf((m) => m === bad);
    expect(s.compiler.verify(view(bad))).toBe(false);
  });

  it("compile(): a pair program's link status; a material disposed meanwhile → false, shaders freed", async () => {
    const s = setup();
    const ok = s.compiler.compile(new ShaderMaterial());
    await s.resolveAll();
    expect(await ok).toBe(true);
    const gone = new ShaderMaterial();
    const compiling = s.compiler.compile(gone);
    s.dispose(gone);
    await s.resolveAll();
    expect(await compiling).toBe(false);
    expect(s.calls.filter((c) => c === "deleteShader")).toHaveLength(2);
  });

  for (const restored of [false, true]) {
    it(`a compile resolving after the context was lost${restored ? " and restored" : ""}: no GL call at all`, async () => {
      const s = setup();
      const pair = s.compiler.compile(new ShaderMaterial());
      const warm = s.compiler.warm(view(new ShaderMaterial()));
      const before = s.calls.length; // handles captured when compiling started (old generation)
      s.lose();
      if (restored) s.restore();
      await s.resolveAll();
      expect(await pair).toBe(false);
      expect(await warm).toBe(false);
      expect(s.calls.slice(before)).toEqual([]); // no old-generation handle reached any context
    });
  }

  it("the stand-in geometry is released when the compile resolves", async () => {
    const s = setup();
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const ok = s.compiler.compile(new ShaderMaterial());
    await s.resolveAll();
    await ok;
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
  });
});
