import cfg from '../site.config.js';
import { esc, now, jparse, json, redirect, html, layout, getUser, startSession, checkPassword, hashPassword, csrfOk, csrfField, isAdmin, rand, validImageUrl, articleUrl } from './lib.js';
import { prepList, prepCreate, prepCard, prepSave, prepDelete, createCards, cardImages, cliSetPrompts, cliSetStatus, promptCount } from './pages/prep.js';
import { socialBoard, setIndexed, socialCard, socialAction, bulkPage, bulkDownload, exportCsv, templateGallery, templateSample, cliUpsertCard, articleImages } from './pages/social.js';
import { articlesList, articleForm, articleSave, articleDelete, usersPage, usersAdd, usersDelete, upsertArticle } from './pages/articles.js';
import { autoTemplate, isTemplate } from './templates.js';

const EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
const extOf = (n) => (String(n).split('.').pop() || '').toLowerCase();

async function loginPage(req, env, msg, err) {
  const first = !(await env.DB.prepare('SELECT 1 x FROM users LIMIT 1').first());
  const body = `<div class="box" style="max-width:420px;margin:2rem auto"><h1>${first ? 'Create the first admin' : 'Log in'}</h1>
<form method="post" action="${first ? '/setup' : '/login'}">${first ? `<label>Name</label><input type="text" name="name" required>` : ''}
<label>Email</label><input type="email" name="email" required><label>Password${first ? ' (min 10 characters)' : ''}</label><input type="password" name="password" required ${first ? 'minlength="10"' : ''}>
${first && env.SETUP_KEY ? '<label>Setup key</label><input type="password" name="setup_key" required>' : ''}<p><button class="btn">${first ? 'Create admin' : 'Log in'}</button></p></form></div>`;
  const r = layout('Log in', body, null, '', req);
  return err ? new Response(r.body, { status: 401, headers: r.headers }) : r;
}

const CLI_OK = (req, env) => env.CLI_TOKEN && req.headers.get('authorization') === `Bearer ${env.CLI_TOKEN}`;

