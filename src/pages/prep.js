import cfg from '../../site.config.js';
import { esc, now, jparse, layout, html, back, csrfField, csrfOk, isAdmin, validImageUrl, articleUrl } from '../lib.js';
import { TEMPLATES, isTemplate, templateName, mockup } from '../templates.js';
import { buildPrompts, parsePrompts } from '../prompts.js';

export const STATUSES = ['new', 'filled', 'prompted', 'ready', 'published'];
const LABEL = { new: 'New', filled: 'Filled', prompted: 'Prompts ready', ready: 'Ready to write', published: 'Published' };
const RANK = { ready: 0, filled: 1, prompted: 2, new: 3, published: 4 };
const pill = (s) => `<span class="pill s-${s}">${LABEL[s] || s}</span>`;

// ---------- data helpers ----------
export function cleanImages(list) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (out.length >= 40) break;
    if (it && validImageUrl(it.url)) out.push({ url: it.url, caption: String(it.caption || '').slice(0, 200) });
  }
  return out;
}
export const cardImages = (c) => { const j = jparse(c.images_json, {}); return { original: cleanImages(j.original), generated: cleanImages(j.generated) }; };
export const promptCount = (text) => parsePrompts(text).length;

export function titleFromLine(line) {
  line = line.trim();
  if (!/^https?:\/\//i.test(line)) return { title: line.slice(0, 200), url: '' };
  let last = '';
  try { const p = new URL(line).pathname.split('/').filter(Boolean); last = decodeURIComponent(p[p.length - 1] || new URL(line).hostname); } catch { last = line; }
  last = last.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').trim();
  return { title: last.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 200), url: line.slice(0, 500) };
}

// Status rules, applied on every save. Can jump several steps at once.
export function nextStatus(card, user) {
  const imgs = cardImages(card);
  const stamp = {};
  let s = card.status || 'new';
  const t = now();
  if (s === 'new' && ((card.info_text || '').trim() || (card.title || '').trim()) && imgs.original.length >= 1) { s = 'filled'; stamp.filled_at = t; stamp.filled_by = user?.name || ''; }
  if (s === 'filled' && (card.prompts_text || '').trim()) { s = 'prompted'; stamp.prompted_at = t; }
  if (s === 'prompted' && imgs.generated.length >= Math.min(5, promptCount(card.prompts_text) || 5)) { s = 'ready'; stamp.ready_at = t; }
  return { status: s, stamp };
}

async function persist(env, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await env.DB.prepare(`UPDATE prep_cards SET ${keys.map((k) => k + '=?').join(',')}, updated_at=? WHERE id=?`).bind(...keys.map((k) => fields[k]), now(), id).run();
}

