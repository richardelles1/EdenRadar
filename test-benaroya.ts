import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  const $b = await fetchHtml('https://www.benaroyaresearch.org/collaborations-bri/technology-available-licensing', 12000);
  if (!$b) { console.log('null'); return; }
  $b('h3').each((i, el) => {
    const text = cleanText($b(el).text());
    const linkInParent = $b(el).parent().find('a').first().attr('href') || $b(el).next('a').attr('href') || 'none';
    const linkInH3 = $b(el).find('a').attr('href') || 'none';
    console.log(`h3[${i}]: "${text}"`);
    console.log(`  h3-link: ${linkInH3} | parent-link: ${linkInParent}`);
  });
}
main().catch(console.error);
