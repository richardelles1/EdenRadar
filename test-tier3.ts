async function probe(name: string, url: string) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EdenRadar/2.0)' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    const html = res.ok ? await res.text() : '';
    // Count potential listing anchors
    const links = (html.match(/<a [^>]*href="[^"]+"/g) || []).length;
    const h2s = (html.match(/<h2/g) || []).length;
    const h3s = (html.match(/<h3/g) || []).length;
    const lis = (html.match(/<li/g) || []).length;
    console.log(`${name}: HTTP ${res.status}, ${html.length} chars, ${links} a-tags, ${h2s} h2, ${h3s} h3, ${lis} li`);
    // Print first 1500 chars of body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]{0,3000})/i);
    if (bodyMatch) {
      const preview = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300).trim();
      console.log(`  preview: ${preview}`);
    }
  } catch(e: any) {
    console.log(`${name}: error — ${e.message}`);
  }
}

async function main() {
  await probe('Benaroya', 'https://www.benaroyaresearch.org/collaborations-bri/technology-available-licensing');
  await probe('LJI', 'https://www.lji.org/research/licensing-opportunities/');
  await probe('BGN', 'https://bgn.bgu.ac.il/technology-licensing');
  await probe('Nova SE', 'https://research.nova.edu/ottc/available-technologies/index.html');
  await probe('LIMR', 'https://limr.mainlinehealth.org/technology-development-licensing/intellectual-property-and-other-technology');
}
main().catch(console.error);