export async function createCards(env, user, lines, template, count) {
  const tpl = isTemplate(template) ? template : '';
  const n = Math.max(5, Math.min(10, parseInt(count, 10) || 8));
  let made = 0;
  for (const raw of lines.map((l) => l.trim()).filter(Boolean).slice(0, 100)) {
    const { title, url } = titleFromLine(raw);
    await env.DB.prepare('INSERT INTO prep_cards(kind,title,source_url,template,prompt_count,status,images_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind('patterns', title, url, tpl, n, 'new', '{}', user?.name || 'cli', now(), now()).run();
    made++;
  }
  return made;
}

// ---------- list ----------
export async function prepList(req, env, user) {
  const url = new URL(req.url);
  const f = STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const { results } = await env.DB.prepare('SELECT * FROM prep_cards ORDER BY updated_at DESC').all();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  results.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
  const rows = results.filter((c) => !f || c.status === f).sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const chips = [['', 'All', results.length], ...STATUSES.map((s) => [s, LABEL[s], counts[s]])]
    .map(([k, l, n]) => `<a class="chip ${f === k ? 'on' : ''}" href="/dashboard/prep${k ? '?status=' + k : ''}">${l} <b>${n}</b></a>`).join('');
  const admin = isAdmin(user) ? `<div class="box"><h2>New project cards</h2><form method="post" action="/dashboard/prep/create">${csrfField(user)}
<label>One project per line (a URL on a line works too — the title is made from its last path part)</label>
<textarea name="lines" rows="4" placeholder="Chunky Granny Square Cardigan&#10;https://example.com/free-bunny-pattern/"></textarea>
<div class="row"><div><label>Social template</label><select name="template"><option value="">Let the editor choose</option>${TEMPLATES.map((t) => `<option value="${t.key}">${esc(t.name)}</option>`).join('')}</select></div>
<div><label>Images per article</label><select name="count">${[5, 6, 7, 8, 9, 10].map((n) => `<option ${n === 8 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
<div class="fit"><button class="btn">Create cards</button></div></div></form></div>` : '';
  const trs = rows.map((c) => {
    const im = cardImages(c); const th = (im.original[0] || im.generated[0] || {}).url;
    return `<tr><td>${th ? `<img class="thumb" src="${esc(th)}" alt="">` : '<div class="thumb"></div>'}</td>
<td><a href="/dashboard/prep/${c.id}"><b>${esc(c.title || '(untitled)')}</b></a><div class="muted">#${c.id}${c.template ? ' · template: ' + esc(templateName(c.template)) : ''}</div></td>
<td>${pill(c.status)}</td><td class="muted">Originals ${im.original.length} · Prompts ${promptCount(c.prompts_text)} · Generated ${im.generated.length}</td>
<td>${esc(c.filled_by || '')}</td><td>${c.article_slug ? `<a href="${esc(articleUrl(c.article_slug))}" rel="nofollow" target="_blank">${esc(c.article_slug)}</a>` : ''}</td>
<td class="muted">${esc((c.updated_at || '').slice(0, 10))}</td><td><a class="btn sm alt" href="/dashboard/prep/${c.id}">Open</a></td></tr>`;
  }).join('');
  return layout('Pattern prep', `<h1>Pattern prep</h1>${admin}<div class="chips">${chips}</div>
<div class="box tw"><table><tr><th></th><th>Project</th><th>Status</th><th>Progress</th><th>Filled by</th><th>Article</th><th>Updated</th><th></th></tr>${trs || '<tr><td colspan="8" class="muted">No cards.</td></tr>'}</table></div>`, user, 'prep', req);
}

export async function prepCreate(req, env, user) {
  const f = await req.formData();
  if (!csrfOk(user, f, req) || !isAdmin(user)) return back('/dashboard/prep', 'Not allowed', 1);
  const made = await createCards(env, user, String(f.get('lines') || '').split(/\r?\n/), f.get('template'), f.get('count'));
  return back('/dashboard/prep', made ? `Created ${made} card${made > 1 ? 's' : ''}` : 'Nothing to create', !made);
}

// ---------- card page ----------
const STEPS = ['Original photos', 'Pattern info', 'Template', 'Image prompts', 'Generated images'];

function todo(c, user) {
  const admin = isAdmin(user);
  const T = {
    new: 'Upload the original photos in step 1, paste the pattern details in step 2, choose the social template in step 3, then press Save card.',
    filled: admin ? 'Choose how many images (5–10) in step 4 and press Generate prompts.' : 'Nothing to do for now. The admin is preparing the image prompts.',
    prompted: 'For each prompt: open Google Flow or ChatGPT, ATTACH the best original photo (download it in step 1), paste the prompt, generate, check it is the SAME project (same stitches, colours, shape), then upload the results in step 5 IN PROMPT ORDER and press Save card.',
    ready: 'Done on your side. The writer is turning this card into an article.',
    published: 'Published. This card is finished.',
  };
  return T[c.status] || '';
}

const PLACEHOLDER = `Skill level: Easy
Yarn: Worsted weight (#4) acrylic — 3 skeins, colours: cream, sage, mustard
Hook: 5 mm (H-8)
Other materials: yarn needle, stitch markers, 6 buttons
Gauge: 14 sts x 8 rows = 4 in in dc
Finished size: S–XL (chest 36–52 in)
Abbreviations (US terms): ch, sc, dc, sl st …
Instructions:
Round 1: …
Round 2: …
Assembly / finishing: …
Time: about 8 hours
Notes: …`;

export async function prepCard(req, env, user, id) {
  const c = await env.DB.prepare('SELECT * FROM prep_cards WHERE id=?').bind(id).first();
  if (!c) return layout('Not found', '<h1>Card not found</h1>', user, 'prep', req);
  const im = cardImages(c);
  const admin = isAdmin(user);
  const prompts = parsePrompts(c.prompts_text);
  const done = [im.original.length >= 1, !!((c.info_text || '').trim() || (c.title || '').trim()), !!c.template, prompts.length > 0, im.generated.length >= Math.min(5, prompts.length || 5) && prompts.length > 0];
  const cur = done.indexOf(false);
  const stepper = STEPS.map((s, i) => `<span class="step ${done[i] ? 'done' : i === cur ? 'cur' : ''}">${done[i] ? '✓ ' : ''}${i + 1}. ${s}</span>`).join('');
  const tpls = TEMPLATES.map((t) => `<label class="tpl ${c.template === t.key ? 'on' : ''}"><input type="radio" name="template" value="${t.key}" ${c.template === t.key ? 'checked' : ''}><div class="mock">${mockup(t.key)}</div><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></label>`).join('');
  const prm = prompts.map((p, i) => `<div class="prm" data-i="${i}"><div><b>${i + 1}.</b> <b>${esc(p.name)}</b><span style="flex:1"></span><button type="button" class="btn sm alt copy">Copy</button></div><pre>${esc(p.text)}</pre></div>`).join('');
  const body = `<p><a href="/dashboard/prep">← All cards</a></p>
<div class="box"><div class="row"><div><h1>Pattern card #${c.id} ${pill(c.status)}</h1><div class="muted">Created ${esc((c.created_at || '').slice(0, 10))}${c.filled_by ? ' · filled by ' + esc(c.filled_by) : ''}</div></div></div>
${c.source_url ? `<p>Source: <input type="text" readonly value="${esc(c.source_url)}" onclick="this.select()" style="max-width:420px"> <a href="${esc(c.source_url)}" target="_blank" rel="nofollow noopener">Open source ↗</a></p>` : ''}
${c.article_slug ? `<p>Published: <a href="${esc(articleUrl(c.article_slug))}" target="_blank" rel="nofollow">${esc(c.article_slug)}</a></p>` : ''}
<div class="stepper">${stepper}</div><div class="todo"><b>What to do now:</b> ${esc(todo(c, user))}</div></div>
<form method="post" action="/dashboard/prep/${c.id}/save" id="cardform">${csrfField(user)}
<input type="hidden" name="original_json" id="original_json"><input type="hidden" name="generated_json" id="generated_json">
<div class="box"><h2>1 · Original photos of the finished project</h2><div class="drop" data-g="original">Drop photos here or click to upload (JPG/PNG/WebP/AVIF, up to ${cfg.uploadMaxMB} MB each)<input type="file" accept="image/*" multiple hidden></div><div class="tiles" id="tiles-original"></div></div>
<div class="box"><h2>2 · Pattern information</h2>
<label>Project name</label><input type="text" name="title" value="${esc(c.title)}" maxlength="200">
<label>Pattern details</label><textarea class="mono" name="info_text" rows="16" placeholder="${esc(PLACEHOLDER)}">${esc(c.info_text)}</textarea>
<div class="row"><div><label>Source link (optional)</label><input type="url" name="source_url" value="${esc(c.source_url)}"></div></div>
<label>Notes for the writer (optional)</label><textarea name="notes" rows="3">${esc(c.notes)}</textarea></div>
<div class="box"><h2>3 · Social image template</h2><div class="tpls">${tpls}</div><p><a href="/dashboard/social/templates" target="_blank">Open the full template gallery ↗</a></p></div>
<div class="box"><h2>4 · Image prompts</h2>
${prm || '<p class="muted">No prompts yet.</p>'}${prm ? '<p class="muted"><a href="#" id="resetcopy">reset copied marks</a></p>' : ''}
${admin ? `<div class="row"><div><label>Images for this article</label><select name="prompt_count">${[5, 6, 7, 8, 9, 10].map((n) => `<option ${n === (c.prompt_count || 8) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
<div class="fit"><button class="btn" name="act" value="genprompts" id="genbtn" ${!(c.title || c.info_text) ? 'disabled' : ''}>✨ ${prompts.length ? 'Regenerate' : 'Generate'} prompts</button></div></div>` : ''}</div>
<div class="box"><h2>5 · Generated images</h2><p class="muted">Upload in prompt order. The caption is the prompt title.</p><div class="drop" data-g="generated">Drop generated images here or click to upload<input type="file" accept="image/*" multiple hidden></div><div class="tiles" id="tiles-generated"></div></div>
${admin ? `<div class="box"><details><summary>Writer / admin tools</summary><label>Prompts text (## Shot name, then the prompt, blank line between)</label><textarea class="mono" name="prompts_text" rows="12">${esc(c.prompts_text)}</textarea>
<div class="row"><div><label>Status override</label><select name="status_override"><option value="">(automatic)</option>${STATUSES.map((s) => `<option value="${s}">${LABEL[s]}</option>`).join('')}</select></div>
<div><label>Published article slug</label><input type="text" name="article_slug" value="${esc(c.article_slug)}"></div></div></details></div>` : ''}
<div class="savebar"><button class="btn" name="act" value="save">Save card</button><a class="btn alt" href="/dashboard/prep">Back to list</a></div></form>
${admin ? `<form method="post" action="/dashboard/prep/${c.id}/delete" onsubmit="return confirm('Delete this card for good?')" class="box">${csrfField(user)}<button class="btn danger sm">Delete card</button></form>` : ''}
<script>window.CARD=${JSON.stringify({ id: c.id, csrf: user.csrf, original: im.original, generated: im.generated }).replace(/</g, '\\u003c')};${CLIENT}</script>`;
  return layout(`Card #${c.id}`, body, user, 'prep', req);
}

const CLIENT = `
(function(){
var S=window.CARD,form=document.getElementById('cardform');
function sync(){document.getElementById('original_json').value=JSON.stringify(S.original);document.getElementById('generated_json').value=JSON.stringify(S.generated);}
function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function render(g){var box=document.getElementById('tiles-'+g),a=S[g];box.innerHTML=a.map(function(it,i){return '<div class="tile"><img src="'+esc(it.url)+'" alt="" loading="lazy"><div class="n">'+(i+1)+'</div><div class="acts"><button type="button" data-a="up" data-i="'+i+'">↑</button><button type="button" data-a="dn" data-i="'+i+'">↓</button><button type="button" data-a="rm" data-i="'+i+'">✕</button><a href="'+esc(it.url)+'" target="_blank">Full size</a>'+(g==='original'?'<button type="button" data-a="jpg" data-i="'+i+'">Download JPG</button>':'')+'</div><input type="text" maxlength="200" placeholder="Caption" value="'+esc(it.caption)+'" data-a="cap" data-i="'+i+'"></div>'}).join('');sync();}
['original','generated'].forEach(function(g){
 render(g);var box=document.getElementById('tiles-'+g);
 box.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b||b.tagName==='INPUT')return;var i=+b.dataset.i,a=S[g],x=b.dataset.a;
  if(x==='rm')a.splice(i,1);else if(x==='up'&&i>0){var t=a[i];a[i]=a[i-1];a[i-1]=t}else if(x==='dn'&&i<a.length-1){var t2=a[i];a[i]=a[i+1];a[i+1]=t2}
  else if(x==='jpg'){toJpg(a[i].url,'original-'+(i+1)+'.jpg');return}
  render(g)});
 box.addEventListener('input',function(e){var b=e.target;if(b.dataset.a==='cap'){S[g][+b.dataset.i].caption=b.value;sync()}});
 var drop=document.querySelector('.drop[data-g='+g+']'),inp=drop.querySelector('input');
 drop.addEventListener('click',function(){inp.click()});
 drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('over')});drop.addEventListener('dragleave',function(){drop.classList.remove('over')});
 drop.addEventListener('drop',function(e){e.preventDefault();drop.classList.remove('over');up(g,e.dataTransfer.files,drop)});
 inp.addEventListener('change',function(){up(g,inp.files,drop);inp.value=''});
});
async function up(g,files,drop){var old=drop.firstChild.textContent;
 for(var i=0;i<files.length;i++){var f=files[i];drop.firstChild.textContent='Uploading '+(i+1)+'/'+files.length+'…';
  var fd=new FormData();fd.append('file',f);fd.append('card',S.id);
  try{var r=await fetch('/api/upload',{method:'POST',headers:{'x-csrf':S.csrf},body:fd});var j=await r.json();if(!r.ok)throw new Error(j.error||'upload failed');
   var cap=g==='generated'?(promptTitle(S.generated.length)||''):'';S[g].push({url:j.url,caption:cap});render(g)}catch(err){alert(f.name+': '+err.message)}}
 drop.firstChild.textContent=old}
function promptTitle(i){var p=document.querySelectorAll('.prm b:nth-of-type(2)');return p[i]?p[i].textContent:''}
function toJpg(url,name){var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0);c.toBlob(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},2000)},'image/jpeg',0.92)};im.onerror=function(){alert('Could not convert this image')};im.src=url}
// copy buttons, remembered per card
var key='prep-copied-'+S.id,seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){}
function mark(){document.querySelectorAll('.prm').forEach(function(p){var on=seen.indexOf(+p.dataset.i)>-1;p.classList.toggle('copied',on);p.querySelector('.copy').textContent=on?'Copied ✓':'Copy'})}
document.querySelectorAll('.prm .copy').forEach(function(b){b.addEventListener('click',function(){var p=b.closest('.prm'),i=+p.dataset.i,t=p.querySelector('pre').textContent;
 (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(function(){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()});
 if(seen.indexOf(i)<0)seen.push(i);try{localStorage.setItem(key,JSON.stringify(seen))}catch(e){}mark()})});
var rs=document.getElementById('resetcopy');if(rs)rs.addEventListener('click',function(e){e.preventDefault();seen=[];try{localStorage.removeItem(key)}catch(x){}mark()});
mark();
var tp=document.querySelectorAll('.tpl input');tp.forEach(function(r){r.addEventListener('change',function(){document.querySelectorAll('.tpl').forEach(function(l){l.classList.toggle('on',l.querySelector('input').checked)})})});
})();`;

// ---------- save / delete ----------
export async function prepSave(req, env, user, id) {
  const f = await req.formData();
  if (!csrfOk(user, f, req)) return back(`/dashboard/prep/${id}`, 'Session expired, reload the page', 1);
  const c = await env.DB.prepare('SELECT * FROM prep_cards WHERE id=?').bind(id).first();
  if (!c) return back('/dashboard/prep', 'Card not found', 1);
  const admin = isAdmin(user);
  const act = f.get('act');
  const g = (k) => String(f.get(k) ?? '');
  const next = { ...c };
  next.title = g('title').trim().slice(0, 200);
  next.info_text = g('info_text').slice(0, 60000);
  next.notes = g('notes').slice(0, 5000);
  const src = g('source_url').trim().slice(0, 500);
  next.source_url = /^https?:\/\//i.test(src) || !src ? src : c.source_url;
  next.template = isTemplate(g('template')) ? g('template') : c.template;
  next.images_json = JSON.stringify({ original: cleanImages(jparse(g('original_json'), [])), generated: cleanImages(jparse(g('generated_json'), [])) });
  if (admin) {
    if (f.has('prompts_text')) next.prompts_text = g('prompts_text').slice(0, 60000);
    if (f.has('prompt_count')) next.prompt_count = Math.max(5, Math.min(10, parseInt(g('prompt_count'), 10) || 8));
    if (f.has('article_slug')) next.article_slug = g('article_slug').trim().replace(/[^a-z0-9-]/gi, '').slice(0, 120);
  }
  let genNote = '';
  if (act === 'genprompts' && admin) {
    if (!next.title && !next.info_text.trim()) return back(`/dashboard/prep/${id}`, 'Add a title or pattern details first', 1);
    next.prompts_text = buildPrompts(next.title, next.info_text, next.prompt_count);
    genNote = `Generated ${next.prompt_count} prompts. `;
  }
  const { status, stamp } = nextStatus(next, user);
  next.status = status;
  if (admin && next.article_slug && !c.article_slug && next.status !== 'published') next.status = 'published';
  const ov = g('status_override');
  if (admin && STATUSES.includes(ov)) next.status = ov;
  const cols = ['title', 'info_text', 'notes', 'source_url', 'template', 'images_json', 'prompts_text', 'prompt_count', 'article_slug', 'status'];
  const fields = Object.fromEntries(cols.filter((k) => next[k] !== c[k]).map((k) => [k, next[k]]));
  Object.assign(fields, stamp);
  await persist(env, id, fields);
  const im = cardImages(next);
  let msg;
  if (next.status !== c.status) msg = `Saved — status is now ${LABEL[next.status]}`;
  else if (next.status === 'new') {
    const miss = [];
    if (!next.info_text.trim() && !next.title) miss.push('the pattern information');
    if (!im.original.length) miss.push('at least one original photo');
    msg = miss.length ? `Saved. Still missing: ${miss.join(', ')}` : 'Saved';
  } else if (next.status === 'prompted') msg = `Saved — ${im.generated.length} generated images so far`;
  else msg = `Saved — status is ${LABEL[next.status]}`;
  return back(`/dashboard/prep/${id}`, genNote + msg);
}

export async function prepDelete(req, env, user, id) {
  const f = await req.formData();
  if (!csrfOk(user, f, req) || !isAdmin(user)) return back('/dashboard/prep', 'Not allowed', 1);
  await env.DB.prepare('DELETE FROM prep_cards WHERE id=?').bind(id).run();
  return back('/dashboard/prep', 'Card deleted');
}

// CLI helpers
export async function cliSetPrompts(env, id, text, n) {
  const c = await env.DB.prepare('SELECT * FROM prep_cards WHERE id=?').bind(id).first();
  if (!c) return null;
  const next = { ...c, prompts_text: text ?? buildPrompts(c.title, c.info_text, n || c.prompt_count || 8), prompt_count: n || c.prompt_count };
  const { status, stamp } = nextStatus(next, null);
  await persist(env, id, { prompts_text: next.prompts_text, prompt_count: next.prompt_count, status, ...stamp });
  return { status, prompts: promptCount(next.prompts_text) };
}
export async function cliSetStatus(env, id, status, slug) {
  if (!STATUSES.includes(status)) return null;
  const f = { status };
  if (slug) { f.article_slug = slug; if (status === 'new') f.status = 'published'; }
  await persist(env, id, f);
  return { status: f.status };
}
