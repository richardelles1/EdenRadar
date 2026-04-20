async function main() {
  const portals = [
    { sub: 'uri', name: 'University of Rhode Island' },
    { sub: 'norinnova', name: 'Norinnova' },
    { sub: 'embl-em', name: 'EMBLEM Technology Transfer' },
  ];

  for (const { sub, name } of portals) {
    try {
      const url = `https://app.in-part.com/api/v3/public/opportunities?portalSubdomain=${sub}&page=1&limit=5`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) { console.log(`${sub}: API HTTP ${res.status}`); continue; }
      const data = await res.json() as any;
      const results = data?.data?.results ?? data?.results ?? [];
      const total = data?.data?.pagination?.count ?? data?.pagination?.count ?? '?';
      console.log(`${sub}: ${results.length} sample results, total=${total}`);
      if (results.length > 0) console.log(`  first: ${results[0].title}`);
    } catch(e: any) {
      console.log(`${sub}: error — ${e.message}`);
    }
  }
}
main().catch(console.error);
