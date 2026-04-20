import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  const $n = await fetchHtml('https://research.nova.edu/ottc/available-technologies/index.html', 12000);
  if (!$n) { console.log('null'); return; }
  // Get all anchors from the page
  const allLinks: string[] = [];
  $n('a[href]').each((_, el) => {
    const href = $n(el).attr('href') || '';
    const text = cleanText($n(el).text());
    if (text.length > 8 && !text.includes('Canvas') && !text.includes('SharkLink')) {
      allLinks.push(`"${text.slice(0,60)}" -> ${href.slice(0,80)}`);
    }
  });
  console.log('all meaningful links:', allLinks.length);
  allLinks.slice(0,20).forEach(l => console.log(`  ${l}`));
}
main().catch(console.error);
