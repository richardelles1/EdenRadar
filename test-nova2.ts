import { fetchHtml, cleanText } from './server/lib/scrapers/utils';
async function main() {
  // The main page doesn't have category links - get text content to see what's actually there
  const $n = await fetchHtml('https://research.nova.edu/ottc/available-technologies/index.html', 12000);
  if (!$n) { console.log('null'); return; }
  // Print text content of main/content area
  const mainText = $n('body').text().replace(/\s+/g, ' ');
  // Find anything that looks like technology titles
  const techSection = mainText.slice(mainText.indexOf('Available'), mainText.indexOf('Available') + 3000);
  console.log('Available Technologies section:', techSection.slice(0,2000));
}
main().catch(console.error);
