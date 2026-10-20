// Rules-based social texts (no AI). Pure functions, used by tools/social-cards.mjs.
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const TAG = { amigurumi: ['amigurumi', 'crochettoys'], blanket: ['crochetblanket', 'afghan'], wearable: ['crochetclothing', 'crochetsweater'], bag: ['crochetbag', 'crochetaccessories'], home: ['crochethomedecor', 'handmadehome'], baby: ['crochetbaby', 'babygifts'], seasonal: ['holidaycrochet', 'seasonalcrafts'], square: ['grannysquare', 'crochetmotif'], other: ['crochetproject', 'handmade'] };

export function genTexts({ title, type, facts = {}, url, n, label, cfg }) {
  const t = type || 'other';
  const bits = [facts.skill && `${facts.skill} level`, facts.yarn && `${facts.yarn} yarn`, facts.hook, facts.time && `about ${String(facts.time).replace(/^about\s+/i, '')}`].filter(Boolean);
  const detail = n === 1 ? 'Here is the finished project.' : label && !/^hero$/i.test(label) ? `${label}.` : 'A closer look at the project.';
  const tags = ['crochet', 'crochetpattern', 'freecrochetpattern', ...(TAG[t] || TAG.other), 'yarnlove', 'handmade'].slice(0, 8).map((x) => '#' + x).join(' ');
  const fb_caption = [`🧶 ${title}`, detail + (bits.length ? ` ${bits.join(' · ')}.` : ''), 'The full free pattern is written out step by step. Save it for your next project!', '', tags].join('\n');
  const pin_title = clip(`${facts.skill && !new RegExp(facts.skill, 'i').test(title) ? facts.skill + ' ' : ''}${title} – Free Crochet Pattern`, 100);
  const pin_desc = clip([`Free crochet pattern: ${title}.`, bits.length ? `${bits.join(', ')}.` : '', 'Full written pattern with materials, gauge and finishing tips.', facts.skill && /easy|beginner/i.test(facts.skill) ? 'Beginner friendly crochet pattern.' : 'Crochet pattern with clear instructions.', 'Save this pin to your crochet board and start it whenever you are ready!'].filter(Boolean).join(' '), 500);
  const topics = ['Crochet', 'Crochet Patterns', 'Free Crochet Patterns', ...((cfg.topicsByType || {})[t] || [])].slice(0, 8).join(', ');
  return { fb_caption, fb_comment: `Free pattern here 👉 ${url}`, pin_title, pin_desc, pin_topics: topics, pin_board: (cfg.boards || {})[t] || cfg.boards.other, label: label || (n === 1 ? 'Hero' : `Image ${n}`) };
}