async function cli(req, env, url, path) {
  if (!CLI_OK(req, env)) return json({ error: 'unauthorized' }, 401);
  const m = req.method;
  const origin = url.origin;
  let x;
  if (path === '/api/cli/ping') return json({ ok: true, siteId: cfg.siteId, siteName: cfg.siteName, siteUrl: cfg.siteUrl, mediaBase: cfg.mediaBase || origin, boards: cfg.boards, topicsByType: cfg.topicsByType, brand: cfg.brand });
  if (path === '/api/cli/upload' && m === 'PUT') {
    const key = url.searchParams.get('key') || '';
    if (!/^(images|media)\/[\w\-\/.]+$/.test(key) || key.includes('..') || !EXT[extOf(key)]) return json({ error: 'bad key' }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > cfg.uploadMaxMB * 1048576) return json({ error: 'too large' }, 413);
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: EXT[extOf(key)] } });
    return json({ url: '/' + key });
  }
  if (path === '/api/cli/prep' && m === 'GET') {
    const st = url.searchParams.get('status');
    const { results } = await env.DB.prepare('SELECT * FROM prep_cards ORDER BY id').all();
    return json(results.filter((c) => !st || c.status === st).map((c) => { const i = cardImages(c); return { id: c.id, title: c.title, status: c.status, template: c.template, article_slug: c.article_slug, originals: i.original.length, prompts: promptCount(c.prompts_text), generated: i.generated.length }; }));
  }
  if (path === '/api/cli/prep' && m === 'POST') {
    const b = await req.json();
    return json({ created: await createCards(env, { name: 'cli' }, b.titles || [], b.template, b.count) });
  }
  if ((x = path.match(/^\/api\/cli\/prep\/(\d+)$/)) && m === 'GET') {
    const c = await env.DB.prepare('SELECT * FROM prep_cards WHERE id=?').bind(x[1]).first();
    if (!c) return json({ error: 'not found' }, 404);
    return json({ ...c, images: cardImages(c), images_json: undefined });
  }
  if ((x = path.match(/^\/api\/cli\/prep\/(\d+)\/prompts$/)) && m === 'POST') {
    const b = await req.json();
    const r = await cliSetPrompts(env, x[1], b.text, b.n);
    return r ? json(r) : json({ error: 'not found' }, 404);
  }
  if ((x = path.match(/^\/api\/cli\/prep\/(\d+)\/status$/)) && m === 'POST') {
    const b = await req.json();
    const r = await cliSetStatus(env, x[1], b.status, b.slug);
    return r ? json(r) : json({ error: 'bad status' }, 400);
  }
  if (path === '/api/cli/articles' && m === 'GET') return json((await env.DB.prepare('SELECT slug,title,published_at FROM articles ORDER BY published_at DESC').all()).results);
  if (path === '/api/cli/articles' && m === 'POST') {
    try { return json({ slug: await upsertArticle(env, await req.json()) }); } catch (e) { return json({ error: e.message }, 400); }
  }
  if ((x = path.match(/^\/api\/cli\/articles\/([\w-]+)$/)) && m === 'GET') {
    const a = await env.DB.prepare('SELECT * FROM articles WHERE slug=?').bind(x[1]).first();
    if (!a) return json({ error: 'not found' }, 404);
    return json({ ...a, images: articleImages(a), images_json: undefined, template: isTemplate(a.social_template) ? a.social_template : autoTemplate(a.slug), url: articleUrl(a.slug) });
  }
  if ((x = path.match(/^\/api\/cli\/social\/([\w-]+)\/(\d+)$/)) && m === 'POST') {
    await cliUpsertCard(env, x[1], parseInt(x[2], 10), await req.json());
    return json({ ok: true });
  }
  if ((x = path.match(/^\/api\/cli\/social\/([\w-]+)$/)) && m === 'GET') return json((await env.DB.prepare('SELECT * FROM social_cards WHERE slug=? ORDER BY n').bind(x[1]).all()).results);
  return json({ error: 'not found' }, 404);
}

