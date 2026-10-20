import cfg from '../site.config.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const jparse = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

export const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const redirect = (url, headers = {}) => new Response(null, { status: 303, headers: { location: url, ...headers } });
export const back = (path, msg, err) => redirect(path + (msg ? (path.includes('?') ? '&' : '?') + (err ? 'err=' : 'msg=') + encodeURIComponent(msg) : ''));

export const articleUrl = (slug) => cfg.siteUrl.replace(/\/$/, '') + cfg.articlePath.replace('{slug}', slug);
export const absMedia = (path, origin) => (/^https?:\/\//.test(path || '') ? path : (cfg.mediaBase || origin || '').replace(/\/$/, '') + path);

export function validImageUrl(u) {
  u = String(u || '');
  if (u.length > 500 || /[\s"'<>\\]/.test(u) || u.includes('..')) return false;
  if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(u)) return false;
  return cfg.imagePrefixes.some((p) => u.startsWith(p)) || (cfg.mediaBase && u.startsWith(cfg.mediaBase));
}

// ---------- passwords + sessions ----------
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const rand = (n = 24) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '').slice(0, n * 4 / 3 | 0);

async function pbkdf2(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 100000 }, key, 256));
}
export async function hashPassword(pw) { const salt = b64(crypto.getRandomValues(new Uint8Array(16))); return { salt, hash: await pbkdf2(pw, salt) }; }
export async function checkPassword(pw, salt, hash) { return (await pbkdf2(pw, salt)) === hash; }

