import { fetchHtml, cleanText } from './server/lib/scrapers/utils';

async function main() {
  console.log('\n=== BENAROYA — full tech link scan ===');
  const $b = await fetchHtml('https://www.benaroyaresearch.org/collaborations-bri/technology-available-licensing', 12000);
  if ($b) {
    // Check what's around each h3
    $b('h3').each((i, el) => {
      const text = cleanText($b(el).text());
      const parent = $b(el).parent();
      const parentHtml = parent.html()?.slice(0, 300) ?? '';
      const linkInParent = parent.find('a').attr('href') || 'none';
      console.log(`  h3[${i}]: "${text}"`);
      console.log(`    parent-link: ${linkInParent}`);
    });
  }

  console.log('\n=== LJI — look at main content for tech listings ===');
  const $l = await fetchHtml('https://www.lji.org/research/licensing-opportunities/', 12000);
  if ($l) {
    // Look for main/article content section
    const mainHtml = $l('main, article, .entry-content, .page-content, [class*="licensing"]').first().html() ?? '';
    console.log(`  main content length: ${mainHtml.length}`);
    // Look for any link with meaningful anchor text that could be a technology
    const techLinks: string[] = [];
    $l('main a, article a, .entry-content a').each((_, el) => {
      const text = cleanText($l(el).text());
      const href = $l(el).attr('href') || '';
      if (text.length > 15 && !href.includes('#') && !href.includes('javascript')) {
        techLinks.push(`"${text.slice(0,80)}" -> ${href.slice(0,80)}`);
      }
    });
    console.log(`  main-area tech links: ${techLinks.length}`);
    techLinks.slice(0,10).forEach(l => console.log(`    ${l}`));
    // Also get raw text preview of main content
    const mainText = $l('main, .entry-content').text().replace(/\s+/g, ' ').slice(0, 500);
    console.log(`  text preview: ${mainText}`);
  }

  console.log('\n=== BGN — look for English tech listings ===');
  const $bg = await fetchHtml('https://bgn.bgu.ac.il/technology-licensing', 12000);
  if ($bg) {
    const mainText = $bg('main, .main, [class*="content"]').first().text().replace(/\s+/g, ' ').slice(0, 600);
    console.log(`  main text: ${mainText}`);
    let count = 0;
    $bg('a[href]').each((_, el) => {
      const href = $bg(el).attr('href') || '';
      const text = cleanText($bg(el).text());
      if ((href.includes('technology') || href.includes('tech')) && text.length > 8) {
        if (count < 8) console.log(`  tech-link: "${text.slice(0,70)}" -> ${href.slice(0,80)}`);
        count++;
      }
    });
    console.log(`  total tech-style links: ${count}`);
    // Check for API/search endpoints
    const html = $bg.html() ?? '';
    const apiMatch = html.match(/api[^"']{0,50}["']/i);
    console.log(`  api hint: ${apiMatch?.[0] ?? 'none'}`);
  }

  console.log('\n=== NOVA SE — check category pages ===');
  const categories = ['/ottc/available-technologies/life-sciences.html', '/ottc/available-technologies/']);
  for (const cat of categories) {
    try {
      const $cat = await fetchHtml(`https://research.nova.edu${cat}`, 12000);
      if ($cat) {
        let links: string[] = [];
        $cat('a[href]').each((_, el) => {
          const href = $cat(el).attr('href') || '';
          const text = cleanText($cat(el).text());
          if (text.length > 10 && href.includes('available') && !href.endsWith('index.html')) {
            links.push(`"${text.slice(0,60)}" -> ${href}`);
          }
        });
        console.log(`  ${cat}: ${links.length} potential tech links`);
        links.slice(0,5).forEach(l => console.log(`    ${l}`));
      }
    } catch(e: any) { console.log(`  ${cat}: error — ${e.message}`); }
  }
}
main().catch(console.error);
