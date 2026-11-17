import type { ReactNode } from "react";
import { Link } from "react-router";
import { ExternalLink } from "./ExternalLink";

/** One link target: a page of this site, an outbound https page, or a download / tel: / mailto:. */
export type LinkTarget =
  | { to: string; href?: never; external?: never; download?: never }
  | { href: string; to?: never; external?: boolean; download?: boolean };

/**
 * Renders a target with the right element: a client-side `Link` for this site's pages (keeps the
 * stage and transitions), `ExternalLink` for outbound pages (new tab, noopener), else a plain
 * anchor (CV download, tel:, mailto:, same-page #sections).
 */
export function SmartLink({
  target,
  className,
  children,
}: {
  target: LinkTarget;
  className?: string;
  children: ReactNode;
}) {
  if (target.to !== undefined) {
    return (
      <Link to={target.to} className={className}>
        {children}
      </Link>
    );
  }
  if (target.external) {
    return (
      <ExternalLink href={target.href} className={className}>
        {children}
      </ExternalLink>
    );
  }
  return (
    <a href={target.href} download={target.download || undefined} className={className}>
      {children}
    </a>
  );
}