async function upload(req, env, user) {
  if (!user || !csrfOk(user, null, req)) return json({ error: 'Not allowed' }, 403);
  const f = await req.formData();
  const file = f.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No file' }, 400);
  const ext = extOf(file.name);
  if (!EXT[ext]) return json({ error: 'Only JPG, PNG, WebP, AVIF or GIF images' }, 400);
  if (file.size > cfg.uploadMaxMB * 1048576) return json({ error: `File is over ${cfg.uploadMaxMB} MB` }, 413);
  const card = parseInt(f.get('card'), 10) || 0;
  const key = `media/prep/${card}/${rand(12).toLowerCase()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: EXT[ext] } });
  return json({ url: '/' + key });
}

async function media(env, path, req) {
  const key = decodeURIComponent(path.slice(1));
  if (key.includes('..') || !EXT[extOf(key)]) return new Response('Not found', { status: 404 });
  const o = await env.MEDIA.get(key);
  if (!o) return new Response('Not found', { status: 404 });
  return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || EXT[extOf(key)], 'cache-control': 'public, max-age=300', etag: o.httpEtag } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const m = req.method;
    try {
      if (path.startsWith('/api/cli/')) return await cli(req, env, url, path);
      if ((path.startsWith('/media/') || path.startsWith('/images/')) && m === 'GET') return await media(env, path, req);
      if (path === '/') return redirect('/dashboard');

      if (path === '/login' && m === 'GET') return await loginPage(req, env);
      if (path === '/login' && m === 'POST') {
        const f = await req.formData();
        const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(String(f.get('email') || '').trim().toLowerCase()).first();
        if (!u || !(await checkPassword(String(f.get('password') || ''), u.salt, u.pass_hash))) return await loginPage(req, env, '', 1);
        return redirect('/dashboard', { 'set-cookie': await startSession(env, u.id, req) });
      }
      if (path === '/setup' && m === 'POST') {
        if (await env.DB.prepare('SELECT 1 x FROM users LIMIT 1').first()) return redirect('/login');
        const f = await req.formData();
        if (env.SETUP_KEY && f.get('setup_key') !== env.SETUP_KEY) return await loginPage(req, env, '', 1);
        const pw = String(f.get('password') || '');
        if (pw.length < 10) return await loginPage(req, env, '', 1);
        const { salt, hash } = await hashPassword(pw);
        const email = String(f.get('email') || '').trim().toLowerCase();
        const r = await env.DB.prepare('INSERT INTO users(email,name,role,pass_hash,salt,created_at) VALUES(?,?,?,?,?,?)').bind(email, String(f.get('name') || email).slice(0, 80), 'admin', hash, salt, now()).run();
        return redirect('/dashboard', { 'set-cookie': await startSession(env, r.meta.last_row_id, req) });
      }

      const user = await getUser(req, env);
      if (!user) return redirect('/login');
      if (path === '/logout' && m === 'POST') {
        const f = await req.formData();
        if (csrfOk(user, f, req)) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
        return redirect('/login', { 'set-cookie': 'sid=; Path=/; Max-Age=0' });
      }
      if (path === '/api/upload' && m === 'POST') return await upload(req, env, user);
      if (path === '/api/social/indexed' && m === 'POST') return await setIndexed(req, env, user);

      if (path === '/dashboard') return redirect('/dashboard/prep');
      let x;
      if (path === '/dashboard/prep' && m === 'GET') return await prepList(req, env, user);
      if (path === '/dashboard/prep/create' && m === 'POST') return await prepCreate(req, env, user);
      if ((x = path.match(/^\/dashboard\/prep\/(\d+)$/)) && m === 'GET') return await prepCard(req, env, user, +x[1]);
      if ((x = path.match(/^\/dashboard\/prep\/(\d+)\/save$/)) && m === 'POST') return await prepSave(req, env, user, +x[1]);
      if ((x = path.match(/^\/dashboard\/prep\/(\d+)\/delete$/)) && m === 'POST') return await prepDelete(req, env, user, +x[1]);

      if (path === '/dashboard/social' && m === 'GET') return await socialBoard(req, env, user);
      if (path === '/dashboard/social/bulk' && m === 'GET') return await bulkPage(req, env, user);
      if (path === '/dashboard/social/bulk/download' && m === 'POST') return await bulkDownload(req, env, user);
      if (path === '/dashboard/social/export.csv') return await exportCsv(req, env);
      if (path === '/dashboard/social/templates' && m === 'GET') return await templateGallery(req, env, user);
      if (path === '/dashboard/social/templates/sample' && m === 'GET') return templateSample(req);
      if ((x = path.match(/^\/dashboard\/social\/card\/([\w-]+)\/(\d+)$/)) && m === 'GET') return await socialCard(req, env, user, x[1], +x[2]);
      if ((x = path.match(/^\/dashboard\/social\/card\/([\w-]+)\/(\d+)\/(post|bad|unbulk|texts)$/)) && m === 'POST') return await socialAction(req, env, user, x[1], +x[2], x[3]);

      if (path === '/dashboard/articles' && m === 'GET') return await articlesList(req, env, user);
      if (path === '/dashboard/articles/save' && m === 'POST') return await articleSave(req, env, user);
      if (path === '/dashboard/articles/delete' && m === 'POST') return await articleDelete(req, env, user);
      if ((x = path.match(/^\/dashboard\/articles\/([\w-]+)$/)) && m === 'GET') return await articleForm(req, env, user, x[1]);

      if (isAdmin(user)) {
        if (path === '/dashboard/users' && m === 'GET') return await usersPage(req, env, user);
        if (path === '/dashboard/users/add' && m === 'POST') return await usersAdd(req, env, user);
        if (path === '/dashboard/users/delete' && m === 'POST') return await usersDelete(req, env, user);
      }
      return layout('Not found', '<h1>Page not found</h1>', user, '', req);
    } catch (e) {
      console.error(e);
      return html(`<h1>Server error</h1><pre>${esc(e.message)}</pre>`, 500);
    }
  },
};
