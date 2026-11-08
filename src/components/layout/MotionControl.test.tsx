import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { resetMotionStore, setSystemPrefersReduced, useMotionStore } from "~/motion/store";
import { MotionControl } from "./MotionControl";

const trigger = () => screen.getByRole("button", { name: /^Motion/ });
const panelOf = (button: HTMLElement) =>
  document.getElementById(button.getAttribute("aria-controls")!)!;

/** The header owns the open state in the app; this harness stands in for it. */
function Harness() {
  const [open, setOpen] = useState(false);
  return <MotionControl open={open} onOpenChange={setOpen} />;
}

beforeEach(() => resetMotionStore());

describe("MotionControl", () => {
  it("shows the setting and the motion in effect in its accessible name", () => {
    render(<Harness />);
    expect(trigger()).toHaveAccessibleName("Motion: System, Full");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(panelOf(trigger())).not.toBeVisible();
  });

  it("opens a labelled radio group with System selected by default", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const group = screen.getByRole("group", { name: "Motion" });
    expect(group).toBeVisible();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "system",
      "full",
      "reduced",
      "off",
    ]);
    const system = screen.getByRole("radio", { name: "System" });
    expect(system).toBeChecked();
    expect(system).toHaveAccessibleDescription(/currently full motion/);
    expect(screen.getByRole("radio", { name: "Off" })).toHaveAccessibleDescription(
      "No decorative animation. The static design only.",
    );
    expect(screen.getByText(/Not saved/)).toBeVisible();
  });

  it("is fully keyboard operable: open, choose with arrow keys, Escape returns focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");

    await user.tab();
    expect(screen.getByRole("radio", { name: "System" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Reduced" })).toBeChecked();
    expect(useMotionStore.getState()).toMatchObject({ setting: "reduced", effective: "reduced" });
    expect(trigger()).toHaveAccessibleName("Motion: Reduced");

    await user.keyboard("{Escape}");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveFocus();
  });

  it("selecting Off and then System returns to following the OS", async () => {
    const user = userEvent.setup();
    act(() => setSystemPrefersReduced(true));
    render(<Harness />);
    await user.click(trigger());

    await user.click(screen.getByRole("radio", { name: "Off" }));
    expect(useMotionStore.getState().effective).toBe("off");
    expect(screen.getByText(/your choice/)).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(useMotionStore.getState()).toMatchObject({ setting: "system", effective: "reduced" });
    expect(trigger()).toHaveAccessibleName("Motion: System, Reduced");
  });

  it("updates live when the OS preference changes while following the system", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    act(() => setSystemPrefersReduced(true));
    expect(trigger()).toHaveAccessibleName("Motion: System, Reduced");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAccessibleDescription(
      /currently reduced motion/,
    );
  });

  it("closes when focus or a click moves outside the control", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Elsewhere</button>
      </>,
    );
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger());
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("is invisible and disabled in the prerendered HTML (it needs JavaScript)", () => {
    const html = renderToString(<MotionControl open={false} onOpenChange={() => {}} />);
    expect(html).toMatch(/<button[^>]*class="[^"]*\binvisible\b[^"]*"[^>]*disabled/);
    expect(html).not.toMatch(/style=/);
  });
});
