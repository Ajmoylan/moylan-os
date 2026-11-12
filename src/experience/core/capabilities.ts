import { definitionFor } from "../agents/definitions";
import type { AgentRenderDefinition, OrbitTransport, StageAgent } from "../agents/types";

/**
 * Device-specific agent viability (Milestone 2.4b.2 remediation; proposal §6.6): the one
 * authoritative assessment of which agents can render on **this WebGL context**, shared by
 * `TransitionClock` (its machine's `supported()`) and AgentCore (the transport each view is built
 * with). One instance per context generation: the Stage builds it with the layers, so a restored
 * context (new epoch, probe forgotten) is assessed afresh, and nothing carries over a loss.
 *
 * A transport is **viable** for an agent when:
 * - the agent declares it, with a measured vertex-uniform count;
 * - that count fits `MAX_VERTEX_UNIFORM_VECTORS − 32` (the established headroom);
 * - for `texture`, the context passes the float-texture sampling probe (asked lazily, only when
 *   the texture transport is actually considered, so the default path never probes);
 * - its idle program has not failed to compile or link on this context (`reject()`).
 *
 * The agent's transport is the first viable one: the `?orbits=` preference first when declared,
 * then the declared order. No viable transport → the agent is **unsupported** for this context: a
 * capability outcome (its accessible poster stays), never a Stage failure. The verdict is cached
 * per agent, so a rejected program is never compiled again until a restore.
 */

/** Vertex-uniform vectors kept free for the driver and Three.js's built-ins (proposal §6.6). */
export const VERTEX_UNIFORM_HEADROOM = 32;
/** WebGL2's guaranteed minimum MAX_VERTEX_UNIFORM_VECTORS (used when a renderer reports none). */
export const WEBGL2_MIN_VERTEX_UNIFORM_VECTORS = 256;

export interface DeviceLimits {
  /** MAX_VERTEX_UNIFORM_VECTORS of this context. */
  maxVertexUniforms(): number;
  /** The float-texture sampling probe for this context (cached by the probe itself). */
  floatTextures(): boolean;
}

export class AgentCapabilities {
  private readonly rejected = new Map<StageAgent, Set<OrbitTransport>>();
  private readonly verdicts = new Map<StageAgent, OrbitTransport | null>();

  constructor(
    private readonly limits: DeviceLimits,
    private readonly preference: OrbitTransport,
    /** The context generation this assessment belongs to. */
    readonly epoch: number,
  ) {}

  /** Vertex-uniform vectors a program may use on this context. */
  get budget(): number {
    const max = this.limits.maxVertexUniforms();
    return (
      (Number.isFinite(max) && max > 0 ? max : WEBGL2_MIN_VERTEX_UNIFORM_VECTORS) -
      VERTEX_UNIFORM_HEADROOM
    );
  }

  /** The float-texture probe (lazy; a probe that can't restore the renderer throws: a real failure). */
  floatTextures(): boolean {
    return this.limits.floatTextures();
  }

  /** Is `transport` viable for this definition on this context (rejections included)? */
  viable(definition: AgentRenderDefinition, transport: OrbitTransport): boolean {
    if (!definition.transports.idle.includes(transport)) return false;
    if (this.rejected.get(definition.id)?.has(transport)) return false;
    const vectors = definition.transports.uniformVectors[transport];
    if (vectors === undefined || vectors > this.budget) return false;
    return transport === "uniforms" || this.floatTextures();
  }

  /** The agent's idle transport on this context, or null when it is unsupported here. */
  transport(agent: StageAgent): OrbitTransport | null {
    const cached = this.verdicts.get(agent);
    if (cached !== undefined) return cached;
    const definition = definitionFor(agent);
    let verdict: OrbitTransport | null = null;
    if (definition) {
      const declared = definition.transports.idle;
      const order = declared.includes(this.preference)
        ? [this.preference, ...declared.filter((t) => t !== this.preference)]
        : declared;
      verdict = order.find((t) => this.viable(definition, t)) ?? null;
    }
    this.verdicts.set(agent, verdict);
    return verdict;
  }

  /** Has the agent a definition and a viable transport on this context? */
  supported(agent: StageAgent): boolean {
    return this.transport(agent) !== null;
  }

  /**
   * The agent's idle program failed to compile or link with `transport`: it is never tried again on
   * this context. Returns the next viable transport (tried once), or null: unsupported.
   */
  reject(agent: StageAgent, transport: OrbitTransport): OrbitTransport | null {
    let set = this.rejected.get(agent);
    if (!set) this.rejected.set(agent, (set = new Set()));
    set.add(transport);
    this.verdicts.delete(agent);
    return this.transport(agent);
  }
}

/** The assessment's device limits from a Three.js renderer (WebGL2's minimum if it reports none). */
export function rendererLimits(
  renderer: { capabilities?: { maxVertexUniforms?: number } },
  floatTextures: () => boolean,
): DeviceLimits {
  return {
    maxVertexUniforms: () =>
      renderer.capabilities?.maxVertexUniforms ?? WEBGL2_MIN_VERTEX_UNIFORM_VECTORS,
    floatTextures,
  };
}
