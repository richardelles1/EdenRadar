import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  // Try /technologies/ listing page
  const $t = await fetchHtml('https://bgn.bgu.ac.il/technologies/', 12000);
  if (!$t) { console.log('technologies/ null'); return; }
  const html = $t.html() ?? '';
  console.log('page length:', html.length);
  // Look for REST API calls in source
  const wpApiMatch = html.match(/wp-json\/wp\/v2\/[^"'\s]+/g);
  if (wpApiMatch) console.log('WP API refs:', wpApiMatch.slice(0,5).join('\n'));
  // Look for post type / CPT
  const cptMatch = html.match(/"post_type"\s*:\s*"([^"]+)"/g);
  if (cptMatch) console.log('CPT refs:', cptMatch.slice(0,5).join('\n'));
  // Try direct WP API
  const apiRes = await fetch('https://bgn.bgu.ac.il/wp-json/wp/v2/types', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (apiRes.ok) {
    const types = await apiRes.json() as any;
    console.log('WP post types:', Object.keys(types).join(', '));
  } else {
    console.log('WP API /types:', apiRes.status);
  }
  // Check for technology items on the page
  let count = 0;
  $t('article, .technology-item, [class*="tech"], .post').each((i, el) => {
    const text = cleanText($t(el).find('h1,h2,h3,h4,.entry-title').first().text());
    if (text.length > 5) { console.log(`  item[${i}]: "${text.slice(0,70)}"`); count++; }
  });
  console.log(`total items: ${count}`);
  // Also try category filtering via the WP REST API
}
main().catch(console.error);
