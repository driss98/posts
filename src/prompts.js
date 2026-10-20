// Rules-based image prompt generator (no AI API). Also used by tools/prep-cards.mjs.

const PREFIX = 'Use the attached photo as the reference for the crochet project: keep exactly the same piece — the same stitch pattern and texture, the same yarn colours in the same places, the same shape, size proportions and details (buttons, tassels, borders, faces). Do not change the design, do not add colours or motifs that are not in the photo. Only the photography changes: ';
const SUFFIX = " Realistic photo, natural handmade look with visible stitches and soft yarn fibres. No people's faces, no text, no logos, no watermark.";

// Order matters: first match wins ("granny square cardigan" is wearable, "baby blanket" is a blanket).
const TYPES = [
  ['amigurumi', ['amigurumi', 'plush', 'toy', 'doll', 'bear', 'bunny', 'animal', 'keychain']],
  ['blanket', ['blanket', 'afghan', 'throw']],
  ['wearable', ['sweater', 'cardigan', 'top', 'vest', 'hat', 'beanie', 'scarf', 'cowl', 'shawl', 'sock', 'mitten', 'glove', 'poncho', 'shrug', 'dress']],
  ['bag', ['bag', 'tote', 'purse', 'clutch']],
  ['home', ['pillow', 'cushion', 'basket', 'coaster', 'rug', 'placemat', 'plant hanger', 'wall hanging', 'garland', 'doily', 'runner']],
  ['baby', ['baby', 'bootie', 'booty', 'bib', 'lovey', 'rattle']],
  ['seasonal', ['christmas', 'ornament', 'halloween', 'pumpkin', 'easter', 'valentine', 'heart', 'flower', 'snowflake']],
  ['square', ['granny square', 'motif', 'square', 'hexagon', 'block']],
];

const STYLE = {
  amigurumi: { surface: "a light wooden shelf in a kids' room", props: 'wooden toys', texture: 'tight single crochet, safety eyes and embroidered details', use: "sitting on the pillows of a child's bed" },
  blanket: { surface: 'a sofa with neutral linen cushions', props: 'linen cushions', texture: 'the stitch pattern and the border', use: 'draped over an armchair or folded at the foot of a bed' },
  wearable: { surface: 'a bed with neutral linen, laid flat or on a wooden hanger', props: 'a wooden hanger and a plant', texture: 'the ribbing and the way the fabric drapes', use: 'on a mannequin form or hanging by a sunny window (no faces)' },
  bag: { surface: 'a café table', props: 'sunglasses and a book', texture: 'the mesh or tapestry stitch', use: 'hanging from a chair with a few items inside' },
  home: { surface: 'a styled shelf or coffee table', props: 'a plant and a candle', texture: 'the stitch close-up', use: 'in a cosy living room' },
  baby: { surface: 'a nursery with soft white bedding', props: 'a wooden rattle', texture: 'the soft stitches', use: 'lying in a crib (no baby)' },
  seasonal: { surface: 'a seasonal table', props: 'matching seasonal props', texture: 'the stitches of the motif', use: 'hanging on a seasonal tree or styled on a festive table' },
  square: { surface: 'a wooden table', props: 'several identical squares', texture: 'the round-by-round stitch detail', use: 'a flat lay of several identical squares on wood' },
  other: { surface: 'a light wooden table with a linen cloth', props: 'a ball of the same yarn', texture: 'the stitches', use: 'in a cosy home scene' },
};

const rx = (w) => new RegExp('\\b' + w.replace(/ /g, '\\s+') + '(s|es)?\\b', 'i');

export function detectType(title, info = '') {
  for (const src of [title || '', info || '']) {
    for (const [type, words] of TYPES) if (words.some((w) => rx(w).test(src))) return type;
  }
  return 'other';
}

function field(info, names) {
  for (const line of String(info || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z ()\/]+?)\s*:\s*(.+)$/);
    if (m && names.includes(m[1].trim().toLowerCase())) return m[2].trim();
  }
  return '';
}

export function parseInfo(info) {
  const yarn = field(info, ['yarn']);
  const hook = field(info, ['hook']);
  let colours = '';
  const cm = yarn.match(/colou?rs?\s*:\s*(.+)$/i);
  if (cm) colours = cm[1].trim();
  const weight = (yarn.match(/(lace|fingering|sport|dk|worsted|aran|bulky|chunky|super bulky|jumbo)/i) || [''])[0].toLowerCase();
  return {
    skill: field(info, ['skill level', 'skill', 'level']),
    yarn, colours, weight,
    hook,
    materials: field(info, ['other materials', 'materials', 'notions']),
    time: field(info, ['time']),
    gauge: field(info, ['gauge']),
  };
}

export function buildPrompts(title, info, n = 8) {
  n = Math.max(5, Math.min(10, parseInt(n, 10) || 8));
  const type = detectType(title, info);
  const st = STYLE[type];
  const p = parseInfo(info);
  const yarnWords = [p.colours && `${p.colours}`, p.weight && `${p.weight}-weight`].filter(Boolean).join(' ');
  const colours = p.colours || 'the same colours as in the photo';
  const hook = p.hook ? `the ${p.hook} crochet hook` : 'a crochet hook';
  const notions = p.materials ? `(${p.materials})` : '(stitch markers, a yarn needle, scissors)';
  const distinct = type === 'amigurumi' ? 'the face — safety eyes, embroidered nose or mouth —' : type === 'wearable' ? 'the neckline, cuffs or hem finishing' : type === 'bag' ? 'the handles and the closure' : type === 'blanket' || type === 'home' ? 'the border or edging' : type === 'seasonal' ? 'the hanging loop or the small embellishments' : 'the most distinctive finishing detail (border, seam, buttons, tassels)';

  const shots = [
    ['Hero styled', `the finished piece as the clear subject on ${st.surface}, soft natural window light, a few ${st.props} out of focus behind it, 3/4 angle.`],
    ['Flat lay with tools', `overhead flat-lay: the piece in the centre with balls of the same yarn colours (${colours}), ${hook}, scissors, stitch markers and a yarn needle around it.`],
    ['Stitch close-up', `macro close-up of the stitches — ${st.texture} — shallow depth of field, sharp front edge.`],
    ['In use / lifestyle', `${st.use}, wide 3/4 view, warm afternoon light.`],
    ['Materials spread', `the materials only, before starting: ${yarnWords || colours} yarn balls, ${hook}, notions ${notions}, neatly laid out, with the finished piece partly visible at one edge.`],
    ['Work in progress', `the piece half-finished with the hook still in the last loop and the working yarn attached, on ${st.surface}; same colours and stitch.`],
    ['Detail', `a detail of ${distinct} — the most distinctive detail of this project, close and sharp.`],
    ['Cosy scene', 'the piece in a cosy home scene with a mug of tea and a book, golden light.'],
    ['Pinterest vertical', 'tall composition, the piece in the lower two thirds, soft empty space in the top third (for a title added later), bright and airy.'],
    ['Bright and airy', 'minimal shot on a white surface with plenty of negative space, soft diffused daylight.'],
  ];
  return shots.slice(0, n).map(([name, body]) => `## ${name}\n${PREFIX}${body}${SUFFIX}`).join('\n\n');
}

// "## Name\ntext" blocks -> [{name, text}]
export function parsePrompts(text) {
  return String(text || '').split(/^##[ \t]*/m).slice(1).map((b) => {
    const i = b.indexOf('\n');
    return { name: (i < 0 ? b : b.slice(0, i)).trim(), text: i < 0 ? '' : b.slice(i + 1).trim() };
  });
}
