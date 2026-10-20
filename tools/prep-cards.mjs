#!/usr/bin/env node
// node tools/prep-cards.mjs list [status] | show <id> [outDir] | genprompts <id> [n] | prompts <id> <file.txt> | status <id> <status> [slug] | create <titles.txt>
import fs from 'node:fs';
import path from 'node:path';
import { api, guard, mediaUrl, root } from './api.mjs';
import { buildPrompts } from '../src/prompts.js';

const [cmd, a, b, c] = process.argv.slice(2);
const need = (v, m) => { if (!v) { console.error(m); process.exit(1); } };
if (!cmd) { console.log('Usage: node tools/prep-cards.mjs list [status] | show <id> [outDir] | genprompts <id> [n] | prompts <id> <file.txt> | status <id> <status> [slug] | create <titles.txt>'); process.exit(0); }
await guard();

if (cmd === 'list') {
  const rows = await api('GET', '/api/cli/prep' + (a ? '?status=' + a : ''));
  for (const r of rows) console.log(`#${r.id}\t${r.status.padEnd(9)}\torig ${r.originals} · prompts ${r.prompts} · gen ${r.generated}\t${r.template || '-'}\t${r.title}${r.article_slug ? '  -> ' + r.article_slug : ''}`);
  if (!rows.length) console.log('(no cards)');
} else if (cmd === 'show') {
  need(a, 'show <id> [outDir]');
  const card = await api('GET', '/api/cli/prep/' + a);
  const dir = path.resolve(b || path.join(root, 'out', 'card-' + a));
  fs.mkdirSync(dir, { recursive: true });
  console.log(`# ${card.title} (#${card.id}, ${card.status})\ntemplate: ${card.template || '-'}  source: ${card.source_url || '-'}\n\n--- PATTERN INFO ---\n${card.info_text || ''}\n\n--- NOTES ---\n${card.notes || ''}\n\n--- PROMPTS ---\n${card.prompts_text || ''}\n`);
  for (const g of ['original', 'generated']) {
    let i = 0;
    for (const im of card.images[g]) {
      i++;
      const r = await fetch(mediaUrl(im.url));
      const file = path.join(dir, `${g}-${String(i).padStart(2, '0')}${path.extname(im.url)}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      console.log(`${g} ${i}: ${file}${im.caption ? '  (' + im.caption + ')' : ''}`);
    }
  }
} else if (cmd === 'genprompts') {
  need(a, 'genprompts <id> [n]');
  const card = await api('GET', '/api/cli/prep/' + a);
  const n = Math.max(5, Math.min(10, parseInt(b, 10) || card.prompt_count || 8));
  console.log(await api('POST', `/api/cli/prep/${a}/prompts`, { text: buildPrompts(card.title, card.info_text, n), n }));
} else if (cmd === 'prompts') {
  need(a && b, 'prompts <id> <file.txt>');
  console.log(await api('POST', `/api/cli/prep/${a}/prompts`, { text: fs.readFileSync(b, 'utf8') }));
} else if (cmd === 'status') {
  need(a && b, 'status <id> <status> [slug]');
  console.log(await api('POST', `/api/cli/prep/${a}/status`, { status: b, slug: c }));
} else if (cmd === 'create') {
  need(a, 'create <titles.txt>');
  console.log(await api('POST', '/api/cli/prep', { titles: fs.readFileSync(a, 'utf8').split(/\r?\n/) }));
} else {
  console.error('Unknown command: ' + cmd);
  process.exit(1);
}
