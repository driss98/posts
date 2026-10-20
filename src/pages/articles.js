import { esc, now, jparse, layout, back, csrfField, csrfOk, canEditSocial, articleUrl, validImageUrl, hashPassword, isAdmin } from '../lib.js';
import { TEMPLATES, isTemplate, autoTemplate, templateName } from '../templates.js';
import { detectType } from '../prompts.js';

export async function upsertArticle(env, a) {
  const slug = String(a.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120);
  if (!slug) throw new Error('slug required');
  const imgs = (Array.isArray(a.images) ? a.images : jparse(a.images_json, [])).filter((i) => i && validImageUrl(i.url)).map((i) => ({ url: i.url, alt: String(i.alt || '').slice(0, 200) }));
  const old = await env.DB.prepare('SELECT * FROM articles WHERE slug=?').bind(slug).first();
  const v = {
    title: String(a.title ?? old?.title ?? slug).slice(0, 200), description: String(a.description ?? old?.description ?? '').slice(0, 600),
    type: String(a.type ?? old?.type ?? '') || detectType(a.title ?? old?.title ?? slug), skill: String(a.skill ?? old?.skill ?? '').slice(0, 60),
    yarn: String(a.yarn ?? old?.yarn ?? '').slice(0, 120), hook: String(a.hook ?? old?.hook ?? '').slice(0, 60), time: String(a.time ?? old?.time ?? '').slice(0, 60),
    images_json: JSON.stringify(a.images || a.images_json ? imgs : jparse(old?.images_json, [])),
    social_template: isTemplate(a.social_template) ? a.social_template : (a.social_template === '' ? '' : old?.social_template || ''),
    published_at: String(a.published_at || old?.published_at || now()).slice(0, 30),
  };
  if (old) await env.DB.prepare('UPDATE articles SET title=?,description=?,type=?,skill=?,yarn=?,hook=?,time=?,images_json=?,social_template=?,published_at=?,updated_at=? WHERE slug=?')
    .bind(v.title, v.description, v.type, v.skill, v.yarn, v.hook, v.time, v.images_json, v.social_template, v.published_at, now(), slug).run();
  else await env.DB.prepare('INSERT INTO articles(slug,title,description,type,skill,yarn,hook,time,images_json,social_template,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(slug, v.title, v.description, v.type, v.skill, v.yarn, v.hook, v.time, v.images_json, v.social_template, v.published_at, now()).run();
  return slug;
}

export async function articlesList(req, env, user) {
  const { results } = await env.DB.prepare('SELECT * FROM articles ORDER BY published_at DESC').all();
  const trs = results.map((a) => `<tr><td><a href="/dashboard/articles/${encodeURIComponent(a.slug)}"><b>${esc(a.title)}</b></a><div class="muted">${esc(a.slug)}</div></td><td>${esc(a.type)}</td><td>${jparse(a.images_json, []).length}</td><td>${esc(templateName(a.social_template) || 'auto: ' + templateName(autoTemplate(a.slug)))}</td><td class="muted">${esc((a.published_at || '').slice(0, 10))}</td></tr>`).join('');
  return layout('Articles', `<h1>Articles</h1><p class="muted">The published articles the social board works from. The writer normally adds them with <code>tools/prep-cards.mjs</code> / the API; you can also edit them here. Image 1 is the hero.</p>
${canEditSocial(user) ? '<p><a class="btn" href="/dashboard/articles/new">New article</a></p>' : ''}<div class="box tw"><table><tr><th>Article</th><th>Type</th><th>Images</th><th>Social template</th><th>Published</th></tr>${trs || '<tr><td colspan="5" class="muted">No articles yet.</td></tr>'}</table></div>`, user, 'articles', req);
}

export async function articleForm(req, env, user, slug) {
  const a = slug === 'new' ? { images_json: '[]' } : await env.DB.prepare('SELECT * FROM articles WHERE slug=?').bind(slug).first();
  if (!a) return layout('Not found', '<h1>Article not found</h1>', user, 'articles', req);
  const edit = canEditSocial(user), d = edit ? '' : 'disabled';
  const imgs = jparse(a.images_json, []).map((i) => `${i.url} | ${i.alt || ''}`).join('\n');
  const inp = (n, l, v) => `<div><label>${l}</label><input type="text" name="${n}" value="${esc(v)}" ${d}></div>`;
  const body = `<p><a href="/dashboard/articles">← Articles</a>${a.slug ? ` · <a href="${esc(articleUrl(a.slug))}" target="_blank" rel="nofollow">Open ↗</a>` : ''}</p><h1>${a.slug ? esc(a.title) : 'New article'}</h1>
<form method="post" action="/dashboard/articles/save" class="box">${csrfField(user)}
<div class="row">${a.slug ? `<input type="hidden" name="slug" value="${esc(a.slug)}"><div><label>Slug</label><input type="text" value="${esc(a.slug)}" disabled></div>` : inp('slug', 'Slug (lowercase-with-dashes)', '')}${inp('title', 'Title', a.title)}</div>
<label>Description</label><textarea name="description" rows="2" ${d}>${esc(a.description)}</textarea>
<div class="row">${inp('type', 'Type (amigurumi, blanket, wearable, bag, home, baby, seasonal, square)', a.type)}${inp('skill', 'Skill level', a.skill)}${inp('yarn', 'Yarn weight', a.yarn)}${inp('hook', 'Hook', a.hook)}${inp('time', 'Time', a.time)}</div>
<label>Article images, one per line: <code>/images/file.jpg | alt text</code> (first = hero)</label><textarea class="mono" name="images" rows="8" ${d}>${esc(imgs)}</textarea>
<div class="row"><div><label>Social template</label><select name="social_template" ${d}><option value="">Automatic (${esc(a.slug ? templateName(autoTemplate(a.slug)) : 'by slug')})</option>${TEMPLATES.map((t) => `<option value="${t.key}" ${a.social_template === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
<div><label>Published date</label><input type="date" name="published_at" value="${esc((a.published_at || new Date().toISOString()).slice(0, 10))}" ${d}></div></div>
${edit ? '<p><button class="btn">Save article</button></p>' : ''}</form>
${edit && a.slug && isAdmin(user) ? `<form method="post" action="/dashboard/articles/delete" class="box" onsubmit="return confirm('Delete this article and its social cards?')">${csrfField(user)}<input type="hidden" name="slug" value="${esc(a.slug)}"><button class="btn danger sm">Delete article</button></form>` : ''}`;
  return layout(a.title || 'New article', body, user, 'articles', req);
}

export async function articleSave(req, env, user) {
  const f = await req.formData();
  if (!csrfOk(user, f, req) || !canEditSocial(user)) return back('/dashboard/articles', 'Not allowed', 1);
  const images = String(f.get('images') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [u, ...r] = l.split('|'); return { url: u.trim(), alt: r.join('|').trim() }; });
  try {
    const slug = await upsertArticle(env, { slug: f.get('slug'), title: f.get('title'), description: f.get('description'), type: f.get('type'), skill: f.get('skill'), yarn: f.get('yarn'), hook: f.get('hook'), time: f.get('time'), images, social_template: f.get('social_template') || '', published_at: f.get('published_at') });
    return back(`/dashboard/articles/${slug}`, 'Article saved');
  } catch (e) { return back('/dashboard/articles', e.message, 1); }
}

export async function articleDelete(req, env, user) {
  const f = await req.formData();
  if (!csrfOk(user, f, req) || !isAdmin(user)) return back('/dashboard/articles', 'Not allowed', 1);
  const slug = String(f.get('slug'));
  await env.DB.batch([env.DB.prepare('DELETE FROM articles WHERE slug=?').bind(slug), env.DB.prepare('DELETE FROM social_cards WHERE slug=?').bind(slug), env.DB.prepare('DELETE FROM social_articles WHERE slug=?').bind(slug)]);
  return back('/dashboard/articles', 'Article deleted');
}

// ---------- users ----------
export async function usersPage(req, env, user) {
  const { results } = await env.DB.prepare('SELECT id,email,name,role FROM users ORDER BY id').all();
  const trs = results.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.id === user.id ? '' : `<form method="post" action="/dashboard/users/delete" class="inl" onsubmit="return confirm('Delete user?')">${csrfField(user)}<input type="hidden" name="id" value="${u.id}"><button class="btn danger sm">Delete</button></form>`}</td></tr>`).join('');
  return layout('Users', `<h1>Users</h1><div class="box tw"><table><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>${trs}</table></div>
<form method="post" action="/dashboard/users/add" class="box"><h2>Add a user</h2>${csrfField(user)}<div class="row"><div><label>Name</label><input type="text" name="name" required></div><div><label>Email</label><input type="email" name="email" required></div>
<div><label>Role</label><select name="role"><option value="editor">Editor (employee)</option><option value="writer">Writer</option><option value="admin">Admin / owner</option></select></div><div><label>Password (min 10)</label><input type="password" name="password" minlength="10" required></div><div class="fit"><button class="btn">Add</button></div></div></form>`, user, 'users', req);
}
export async function usersAdd(req, env, user) {
  const f = await req.formData();
  if (!csrfOk(user, f, req) || !isAdmin(user)) return back('/dashboard/users', 'Not allowed', 1);
  const pw = String(f.get('password') || ''), email = String(f.get('email') || '').trim().toLowerCase();
  if (pw.length < 10 || !email) return back('/dashboard/users', 'Email and a password of at least 10 characters are required', 1);
  const role = ['admin', 'editor', 'writer'].includes(f.get('role')) ? f.get('role') : 'editor';
  const { salt, hash } = await hashPassword(pw);
  try { await env.DB.prepare('INSERT INTO users(email,name,role,pass_hash,salt,created_at) VALUES(?,?,?,?,?,?)').bind(email, String(f.get('name') || email).slice(0, 80), role, hash, salt, now()).run(); }
  catch { return back('/dashboard/users', 'That email already exists', 1); }
  return back('/dashboard/users', 'User added');
}
export async function usersDelete(req, env, user) {
  const f = await req.formData();
  if (!csrfOk(user, f, req) || !isAdmin(user)) return back('/dashboard/users', 'Not allowed', 1);
  const id = parseInt(f.get('id'), 10);
  if (id !== user.id) { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run(); await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run(); }
  return back('/dashboard/users', 'User deleted');
}
