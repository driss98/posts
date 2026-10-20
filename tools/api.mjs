// Tiny client for the dashboard's /api/cli/* endpoints. Reads CLI_URL + CLI_TOKEN from env or .cli.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cfg from '../site.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export { root, cfg };

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const l of fs.readFileSync(path.join(root, '.cli.env'), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch {}
  return env;
}
const env = loadEnv();
export const BASE = (env.CLI_URL || '').replace(/\/$/, '');

// Node keeps idle sockets open; the server may have closed one. Retry once.
const retry = async (f) => { try { return await f(); } catch (e) { return await f(); } };

export async function api(method, p, body) {
  if (!BASE || !env.CLI_TOKEN) throw new Error('Set CLI_URL and CLI_TOKEN (env or .cli.env)');
  const raw = body instanceof Uint8Array;
  const r = await retry(() => fetch(BASE + p, {
    method,
    headers: { authorization: `Bearer ${env.CLI_TOKEN}`, ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${j.error || ''}`);
  return j;
}

// Refuse to run against another site's dashboard.
export async function guard() {
  if (!fs.existsSync(path.join(root, 'site.config.js'))) throw new Error('Not inside a site project (no site.config.js)');
  const p = await api('GET', '/api/cli/ping');
  if (p.siteId !== cfg.siteId) throw new Error(`Refusing to run: ${BASE} is site "${p.siteId}" but this project is "${cfg.siteId}"`);
  return p;
}
export const upload = (key, buf) => api('PUT', '/api/cli/upload?key=' + encodeURIComponent(key), new Uint8Array(buf));
export const mediaUrl = (u) => (/^https?:/.test(u) ? u : (cfg.mediaBase || BASE) + u);
