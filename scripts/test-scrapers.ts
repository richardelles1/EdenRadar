import { fetchColumbiaSitemapUrls, fetchColumbiaJson, columbiaJsonToListing } from '../server/lib/scrapers/columbia.ts';
import { fetchHtml } from '../server/lib/scrapers/utils.ts';

async function testColumbia() {
  console.log('\n=== COLUMBIA ===');
  const urls = await fetchColumbiaSitemapUrls();
  console.log('Sitemap URLs:', urls?.length ?? 'NULL');
  if (!urls?.length) return;
  console.log('Samples:', urls.slice(0,3));
  for (const url of urls.slice(0,3)) {
    console.log('\n URL:', url);
    const data = await fetchColumbiaJson(url, 10000);
    if (!data) { console.log('  JSON: NULL'); continue; }
    console.log('  top-keys:', Object.keys(data));
    console.log('  source-keys:', data.source ? Object.keys(data.source) : 'no source');
    const listing = columbiaJsonToListing(url, data);
    console.log('  listing:', listing
      ? { title: listing.title?.slice(0,70), descLen: listing.description?.length ?? 0, abstract: listing.abstract?.slice(0,60) }
      : 'NULL — columbiaJsonToListing returned null');
  }
}

async function testStanford() {
  console.log('\n=== STANFORD ===');
  const BASE = 'https://techfinder.stanford.edu';
  const $ = await fetchHtml(BASE + '/', 15000, undefined, 1, true);
  if (!$) { console.log('FAILED: page 0 returned null'); return; }
  console.log('Page title:', $('title').text()?.slice(0,80));
  console.log('h3.teaser__title a:', $('h3.teaser__title a').length);

  // Probe alternates
  for (const sel of [
    'h3 a[href*="/technology/"]', '.card__title a', '.teaser a[href*="/technology/"]',
    'a[href^="/technology/"]', '.views-row a', 'h2 a[href*="/technology/"]',
    '.node-title a', 'h4 a[href*="/technology/"]',
  ]) {
    const n = $(sel).length;
    if (n > 0) console.log(`  ${sel}: ${n}`);
  }

  const hrefs: string[] = [];
  $('a').each((_: number, el: any) => {
    const h = $(el).attr('href') ?? '';
    if (h.startsWith('/technology/')) hrefs.push(h);
  });
  console.log('All /technology/ hrefs:', hrefs.length, '— samples:', hrefs.slice(0,5));

  if (hrefs.length > 0) {
    const el = $(`a[href="${hrefs[0]}"]`).first();
    console.log('First link text:', el.text().trim().slice(0,60));
    const parent = el.parent();
    const gp = parent.parent();
    console.log('Parent tag/class:', parent.prop('tagName'), '|', parent.attr('class'));
    console.log('Grandparent tag/class:', gp.prop('tagName'), '|', gp.attr('class'));
    console.log('GGP tag/class:', gp.parent().prop('tagName'), '|', gp.parent().attr('class'));
  }

  // Also test a detail page selector
  const sampleUrl = hrefs[0] ? BASE + hrefs[0] : null;
  if (sampleUrl) {
    console.log('\nTesting detail page:', sampleUrl);
    const d$ = await fetchHtml(sampleUrl, 12000, undefined, 1, true);
    if (!d$) { console.log('Detail page: NULL'); return; }
    for (const sel of ['.docket__text', 'article p', '.field--name-body', 'main p', '.content']) {
      const t = d$(sel).first().text().trim().slice(0,80);
      if (t) console.log(`  ${sel}: "${t}"`);
    }
    // Check inventors
    for (const sel of ['.docket__related-people a', '.docket__related-people li', '.field--name-field-inventors a']) {
      const items: string[] = [];
      d$(sel).each((_: number, el: any) => { const t = d$(el).text().trim(); if (t) items.push(t); });
      if (items.length) console.log(`  inventors ${sel}:`, items.slice(0,3));
    }
  }
}

await testColumbia();
await testStanford();
