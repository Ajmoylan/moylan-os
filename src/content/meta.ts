import { pageTitle, site } from "./site";

interface PageMeta {
  title?: string;
  description?: string;
  path: string;
}

/** Shared <head> metadata for every route: title, description, canonical URL and Open Graph. */
export function buildMeta({ title, description = site.description, path }: PageMeta) {
  const fullTitle = pageTitle(title);
  const url = new URL(path, site.url).toString();
  return [
    { title: fullTitle },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: site.name },
    { property: "og:type", content: "website" },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { name: "twitter:card", content: "summary" },
  ];
}
