// Adds the entries of an extra-<version>.json file to the app's dictionaries (EN and the others).
//   node build/i18n-src/apply-extra.mjs build/i18n-src/extra-2.2.7.json
import fs from 'fs';
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ROOT = new URL('../../', import.meta.url).pathname;
const n = src.keys.length;
for (const [lang, list] of Object.entries(src)) {
  if (lang === 'keys') continue;
  if (list.length !== n) throw new Error(`${lang}: ${list.length} of ${n}`);
  const file = lang === 'en' ? ROOT + 'app/js/i18n-en.js' : ROOT + `app/js/i18n/${lang}.js`;
  let s = fs.readFileSync(file, 'utf8');
  const end = s.lastIndexOf('}');
  const have = new Set();
  const add = src.keys.map((k, i) => [k, list[i]]).filter(([k]) => !s.includes(JSON.stringify(k) + ':'));
  if (!add.length) { console.log(lang, 'nothing new'); continue; }
  s = s.slice(0, end).replace(/\s*$/, '') + ',\n' + add.map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n' + s.slice(end);
  fs.writeFileSync(file, s);
  console.log(lang, '+' + add.length);
  void have;
}
