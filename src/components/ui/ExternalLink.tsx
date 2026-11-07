import type { AnchorHTMLAttributes, ReactNode } from "react";

/** Attributes this component controls; callers cannot pass or override them. */
type EnforcedAttributes = "href" | "target" | "rel" | "children";

export type ExternalLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  EnforcedAttributes
> & {
  href: string;
  children: ReactNode;
};

/** Only absolute https URLs may be rendered as outbound links (blocks javascript:, data:, http:). */
export function isSafeExternalUrl(href: string): boolean {
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Outbound link (SECURITY.md T4/T12): always a new tab with `noopener noreferrer`.
 * Enforced attributes are applied after caller props, so they win even if a caller bypasses the
 * types. Unsafe URLs render as plain text rather than a link.
 */
export function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  if (!isSafeExternalUrl(href)) {
    return <span className={rest.className}>{children}</span>;
  }
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
