import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  const $l = await fetchHtml('https://www.lji.org/research/licensing-opportunities/', 12000);
  if (!$l) { console.log('null'); return; }
  // Get full body text
  const fullText = $l('body').text().replace(/\s+/g, ' ');
  // Find tech listings section
  const idx = fullText.indexOf('partner with companies');
  console.log('post-intro text:', fullText.slice(idx, idx + 2000));
  // Look for PDF links or external links that might be tech listings
  $l('a').each((i, el) => {
    const href = $l(el).attr('href') || '';
    const text = cleanText($l(el).text());
    if (href && text.length > 10 && !href.includes('#') && !href.includes('lji.org/research/')) {
      console.log(`external-link: "${text.slice(0,70)}" -> ${href.slice(0,80)}`);
    }
  });
}
main().catch(console.error);
