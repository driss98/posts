// Social image templates. Keys are stored in the DB — never rename a key.
export const TEMPLATES = [
  { key: 'classic', name: 'Classic Banner', images: 1, desc: 'Full photo, a colour title band across the lower third.' },
  { key: 'split', name: 'Duo Split', images: 2, desc: 'Two photos stacked, title strip between them (the Pinterest favourite).' },
  { key: 'magazine', name: 'Magazine Cover', images: 1, desc: 'Edge-to-edge photo, dark fade, big headline, "FREE PATTERN" badge.' },
  { key: 'polaroid', name: 'Polaroid', images: 1, desc: 'Tilted instant-photo frame on a knit-texture background, handwritten title.' },
  { key: 'pattern-card', name: 'Pattern Card', images: 1, desc: 'Photo on top, a card below with skill level, yarn weight, hook size, time.' },
  { key: 'yarn-ball', name: 'Yarn Circle', images: 1, desc: 'The piece in a big circle (like a yarn ball) on a pastel background.' },
  { key: 'collage', name: 'Three-Photo Collage', images: 3, desc: 'One large + two small photos (hero, close-up, detail) and a title band.' },
  { key: 'minimal', name: 'Minimal White', images: 1, desc: 'White layout, rounded photo, large serif title, thin rule.' },
  { key: 'bold', name: 'Bold Block', images: 1, desc: 'Bright colour poster, giant type, pills "Easy · 5 mm hook · Worsted".' },
  { key: 'materials', name: 'Materials Checklist', images: 1, desc: 'Photo with a checklist panel: yarn, hook, notions — great for saves.' },
  { key: 'stitch-guide', name: 'Stitch Guide', images: 1, desc: 'Photo + a strip of the 3 main stitches as text badges: ch · sc · dc.' },
];

export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
export const isTemplate = (k) => TEMPLATE_KEYS.includes(k);
export const templateName = (k) => (TEMPLATES.find((t) => t.key === k) || {}).name || k || '';

// Stable hash of the slug -> a template key (for articles without a choice).
export function autoTemplate(slug) {
  let h = 2166136261;
  for (const c of String(slug || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return TEMPLATE_KEYS[h % TEMPLATE_KEYS.length];
}

// Tiny CSS mock-up (2:3 box, positioned <i> blocks, no images) for the pickers.
const MOCK = {
  classic: '<i style="inset:0;background:#d6b99a"></i><i style="left:0;right:0;bottom:0;height:30%;background:var(--p)"></i>',
  split: '<i style="left:0;right:0;top:0;height:42%;background:#d6b99a"></i><i style="left:0;right:0;top:42%;height:16%;background:var(--p)"></i><i style="left:0;right:0;bottom:0;height:42%;background:#b9c9b0"></i>',
  magazine: '<i style="inset:0;background:#c9a98a"></i><i style="left:0;right:0;bottom:0;height:45%;background:linear-gradient(transparent,#000a)"></i><i style="left:8%;top:8%;width:36%;height:7%;background:var(--p);border-radius:9px"></i>',
  polaroid: '<i style="inset:0;background:#efe3d3"></i><i style="left:16%;top:12%;width:68%;height:70%;background:#fff;transform:rotate(-5deg);box-shadow:0 1px 4px #0004"></i><i style="left:22%;top:16%;width:56%;height:46%;background:#d6b99a;transform:rotate(-5deg)"></i>',
  'pattern-card': '<i style="left:0;right:0;top:0;height:62%;background:#d6b99a"></i><i style="left:6%;right:6%;top:58%;bottom:5%;background:#fff;border:2px solid var(--p);border-radius:6px"></i>',
  'yarn-ball': '<i style="inset:0;background:var(--s)"></i><i style="left:12%;top:20%;width:76%;height:50%;border-radius:50%;background:#d6b99a"></i>',
  collage: '<i style="left:4%;top:4%;right:4%;height:50%;background:#d6b99a"></i><i style="left:4%;top:56%;width:44%;height:24%;background:#b9c9b0"></i><i style="right:4%;top:56%;width:44%;height:24%;background:#e3c3a0"></i><i style="left:0;right:0;bottom:0;height:16%;background:var(--p)"></i>',
  minimal: '<i style="inset:0;background:#fff"></i><i style="left:10%;right:10%;top:8%;height:58%;background:#d6b99a;border-radius:10px"></i><i style="left:20%;right:20%;top:74%;height:6%;background:#333"></i><i style="left:10%;right:10%;top:88%;height:1px;background:#999"></i>',
  bold: '<i style="inset:0;background:var(--p)"></i><i style="left:8%;top:8%;right:8%;height:20%;background:#fff"></i><i style="left:12%;right:12%;top:36%;height:44%;background:#d6b99a;border-radius:6px"></i>',
  materials: '<i style="left:0;top:0;bottom:0;width:62%;background:#d6b99a"></i><i style="right:0;top:0;bottom:0;width:38%;background:#fff;border-left:2px solid var(--p)"></i>',
  'stitch-guide': '<i style="left:0;right:0;top:0;height:76%;background:#d6b99a"></i><i style="left:6%;top:80%;width:24%;height:12%;background:var(--p);border-radius:9px"></i><i style="left:38%;top:80%;width:24%;height:12%;background:var(--p);border-radius:9px"></i><i style="left:70%;top:80%;width:24%;height:12%;background:var(--p);border-radius:9px"></i>',
};
export const mockup = (key) => MOCK[key] || MOCK.classic;
