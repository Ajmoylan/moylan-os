import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalLink, isSafeExternalUrl, type ExternalLinkProps } from "./ExternalLink";

describe("ExternalLink", () => {
  it("opens https links in a new tab without opener or referrer", () => {
    render(<ExternalLink href="https://github.com/example">GitHub</ExternalLink>);
    const link = screen.getByRole("link", { name: /GitHub/ });
    expect(link).toHaveAttribute("href", "https://github.com/example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("(opens in a new tab)");
  });

  it("cannot have its safe attributes overridden, even by untyped callers", () => {
    const unsafe = {
      target: "_self",
      rel: "opener",
      className: "x",
    } as unknown as ExternalLinkProps;
    render(
      <ExternalLink {...unsafe} href="https://example.com">
        Example
      </ExternalLink>,
    );
    const link = screen.getByRole("link", { name: /Example/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("x");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://example.com",
    "/relative",
    "nonsense",
  ])("renders %s as plain text, not a link", (href) => {
    render(<ExternalLink href={href}>Unsafe</ExternalLink>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Unsafe")).toBeInTheDocument();
  });

  it("accepts only absolute https URLs", () => {
    expect(isSafeExternalUrl("https://www.datatilsynet.no")).toBe(true);
    expect(isSafeExternalUrl("HTTPS://EXAMPLE.COM")).toBe(true);
    expect(isSafeExternalUrl("javascript:void(0)")).toBe(false);
  });
});
