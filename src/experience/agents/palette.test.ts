import { describe, expect, it } from "vitest";
import { agents } from "~/agents/registry";
import { ambientLook, nexPalette, rgb } from "../ambient/config";
import { NEX_HOT, registryPalette } from "./palette";

/**
 * Milestone 2.4b.1a: agent palettes come from the registry (no second copy of NEX's colours), and
 * the values uploaded to the GPU are exactly NEX's approved ones (8920b54 literals).
 */
describe("registry palettes", () => {
  it("maps base to the secondary colour and accent to the primary colour", () => {
    expect(registryPalette("forge", "#ffffff")).toEqual({
      base: agents.forge.colours.secondary,
      accent: agents.forge.colours.primary,
      hot: "#ffffff",
    });
  });

  it("NEX's palette (used by NEX and the ambient field) uploads the approved values exactly", () => {
    expect(ambientLook.palette).toBe(nexPalette);
    expect(nexPalette.hot).toBe(NEX_HOT);
    const legacy = { base: "#14a89c", accent: "#3fe0d0", hot: "#c9fbf5" } as const;
    for (const key of ["base", "accent", "hot"] as const) {
      expect(rgb(nexPalette[key]).toArray()).toEqual(rgb(legacy[key]).toArray());
    }
  });
});
