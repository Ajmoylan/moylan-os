import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pageRoutes } from "~/routing/manifest";
import { contrastRatio } from "~/lib/contrast";
import { agentList, agents, specialists } from "./registry";

// jsdom rewrites import.meta.url, so resolve from the project root instead.
const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");
const token = (name: string) => {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css);
  if (!match?.[1]) throw new Error(`Token --color-${name} not found in app.css`);
  return match[1].toLowerCase();
};

const surfaces = {
  obsidian: token("obsidian"),
  abyss: token("abyss"),
  gunmetal: token("gunmetal"),
};

describe("agent registry", () => {
  it("defines all five agents with unique routes", () => {
    expect(agentList.map((a) => a.id)).toEqual(["nex", "forge", "syn", "atlas", "cipher"]);
    expect(new Set(agentList.map((a) => a.route)).size).toBe(agentList.length);
    expect(specialists.map((a) => a.id)).toEqual(["forge", "syn", "atlas", "cipher"]);
  });

  it("hosts every agent's home environment on a manifest page owned by that agent", () => {
    for (const agent of agentList) {
      const page = pageRoutes.find((route) => route.path === agent.route);
      expect(page?.agent, `${agent.route} should be hosted by ${agent.id}`).toBe(agent.id);
    }
  });

  it("keeps registry colours in sync with the CSS design tokens", () => {
    for (const agent of agentList) {
      expect(agent.colours.primary.toLowerCase()).toBe(token(agent.id));
      expect(agent.colours.secondary.toLowerCase()).toBe(token(`${agent.id}-deep`));
    }
  });

  it.each(agentList.map((a) => [a.name, a.colours.primary] as const))(
    "%s primary colour meets WCAG AA (4.5:1) on every surface",
    (_name, colour) => {
      for (const surface of Object.values(surfaces)) {
        expect(contrastRatio(colour, surface)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("meets WCAG AA for body and muted text on every surface", () => {
    for (const surface of Object.values(surfaces)) {
      expect(contrastRatio(token("text"), surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(token("text-muted"), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives filled buttons (obsidian on accent) at least 7:1", () => {
    for (const agent of agentList) {
      expect(contrastRatio(surfaces.obsidian, agent.colours.primary)).toBeGreaterThanOrEqual(7);
    }
  });

  it("uses first-person intro lines and never speaks as Alex", () => {
    for (const agent of agentList) {
      expect(agent.introLine.length).toBeGreaterThan(0);
      expect(agent.summary).not.toMatch(/\b(I|my|me)\b/);
    }
    expect(agents.nex.introLine).toBe("Welcome to MOYLAN//OS. What would you like to explore?");
  });
});

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("rejects invalid input", () => {
    expect(() => contrastRatio("red", "#fff")).toThrow();
  });
});
