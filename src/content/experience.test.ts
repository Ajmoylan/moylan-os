import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { experience, roleYears } from "./experience";
import { profile } from "./profile";

describe("experience content (CV, 16 November 2026)", () => {
  it("lists the four roles with the CV's organisations, titles, places and dates, most recent first", () => {
    expect(experience.map((r) => [r.organisation, r.title, r.location, roleYears(r)])).toEqual([
      ["Lululemon", "Key Leader", "Oslo, Norway", "2024–2026"],
      ["Meta", "Market Manager, Reality Labs", "London, UK", "2022–2023"],
      ["Microsoft", "Business Development Manager, Indirect Channel", "London, UK", "2019–2022"],
      [
        "Hewlett-Packard",
        "Innovation Manager and Customer Experience Centre Lead",
        "London, UK",
        "2018–2019",
      ],
    ]);
  });

  it("presents the Microsoft role as direct Microsoft employment, supporting Ingram Micro", () => {
    const microsoft = experience.find((r) => r.id === "microsoft")!;
    expect(microsoft.organisation).toBe("Microsoft");
    expect(microsoft.points.join(" ")).toMatch(/Ingram Micro, the distribution partner Microsoft/);
    expect(experience.map((r) => r.organisation).join(" ")).not.toMatch(/SureStep|Ingram/);
  });

  it("only highlights figures the role's own CV points state", () => {
    for (const role of experience) {
      for (const highlight of role.highlights ?? []) {
        expect(role.points.join(" "), `${role.id}: ${highlight.value}`).toContain(
          highlight.value.replace("+", ""),
        );
      }
    }
  });

  it("keeps the predicted degree result labelled as predicted", () => {
    const ou = profile.education.find((e) => e.institution === "The Open University");
    expect(ou?.status).toMatch(/predicted/);
    expect(profile.certifications.map((c) => [c.code, c.status])).toEqual([
      ["AZ-900", "completed"],
      ["AB-731", "in-preparation"],
    ]);
  });

  it("publishes no private contact details anywhere in the site's content", () => {
    const dir = __dirname;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/gmail\.com/i);
      expect(text, file).not.toMatch(/\+\d{2}[\s\d]{7,}|\b\d{3}\s?\d{2}\s?\d{3}\b/);
    }
  });
});
