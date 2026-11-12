import type { StageAgent as AgentId } from "../agents/types";
import type { AgentRenderDefinition, AgentShape } from "../agents/types";

/** Shapes kept: the current agent, a destination and one prefetched (proposal §5.3). */
export const SHAPE_CACHE_CAPACITY = 3;

interface Entry {
  key: string;
  agent: AgentId;
  shape: AgentShape;
}

/**
 * Stage-lifetime CPU cache of generated agent shapes (Milestone 2.4b.1a). Owned by the Stage, so
 * it survives context loss: a restore rebuilds the GPU buffers from the same arrays without
 * generating again. Generation is synchronous (the agreed `generate()` contract).
 *
 * Key: (agent, N, seed, definition version), so a shape from older generator code can never be
 * reused. One N per agent: a tier change evicts that agent's shapes for the old N. Least recently
 * used entries go first beyond the capacity. The arrays are never written after generation; the
 * GPU attributes reference them directly, so a cached shape costs no extra memory while drawn.
 */
export class ShapeCache {
  private readonly entries: Entry[] = [];
  /** Shapes generated so far (diagnostics and tests). */
  generated = 0;

  constructor(private readonly capacity = SHAPE_CACHE_CAPACITY) {}

  get size(): number {
    return this.entries.length;
  }

  get(definition: AgentRenderDefinition, count: number): AgentShape {
    const { id, seed, version } = definition;
    const key = `${id}:${count}:${seed}:${version}`;
    const index = this.entries.findIndex((entry) => entry.key === key);
    if (index >= 0) {
      const [entry] = this.entries.splice(index, 1);
      this.entries.push(entry!);
      return entry!.shape;
    }
    // A throwing generator leaves the cache unchanged.
    const shape = definition.generate(count, seed);
    this.generated++;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]!.agent === id) this.entries.splice(i, 1);
    }
    this.entries.push({ key, agent: id, shape });
    while (this.entries.length > this.capacity) this.entries.shift();
    return shape;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
