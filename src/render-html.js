// HTML for the social images. Used by tools/social-cards.mjs (Puppeteer) and by the template gallery (iframes).
// FB 1080x1350 (no site name on the image), Pinterest 1000x1500 (site name once, small).
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SIZES = { fb: [1080, 1350], pin: [1000, 1500] };

const fit = (t, max, min, per) => Math.max(min, Math.min(max, Math.round(max - Math.max(0, String(t).length - per) * (max - min) / 60)));

function sampleSvg(c1, c2, c3) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><defs><pattern id="p" width="60" height="40" patternUnits="userSpaceOnUse"><rect width="60" height="40" fill="${c1}"/><path d="M0 20 Q15 0 30 20 T60 20" stroke="${c2}" stroke-width="9" fill="none"/><path d="M0 40 Q15 20 30 40 T60 40" stroke="${c3}" stroke-width="9" fill="none"/></pattern></defs><rect width="900" height="900" fill="url(#p)"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
export const SAMPLE = {
  title: 'Chunky Granny Square Cardigan',
  photos: [sampleSvg('#e8cfa8', '#c98f5a', '#8aa17a'), sampleSvg('#cfe0d0', '#7fa389', '#f1d38a'), sampleSvg('#f2d9d0', '#d9876f', '#e8cfa8')],
  facts: { skill: 'Easy', weight: 'Worsted', hook: '5 mm hook', time: '8 hours', materials: ['Worsted yarn — 3 skeins', '5 mm (H-8) hook', 'Yarn needle', 'Stitch markers', '6 buttons'], stitches: ['ch', 'sc', 'dc'] },
};

