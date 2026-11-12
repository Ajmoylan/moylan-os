import {
  BufferAttribute,
  BufferGeometry,
  Points,
  type Material,
  type Object3D,
  type ShaderMaterial,
} from "three";
import type { Engine } from "../../engine/Engine";

/**
 * The bounded morph-program compiler (Milestone 2.4b.2; proposal §6.3, §6.5).
 *
 * - **One** compile active at a time, and **one** queued. The queue is **latest-wanted**: AgentCore
 *   tells it which pair the latest preparation wants (`want()`, with its request number), and a
 *   newer want supersedes everything older. A queued pair no longer wanted is dropped without
 *   being built, including when the latest want is the pair already compiling or already cached
 *   (A compiling, C queued, then A wanted again: C is never compiled). `unwant()` (no preparation)
 *   drops the queued one too.
 * - At most `capacity` (2) completed programs kept, least recently used evicted first. A program
 *   in use by the current morph (pinned), or the one currently wanted, is never evicted. A compile
 *   that completes for a pair no longer wanted is kept only if that evicts nothing pinned or
 *   wanted; otherwise it is released at once. It never starts a transition by itself.
 * - A pair that failed to compile or link is remembered for this queue's lifetime (one WebGL
 *   context), and asked for again it fails at once (the agreed fallback: a swap).
 * - **Epoch guards:** every compile carries a ticket with a unique, monotonic id (never reused, in
 *   any queue), the request it was started for, the owner epoch (the AgentCore instance that asked)
 *   and the WebGL context epoch. A result is applied only if its ticket is still the active one and
 *   both epochs are still current; any other result is stale and is dropped (its material already
 *   released), so a late compile can never commit to, or resurrect, a disposed owner or a lost
 *   context.
 * - `dispose()` releases every material at once, the compiling one included (Three.js then stops
 *   waiting for it).
 */

/** Compiles programs ahead of their first draw. */
export interface MorphCompiler {
  /** A pair program; resolves true only when it linked, on the context it started on. */
  compile(material: ShaderMaterial): Promise<boolean>;
  /**
   * Every idle program of a (hidden) view's scene object, so its first draw doesn't compile.
   * Resolves true only when every one linked, on the context it started on.
   */
  warm(object: Object3D): Promise<boolean>;
  /** The same check synchronously, for a view about to draw: true when every program linked. */
  verify(object: Object3D): boolean;
}

/** The Stage-lifetime epochs every asynchronous result is checked against. */
export interface StageEpochs {
  /** Incremented by each AgentCore built (its owner epoch). */
  owner: number;
  /** Incremented at each WebGL context loss and restore. */
  context: number;
}

export type ProgramStatus = "compiling" | "queued" | "ready" | "failed";

export interface CompileTicket {
  readonly id: number;
  readonly key: string;
  /** The preparation request it was started for. */
  readonly request: number;
  readonly owner: number;
  readonly context: number;
}

interface Entry {
  readonly key: string;
  readonly material: ShaderMaterial;
}

/** Diagnostics, published by AgentCore and read by the browser harnesses. */
export interface ProgramStats {
  started: number;
  ready: number;
  failed: number;
  stale: number;
  evicted: number;
  /** Queued requests dropped without being built (superseded or no longer wanted). */
  dropped: number;
  /** Completions for a pair no longer wanted, released at once rather than cached. */
  discarded: number;
  /** Duration of the last completed compile (ms, from start to the program being ready). */
  lastMs: number;
}

/** Unique across every queue in the page: a ticket id is never issued twice. */
let tickets = 0;

export class MorphPrograms {
  private active: (Entry & { ticket: CompileTicket; started: number }) | null = null;
  private queued: { key: string; request: number; build: () => ShaderMaterial } | null = null;
  /** The pair the latest preparation wants (null: no preparation). */
  private wanted: { key: string; request: number } | null = null;
  /** Completed programs, least recently used first. */
  private readonly ready: Entry[] = [];
  private readonly failedKeys = new Set<string>();
  private readonly pinned = new Set<ShaderMaterial>();
  private disposed = false;
  readonly stats: ProgramStats = {
    started: 0,
    ready: 0,
    failed: 0,
    stale: 0,
    evicted: 0,
    dropped: 0,
    discarded: 0,
    lastMs: 0,
  };

