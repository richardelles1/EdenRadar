import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  const $bg = await fetchHtml('https://bgn.bgu.ac.il/technology-licensing', 12000);
  if (!$bg) { console.log('null'); return; }
  // Try English content
  $bg('[lang="en"] a, a[href*="technolog"], .technology a').each((i, el) => {
    const text = cleanText($bg(el).text());
    const href = $bg(el).attr('href') || '';
    if (text.length > 8) console.log(`link[${i}]: "${text.slice(0,80)}" -> ${href.slice(0,80)}`);
  });
  // Look for any JSON data embedded
  const html = $bg.html() ?? '';
  const techMatches = html.match(/"technology[^"]*":\s*"([^"]{10,80})"/gi);
  if (techMatches) console.log('JSON tech fields:', techMatches.slice(0,5).join('\n'));
  // API endpoint hints
  const apiHints = html.match(/fetch\(['"][^'"]+['"]/g);
  if (apiHints) console.log('fetch calls:', apiHints.slice(0,5).join('\n'));
  console.log('page html length:', html.length);
}
main().catch(console.error);