const cookie = (req, name) => (req.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find((c) => c[0] === name)?.[1];

export async function getUser(req, env) {
  const sid = cookie(req, 'sid');
  if (!sid) return null;
  const s = await env.DB.prepare('SELECT s.csrf, s.expires_at, u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').bind(sid).first();
  if (!s || s.expires_at < Date.now()) return null;
  return { id: s.id, email: s.email, name: s.name || s.email, role: s.role, csrf: s.csrf };
}

export async function startSession(env, userId, req) {
  const token = rand(32), csrf = rand(16);
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES(?,?,?,?)').bind(token, userId, csrf, Date.now() + 14 * 864e5).run();
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 86400}${secure}`;
}

export const isAdmin = (u) => u?.role === 'admin';
export const canEditSocial = (u) => u?.role === 'admin' || u?.role === 'writer';

export function csrfOk(user, form, req) {
  const t = (form && form.get && form.get('_csrf')) || req.headers.get('x-csrf');
  return !!user && t === user.csrf;
}
export const csrfField = (u) => `<input type="hidden" name="_csrf" value="${esc(u.csrf)}">`;

// ---------- layout ----------
const NAV = [
  ['prep', '/dashboard/prep', 'Pattern prep'],
  ['social', '/dashboard/social', 'Social posts'],
  ['articles', '/dashboard/articles', 'Articles'],
  ['users', '/dashboard/users', 'Users', 'admin'],
];

export function layout(title, body, user, active, req) {
  const b = cfg.brand;
  const url = req ? new URL(req.url) : null;
  const msg = url?.searchParams.get('msg'), err = url?.searchParams.get('err');
  const nav = user ? NAV.filter((n) => !n[3] || user.role === n[3]).map((n) => `<a href="${n[1]}" class="${active === n[0] ? 'on' : ''}">${n[2]}</a>`).join('') : '';
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · ${esc(cfg.siteName)}</title>
<style>:root{--p:${b.primary};--a:${b.accent};--soft:${b.soft};--ink:${b.ink};--s:${b.pastel}}${CSS}</style></head>
<body><header class="top"><a class="brand" href="/dashboard">🧶 ${esc(cfg.siteName)}</a><nav>${nav}</nav>
${user ? `<span class="who">${esc(user.name)} · ${esc(user.role)} <form method="post" action="/logout" class="inl">${csrfField(user)}<button class="lnk">Log out</button></form></span>` : ''}</header>
<main>${msg ? `<div class="flash ok">${esc(msg)}</div>` : ''}${err ? `<div class="flash bad">${esc(err)}</div>` : ''}${body}</main></body></html>`);
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f6f4f1}
a{color:var(--a)}h1{font-size:1.5rem;margin:.2em 0 .6em}h2{font-size:1.15rem;margin:.2em 0 .5em}
.top{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;padding:.6rem 1rem;background:#fff;border-bottom:1px solid #e5dfd8;position:sticky;top:0;z-index:20}
.brand{font-weight:700;text-decoration:none;color:var(--p)}.top nav{display:flex;gap:.25rem;flex-wrap:wrap}.top nav a{padding:.3rem .7rem;border-radius:99px;text-decoration:none;color:var(--ink)}
.top nav a.on,.top nav a:hover{background:var(--s);color:var(--p)}.who{margin-left:auto;font-size:.85rem;color:#666}.inl{display:inline}
.lnk{background:none;border:0;color:var(--a);cursor:pointer;padding:0;font:inherit;text-decoration:underline}
main{max-width:1150px;margin:0 auto;padding:1rem}
.box{background:#fff;border:1px solid #e5dfd8;border-radius:12px;padding:1rem;margin-bottom:1rem}
.flash{padding:.6rem .9rem;border-radius:8px;margin-bottom:1rem}.flash.ok{background:#e7f6ec;color:#14532d}.flash.bad{background:#fde8e8;color:#7f1d1d}
label{display:block;font-weight:600;margin:.6rem 0 .2rem;font-size:.9rem}
input[type=text],input[type=url],input[type=email],input[type=password],input[type=number],input[type=date],input[type=time],select,textarea{width:100%;padding:.5rem .6rem;border:1px solid #cfc7bd;border-radius:8px;font:inherit;background:#fff}
textarea{min-height:90px}textarea.mono,pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}
.btn{display:inline-block;border:0;background:var(--p);color:#fff;padding:.5rem 1rem;border-radius:8px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.btn.alt{background:#fff;color:var(--ink);border:1px solid #cfc7bd}.btn.sm{padding:.25rem .6rem;font-size:.85rem}.btn.danger{background:#b91c1c}.btn[disabled]{opacity:.45;cursor:not-allowed}
.row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:flex-end}.row>*{flex:1 1 180px}.row>.fit{flex:0 0 auto}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;margin:.5rem 0}.chip{padding:.25rem .7rem;border-radius:99px;background:#fff;border:1px solid #d8d0c6;text-decoration:none;color:var(--ink);font-size:.85rem}
.chip.on{background:var(--p);color:#fff;border-color:var(--p)}.chip b{font-weight:700}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #eee;vertical-align:middle}th{font-size:.8rem;color:#777;text-transform:uppercase}
.tw{overflow-x:auto}.thumb{width:56px;height:56px;object-fit:cover;border-radius:8px;background:#eee;display:block}
.pill{display:inline-block;padding:.1rem .6rem;border-radius:99px;font-size:.78rem;font-weight:700}
.s-new{background:#eee;color:#555}.s-filled{background:#dbeafe;color:#1e40af}.s-prompted{background:#fef3c7;color:#92400e}.s-ready{background:#dcfce7;color:#166534}.s-published{background:#ede9fe;color:#5b21b6}
.muted{color:#777;font-size:.85rem}.stepper{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0}.step{padding:.3rem .7rem;border-radius:99px;background:#eee;font-size:.82rem}
.step.done{background:#dcfce7;color:#166534}.step.cur{background:var(--p);color:#fff}
.todo{background:var(--soft);border-left:4px solid var(--p);padding:.7rem 1rem;border-radius:8px;margin:.6rem 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.7rem;margin-top:.7rem}
.tile{border:1px solid #ddd;border-radius:10px;padding:.4rem;background:#fafafa;font-size:.8rem}.tile img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block}
.tile .n{font-weight:700}.tile .acts{display:flex;gap:.25rem;flex-wrap:wrap;margin:.3rem 0}.tile .acts button,.tile .acts a{border:1px solid #ccc;background:#fff;border-radius:6px;padding:.1rem .4rem;cursor:pointer;font-size:.78rem;text-decoration:none;color:var(--ink)}
.tile input{font-size:.8rem;padding:.25rem}.drop{border:2px dashed #cfc7bd;border-radius:10px;padding:1rem;text-align:center;color:#777;cursor:pointer}.drop.over{background:var(--s)}
.tpls{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.7rem}.tpl{border:2px solid #ddd;border-radius:10px;padding:.4rem;cursor:pointer;display:block;font-weight:400;margin:0;background:#fff}
.tpl.on,.tpl:has(input:checked){border-color:var(--p);background:var(--soft)}.tpl input{display:none}.tpl b{display:block;font-size:.85rem}.tpl small{color:#777;font-size:.74rem;display:block;line-height:1.2}
.mock{position:relative;aspect-ratio:2/3;background:#eee;border-radius:6px;overflow:hidden;margin-bottom:.3rem}.mock i{position:absolute;display:block}
.prm{border:1px solid #ddd;border-radius:10px;margin:.6rem 0;overflow:hidden;background:#fff}.prm.copied{border-color:#16a34a;background:#f0fdf4}
.prm>div{display:flex;gap:.5rem;align-items:center;padding:.4rem .7rem;background:#f5f5f5}.prm.copied>div{background:#dcfce7}.prm pre{margin:0;padding:.7rem;white-space:pre-wrap}
.savebar{position:sticky;bottom:0;background:#fff;border-top:1px solid #ddd;padding:.6rem 1rem;margin:1rem -1rem 0;display:flex;gap:.6rem;flex-wrap:wrap;z-index:10}
details summary{cursor:pointer;font-weight:600}
.cells{display:flex;flex-wrap:wrap;gap:4px;margin:.3rem 0}.cell{position:relative;width:34px;height:40px;border-radius:6px;overflow:hidden;border:1px solid #bbb;display:flex;flex-direction:column;text-decoration:none;color:var(--ink);background:#e5e5e5}
.cell .num{flex:1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem}.cell .fp{display:flex;height:11px}.cell .fp span{flex:1;font-size:8px;text-align:center;line-height:11px;background:#d4d4d4;color:#666}
.cell .fp .f.on{background:#16a34a;color:#fff}.cell .fp .p.on{background:#16a34a;color:#fff}.cell .fp .p.bulk{background:#7c3aed;color:#fff}
.cell.bad{background:#fecaca;border-color:#dc2626}.cell.bad .fp span{background:#dc2626;color:#fff}.cell.nogen{border-style:dashed;opacity:.5}
.cell .dot{position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:#eab308}
.legend{display:flex;flex-wrap:wrap;gap:.8rem;font-size:.8rem;color:#555;margin:.5rem 0}.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.two img{width:100%;border-radius:10px;border:1px solid #ddd}
.cp{display:flex;gap:.4rem;align-items:center;justify-content:space-between}.cnt{font-size:.78rem;color:#777}
.dates{display:flex;gap:.3rem;flex-wrap:wrap;margin:.4rem 0}.dates span{background:#dcfce7;color:#166534;border-radius:99px;padding:.05rem .6rem;font-size:.8rem}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:1rem}.fr{position:relative;overflow:hidden;background:#eee;border-radius:8px}.fr iframe{border:0;transform-origin:0 0;position:absolute;left:0;top:0}
@media(max-width:700px){.two{grid-template-columns:1fr}.top{position:static}main{padding:.6rem}.box{padding:.7rem}.savebar{margin:1rem -.6rem 0}}
`;
