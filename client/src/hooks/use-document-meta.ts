import { useEffect } from "react";

interface DocumentMeta {
  title: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
  ogType?: string;
}

function setNamedMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setOgMeta(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Lightweight client-side hook that updates <title>, meta description,
 * canonical, and OG/Twitter tags on SPA navigation. Crawlers get the SSR
 * version; this keeps the browser tab + share state correct.
 */
export function useDocumentMeta(meta: DocumentMeta) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const url = window.location.origin + window.location.pathname;

    document.title = meta.title;

    if (meta.description) {
      setNamedMeta("description", meta.description);
      setOgMeta("og:description", meta.description);
      setNamedMeta("twitter:description", meta.description);
    }

    setOgMeta("og:title", meta.title);
    setNamedMeta("twitter:title", meta.title);
    setOgMeta("og:url", url);
    setOgMeta("og:type", meta.ogType ?? "website");
    setCanonical(url);

    if (meta.ogImage) {
      const abs = meta.ogImage.startsWith("http")
        ? meta.ogImage
        : window.location.origin + meta.ogImage;
      setOgMeta("og:image", abs);
      setNamedMeta("twitter:image", abs);
    }

    // robots: noindex,nofollow for authenticated routes
    setNamedMeta(
      "robots",
      meta.noindex ? "noindex,nofollow" : "index,follow",
    );
  }, [meta.title, meta.description, meta.ogImage, meta.noindex, meta.ogType]);
}
