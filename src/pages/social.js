import cfg from '../../site.config.js';
import { esc, now, today, jparse, layout, html, back, csrfField, csrfOk, isAdmin, canEditSocial, articleUrl, absMedia } from '../lib.js';
import { TEMPLATES, templateName, autoTemplate, isTemplate } from '../templates.js';
import { renderHtml, SAMPLE } from '../render-html.js';

export const articleImages = (a) => {
  const seen = new Set(); const out = [];
  for (const it of jparse(a.images_json, [])) { if (it && it.url && !seen.has(it.url)) { seen.add(it.url); out.push(it); } }
  return out;
};
const daysAgo = (d) => (Date.now() - new Date(d + 'T00:00:00Z').getTime()) / 864e5;
const csvCell = (v) => { v = String(v ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
const fmt = (d) => (d ? d : '–');

function info(row) {
  const fb = jparse(row?.fb_log, []), pin = jparse(row?.pin_log, []);
  const last = [fb[0], pin[0]].filter(Boolean).sort().pop() || '';
  return { gen: !!(row && row.fb_image), fb, pin, last, stale: !!last && daysAgo(last) > cfg.repostAfterDays, bad: !!row?.bad_at, bulk: !!row?.pin_bulk_at, posted: fb.length + pin.length > 0 };
}

async function loadAll(env) {
  const [a, sa, sc] = await Promise.all([
    env.DB.prepare('SELECT * FROM articles ORDER BY published_at DESC').all(),
    env.DB.prepare('SELECT * FROM social_articles').all(),
    env.DB.prepare('SELECT * FROM social_cards ORDER BY slug, n').all(),
  ]);
  const saMap = Object.fromEntries(sa.results.map((r) => [r.slug, r]));
  const cards = {};
  sc.results.forEach((r) => { (cards[r.slug] ||= {})[r.n] = r; });
  return { articles: a.results, saMap, cards };
}

// ---------- board ----------
export async function socialBoard(req, env, user) {
  const f = new URL(req.url).searchParams.get('f') || '';
  const { articles, saMap, cards } = await loadAll(env);
  let tot = { cards: 0, fb: 0, pin: 0, bulk: 0, bad: 0 };
  const rows = articles.map((a) => {
    const imgs = articleImages(a);
    const cells = imgs.map((_, i) => ({ n: i + 1, row: (cards[a.slug] || {})[i + 1] }));
    const inf = cells.map((c) => ({ ...c, i: info(c.row) }));
    const gen = inf.filter((c) => c.i.gen);
    const fbN = inf.reduce((s, c) => s + c.i.fb.length, 0), pinN = inf.reduce((s, c) => s + c.i.pin.length, 0);
    const lastFb = inf.map((c) => c.i.fb[0]).filter(Boolean).sort().pop(), lastPin = inf.map((c) => c.i.pin[0]).filter(Boolean).sort().pop();
    gen.forEach((c) => { tot.cards++; if (c.i.fb.length) tot.fb++; if (c.i.pin.length) tot.pin++; if (c.i.bulk) tot.bulk++; if (c.i.bad) tot.bad++; });
    const indexed = !!saMap[a.slug]?.indexed;
    const flags = {
      never: gen.some((c) => !c.i.posted), due: gen.some((c) => c.i.stale), bad: gen.some((c) => c.i.bad), bulk: gen.some((c) => c.i.bulk),
      full: gen.length > 0 && gen.every((c) => c.i.fb.length && (c.i.pin.length || c.i.bulk)), notindexed: !indexed,
    };
    return { a, inf, fbN, pinN, lastFb, lastPin, indexed, flags };
  });
  const FILTERS = [['', 'All'], ['never', 'Has cards never posted'], ['due', 'Due for a repost'], ['bad', '⚠ Marked wrong'], ['bulk', 'In a bulk upload'], ['full', 'Fully posted'], ['notindexed', 'Not indexed']];
  const chips = FILTERS.map(([k, l]) => `<a class="chip ${f === k ? 'on' : ''}" href="/dashboard/social${k ? '?f=' + k : ''}">${l}${k ? ` <b>${rows.filter((r) => r.flags[k]).length}</b>` : ` <b>${rows.length}</b>`}</a>`).join('');
  const trs = rows.filter((r) => !f || r.flags[f]).map((r) => {
    const cellsHtml = r.inf.map((c) => {
      const cl = ['cell', c.i.bad ? 'bad' : '', c.i.gen ? '' : 'nogen'].join(' ');
      const t = `${c.row?.label || 'Image ' + c.n} — Facebook ${c.i.fb.length}× ${fmt(c.i.fb[0])} · Pinterest ${c.i.pin.length}× ${fmt(c.i.pin[0])}${c.i.bad ? ' · WRONG: ' + (c.row.bad_note || '') : ''}${c.i.gen ? '' : ' · not generated yet'}`;
      return `<a class="${cl}" href="/dashboard/social/card/${encodeURIComponent(r.a.slug)}/${c.n}" title="${esc(t)}"><span class="num">${c.n}</span><span class="fp"><span class="f ${c.i.fb.length ? 'on' : ''}">F</span><span class="p ${c.i.bulk ? 'bulk' : c.i.pin.length ? 'on' : ''}">P</span></span>${c.i.stale ? '<span class="dot"></span>' : ''}</a>`;
    }).join('');
    return `<tr><td><a href="${esc(articleUrl(r.a.slug))}" target="_blank" rel="nofollow"><b>${esc(r.a.title)}</b></a><div class="muted">${esc(r.a.slug)} · <a href="#" data-copy="${esc(articleUrl(r.a.slug))}">Copy link</a> · ${esc((r.a.published_at || '').slice(0, 10))}</div></td>
<td><label style="margin:0;font-weight:400"><input type="checkbox" class="idx" data-slug="${esc(r.a.slug)}" ${r.indexed ? 'checked' : ''}> Indexed in Google</label></td>
<td><div class="cells">${cellsHtml || '<span class="muted">no images</span>'}</div><div class="muted">Facebook ${r.fbN}× · last ${fmt(r.lastFb)} · Pinterest ${r.pinN}× · last ${fmt(r.lastPin)}</div></td></tr>`;
  }).join('');
  const body = `<h1>Social posts</h1>
<div class="row" style="margin-bottom:.5rem"><div class="fit"><a class="btn" href="/dashboard/social/bulk">Pinterest bulk upload</a></div><div class="fit"><a class="btn alt" href="/dashboard/social/export.csv">Export posting log (CSV)</a></div><div class="fit"><a class="btn alt" href="/dashboard/social/templates">Templates</a></div></div>
<div class="legend"><span><i style="background:#d4d4d4"></i>not posted</span><span><i style="background:#16a34a"></i>F posted / P pinned by hand</span><span><i style="background:#7c3aed"></i>P in a bulk upload</span><span><i style="background:#fecaca;border:1px solid #dc2626"></i>marked wrong</span><span><i style="border:1px dashed #888"></i>not generated yet</span><span><i style="background:#eab308;border-radius:50%"></i>last post older than ${cfg.repostAfterDays} days</span></div>
<p class="muted">${rows.length} articles · ${tot.cards} cards · Facebook posted ${tot.fb} · Pinterest posted ${tot.pin} · in bulk ${tot.bulk} · wrong ${tot.bad}</p>
<div class="chips">${chips}</div><div class="box tw"><table><tr><th>Article</th><th>Google</th><th>Cards</th></tr>${trs || '<tr><td colspan="3" class="muted">No articles.</td></tr>'}</table></div>
<script>document.querySelectorAll('[data-copy]').forEach(function(a){a.onclick=function(e){e.preventDefault();navigator.clipboard.writeText(a.dataset.copy);a.textContent='Copied ✓'}});
document.querySelectorAll('.idx').forEach(function(c){c.onchange=function(){fetch('/api/social/indexed',{method:'POST',headers:{'content-type':'application/json','x-csrf':${JSON.stringify(user.csrf)}},body:JSON.stringify({slug:c.dataset.slug,indexed:c.checked})}).then(function(r){if(!r.ok){c.checked=!c.checked;alert('Not saved')}})}});</script>`;
  return layout('Social posts', body, user, 'social', req);
}

export async function setIndexed(req, env, user) {
  if (!csrfOk(user, null, req)) return new Response('{"error":"csrf"}', { status: 403 });
  const { slug, indexed } = await req.json();
  await env.DB.prepare('INSERT INTO social_articles(slug,indexed,indexed_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET indexed=excluded.indexed, indexed_at=excluded.indexed_at, updated_at=excluded.updated_at')
    .bind(String(slug), indexed ? 1 : 0, indexed ? today() : null, now()).run();
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
}

// ---------- card page ----------
export async function socialCard(req, env, user, slug, n) {
  const a = await env.DB.prepare('SELECT * FROM articles WHERE slug=?').bind(slug).first();
  const r = await env.DB.prepare('SELECT * FROM social_cards WHERE slug=? AND n=?').bind(slug, n).first();
  if (!a) return layout('Not found', '<h1>Article not found</h1>', user, 'social', req);
  const imgs = articleImages(a);
  const all = (await env.DB.prepare('SELECT * FROM social_cards WHERE slug=?').bind(slug).all()).results;
  const nav = imgs.map((_, i) => { const row = all.find((x) => x.n === i + 1); const inf = info(row); return `<a class="cell ${inf.bad ? 'bad' : ''} ${inf.gen ? '' : 'nogen'}" style="${i + 1 === n ? 'outline:3px solid var(--p)' : ''}" href="/dashboard/social/card/${encodeURIComponent(slug)}/${i + 1}"><span class="num">${i + 1}</span><span class="fp"><span class="f ${inf.fb.length ? 'on' : ''}">F</span><span class="p ${inf.bulk ? 'bulk' : inf.pin.length ? 'on' : ''}">P</span></span></a>`; }).join('');
  const base = `/dashboard/social/card/${encodeURIComponent(slug)}/${n}`;
  const edit = canEditSocial(user);
  if (!r || !r.fb_image) return layout(`${a.title} #${n}`, `<p><a href="/dashboard/social">← Board</a></p><h1>${esc(a.title)} · image ${n}</h1><div class="cells">${nav}</div><div class="box">Social images are not generated yet. Run: <code>node tools/social-cards.mjs ${esc(slug)}</code></div>`, user, 'social', req);
  const inf = info(r);
  const link = articleUrl(slug);
  const ta = (name, label, val, max, rows = 3) => `<div class="cp"><label>${label}</label><span><span class="cnt" data-for="${name}"></span> <button type="button" class="btn sm alt cpy" data-for="${name}">Copy</button></span></div><textarea name="${name}" rows="${rows}" ${max ? `maxlength="${max}" data-max="${max}"` : ''} ${edit ? '' : 'readonly'}>${esc(val)}</textarea>`;
  const post = (plat, label, log) => `<div class="box"><h2>${label}</h2><div class="dates">${log.map((d) => `<span>${d}</span>`).join('') || '<span class="muted" style="background:none">never posted</span>'}</div>
<form method="post" action="${base}/post" class="inl">${csrfField(user)}<input type="hidden" name="platform" value="${plat}"><button class="btn sm" name="op" value="add">Mark as posted today</button> ${log.length ? '<button class="btn sm alt" name="op" value="undo">Undo latest</button>' : ''}</form></div>`;
  const body = `<p><a href="/dashboard/social">← Board</a> · <a href="${esc(link)}" target="_blank" rel="nofollow">Open article ↗</a></p>
<h1>${esc(a.title)} · image ${n}${r.label ? ' — ' + esc(r.label) : ''}</h1><div class="cells">${nav}</div>
${inf.bad ? `<div class="flash bad">⚠ Marked wrong${r.bad_by ? ' by ' + esc(r.bad_by) : ''}: ${esc(r.bad_note || '')}</div>` : ''}
${r.pin_bulk_at ? `<div class="box" style="border-color:#7c3aed;background:#f5f3ff">Sent in a Pinterest bulk upload: <b>${esc(r.pin_bulk_file)}</b>, scheduled ${esc(r.pin_bulk_date)}. <form method="post" action="${base}/unbulk" class="inl">${csrfField(user)}<button class="btn sm alt">Undo bulk</button></form></div>` : ''}
<div class="two"><div class="box"><h2>Facebook</h2><img src="${esc(r.fb_image)}" alt=""><p><a class="btn sm alt" href="${esc(r.fb_image)}" download>Download</a></p></div>
<div class="box"><h2>Pinterest</h2><img src="${esc(r.pin_image)}" alt=""><p><a class="btn sm alt" href="${esc(r.pin_image)}" download>Download</a></p></div></div>
<div class="two">${post('fb', 'Facebook posts', inf.fb)}${post('pin', 'Pinterest posts', inf.pin)}</div>
<form method="post" action="${base}/texts" class="box">${csrfField(user)}<h2>Texts</h2>
${ta('fb_caption', 'Facebook caption (hashtags, no link)', r.fb_caption, 0, 5)}${ta('fb_comment', 'Facebook first comment (article link)', r.fb_comment, 0, 2)}
${ta('pin_title', 'Pin title (≤ 100)', r.pin_title, 100, 2)}${ta('pin_desc', 'Pin description (≤ 500, no domain)', r.pin_desc, 500, 5)}
${ta('pin_topics', 'Tagged topics', r.pin_topics, 0, 2)}${ta('pin_board', 'Board', r.pin_board, 0, 1)}${ta('label', 'Label', r.label, 0, 1)}
<div class="cp"><label>Link</label><button type="button" class="btn sm alt" data-copy="${esc(link)}">Copy</button></div><input type="text" readonly value="${esc(link)}">
${edit ? '<p><button class="btn">Save texts</button></p>' : '<p class="muted">Only admin and writer can edit the texts.</p>'}</form>
<div class="box"><h2>Mark as wrong</h2><form method="post" action="${base}/bad" class="row">${csrfField(user)}<div><input type="text" name="note" maxlength="300" placeholder="What is wrong? (short note)" value="${esc(r.bad_note || '')}"></div>
<div class="fit"><button class="btn danger sm" name="op" value="set">Mark as wrong</button> ${inf.bad ? '<button class="btn alt sm" name="op" value="clear">Clear</button>' : ''}</div></form></div>
<script>function cnt(t){var c=document.querySelector('.cnt[data-for='+t.name+']');if(c)c.textContent=t.value.length+(t.dataset.max?'/'+t.dataset.max:'')}
document.querySelectorAll('textarea[name]').forEach(function(t){cnt(t);t.addEventListener('input',function(){cnt(t)})});
document.querySelectorAll('.cpy').forEach(function(b){b.onclick=function(){var t=document.querySelector('textarea[name='+b.dataset.for+']');navigator.clipboard.writeText(t.value);b.textContent='Copied ✓'}});
document.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied ✓'}});</script>`;
  return layout(`${a.title} #${n}`, body, user, 'social', req);
}

export async function socialAction(req, env, user, slug, n, action) {
  const base = `/dashboard/social/card/${encodeURIComponent(slug)}/${n}`;
  const f = await req.formData();
  if (!csrfOk(user, f, req)) return back(base, 'Session expired', 1);
  const r = await env.DB.prepare('SELECT * FROM social_cards WHERE slug=? AND n=?').bind(slug, n).first();
  if (!r) return back(base, 'Card not found', 1);
  const set = async (o) => { const k = Object.keys(o); await env.DB.prepare(`UPDATE social_cards SET ${k.map((x) => x + '=?').join(',')}, updated_at=? WHERE slug=? AND n=?`).bind(...k.map((x) => o[x]), now(), slug, n).run(); };
  if (action === 'post') {
    const pf = f.get('platform') === 'pin' ? 'pin' : 'fb';
    const log = jparse(r[pf + '_log'], []);
    if (f.get('op') === 'undo') log.shift(); else log.unshift(today());
    await set({ [pf + '_log']: JSON.stringify(log), [pf + '_posted_at']: log[0] || null });
    return back(base, f.get('op') === 'undo' ? 'Latest date removed' : 'Marked as posted');
  }
  if (action === 'bad') {
    if (f.get('op') === 'clear') await set({ bad_at: null, bad_note: null, bad_by: null });
    else await set({ bad_at: now(), bad_note: String(f.get('note') || '').slice(0, 300), bad_by: user.name });
    return back(base, f.get('op') === 'clear' ? 'Cleared' : 'Marked as wrong');
  }
  if (action === 'unbulk') {
    const log = jparse(r.pin_log, []); const d = (r.pin_bulk_date || '').slice(0, 10); const i = log.indexOf(d);
    if (i > -1) log.splice(i, 1);
    await set({ pin_bulk_at: null, pin_bulk_date: null, pin_bulk_file: null, pin_log: JSON.stringify(log), pin_posted_at: log[0] || null });
    return back(base, 'Bulk upload undone');
  }
  if (action === 'texts') {
    if (!canEditSocial(user)) return back(base, 'Not allowed', 1);
    const o = {};
    for (const [k, max] of [['fb_caption', 3000], ['fb_comment', 1000], ['pin_title', 100], ['pin_desc', 500], ['pin_topics', 300], ['pin_board', 120], ['label', 120]]) if (f.has(k)) o[k] = String(f.get(k)).slice(0, max);
    await set(o);
    return back(base, 'Texts saved');
  }
  return back(base, 'Unknown action', 1);
}

// ---------- bulk upload ----------
export async function bulkPage(req, env, user) {
  const { articles, cards } = await loadAll(env);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const groups = articles.map((a) => {
    const chips = Object.values(cards[a.slug] || {}).filter((c) => c.pin_image).map((c) => {
      const sent = !!c.pin_bulk_at;
      return `<label class="chip ${sent ? '' : ''}" style="${sent ? 'background:#ede9fe;border-color:#7c3aed;color:#5b21b6' : ''}"><input type="checkbox" name="pin" value="${esc(c.slug)}|${c.n}" ${sent ? 'disabled' : ''} class="pk"> ${c.n}${sent ? ' · sent' : ''}</label>`;
    }).join('');
    return chips ? `<div style="margin:.5rem 0"><b>${esc(a.title)}</b> <span class="muted">${esc(a.slug)}</span><div class="chips">${chips}</div></div>` : '';
  }).join('');
  const body = `<p><a href="/dashboard/social">← Board</a></p><h1>Pinterest bulk upload</h1>
<form method="post" action="/dashboard/social/bulk/download" class="box">${csrfField(user)}
<div class="row"><div><label>Publish day (UTC)</label><input type="date" name="day" value="${tomorrow}" required></div><div><label>From</label><input type="time" name="from" value="00:00"></div><div><label>To</label><input type="time" name="to" value="23:59"></div>
<div><label>Auto pick (unsent pins)</label><input type="number" id="auto" value="20" min="1" max="200"></div><div class="fit"><button type="button" class="btn alt" id="autob">Auto pick</button></div></div>
<p><b id="cnt">0</b> pins selected. <span class="muted">Pinterest accepts about 200 pins a day. Pins are spread evenly across the window. Pins already sent are never auto-picked.</span> <span id="warn" style="color:#b91c1c;font-weight:700"></span></p>
${groups || '<p class="muted">No cards with Pinterest images yet.</p>'}
<div class="savebar"><button class="btn" id="dl">Download CSV</button></div></form>
<script>var pk=[].slice.call(document.querySelectorAll('.pk:not(:disabled)'));function upd(){var n=pk.filter(function(c){return c.checked}).length;document.getElementById('cnt').textContent=n;document.getElementById('warn').textContent=n>200?'Too many: max 200 per file':'';document.getElementById('dl').disabled=n<1||n>200}
pk.forEach(function(c){c.onchange=upd});document.getElementById('autob').onclick=function(){var k=+document.getElementById('auto').value;pk.forEach(function(c){c.checked=false});pk.slice(0,k).forEach(function(c){c.checked=true});upd()};upd();</script>`;
  return layout('Pinterest bulk upload', body, user, 'social', req);
}

export async function bulkDownload(req, env, user) {
  const f = await req.formData();
  if (!csrfOk(user, f, req)) return back('/dashboard/social/bulk', 'Session expired', 1);
  const picks = f.getAll('pin').map(String).slice(0, 201);
  const day = String(f.get('day') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return back('/dashboard/social/bulk', 'Pick a publish day', 1);
  if (!picks.length || picks.length > 200) return back('/dashboard/social/bulk', 'Select between 1 and 200 pins', 1);
  const mins = (v, d) => { const m = /^(\d\d):(\d\d)$/.exec(String(v)); return m ? +m[1] * 60 + +m[2] : d; };
  const from = mins(f.get('from'), 0), to = Math.max(from, mins(f.get('to'), 1439));
  const origin = new URL(req.url).origin;
  const file = `pinterest-bulk-${day}.csv`;
  const rows = [['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords']];
  const arts = {};
  const used = [];
  for (let i = 0; i < picks.length; i++) {
    const [slug, ns] = picks[i].split('|'); const n = parseInt(ns, 10);
    const c = await env.DB.prepare('SELECT * FROM social_cards WHERE slug=? AND n=?').bind(slug, n).first();
    if (!c || !c.pin_image || c.pin_bulk_at) continue;
    used.push({ c });
  }
  if (used.length < 1) return back('/dashboard/social/bulk', 'No valid pins selected', 1);
  used.forEach((u, i) => {
    const m = used.length > 1 ? from + Math.round(i * (to - from) / (used.length - 1)) : from;
    u.when = `${day} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
    const c = u.c;
    rows.push([c.pin_title, absMedia(c.pin_image, origin), c.pin_board, '', c.pin_desc, articleUrl(c.slug), u.when, c.pin_topics]);
  });
  for (const { c, when } of used) {
    const log = jparse(c.pin_log, []); log.unshift(day);
    await env.DB.prepare('UPDATE social_cards SET pin_bulk_at=?, pin_bulk_date=?, pin_bulk_file=?, pin_log=?, pin_posted_at=?, updated_at=? WHERE slug=? AND n=?')
      .bind(now(), when, file, JSON.stringify(log), day, now(), c.slug, c.n).run();
  }
  return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${file}"` } });
}

// ---------- export ----------
export async function exportCsv(req, env) {
  const { articles, saMap, cards } = await loadAll(env);
  const rows = [['article', 'url', 'indexed', 'card', 'style', 'board', 'facebook posts', 'facebook dates', 'pinterest posts', 'pinterest dates', 'bulk file', 'bulk publish date', 'marked wrong', 'problem']];
  for (const a of articles) for (const c of Object.values(cards[a.slug] || {})) {
    const i = info(c);
    rows.push([a.title, articleUrl(a.slug), saMap[a.slug]?.indexed ? 'yes' : 'no', c.n, templateName(c.template || a.social_template || autoTemplate(a.slug)), c.pin_board, i.fb.length, i.fb.join(' '), i.pin.length, i.pin.join(' '), c.pin_bulk_file, c.pin_bulk_date, i.bad ? 'yes' : 'no', c.bad_note]);
  }
  return new Response('﻿' + csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="social-posting-log.csv"' } });
}

// ---------- template gallery ----------
export async function templateGallery(req, env, user) {
  const cells = TEMPLATES.map((t) => `<div class="box"><h2>${esc(t.name)} <span class="muted">${t.key}</span></h2><p class="muted">${esc(t.desc)}</p><div class="row" style="align-items:flex-start">
<div class="fr" style="width:200px;height:250px;flex:0 0 200px"><iframe loading="lazy" src="/dashboard/social/templates/sample?key=${t.key}&p=fb" style="width:1080px;height:1350px;transform:scale(.1852)"></iframe></div>
<div class="fr" style="width:200px;height:300px;flex:0 0 200px"><iframe loading="lazy" src="/dashboard/social/templates/sample?key=${t.key}&p=pin" style="width:1000px;height:1500px;transform:scale(.2)"></iframe></div></div><p class="muted">Facebook 1080×1350 · Pinterest 1000×1500</p></div>`).join('');
  return layout('Templates', `<p><a href="/dashboard/social">← Board</a></p><h1>Social image templates</h1><div class="gal">${cells}</div>`, user, 'social', req);
}

export function templateSample(req) {
  const u = new URL(req.url);
  const key = isTemplate(u.searchParams.get('key')) ? u.searchParams.get('key') : 'classic';
  return html(renderHtml({ key, platform: u.searchParams.get('p') === 'pin' ? 'pin' : 'fb', title: SAMPLE.title, photos: SAMPLE.photos, site: cfg, facts: SAMPLE.facts }), 200, { 'x-frame-options': 'SAMEORIGIN' });
}

// ---------- CLI: upsert card row (keeps edited texts unless retext) ----------
export async function cliUpsertCard(env, slug, n, body) {
  const old = await env.DB.prepare('SELECT * FROM social_cards WHERE slug=? AND n=?').bind(slug, n).first();
  const F = ['fb_image', 'pin_image', 'template'];
  const T = ['fb_caption', 'fb_comment', 'pin_title', 'pin_desc', 'label', 'pin_topics', 'pin_board'];
  const o = { slug, n, updated_at: now() };
  for (const k of F) if (body[k] !== undefined) o[k] = body[k];
  for (const k of T) if (body[k] !== undefined && (body.retext || !old || !old[k])) o[k] = String(body[k]);
  if (!old) await env.DB.prepare(`INSERT INTO social_cards(${Object.keys(o).join(',')}) VALUES(${Object.keys(o).map(() => '?').join(',')})`).bind(...Object.values(o)).run();
  else { const k = Object.keys(o).filter((x) => x !== 'slug' && x !== 'n'); await env.DB.prepare(`UPDATE social_cards SET ${k.map((x) => x + '=?').join(',')} WHERE slug=? AND n=?`).bind(...k.map((x) => o[x]), slug, n).run(); }
}
