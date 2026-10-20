#!/usr/bin/env node
// node tools/social-cards.mjs <slug> [--force] [--retext] [--template=key] | --all | --samples
// Renders the Facebook (1080x1350) and Pinterest (1000x1500) images for each article image and stores the texts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { api, guard, upload, mediaUrl, root, cfg } from './api.mjs';
import { renderHtml, SIZES, SAMPLE } from '../src/render-html.js';
import { TEMPLATE_KEYS, isTemplate } from '../src/templates.js';
import { genTexts } from '../src/textgen.js';
import { detectType, parseInfo } from '../src/prompts.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const slugArg = args.find((a) => !a.startsWith('--'));
if (!slugArg && !flag('all') && !flag('samples')) {
  console.log('Usage: node tools/social-cards.mjs <slug> [--force] [--retext] [--template=key] | --all | --samples');
  process.exit(0);
}
await guard();

function chromePath() {
  const c = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const p = c.find((x) => fs.existsSync(x));
  if (!p) throw new Error('Chrome/Edge not found. Set CHROME_PATH.');
  return p;
}
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'social-')), args: ['--no-sandbox', '--hide-scrollbars'] });

async function shot(htmlStr, platform) {
  const [W, H] = SIZES[platform];
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(htmlStr, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]));
  const buf = await page.screenshot({ type: 'jpeg', quality: 85 });
  await page.close();
  return Buffer.from(buf);
}

async function doSamples() {
  fs.mkdirSync(path.join(root, 'out', 'samples'), { recursive: true });
  for (const key of TEMPLATE_KEYS) {
    for (const p of ['fb', 'pin']) {
      const buf = await shot(renderHtml({ key, platform: p, title: SAMPLE.title, photos: SAMPLE.photos, site: cfg, facts: SAMPLE.facts }), p);
      fs.writeFileSync(path.join(root, 'out', 'samples', `${key}-${p}.jpg`), buf);
      await upload(`images/social/samples/${key}-${p}.jpg`, buf);
    }
  }
  console.log(`Rendered ${TEMPLATE_KEYS.length * 2} sample images (out/samples + uploaded)`);
}

async function doArticle(slug) {
  const a = await api('GET', '/api/cli/articles/' + slug);
  const existing = Object.fromEntries((await api('GET', '/api/cli/social/' + slug)).map((r) => [r.n, r]));
  const tpl = isTemplate(opt('template')) ? opt('template') : a.template;
  let override = {};
  try { override = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'social-overrides', slug + '.json'), 'utf8')); } catch {}
  const type = a.type || detectType(a.title);
  const w = parseInfo(`Yarn: ${a.yarn || ''}`).weight;
  const facts = {
    skill: a.skill, weight: w ? w[0].toUpperCase() + w.slice(1) : a.yarn, yarn: a.yarn, hook: a.hook, time: a.time,
    materials: [a.yarn && `${a.yarn} yarn`, a.hook && `${a.hook} hook`, 'Yarn needle', 'Scissors'].filter(Boolean),
  };
  let done = 0, skipped = 0;
  for (let i = 0; i < a.images.length; i++) {
    const n = i + 1, old = existing[n];
    const hasImgs = old && old.fb_image && old.pin_image;
    if (hasImgs && !flag('force') && !flag('retext')) { skipped++; continue; }
    const label = n === 1 ? 'Hero' : a.images[i].alt || `Image ${n}`;
    const texts = { ...genTexts({ title: a.title, type, facts, url: a.url, n, label, cfg }), ...(override['*'] || {}), ...(override[n] || {}) };
    const body = { ...texts, template: tpl, retext: flag('retext') };
    if (!hasImgs || flag('force')) {
      const photos = a.images.map((_, k) => mediaUrl(a.images[(i + k) % a.images.length].url));
      for (const p of ['fb', 'pin']) {
        const buf = await shot(renderHtml({ key: tpl, platform: p, title: a.title, photos, site: cfg, facts, label }), p);
        const key = `images/social/${slug}-${p}-${n}.jpg`;
        await upload(key, buf);
        body[p + '_image'] = '/' + key;
      }
    }
    await api('POST', `/api/cli/social/${slug}/${n}`, body);
    done++;
    console.log(`  ${slug} #${n} ${tpl}`);
  }
  console.log(`${slug}: ${done} cards done, ${skipped} skipped`);
}

try {
  if (flag('samples')) await doSamples();
  else if (flag('all')) for (const a of await api('GET', '/api/cli/articles')) await doArticle(a.slug);
  else await doArticle(slugArg);
} finally { await browser.close(); }
