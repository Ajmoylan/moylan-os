import { DataTexture, FloatType, NearestFilter, RGBAFormat, type Matrix3 } from "three";

/** Texels per orbit row: the frame matrix's three columns (xyz; w unused). */
export const ORBIT_TEXELS = 3;

/**
 * Orbit-texture transport (Milestone 2.4b.1b; proposal §6.2): an agent's orbit-frame matrices as
 * an RGBA32F `DataTexture`, width 3, one row per frame. Row k holds frame k's `mat3` columns in
 * texels 0–2 (xyz; the column-major `Matrix3.elements`, exactly the floats the uniform transport
 * uploads). Shaders read it with `texelFetch` (NEAREST, no mipmaps, no filtering), so every value
 * reaches the shader as the same float32.
 *
 * The constant flow speeds stay a uniform array (see `ORBIT_TEXTURE` in nex/shaders.ts: reading
 * them from the table changed Metal-backed compilers' code for the ring pulses by 1 LSB).
 *
 * The CPU still builds the matrices (`NexMotion`, unchanged). `write()` copies them into the one
 * preallocated array and marks the texture for upload: no allocation, no reallocation (Three.js
 * allocates the GPU storage once and updates it with `texSubImage2D`).
 */
export class OrbitTexture {
  readonly texture: DataTexture;
  private readonly data: Float32Array;

  constructor(private readonly frames: number) {
    this.data = new Float32Array(frames * ORBIT_TEXELS * 4);
    const texture = new DataTexture(this.data, ORBIT_TEXELS, frames, RGBAFormat, FloatType);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.texture = texture;
  }

  /** Copies the current frames into the texture data and schedules one upload. */
  write(frames: readonly Matrix3[]): void {
    const data = this.data;
    for (let k = 0; k < this.frames; k++) {
      const e = frames[k]!.elements;
      const row = k * ORBIT_TEXELS * 4;
      data[row] = e[0]!;
      data[row + 1] = e[1]!;
      data[row + 2] = e[2]!;
      data[row + 4] = e[3]!;
      data[row + 5] = e[4]!;
      data[row + 6] = e[5]!;
      data[row + 8] = e[6]!;
      data[row + 9] = e[7]!;
      data[row + 10] = e[8]!;
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
