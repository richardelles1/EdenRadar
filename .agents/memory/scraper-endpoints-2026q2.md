---
name: Scraper live endpoints 2026-Q2
description: Re-probed endpoints and structural changes for scrapers that went empty-response in mid-2026.
---

## University of Washington
- `techtransfer.washington.edu` — dead, TCP connection refused
- `comotion.uw.edu` sitemaps — HTTP 403 regardless of UA
- **Current source**: `https://els2.comotion.uw.edu/autocomplete/products` → JSON array of `{name, dataAttributes: {id, url}}`, ~251 items. Individual pages at `https://els2.comotion.uw.edu/product/SLUG`. Product listing page is client-side rendered (empty div), autocomplete endpoint is the correct scrape target.

**Why:** UW moved from techtransfer.washington.edu to the ELS (Enterprise License System) portal hosted at els2.comotion.uw.edu. The old domain is gone.

## Oxford University Innovation
- `innovation.ox.ac.uk/technologies-available/technology-licensing` — still live (200), all ~378 listings on ONE page (pagination /page/2/ returns 404 since 2026-Q2 redesign).
- Individual tech URLs changed from `/licence-details/SLUG/` (with trailing slash) to `/licence-details/SLUG` (no trailing slash). Old regex required `\/` at end → 0 matches.
- Fix: regex uses `\/?` (optional slash); URL saved without trailing slash.

**Why:** Site redesign collapsed paginated listing into a single server-rendered page and canonicalized URLs to no-trailing-slash.

## UMKC
- `ori.umkc.edu/.../technologies.html` — still live (200) but Bootstrap 4 accordion (`.card`/`.card-body`) removed.
- Current structure: flat siblings inside `.standard--content` — `<h2>` = title, `<h3>Description</h3>` + `<p>` = description, `<a href="*.pdf">` = canonical URL.
- ~12 technologies listed.

**Why:** UMKC website migrated away from Bootstrap 4 accordion component.

## UC NCD Platform (UC Davis, UC Irvine, all UC campuses)
- `techtransfer.universityofcalifornia.edu` returns HTTP 503 intermittently (platform-wide outage window observed 2026-06-12).
- OLD behavior: scraper caught 503, returned `[]` silently → health dashboard showed "empty_response" instead of "site_down".
- Fix: re-throw from catch block in `createUCTechTransferScraper` so ingestion pipeline records error message → health dashboard shows "site_down".
- When platform is up, all UC campus scrapers work correctly (same selectors, same code).

**Why:** Scraper was swallowing errors. Re-throwing lets the scheduler's failure path record the correct error message.
