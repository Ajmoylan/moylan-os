import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactDetails, CopyButton } from "./ContactActions";

afterEach(() => vi.useRealTimers());

describe("CopyButton", () => {
  it("copies the value and confirms it, then resets", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyButton value="+47 489 01 849" label="Copy telephone" />);
    const button = screen.getByRole("button", { name: /Copy telephone/ });
    await user.click(button);
    expect(writeText).toHaveBeenCalledWith("+47 489 01 849");
    expect(button).toHaveTextContent("Copied ✓");
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(2600));
    expect(button).toHaveTextContent("Copy");
  });

  it("asks the visitor to copy by hand when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<CopyButton value="alex@moylanos.dev" label="Copy email" />);
    await user.click(screen.getByRole("button", { name: /Copy email/ }));
    expect(screen.getByRole("button", { name: /Copy email/ })).toHaveTextContent("Select and copy");
  });
});

describe("ContactDetails", () => {
  it("shows the published telephone and email as plain, selectable text", () => {
    render(<ContactDetails />);
    for (const text of ["+47 489 01 849", "alex@moylanos.dev"]) {
      const node = screen.getByText(text);
      expect(node.tagName).toBe("SPAN");
      expect(node.closest("a")).toBeNull();
    }
  });
});
