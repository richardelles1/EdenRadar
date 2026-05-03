#!/usr/bin/env node
  // One-shot validator for marketing/linkedin/eden-linkedin-library.md
  // Usage: node scripts/validate-linkedin.cjs
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(__dirname, '..', 'marketing', 'linkedin', 'eden-linkedin-library.md');
  const raw = fs.readFileSync(FILE, 'utf8');

  // Split on "### Post NNN — ..." headings
  const parts = raw.split(/^### Post (\d{3}) — (.+)$/m);
  // parts: [pre, num, theme, body, num, theme, body, ...]
  const posts = [];
  for (let i = 1; i < parts.length; i += 3) {
    const num = parts[i];
    const theme = parts[i+1];
    let bodyChunk = parts[i+2] || '';
    // body ends at next "---" separator
    const sepIdx = bodyChunk.indexOf('\n---');
    if (sepIdx !== -1) bodyChunk = bodyChunk.slice(0, sepIdx);
    posts.push({ num, theme, body: bodyChunk.trim() });
  }

  const BANNED_OPENERS = [
    "i'm excited to share","im excited to share","hey everyone","as a ",
    "in today's fast-paced world","in todays fast-paced world","i wanted to share",
  ];

  function validate(body) {
    const errors = [];
    if (body.includes("\u2014")) errors.push("contains em dash");
    if (body.includes("\u2013")) errors.push("contains en dash");
    if (body.length > 2200) errors.push(`length ${body.length} > 2200`);
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    const hook = lines[0] || "";
    if (hook.length > 110) errors.push(`hook ${hook.length} > 110`);
    const lhook = hook.toLowerCase();
    for (const b of BANNED_OPENERS) if (lhook.startsWith(b)) errors.push(`banned opener: "${b}"`);
    const lastLine = lines[lines.length - 1];
    const tags = (lastLine.match(/#\w+/g) || []);
    if (tags.length < 3 || tags.length > 5) errors.push(`hashtags=${tags.length} (need 3-5)`);
    const ctaLine = lines[lines.length - 2] || "";
    const qMarks = (body.match(/\?/g) || []).length;
    if (qMarks < 1) errors.push("no ?");
    if (!ctaLine.endsWith("?")) errors.push("CTA line does not end with ?");
    return errors;
  }

  let pass = 0, fail = 0;
  for (const p of posts) {
    const errs = validate(p.body);
    if (errs.length === 0) pass++;
    else { fail++; console.log(`FAIL Post ${p.num} (${p.theme}): ${errs.join('; ')}`); }
  }
  console.log(`\n${pass}/${posts.length} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
  