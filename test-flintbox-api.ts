async function checkFlintbox(slug: string, orgId: number, accessKey: string) {
  const url = `https://${slug}.flintbox.com/api/v1/technologies?organizationId=${orgId}&organizationAccessKey=${accessKey}&per_page=500`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { console.log(`${slug}: API HTTP ${res.status}`); return; }
    const json = await res.json() as any;
    const items = Array.isArray(json) ? json : (json.data ?? json.technologies ?? json.results ?? []);
    console.log(`${slug}: ${items.length} items via API — first: "${items[0]?.attributes?.name ?? items[0]?.name ?? '?'}"`);
  } catch(e: any) {
    console.log(`${slug}: error — ${e.message}`);
  }
}

async function main() {
  await checkFlintbox('unm', 83, 'd806a16b-e229-4077-81f8-1704ae7099be');
  await checkFlintbox('udel', 93, 'b3c809cf-2bd5-4b78-8f50-1cac404a5dba');
  await checkFlintbox('unthsc', 13, '533cffd9-c553-4942-8f15-92b06b96a089');
  await checkFlintbox('qataruniversity', 182, 'cf968422-0adc-4436-9c97-57d3451364b7');
  await checkFlintbox('hollandbloorview', 97, 'a487340c-3e48-45d7-a5d7-a477fc40d173');
}
main().catch(console.error);
