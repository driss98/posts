// End-to-end test against a running dev server (npm run dev) with an EMPTY local database.
// node tools/selftest.mjs     (needs CLI_URL + CLI_TOKEN in .cli.env, Chrome installed)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { api, BASE, root } from './api.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async req(method, url, body, headers = {}) {
    let r; try { r = await fetch(BASE + url, { method, redirect: 'manual', body, headers: { cookie: this.cookie, ...headers } }); } catch { r = await fetch(BASE + url, { method, redirect: 'manual', body, headers: { cookie: this.cookie, ...headers } }); }
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    return r;
  }
  async page(url) { const r = await this.req('GET', url); const t = await r.text(); const m = t.match(/name="_csrf" value="([^"]+)"/) || t.match(/"csrf":"([^"]+)"/); if (m) this.csrf = m[1]; return { r, t }; }
  async post(url, fields, headers = {}) {
    const p = new URLSearchParams(); p.set('_csrf', this.csrf);
    for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) p.append(k, x);
    return this.req('POST', url, p, { 'content-type': 'application/x-www-form-urlencoded', ...headers });
  }
}
const loc = (r) => decodeURIComponent(r.headers.get('location') || '');

const admin = new Client(), editor = new Client();
// --- users
let r = await admin.req('POST', '/setup', new URLSearchParams({ name: 'Boss', email: 'boss@test.local', password: 'bosspassword123' }), { 'content-type': 'application/x-www-form-urlencoded' });
ok(r.status === 303 && admin.cookie, 'first admin created and logged in');
await admin.page('/dashboard/users');
await admin.post('/dashboard/users/add', { name: 'Ed', email: 'ed@test.local', password: 'editorpassword1', role: 'editor' });
r = await editor.req('POST', '/login', new URLSearchParams({ email: 'ed@test.local', password: 'editorpassword1' }), { 'content-type': 'application/x-www-form-urlencoded' });
ok(editor.cookie, 'editor can log in');
r = await editor.page('/dashboard/users');
ok(r.t.includes('Page not found'), 'editor cannot open Users');
const bad = await fetch(BASE + '/dashboard/prep', { redirect: 'manual' });
ok(bad.status === 303, 'anonymous is redirected to login');

// --- 1 admin creates 2 cards (one a URL line)
await admin.page('/dashboard/prep');
r = await admin.post('/dashboard/prep/create', { lines: 'Chunky Granny Square Cardigan\nhttps://example.com/free-bunny-amigurumi-pattern/', template: 'split', count: '6' });
let { t } = await admin.page('/dashboard/prep');
ok(t.includes('Chunky Granny Square Cardigan') && t.includes('Free Bunny Amigurumi Pattern') && t.includes('s-new'), 'admin created 2 cards as New (URL line titled from path)');
const cards = await api('GET', '/api/cli/prep');
const id = cards.find((c) => c.title.startsWith('Chunky')).id;

