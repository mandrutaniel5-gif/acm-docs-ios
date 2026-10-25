// e-Factura XML: invoices made the way the app makes them, checked locally and (with --anaf) by
// ANAF's own public validator (XSD + CIUS-RO rules). node test/efactura.test.mjs [--anaf] [--out dir]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const inv = fs.readFileSync(path.join(root, 'app/js/invoice.js'), 'utf8');
const biz = fs.readFileSync(path.join(root, 'app/js/business.js'), 'utf8');
const ef = fs.readFileSync(path.join(root, 'app/js/efactura.js'), 'utf8');
const pick = (src, start) => { const i = src.indexOf(start); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) break; } return src.slice(i, j + 1); };
const computeSrc = pick(inv, 'function compute(');
const numSrc = inv.slice(inv.indexOf('const num = (s) =>'), inv.indexOf('const isoDate'));

const ctx = { console, URLSearchParams, TextEncoder, TextDecoder, setTimeout, setInterval, document: { addEventListener() {}, visibilityState: 'hidden' }, window: {} };
vm.createContext(ctx);
vm.runInContext(`const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100; ${numSrc}; var Invoice = { compute: ${computeSrc.replace('function compute(data = inv, b = biz)', 'function (data, b)')} };`, ctx);
const cats = { general: { cats: [{ id: 'serv', um: 'serv.' }, { id: 'prod', um: 'buc' }] } };
let company;
vm.runInContext(`var Biz = { get: () => __b, active: () => __b, industry: (i) => (${JSON.stringify(cats)})[i] || ${JSON.stringify(cats.general)}, docs: () => [] };`, ctx);
vm.runInContext(ef.replace('const EFactura =', 'var EFactura ='), ctx);
const EF = ctx.EFactura;

const base = { id: 'b1', industry: 'general', name: 'Test SRL', legal: 'TEST SOFTWARE SRL', cui: 'RO24255660', regcom: 'J05/123/2026', address: 'Str. Republicii nr. 10', city: 'Oradea', county: 'Bihor', country: 'România', phone: '0722000000', email: 'office@test.ro', iban: 'RO49AAAA1B31007593840000', bank: 'Banca Test', vatPayer: true, vatRate: 21, pricesInclVat: true, nonVatNote: 'Furnizor neplătitor de TVA (regim special de scutire, art. 310 Cod fiscal).', currency: 'RON' };
const pjClient = { kind: 'pj', name: 'CLIENT FIRMA SRL', cui: 'RO16337544', regcom: 'J40/1/2000', address: 'Bd. Unirii 1', city: 'Sector 3', county: 'București', country: 'România' };
const pfClient = { kind: 'pf', name: 'Ion Popescu', cnp: '', address: 'Str. Mare 5', city: 'Cluj-Napoca', county: 'Cluj', country: 'România' };
const lines = [{ type: 'serv', desc: 'Reparație instalație sanitară', qty: 2, price: 150 }, { type: 'prod', desc: 'Robinet baterie', qty: 3, price: 89.99 }, { type: 'prod', desc: 'Garnituri (set)', qty: 1.5, price: 12.4 }];
const cases = {
  'tva-incl-pj-bucuresti': [{ ...base }, { client: pjClient, lines, discount: 0, pay: 'Ordin de plată' }],
  'tva-excl-discount-pf': [{ ...base, pricesInclVat: false }, { client: pfClient, lines, discount: 10, pay: 'Card' }],
  'neplatitor-pf-numerar': [{ ...base, vatPayer: false, cui: '24255660' }, { client: pfClient, lines, discount: 5, pay: 'Numerar' }],
  'neplatitor-pj': [{ ...base, vatPayer: false, cui: '24255660' }, { client: pjClient, lines, discount: 0, pay: 'Transfer bancar' }],
  'tva-eur-extern': [{ ...base }, { client: { kind: 'pj', name: 'Kunde GmbH', cui: 'DE123456789', address: 'Hauptstr. 1', city: 'Berlin', county: '', country: 'Germania' }, lines, currency: 'EUR', rate: '4.9771', discount: 0, pay: 'Ordin de plată' }],
};

let failed = 0;
const ok = (c, m) => { if (c) console.log('✓', m); else { failed++; console.log('✗', m); } };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (out) fs.mkdirSync(out, { recursive: true });
const built = {};
let n = 1;
for (const [name, [b, data]] of Object.entries(cases)) {
  ctx.__b = b;
  const d = { id: 'd' + n, bizId: 'b1', type: 'invoice', series: 'TST', number: n++, date: '2026-10-20', data: { currency: 'RON', rate: '', notes: '', date: '2026-10-20', due: '2026-11-04', ...data } };
  const r = EF.build(d);
  built[name] = r;
  ok(!r.problems.length, `${name}: no problems ${r.problems.join(' | ')}`);
  ok(/^<\?xml/.test(r.xml) && (r.xml.match(/<cac:InvoiceLine>/g) || []).length === lines.length, `${name}: ${lines.length} lines`);
  const t = ctx.Invoice.compute(d.data, b);
  const pay = +/<cbc:PayableAmount[^>]*>([\d.]+)</.exec(r.xml)[1];
  ok(Math.abs(pay - t.total) < 0.001, `${name}: payable ${pay} = PDF total ${t.total}`);
  if (out) fs.writeFileSync(path.join(out, name + '.xml'), r.xml);
}
ok(built['tva-incl-pj-bucuresti'].xml.includes('<cbc:CityName>SECTOR3</cbc:CityName>') && built['tva-incl-pj-bucuresti'].xml.includes('RO-B<'), 'Bucharest: SECTOR3 + RO-B');
ok(built['neplatitor-pf-numerar'].xml.includes('VATEX-EU-O') && !built['neplatitor-pf-numerar'].xml.includes('<cac:PartyTaxScheme>'), 'non-VAT payer: category O, no VAT ids');
ok(built['neplatitor-pf-numerar'].b2c && !built['tva-incl-pj-bucuresti'].b2c && built['tva-eur-extern'].extern, 'B2C / extern routing');
ok(built['tva-eur-extern'].xml.includes('<cbc:TaxAmount currencyID="RON">'), 'EUR invoice: VAT also in RON');
// problems are reported
ctx.__b = { ...base, county: '', city: '' };
const bad = EF.build({ id: 'x', bizId: 'b1', series: 'TST', number: 9, date: '2026-10-20', data: { client: { kind: 'pj', name: '', cui: '' }, lines: [], currency: 'RON', date: '2026-10-20' } });
ok(bad.problems.length >= 5, 'missing data is listed: ' + bad.problems.length);
ok(EF.countyCode('jud. Mureș') === 'MS' && EF.countyCode('Municipiul București') === 'B' && EF.countyCode('Satu-Mare') === 'SM', 'county names → codes');

if (process.argv.includes('--anaf')) {
  for (const [name, r] of Object.entries(built)) {
    const res = await fetch('https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: r.xml });
    const text = await res.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    ok(j && j.stare === 'ok', `ANAF validator: ${name} → ${j ? j.stare + ' ' + JSON.stringify(j.Messages || []) : res.status + ' ' + text.slice(0, 300)}`);
  }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