  constructor(
    private readonly compiler: MorphCompiler,
    private readonly epochs: Readonly<StageEpochs>,
    /** The owner epoch of the AgentCore this queue belongs to. */
    private readonly owner: number,
    private readonly capacity = 2,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * The latest preparation (`request`) wants the program for `key` (built with `build` if it has
   * to be compiled). Ready → its material; otherwise its status: compiling, queued (latest only),
   * or failed. Any older queued request is superseded.
   */
  want(
    key: string,
    build: () => ShaderMaterial,
    request = 0,
  ): { status: ProgramStatus; material?: ShaderMaterial } {
    if (this.disposed) return { status: "failed" };
    this.wanted = { key, request };
    if (this.failedKeys.has(key)) {
      this.dropQueued();
      return { status: "failed" };
    }
    const index = this.ready.findIndex((entry) => entry.key === key);
    if (index >= 0) {
      this.dropQueued();
      const [entry] = this.ready.splice(index, 1);
      this.ready.push(entry!);
      return { status: "ready", material: entry!.material };
    }
    if (this.active?.key === key) {
      this.dropQueued();
      return { status: "compiling" };
    }
    if (this.active) {
      if (this.queued && this.queued.key !== key) this.stats.dropped++;
      this.queued = { key, request, build };
      return { status: "queued" };
    }
    return { status: this.start(key, request, build) };
  }

  /** No preparation wants a program any more: the queued request is dropped unbuilt. */
  unwant(): void {
    this.wanted = null;
    this.dropQueued();
  }

  /** Marks the material the current morph draws with (never evicted while pinned). */
  pin(material: ShaderMaterial): void {
    this.pinned.add(material);
  }

  unpin(material: ShaderMaterial): void {
    this.pinned.delete(material);
    this.evict();
  }

  /** Completed programs kept (diagnostics and tests). */
  get size(): number {
    return this.ready.length;
  }

  /** The keys kept, least recently used first (diagnostics and tests). */
  get cached(): string[] {
    return this.ready.map((entry) => entry.key);
  }

  /** The compile in flight (diagnostics and tests). */
  get compiling(): string | null {
    return this.active?.key ?? null;
  }

  /** The queued key (diagnostics and tests). */
  get pending(): string | null {
    return this.queued?.key ?? null;
  }

  private dropQueued(): void {
    if (!this.queued) return;
    this.queued = null;
    this.stats.dropped++;
  }

  private start(key: string, request: number, build: () => ShaderMaterial): ProgramStatus {
    let material: ShaderMaterial;
    try {
      material = build();
    } catch {
      this.failedKeys.add(key);
      this.stats.failed++;
      return "failed";
    }
    const ticket: CompileTicket = {
      id: ++tickets,
      key,
      request,
      owner: this.owner,
      context: this.epochs.context,
    };
    this.active = { key, material, ticket, started: this.now() };
    this.stats.started++;
    let compiling: Promise<boolean>;
    try {
      compiling = this.compiler.compile(material);
    } catch {
      compiling = Promise.resolve(false);
    }
    compiling.then(
      (ok) => this.settle(ticket, ok),
      () => this.settle(ticket, false),
    );
    return "compiling";
  }

  /** A compile result: applied only if its ticket is current, else dropped as stale. */
  private settle(ticket: CompileTicket, ok: boolean): void {
    const active = this.active;
    if (
      this.disposed ||
      !active ||
      active.ticket.id !== ticket.id ||
      ticket.owner !== this.epochs.owner ||
      ticket.context !== this.epochs.context
    ) {
      this.stats.stale++;
      // A current entry whose epochs moved on is released here (a disposed queue already did).
      if (active && active.ticket.id === ticket.id) {
        this.active = null;
        active.material.dispose();
      }
      return;
    }
    this.active = null;
    if (ok) {
      this.stats.ready++;
      this.stats.lastMs = this.now() - active.started;
      this.keep({ key: active.key, material: active.material });
    } else {
      this.failedKeys.add(active.key);
      this.stats.failed++;
      active.material.dispose();
    }
    // The queued request starts only if it is still the latest wanted (never an obsolete pair).
    const next = this.queued;
    this.queued = null;
    if (!next) return;
    if (next.key !== this.wanted?.key || this.failedKeys.has(next.key) || this.has(next.key)) {
      this.stats.dropped++;
      return;
    }
    this.start(next.key, next.request, next.build);
  }

  private has(key: string): boolean {
    return this.ready.some((entry) => entry.key === key);
  }

  /** Caches a completed program: always if wanted; otherwise only without evicting anything kept. */
  private keep(entry: Entry): void {
    const wanted = this.wanted?.key === entry.key;
    if (!wanted && this.ready.length >= this.capacity && this.evictable() < 0) {
      this.stats.discarded++;
      entry.material.dispose();
      return;
    }
    this.ready.push(entry);
    this.evict();
  }

  /** The least recently used entry that is neither pinned nor wanted (-1: none). */
  private evictable(): number {
    return this.ready.findIndex((e) => !this.pinned.has(e.material) && e.key !== this.wanted?.key);
  }

  private evict(): void {
    while (this.ready.length > this.capacity) {
      const index = this.evictable();
      if (index < 0) return;
      const [entry] = this.ready.splice(index, 1);
      entry!.material.dispose();
      this.stats.evicted++;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.queued = null;
    this.wanted = null;
    const active = this.active;
    this.active = null;
    active?.material.dispose();
    for (const entry of this.ready.splice(0)) entry.material.dispose();
    this.pinned.clear();
  }
}

/** The parts of Three.js's (internal) WebGLProgram used here. */
interface ThreeProgram {
  program: WebGLProgram;
  getUniforms(): unknown;
}

/** A program compiled ahead of its first draw, with the shaders captured when it started. */
interface Started {
  material: Material;
  program: ThreeProgram;
  shaders: WebGLShader[];
}

/**
 * The real compiler: Three.js's `compileAsync` (KHR_parallel_shader_compile where available).
 *
 * **Bound to the context generation it started in.** Each compile records `epochs.context` when it
 * starts; when Three resolves, a different generation (the context was lost, and perhaps restored)
 * or a lost context is rejected **before any GL call**: no captured program or shader handle of an
 * earlier generation is ever passed to the (restored) context. Teardown at the loss already
 * disposed the materials, which is what ends Three's polling for them. Such a compile resolves
 * false.
 *
 * **Pair programs** compile on a throwaway, never-drawn object. Its stand-in geometry has the morph
 * geometry's layout where Three.js's program key depends on it (a `position` attribute; no normal,
 * colour, uv or morph attributes): with an empty geometry the key differs (`hasPositionAttribute`)
 * and the first draw compiled a second program synchronously (stage-D lifecycle measurements). The
 * geometry is released on every path; it is never drawn, so nothing is uploaded.
 *
 * **Completion** (`finishProgram`): Three.js deletes a program's shader objects only on its first
 * use, so a program compiled ahead and discarded (a destination released before it drew, a failed
 * link) would keep them until the context is lost (+2 per reversal, measured). Each one is
 * completed when its compile resolves.
 */
export function rendererCompiler(engine: Engine, epochs: Readonly<StageEpochs>): MorphCompiler {
  const renderer = engine.renderer;
  // Read when compiling (never at construction: an AgentCore that never morphs never asks).
  const context = () => renderer.getContext();
  const programOf = (material: Material) =>
    (renderer.properties.get(material) as { currentProgram?: ThreeProgram }).currentProgram;
  const materialsOf = (object: Object3D) => {
    const materials: Material[] = [];
    object.traverse((child) => {
      const material = (child as { material?: Material | Material[] }).material;
      if (Array.isArray(material)) materials.push(...material);
      else if (material) materials.push(material);
    });
    return materials;
  };
  /** The programs `compile()` just created or reused for these materials, with their shaders. */
  const started = (materials: Material[]): Started[] =>
    materials.flatMap((material) => {
      const program = programOf(material);
      return program
        ? [{ material, program, shaders: context().getAttachedShaders(program.program) ?? [] }]
        : [];
    });
  /** True when the generation it started in is still current and the context usable. */
  const current = (generation: number) =>
    generation === epochs.context && !context().isContextLost();
  const finishAll = (programs: Started[], count: number) =>
    programs.length === count &&
    programs
      .map((entry) => finishProgram(context(), entry, programOf(entry.material)))
      .every(Boolean);
  return {
    warm(object) {
      const generation = epochs.context;
      const materials = materialsOf(object);
      const compiling = renderer.compileAsync(object, engine.camera, engine.scene);
      const programs = started(materials);
      return compiling.then(() => current(generation) && finishAll(programs, materials.length));
    },
    verify(object) {
      const materials = materialsOf(object);
      renderer.compile(object, engine.camera, engine.scene);
      return finishAll(started(materials), materials.length);
    },
    compile(material) {
      const generation = epochs.context;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
      let compiling: Promise<unknown>;
      let programs: Started[];
      try {
        compiling = renderer.compileAsync(
          new Points(geometry, material),
          engine.camera,
          engine.scene,
        );
        programs = started([material]);
      } catch (error) {
        geometry.dispose();
        return Promise.reject(error);
      }
      return compiling
        .then(() => current(generation) && finishAll(programs, 1))
        .finally(() => geometry.dispose());
    },
  };
}

/**
 * Completes a program compiled ahead of its first draw; returns whether it can draw. The caller
 * has already checked the context generation (no handle of an earlier one reaches this point).
 * - Still the material's program and linked: Three's first-use step runs now (`getUniforms()`):
 *   the shaders are deleted and the uniform and attribute locations cached, off the draw frame.
 * - Otherwise (not linked, or no longer current): its shaders are deleted here. Deleting a shader
 *   only flags it while it is attached; deleting it again is a no-op.
 */
function finishProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  entry: { program: ThreeProgram; shaders: WebGLShader[] },
  current: ThreeProgram | undefined,
): boolean {
  if (current === entry.program && gl.getProgramParameter(entry.program.program, gl.LINK_STATUS)) {
    entry.program.getUniforms();
    return true;
  }
  for (const shader of entry.shaders) gl.deleteShader(shader);
  return false;
}