// --- 2 editor: uploads 2 originals, info, template, save -> Filled
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function up(c, name) { const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), name); fd.append('card', String(id)); const x = await c.req('POST', '/api/upload', fd, { 'x-csrf': c.csrf }); return x.json(); }
await editor.page(`/dashboard/prep/${id}`);
const o1 = await up(editor, 'a.png'), o2 = await up(editor, 'b.png');
ok(o1.url && o1.url.startsWith('/media/prep/'), 'editor uploaded original photos');
const badUp = new FormData(); badUp.append('file', new Blob(['x'], { type: 'text/html' }), 'evil.html');
ok((await editor.req('POST', '/api/upload', badUp, { 'x-csrf': editor.csrf })).status === 400, 'non-image upload rejected');
const img = await fetch(BASE + o1.url);
ok(img.status === 200 && img.headers.get('content-type') === 'image/png', 'uploaded image is served');
const info = 'Skill level: Easy\nYarn: Worsted weight (#4) acrylic — 3 skeins, colours: cream, sage, mustard\nHook: 5 mm (H-8)\nOther materials: yarn needle, stitch markers, 6 buttons\nTime: about 8 hours';
r = await editor.post(`/dashboard/prep/${id}/save`, { title: 'Chunky Granny Square Cardigan', info_text: info, template: 'magazine', original_json: JSON.stringify([{ url: o2.url, caption: 'back' }, { url: o1.url, caption: 'front' }]), generated_json: '[]', source_url: '', notes: '' });
ok(/status is now Filled/.test(loc(r)), 'editor save -> Filled: ' + loc(r));
// evil image url is dropped
r = await editor.post(`/dashboard/prep/${id}/save`, { title: 'Chunky Granny Square Cardigan', info_text: info, template: 'magazine', original_json: JSON.stringify([{ url: 'https://evil.example/x.jpg' }, { url: o1.url }]), generated_json: '[]' });
let card = await api('GET', '/api/cli/prep/' + id);
ok(card.images.original.length === 1, 'external image URL is rejected');
await editor.post(`/dashboard/prep/${id}/save`, { title: card.title, info_text: info, template: 'magazine', original_json: JSON.stringify([{ url: o2.url }, { url: o1.url }]), generated_json: '[]' });
// editor cannot generate prompts
await editor.post(`/dashboard/prep/${id}/save`, { act: 'genprompts', title: card.title, info_text: info, original_json: JSON.stringify([{ url: o2.url }, { url: o1.url }]) });
card = await api('GET', '/api/cli/prep/' + id);
ok(!card.prompts_text, 'editor cannot generate prompts');

