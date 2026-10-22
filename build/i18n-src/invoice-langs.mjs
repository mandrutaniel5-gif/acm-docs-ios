// Builds app/js/invoice-langs.js from build/i18n-src/invoice/<lang>.txt
// Each .txt: line 1 = the 78 terms of DOC_EN (invoice.js) in the same order, line 2 = the 21 labels.
//   node build/i18n-src/invoice-langs.mjs
import fs from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const s = fs.readFileSync(ROOT + 'app/js/invoice.js', 'utf8');
const keys = Object.keys(eval('({' + s.match(/const DOC_EN = \{([\s\S]*?)\n  \};/)[1] + '})'));
const LK = ['series', 'number', 'date', 'due', 'valid', 'supplier', 'client', 'colNr', 'colDesc', 'colUm', 'colQty', 'colPrice', 'colValue', 'subtotal', 'discount', 'totalBase', 'totalVat', 'grand', 'payment', 'notes', 'signSupplier'];
const META = { de: ['Deutsch', 'de-DE'], fr: ['Français', 'fr-FR'], es: ['Español', 'es-ES'], it: ['Italiano', 'it-IT'], pt: ['Português', 'pt-PT'], hu: ['Magyar', 'hu-HU'], pl: ['Polski', 'pl-PL'], uk: ['Українська', 'uk-UA'], ru: ['Русский', 'ru-RU'], tr: ['Türkçe', 'tr-TR'], ar: ['العربية', 'ar-u-nu-latn'], hi: ['हिन्दी', 'hi-IN'], zh: ['中文', 'zh-CN'], ja: ['日本語', 'ja-JP'], ko: ['한국어', 'ko-KR'] };
let out = "'use strict';\n// Words on invoices, proformas and quotes in the other document languages (Romanian and English\n// live in invoice.js). Generated from build/i18n-src/invoice/<lang>.txt by build/i18n-src/invoice-langs.mjs.\nwindow.INVOICE_LANGS = {\n";
for (const [l, [name, loc]] of Object.entries(META)) {
  const [a, b] = fs.readFileSync(ROOT + `build/i18n-src/invoice/${l}.txt`, 'utf8').trim().split('\n');
  const t = a.split('|'), lb = b.split('|');
  if (t.length !== keys.length || lb.length !== LK.length) throw new Error(`${l}: ${t.length}/${keys.length} terms, ${lb.length}/${LK.length} labels`);
  const labels = Object.fromEntries(LK.map((k, i) => [k, lb[i]]));
  Object.assign(labels, { titleInvoice: '', titleProforma: '', titleQuote: '', signClient: '' });
  out += '  ' + l + ': ' + JSON.stringify({ name, loc, rtl: l === 'ar', labels, terms: Object.fromEntries(keys.map((k, i) => [k, t[i]])) }) + ',\n';
}
fs.writeFileSync(ROOT + 'app/js/invoice-langs.js', out + '};\n');
console.log('invoice-langs.js written');