export function renderHtml({ key, platform = 'fb', title, photos, site, facts = {}, label = '' }) {
  const [W, H] = SIZES[platform] || SIZES.fb;
  const b = site.brand;
  const ph = (photos && photos.length ? photos : SAMPLE.photos);
  const P = (i) => ph[i % ph.length];
  const bg = (i, extra = '') => `style="background-image:url('${e(P(i))}');${extra}"`;
  const pin = platform === 'pin';
  const tag = (cls = '') => (pin ? `<div class="site ${cls}">${e(site.siteName || site.name)}</div>` : '');
  const T = e(title || '');
  const pills = [facts.skill, facts.weight, facts.hook, facts.time].filter(Boolean);
  const stitches = (facts.stitches && facts.stitches.length ? facts.stitches : ['ch', 'sc', 'dc']);
  const mats = (facts.materials && facts.materials.length ? facts.materials : ['Yarn', 'Crochet hook', 'Yarn needle', 'Scissors']);
  let inner = '';
  switch (key) {
    case 'split':
      inner = `<div class="im" ${bg(0, 'left:0;top:0;width:100%;height:41%')}></div><div class="im" ${bg(1, 'left:0;bottom:0;width:100%;height:41%')}></div>
<div class="strip" style="top:41%;height:18%;background:${b.primary}"><h1 style="font-size:${fit(title, 74, 46, 24)}px">${T}</h1>${tag('c')}</div>`; break;
    case 'magazine':
      inner = `<div class="im" ${bg(0, 'inset:0')}></div><div class="fade"></div><div class="badge">FREE PATTERN</div>
<div class="mag"><h1 style="font-size:${fit(title, 112, 62, 20)}px">${T}</h1>${tag('l')}</div>`; break;
    case 'polaroid':
      inner = `<div class="knit"></div><div class="pol"><div class="im" ${bg(0, 'left:5%;top:4%;width:90%;height:76%')}></div><div class="hand" style="font-size:${fit(title, 84, 52, 22)}px">${T}</div></div>${tag('c dark')}`; break;
    case 'pattern-card':
      inner = `<div class="im" ${bg(0, 'left:0;top:0;width:100%;height:66%')}></div><div class="pcard"><h1 style="font-size:${fit(title, 62, 40, 26)}px">${T}</h1>
<div class="facts">${[['Skill', facts.skill], ['Yarn', facts.weight], ['Hook', facts.hook], ['Time', facts.time]].filter((x) => x[1]).map((x) => `<div><small>${x[0]}</small><b>${e(x[1])}</b></div>`).join('')}</div>${tag('r')}</div>`; break;
    case 'yarn-ball':
      inner = `<div class="solid" style="background:${b.pastel}"></div><div class="ball"><div class="im" ${bg(0, 'inset:0;border-radius:50%')}></div></div>
<h1 class="below" style="font-size:${fit(title, 80, 50, 22)}px;color:${b.primary}">${T}</h1>${tag('c dark')}`; break;
    case 'collage':
      inner = `<div class="im" ${bg(0, 'left:3%;top:2.5%;width:94%;height:50%;border-radius:18px')}></div>
<div class="im" ${bg(1, 'left:3%;top:55%;width:46%;height:25%;border-radius:18px')}></div><div class="im" ${bg(2, 'right:3%;top:55%;width:46%;height:25%;border-radius:18px')}></div>
<div class="strip" style="bottom:0;height:17%;background:${b.primary}"><h1 style="font-size:${fit(title, 64, 40, 28)}px">${T}</h1>${tag('c')}</div>`; break;
    case 'minimal':
      inner = `<div class="solid" style="background:#fff"></div><div class="im" ${bg(0, 'left:8%;top:5%;width:84%;height:64%;border-radius:28px')}></div>
<div class="min"><small>FREE CROCHET PATTERN</small><h1 style="font-size:${fit(title, 84, 54, 22)}px">${T}</h1><hr>${tag('c dark inl')}</div>`; break;
    case 'bold':
      inner = `<div class="solid" style="background:${b.primary}"></div><h1 class="giant" style="font-size:${fit(title, 120, 70, 18)}px">${T}</h1>
<div class="im" ${bg(0, 'left:7%;top:36%;width:86%;height:44%;border-radius:24px;border:8px solid #fff')}></div>
<div class="pills">${pills.slice(0, 3).map((p) => `<span>${e(p)}</span>`).join('')}</div>${tag('c')}`; break;
    case 'materials':
      inner = `<div class="im" ${bg(0, 'left:0;top:0;width:60%;height:100%')}></div><div class="panel"><h1 style="font-size:${fit(title, 54, 36, 26)}px">${T}</h1><h2>You will need</h2>
<ul>${mats.slice(0, 6).map((m) => `<li>${e(m)}</li>`).join('')}</ul>${tag('r')}</div>`; break;
    case 'stitch-guide':
      inner = `<div class="im" ${bg(0, 'left:0;top:0;width:100%;height:74%')}></div><div class="sg"><h1 style="font-size:${fit(title, 62, 40, 26)}px">${T}</h1>
<div class="st">${stitches.slice(0, 3).map((s) => `<span>${e(s)}</span>`).join('')}</div>${tag('r')}</div>`; break;
    default: // classic
      inner = `<div class="im" ${bg(0, 'inset:0')}></div><div class="band"><h1 style="font-size:${fit(title, 80, 48, 22)}px">${T}</h1>${tag('r')}</div>`;
  }
  const fonts = [b.sans, b.serif, b.hand].map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + (f === b.sans ? ':wght@500;700;800' : f === b.serif ? ':wght@700' : ':wght@700')).join('&');
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden}
.root{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:'${b.sans}',system-ui,sans-serif;color:#fff;background:#ddd}
.im{position:absolute;background-size:cover;background-position:center}.solid{position:absolute;inset:0}
h1{font-family:'${b.serif}',Georgia,serif;font-weight:700;line-height:1.08;letter-spacing:-.01em}
.site{position:absolute;font-size:24px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85}.site.c{left:0;right:0;bottom:16px;text-align:center}.site.r{right:34px;bottom:20px}.site.l{left:56px;bottom:26px}.site.dark{color:#333}.site.inl{position:static;margin-top:18px}
.band{position:absolute;left:0;right:0;bottom:0;height:31%;background:${b.primary};padding:36px 56px;display:flex;align-items:center}
.strip{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;padding:0 50px;text-align:center}
.fade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.55) 30%,transparent 58%)}
.badge{position:absolute;left:48px;top:48px;background:${b.primary};padding:14px 30px;border-radius:99px;font-weight:800;letter-spacing:.12em;font-size:30px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.mag{position:absolute;left:56px;right:56px;bottom:70px;text-shadow:0 3px 18px rgba(0,0,0,.5)}
.knit{position:absolute;inset:0;background:${b.pastel};background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.05) 0 6px,transparent 6px 14px),repeating-linear-gradient(-45deg,rgba(255,255,255,.35) 0 6px,transparent 6px 14px)}
.pol{position:absolute;left:12%;top:7%;width:76%;height:78%;background:#fff;transform:rotate(-4deg);box-shadow:0 18px 50px rgba(0,0,0,.28);border-radius:6px}
.hand{position:absolute;left:5%;right:5%;bottom:3%;height:17%;display:flex;align-items:center;justify-content:center;text-align:center;font-family:'${b.hand}',cursive;font-weight:700;color:#333;line-height:1}
.pcard{position:absolute;left:0;right:0;bottom:0;height:34%;background:#fff;color:${b.ink};border-top:10px solid ${b.primary};padding:36px 56px}
.pcard .site,.panel .site{color:#999}.pcard h1{color:${b.ink}}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:28px}.facts div{background:${b.soft};border-radius:14px;padding:14px 12px;text-align:center}.facts small{display:block;font-size:20px;color:#777;text-transform:uppercase;letter-spacing:.08em}.facts b{font-size:28px;color:${b.primary}}
.ball{position:absolute;left:50%;top:6%;width:${Math.round(W * 0.76)}px;height:${Math.round(W * 0.76)}px;margin-left:-${Math.round(W * 0.38)}px;border-radius:50%;border:14px solid #fff;box-shadow:0 14px 40px rgba(0,0,0,.2);overflow:hidden;position:absolute}
.below{position:absolute;left:60px;right:60px;top:${Math.round(W * 0.76) + Math.round(H * 0.06) + 40}px;text-align:center}
.min{position:absolute;left:8%;right:8%;top:73%;color:#222;text-align:center}.min small{letter-spacing:.3em;font-size:22px;color:${b.primary};font-weight:700}.min h1{color:#222;margin:14px 0 22px}.min hr{border:0;border-top:2px solid #222;width:120px;margin:0 auto}
.giant{position:absolute;left:7%;right:7%;top:4%;height:29%;display:flex;align-items:center;text-transform:uppercase;line-height:1;color:#fff}
.pills{position:absolute;left:5%;right:5%;top:84%;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}.pills span{background:#fff;color:${b.primary};font-weight:800;font-size:34px;padding:14px 30px;border-radius:99px}
.panel{position:absolute;right:0;top:0;bottom:0;width:40%;background:#fff;color:${b.ink};padding:48px 30px;border-left:10px solid ${b.primary}}.panel h1{color:${b.ink};margin-bottom:34px}.panel h2{font-size:30px;color:${b.primary};text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px}
.panel ul{list-style:none}.panel li{font-size:28px;padding:14px 0 14px 52px;border-bottom:1px solid #eee;position:relative;line-height:1.2}.panel li:before{content:'✓';position:absolute;left:0;top:10px;width:36px;height:36px;border-radius:8px;background:${b.accent};color:#fff;text-align:center;line-height:36px;font-weight:800}
.sg{position:absolute;left:0;right:0;bottom:0;height:26%;background:${b.primary};padding:30px 56px}.st{display:flex;gap:18px;margin-top:22px}.st span{background:#fff;color:${b.primary};font-weight:800;font-size:38px;padding:8px 34px;border-radius:99px}
</style></head><body><div class="root" data-label="${e(label)}">${inner}</div></body></html>`;
}