// --- 3 admin generates 6 prompts
await admin.page(`/dashboard/prep/${id}`);
r = await admin.post(`/dashboard/prep/${id}/save`, { act: 'genprompts', prompt_count: '6', title: card.title, info_text: info, template: 'magazine', original_json: JSON.stringify(card.images.original), generated_json: '[]' });
card = await api('GET', '/api/cli/prep/' + id);
ok(card.status === 'prompted' && (card.prompts_text.match(/^## /gm) || []).length === 6, 'admin generated 6 prompts -> Prompts ready');
ok(/cream, sage, mustard/.test(card.prompts_text) && /5 mm/.test(card.prompts_text) && card.prompts_text.includes('Use the attached photo as the reference'), 'prompts use colours/hook and the fixed prefix');
const html = (await editor.page(`/dashboard/prep/${id}`)).t;
ok(html.includes('class="prm"') && html.includes('Copy'), 'card page shows the prompts with Copy buttons');

// --- 4 editor uploads 5 generated -> Ready
const gens = []; for (let i = 0; i < 5; i++) gens.push({ url: (await up(editor, `g${i}.png`)).url, caption: 'shot ' + (i + 1) });
r = await editor.post(`/dashboard/prep/${id}/save`, { title: card.title, info_text: info, template: 'magazine', original_json: JSON.stringify(card.images.original), generated_json: JSON.stringify(gens) });
card = await api('GET', '/api/cli/prep/' + id);
ok(card.status === 'ready', 'editor uploaded 5 generated -> Ready to write (' + card.status + ')');
// --- 5 admin sets slug -> Published
await admin.page(`/dashboard/prep/${id}`);
await admin.post(`/dashboard/prep/${id}/save`, { title: card.title, info_text: info, template: 'magazine', original_json: JSON.stringify(card.images.original), generated_json: JSON.stringify(gens), article_slug: 'chunky-granny-square-cardigan', prompts_text: card.prompts_text });
card = await api('GET', '/api/cli/prep/' + id);
ok(card.status === 'published' && card.article_slug === 'chunky-granny-square-cardigan', 'admin attached slug -> Published');
const list = await api('GET', '/api/cli/prep?status=published');
ok(list.length === 1, 'CLI list filters by status');

// --- 6 renderer + board
let sp = spawnSync(process.execPath, ['tools/social-cards.mjs', '--samples'], { cwd: root, encoding: 'utf8', env: process.env });
ok(sp.status === 0, 'renderer --samples: ' + (sp.stdout + sp.stderr).trim().split('\n').pop());
const photos = ['classic', 'split', 'bold', 'collage'].map((k) => ({ url: `/images/social/samples/${k}-fb.jpg`, alt: 'Photo ' + k }));
await api('POST', '/api/cli/articles', { slug: 'chunky-granny-square-cardigan', title: 'Chunky Granny Square Cardigan', skill: 'Easy', yarn: 'Worsted', hook: '5 mm', time: '8 hours', images: photos, social_template: card.template });
await api('POST', '/api/cli/articles', { slug: 'bunny-amigurumi', title: 'Easy Bunny Amigurumi', skill: 'Easy', yarn: 'Cotton DK', hook: '3 mm', images: photos.slice(0, 3) });
for (const s of ['chunky-granny-square-cardigan', 'bunny-amigurumi']) {
  sp = spawnSync(process.execPath, ['tools/social-cards.mjs', s], { cwd: root, encoding: 'utf8', env: process.env });
  ok(sp.status === 0 && /cards done/.test(sp.stdout), `renderer ${s}: ` + (sp.stdout.trim().split('\n').pop() || sp.stderr.slice(-300)));
}
sp = spawnSync(process.execPath, ['tools/social-cards.mjs', 'bunny-amigurumi'], { cwd: root, encoding: 'utf8', env: process.env });
ok(/0 cards done, 3 skipped/.test(sp.stdout), 'renderer skips existing images');
const rows = await api('GET', '/api/cli/social/chunky-granny-square-cardigan');
ok(rows.length === 4 && rows[0].fb_image.endsWith('-fb-1.jpg') && rows[0].pin_title.length <= 100 && rows[0].pin_desc.length <= 500 && !/https?:|\.com/i.test(rows[0].pin_desc), 'social rows created with texts (pin desc has no domain)');
ok(rows[0].fb_comment.includes('example.com/chunky-granny-square-cardigan') && !/https?:/.test(rows[0].fb_caption), 'fb comment has the link, caption has none');
const im = await fetch(BASE + rows[0].pin_image);
ok(im.status === 200 && im.headers.get('content-type') === 'image/jpeg', 'rendered pin image is served');
// edited texts survive a re-run without --retext
const slug = 'chunky-granny-square-cardigan';
await admin.page(`/dashboard/social/card/${slug}/1`);
await admin.post(`/dashboard/social/card/${slug}/1/texts`, { pin_title: 'My edited title', fb_caption: rows[0].fb_caption, fb_comment: rows[0].fb_comment, pin_desc: rows[0].pin_desc, pin_topics: rows[0].pin_topics, pin_board: rows[0].pin_board, label: 'Hero' });
spawnSync(process.execPath, ['tools/social-cards.mjs', slug], { cwd: root, encoding: 'utf8', env: process.env });
ok((await api('GET', '/api/cli/social/' + slug))[0].pin_title === 'My edited title', 'dashboard-edited texts are kept');

t = (await admin.page('/dashboard/social')).t;
ok(t.includes('class="cell') && t.includes('Chunky Granny Square Cardigan'), 'board shows cells');
// mark F posted twice, undo
await admin.post(`/dashboard/social/card/${slug}/2/post`, { platform: 'fb', op: 'add' });
await admin.post(`/dashboard/social/card/${slug}/2/post`, { platform: 'fb', op: 'add' });
let c2 = (await api('GET', '/api/cli/social/' + slug))[1];
ok(JSON.parse(c2.fb_log).length === 2, 'Facebook marked posted twice (2 dates)');
await admin.post(`/dashboard/social/card/${slug}/2/post`, { platform: 'fb', op: 'undo' });
c2 = (await api('GET', '/api/cli/social/' + slug))[1];
ok(JSON.parse(c2.fb_log).length === 1, 'undo removes the latest date');
await editor.page(`/dashboard/social/card/${slug}/3`);
await editor.post(`/dashboard/social/card/${slug}/3/bad`, { op: 'set', note: 'Extra buttons' });
t = (await admin.page('/dashboard/social?f=bad')).t;
ok(t.includes('cell bad') , 'editor marked wrong -> red cell + filter');
await editor.post(`/dashboard/social/card/${slug}/3/bad`, { op: 'clear' });
t = (await admin.page('/dashboard/social?f=bad')).t;
ok(!t.includes('cell bad'), 'cleared');
// bulk CSV
await admin.page('/dashboard/social/bulk');
r = await admin.post('/dashboard/social/bulk/download', { pin: [`${slug}|1`, `${slug}|2`, `${slug}|3`], day: '2030-01-05', from: '08:00', to: '10:00' });
const csv = await r.text();
const lines = csv.split('\r\n');
ok(r.headers.get('content-disposition').includes('pinterest-bulk-2030-01-05.csv') && lines[0] === 'Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords', 'bulk CSV header + file name');
ok(lines.length === 4 && lines[1].includes('2030-01-05 08:00:00') && lines[2].includes('2030-01-05 09:00:00') && lines[3].includes('2030-01-05 10:00:00') && lines[1].includes(BASE + '/images/social/'), 'bulk CSV: 3 pins spread 08:00-10:00, absolute media URLs');
t = (await admin.page('/dashboard/social?f=bulk')).t;
ok(t.includes('p bulk'), 'bulk cards turn violet');
r = await admin.post('/dashboard/social/bulk/download', { pin: [`${slug}|1`], day: '2030-01-05' });
ok(loc(r).includes('No valid pins'), 'already-sent pins are not exported twice');
await admin.post(`/dashboard/social/card/${slug}/1/unbulk`, {});
c2 = (await api('GET', '/api/cli/social/' + slug))[0];
ok(!c2.pin_bulk_at && JSON.parse(c2.pin_log).length === 0, 'undo bulk restores the card');
r = await admin.req('GET', '/dashboard/social/export.csv');
const exBuf = Buffer.from(await r.arrayBuffer());
const ex = exBuf.toString('utf8').replace(/^\ufeff/, '');
ok(exBuf.subarray(0, 3).toString('hex') === 'efbbbf' && ex.startsWith('article,url,indexed,card,style,board,facebook posts,facebook dates,pinterest posts,pinterest dates,bulk file,bulk publish date,marked wrong,problem') && ex.split('\r\n').length > 5, 'export CSV (UTF-8 BOM, all columns)');
await admin.page('/dashboard/social');
r = await fetch(BASE + '/api/social/indexed', { method: 'POST', headers: { cookie: admin.cookie, 'x-csrf': admin.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ slug, indexed: true }) });
ok(r.ok, 'indexed checkbox saves');
t = (await admin.page('/dashboard/social/templates')).t;
ok((t.match(/<iframe/g) || []).length === 22, 'template gallery shows 11 templates x FB+Pin');

// --- 7 phone width, no horizontal scroll
const browser = await puppeteer.launch({ executablePath: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p)), headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'st-')) });
const pg = await browser.newPage();
await pg.setViewport({ width: 360, height: 800 });
await pg.setCookie({ name: 'sid', value: admin.cookie.split('=')[1], url: BASE });
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
for (const u of ['/dashboard/prep', `/dashboard/prep/${id}`, '/dashboard/social', `/dashboard/social/card/${slug}/1`, '/dashboard/social/bulk', '/dashboard/social/templates', '/dashboard/articles', `/dashboard/articles/${slug}`, '/dashboard/users']) {
  await pg.goto(BASE + u, { waitUntil: 'networkidle0' });
  const w = await pg.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 360, `no horizontal scroll at 360px: ${u} (${w}px)`);
}
// uploader UI renders tiles and copy button turns green
await pg.goto(BASE + `/dashboard/prep/${id}`, { waitUntil: 'networkidle0' });
const tiles = await pg.$$eval('#tiles-original .tile', (e) => e.length);
ok(tiles === 2, 'card page renders the original photo tiles');
await pg.click('.prm .copy').catch(() => {});
const green = await pg.$eval('.prm', (e) => e.classList.contains('copied') && e.querySelector('.copy').textContent.includes('Copied'));
ok(green, 'Copy marks a prompt green');
ok(errs.length === 0, 'no JS errors on pages' + (errs.length ? ': ' + errs[0] : ''));
await browser.close();

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
