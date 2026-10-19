import fs from 'fs';
const master = JSON.parse(fs.readFileSync('/tmp/i18n/master.json', 'utf8'));
const OUT = '/home/claude/work/proiect/app/js/i18n';
fs.mkdirSync(OUT, { recursive: true });
const ph = (s) => (s.match(/\$\{[^}]*\}/g) || []).sort().join('|');
for (const lang of process.argv.slice(2)) {
  const files = fs.readdirSync('/tmp/i18n/tr').filter((f) => f.startsWith(lang + '.')).sort();
  const map = new Map();
  for (const f of files) for (const line of fs.readFileSync('/tmp/i18n/tr/' + f, 'utf8').split('\n')) {
    const m = /^(\d+)\t(.*)$/.exec(line); if (m) map.set(+m[1], m[2]);
  }
  const dict = {}; let missing = 0, bad = [];
  master.forEach(([ro, en], i) => {
    let t = map.get(i);
    if (t == null || !t.trim()) { missing++; t = en; }
    else if (ph(t) !== ph(en)) { bad.push(i); t = en; }
    dict[ro] = t;
  });
  const extra = JSON.parse(fs.readFileSync('/tmp/i18n/extra.json', 'utf8'));
  if (extra[lang]) extra.keys.forEach((k, i) => { if (extra[lang][i]) dict[k] = extra[lang][i]; });
  fs.writeFileSync(`${OUT}/${lang}.js`, `// ${lang}: text of the app (Romanian -> ${lang}).\n(window.I18N_DICT = window.I18N_DICT || {})[${JSON.stringify(lang)}] = {` + Object.entries(dict).map(([a, b]) => JSON.stringify(a) + ':' + JSON.stringify(b)).join(',\n') + '};\n');
  console.log(lang, 'entries', map.size, 'missing', missing, 'placeholder mismatch', bad.length, bad.slice(0, 20).join(','));
}
