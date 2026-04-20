import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  const $l = await fetchHtml('https://www.lji.org/research/licensing-opportunities/', 12000);
  if (!$l) { console.log('null'); return; }
  const mainText = $l('main').text().replace(/\s+/g, ' ').slice(0, 800);
  console.log('main text preview:', mainText);
  // Try finding any section that contains technology names
  $l('p, li').each((i, el) => {
    const text = cleanText($l(el).text());
    if (text.length > 20 && text.length < 200 && i < 60) {
      console.log(`  elem[${i}]: "${text.slice(0,100)}"`);
    }
  });
}
main().catch(console.error);
