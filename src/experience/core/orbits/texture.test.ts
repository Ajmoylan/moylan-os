import { DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NexMotion } from "../../nex/motion";
import { NEX_FRAMES } from "../../nex/shape";
import { ORBIT_TEXELS, OrbitTexture } from "./texture";

/**
 * The orbit-texture table (Milestone 2.4b.1b): exactly the float32 values the uniform transport
 * uploads (`uniformMatrix3fv` of `Matrix3.elements`; the flow speeds stay a uniform array), in the
 * layout the shaders' `orbitFrame()` reads, with no allocation per write.
 */

afterEach(() => vi.restoreAllMocks());

const f32 = Math.fround;

describe("OrbitTexture", () => {
  it("is a 3 × frames RGBA32F table, NEAREST, without mipmaps", () => {
    const table = new OrbitTexture(NEX_FRAMES);
    const t = table.texture;
    expect(t.type).toBe(FloatType);
    expect(t.format).toBe(RGBAFormat);
    expect([t.image.width, t.image.height]).toEqual([ORBIT_TEXELS, NEX_FRAMES]);
    expect([t.minFilter, t.magFilter]).toEqual([NearestFilter, NearestFilter]);
    expect(t.generateMipmaps).toBe(false);
    expect(t.flipY).toBe(false);
  });

  it("holds every frame's matrix columns as the exact float32 the uniforms carry", () => {
    const motion = new NexMotion();
    const table = new OrbitTexture(NEX_FRAMES);
    const data = table.texture.image.data as Float32Array;
    for (const time of [0, 0.016, 3.2, 1234.5678]) {
      motion.update(time);
      table.write(motion.frames);
      for (let k = 0; k < NEX_FRAMES; k++) {
        const e = motion.frames[k]!.elements;
        const row = k * ORBIT_TEXELS * 4;
        for (let column = 0; column < 3; column++) {
          for (let i = 0; i < 3; i++) {
            expect(Object.is(data[row + column * 4 + i], f32(e[column * 3 + i]!))).toBe(true);
          }
          expect(data[row + column * 4 + 3]).toBe(0); // spare channel
        }
      }
    }
  });

  it("writes in place: one array for its lifetime, one upload scheduled per write", () => {
    const motion = new NexMotion();
    const table = new OrbitTexture(NEX_FRAMES);
    const data = table.texture.image.data;
    const version = table.texture.version;
    table.write(motion.frames);
    table.write(motion.frames);
    expect(table.texture.image.data).toBe(data);
    expect(table.texture.version).toBe(version + 2);
  });

  it("dispose releases the GPU texture", () => {
    const dispose = vi.spyOn(DataTexture.prototype, "dispose");
    new OrbitTexture(NEX_FRAMES).dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
