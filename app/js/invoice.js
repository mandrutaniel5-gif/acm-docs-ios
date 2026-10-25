'use strict';
// Invoices, proformas and offers for any business. You fill a form, totals
// update live, the preview shows the document, "Creează PDF" makes the file.
// Business data is entered once (several businesses can be kept).

const Invoice = (() => {
  const $ = (id) => document.getElementById(id);
  const KEY_DRAFT = 'acm.invoiceDraft';
  const KEY_ITEMS = 'acm.invoiceItems';
  const KEY_CLIENTS = 'acm.invoiceClients';
  const load = (k, d) => Biz.load(k, d);
  const store = (k, v) => Biz.store(k, v);

  let biz = null; // active business
  let inv = null; // document being written
  let addType = null;
  let previewTimer = 0;
  let showMore = false;

  // old lists of remembered items/clients (from "PDF Editor")
  if (localStorage.getItem(KEY_ITEMS) === null && localStorage.getItem('pdfeditor.invoiceItems') !== null) {
    try { localStorage.setItem(KEY_ITEMS, localStorage.getItem('pdfeditor.invoiceItems')); } catch (e) {}
  }
  if (localStorage.getItem(KEY_CLIENTS) === null && localStorage.getItem('pdfeditor.invoiceClients') !== null) {
    try {
      const old = JSON.parse(localStorage.getItem('pdfeditor.invoiceClients')) || [];
      localStorage.setItem(KEY_CLIENTS, JSON.stringify(old.map((c) => ({ ...c, extra: c.car || c.extra || {} }))));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const money = (v, loc) => (Number.isFinite(v) ? v : 0).toLocaleString(loc || I18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyC = (v, cur) => `${money(v)} ${I18n.lang !== 'ro' && (cur || 'RON') === 'RON' ? 'RON' : Biz.curSymbol(cur || 'RON')}`;

  // Words on the document itself when it is written in English
  const DOC_EN = {
    Servicii: 'Services', Produse: 'Products', Altele: 'Other', Livrare: 'Delivery', Manoperă: 'Labour', Piese: 'Parts', Materiale: 'Materials',
    Utilaje: 'Equipment', 'Ore lucrate': 'Hours worked', Proiecte: 'Projects', Abonamente: 'Subscriptions', Curse: 'Trips', Kilometri: 'Kilometres',
    'Servicii extra': 'Extra services', Mâncare: 'Food', Băuturi: 'Drinks',
    Autovehicul: 'Vehicle', Lucrare: 'Work', Proiect: 'Project', Transport: 'Transport', Eveniment: 'Event',
    'Marcă și model': 'Make and model', 'Nr. înmatriculare': 'Registration no.', 'Km la bord': 'Mileage (km)', 'Serie șasiu (VIN)': 'VIN',
    'Adresa lucrării': 'Site address', 'Ce lucrare': 'Work', Perioada: 'Period', 'Contract nr.': 'Contract no.', Traseu: 'Route',
    'Nr. auto': 'Vehicle reg. no.', 'CMR / aviz': 'CMR / delivery note', 'Data evenimentului': 'Event date', 'Nr. persoane': 'Guests',
    buc: 'pcs', 'serv.': 'serv.', ore: 'hrs', lună: 'month', cursă: 'trip', porție: 'portion', km: 'km',
    Numerar: 'Cash', Card: 'Card', 'Ordin de plată': 'Bank transfer', 'Transfer bancar': 'Bank transfer', Ramburs: 'Cash on delivery',
    FACTURĂ: 'INVOICE', 'FACTURĂ PROFORMĂ': 'PROFORMA INVOICE', 'OFERTĂ DE PREȚ': 'QUOTATION', DEVIZ: 'ESTIMATE',
    Factură: 'Invoice', Proformă: 'Proforma', Ofertă: 'Quote', Deviz: 'Estimate',
    'Client — am primit autovehiculul și documentul': 'Client — vehicle and document received', 'Client — semnătura de primire': 'Client — signature of receipt',
    'CUI:': 'Tax ID:', 'Nr. Reg. Com.:': 'Trade Reg. No.:', 'Capital social:': 'Share capital:', 'Adresă:': 'Address:', 'IBAN:': 'IBAN:', 'Banca:': 'Bank:',
    'Plătitor de TVA': 'VAT registered', 'Neplătitor de TVA': 'Not VAT registered', 'CNP:': 'Personal ID:', 'Telefon:': 'Phone:', 'Email:': 'Email:',
    '(fără TVA)': '(excl. VAT)', Total: 'Total', 'Adaugă produse sau servicii': 'Add products or services', CUI: 'Tax ID', 'Reg. Com.': 'Trade Reg.', 'Tel.': 'Tel.', 'jud.': 'County',
    'Curs BNR': 'NBR exchange rate', 'Total în lei': 'Total in RON', 'TVA în lei': 'VAT in RON',
    'Furnizor neplătitor de TVA (regim special de scutire, art. 310 Cod fiscal).': 'Supplier not registered for VAT (special exemption scheme, art. 310 of the Romanian Fiscal Code).',
  };
  const XL = () => window.INVOICE_LANGS || {};
  // every language a document can be written in: [code, its own name]
  const DOC_LANGS = [['ro', 'Română'], ['en', 'English'], ...Object.entries(window.INVOICE_LANGS || {}).map(([c, x]) => [c, x.name])];
  const docLang = (data) => (data && (data.lang === 'ro' || data.lang === 'en' || XL()[data.lang]) ? data.lang : 'ro');
  /** A Romanian word of the document in the document's language (English, then Romanian, if missing). */
  const trDoc = (lang, s) => {
    if (lang === 'ro') return s;
    const x = XL()[lang];
    if (x && x.terms[s] !== undefined) return x.terms[s];
    return DOC_EN[s] !== undefined ? DOC_EN[s] : s;
  };
  const docLocale = (lang) => (lang === 'ro' ? 'ro-RO' : lang === 'en' ? 'en-GB' : (XL()[lang] && XL()[lang].loc) || 'en-GB');
  /** The texts printed on the document: yours (Aspect) over the built-in ones of that language. */
  function labelsFor(T, lang) {
    if (lang === 'ro') return T.labels;
    if (lang === 'en') return T.labelsEn;
    T.labelsBy = T.labelsBy || {};
    const mine = (T.labelsBy[lang] = T.labelsBy[lang] || {});
    const base = (XL()[lang] && XL()[lang].labels) || T.labelsEn;
    return new Proxy(mine, { get: (o, k) => (o[k] !== undefined && o[k] !== '' ? o[k] : base[k]), set: (o, k, v) => { o[k] = v; return true; } });
  }
  const num = (s) => {
    if (typeof s === 'number') return s;
    let t = String(s || '').trim().replace(/\s/g, '');
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(',', '.');
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : 0;
  };
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => isoDate(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
  const dateRo = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || ''; };
  const pad = (n) => String(n).padStart(4, '0');
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ind = () => Biz.industry(biz && biz.industry);
  const cats = () => ind().cats;
  const catOf = (type) => cats().find((c) => c.id === type) || null;

  // ---- what this business usually picks (learned from its own documents) ----
  function topOf(counts, min = 2) {
    let best = null, n = 0, total = 0;
    for (const [k, v] of Object.entries(counts || {})) { total += v; if (v > n) { best = k; n = v; } }
    return total >= min ? best : null;
  }
  function habit(key) { return topOf(((biz && biz.habits) || {})[key]); }
  function learn() {
    const h = JSON.parse(JSON.stringify((biz && biz.habits) || {}));
    const add = (k, v) => { if (v === undefined || v === null || v === '') return; h[k] = h[k] || {}; h[k][v] = (h[k][v] || 0) + 1; };
    add('pay', inv.pay); add('kind', inv.client.kind); add('cur', inv.currency); add('lang', inv.lang || 'ro');
    if (inv.docType === 'invoice') add('paid', paidState() ? 'yes' : 'no');
    biz = Biz.save({ ...biz, habits: h });
  }

  function blank(type = 'invoice') {
    const b = biz;
    const pr = Biz.preset(b && b.industry);
    const paidH = habit('paid');
    const paid = type === 'invoice' ? (paidH ? paidH === 'yes' : pr.paid) : null;
    const days = (b && b.payDays) || pr.payDays || 15;
    return {
      bizId: b ? b.id : null, docType: type,
      series: b ? b.series[type] : Biz.DOC_TYPES[type].series, number: b ? b.next[type] : 1,
      date: today(), due: type !== 'invoice' ? addDays(today(), 30) : paid ? '' : addDays(today(), days),
      pay: habit('pay') || pr.pay, currency: habit('cur') || (b && b.currency) || 'RON', rate: '',
      client: { kind: habit('kind') || pr.kind, name: '', phone: '', email: '', address: '', city: '', county: '', country: 'România', cnp: '', cui: '', regcom: '' },
      extra: {}, lines: [], discount: 0,
      notes: (b && b.notes) || '',
      lang: habit('lang') || (b && b.docLang) || 'ro',
      paid,
    };
  }

  function saveDraft() { if (inv) store(KEY_DRAFT, inv); }

  // ---------------------------------------------------------------------------
  // Money
  // ---------------------------------------------------------------------------

  function compute(data = inv, b = biz) {
    const vat = !!(b && b.vatPayer), rate = (num(b && b.vatRate) || 0) / 100;
    const incl = !!(b && b.pricesInclVat);
    const rows = data.lines.map((l) => {
      const qty = num(l.qty) || 0, price = num(l.price) || 0;
      let unit, base, tva, gross;
      if (vat && incl) {
        gross = r2(qty * price); base = r2(gross / (1 + rate)); tva = r2(gross - base); unit = r2(price / (1 + rate));
      } else if (vat) {
        unit = price; base = r2(qty * price); tva = r2(base * rate); gross = r2(base + tva);
      } else {
        unit = price; base = r2(qty * price); tva = 0; gross = base;
      }
      return { ...l, qtyN: qty, unit, base, tva, gross };
    });
    const sum = (f, list = rows) => r2(list.reduce((s, x) => s + x[f], 0));
    const d = Math.min(100, Math.max(0, num(data.discount) || 0)) / 100;
    const subGross = sum('gross'), subBase = sum('base'), subTva = sum('tva');
    const base = r2(subBase * (1 - d)), tva = r2(subTva * (1 - d));
    const total = vat ? r2(base + tva) : r2(subGross * (1 - d));
    const groups = {};
    for (const r of rows) groups[r.type] = r2((groups[r.type] || 0) + r.gross);
    return { rows, vat, rate, discount: d, subGross, subBase, discountValue: r2(subGross - total), base: vat ? base : total, tva: vat ? tva : 0, total, groups };
  }

  // ---------------------------------------------------------------------------
  // Layout of the documents ("Aspect"): colors, structure, texts. Saved per business.
  // ---------------------------------------------------------------------------

  const DEFAULT_TPL = {
    color: '#1d5b79', text: '#1b1b1f', font: 'Segoe UI', size: 9.6, margin: 14,
    header: 'light', // light | tint | band
    boxes: 'outline', // outline | tint | none
    tableHead: 'line', // line | tint | fill
    tableRows: 'lines', // lines | zebra | grid | none
    totalStyle: 'outline', // outline | tint | fill
    logo: { show: true, size: 26, shape: 'rounded', pos: 'left' },
    order: ['parties', 'extra', 'table', 'totals', 'notes', 'signatures', 'footer'],
    hidden: [],
    columns: { nr: true, um: true, qty: true, price: true },
    group: true, subtotals: true,
    footer: '',
    fileName: '{serie}-{nr} {client}',
    labels: {
      titleInvoice: '', titleProforma: '', titleQuote: '',
      series: 'Seria', number: 'nr.', date: 'Data emiterii', due: 'Scadență', valid: 'Valabilă până la',
      supplier: 'FURNIZOR', client: 'CLIENT',
      colNr: 'Nr.', colDesc: 'Denumire produse / servicii', colUm: 'U.M.', colQty: 'Cant.', colPrice: 'Preț unitar', colValue: 'Valoare',
      subtotal: 'Subtotal', discount: 'Discount', totalBase: 'Total fără TVA', totalVat: 'TVA', grand: 'TOTAL DE PLATĂ',
      payment: 'Modalitate de plată', notes: 'Observații',
      signSupplier: 'Furnizor — semnătura', signClient: '',
    },
    labelsEn: {
      titleInvoice: '', titleProforma: '', titleQuote: '',
      series: 'Series', number: 'no.', date: 'Issue date', due: 'Due date', valid: 'Valid until',
      supplier: 'SUPPLIER', client: 'CLIENT',
      colNr: 'No.', colDesc: 'Description', colUm: 'Unit', colQty: 'Qty', colPrice: 'Unit price', colValue: 'Amount',
      subtotal: 'Subtotal', discount: 'Discount', totalBase: 'Total excl. VAT', totalVat: 'VAT', grand: 'TOTAL DUE',
      payment: 'Payment method', notes: 'Notes',
      signSupplier: 'Supplier — signature', signClient: '',
    },
  };
  function withDefaults(t) {
    const d = clone(DEFAULT_TPL);
    t = t || {};
    const out = { ...d, ...t, logo: { ...d.logo, ...(t.logo || {}) }, columns: { ...d.columns, ...(t.columns || {}) }, labels: { ...d.labels, ...(t.labels || {}) }, labelsEn: { ...d.labelsEn, ...(t.labelsEn || {}) }, labelsBy: clone(t.labelsBy || {}) };
    const map = (s) => (s === 'car' ? 'extra' : s);
    const order = (Array.isArray(t.order) ? t.order.map(map) : d.order).filter((s) => d.order.includes(s));
    for (const s of d.order) if (!order.includes(s)) order.splice(Math.min(order.length, d.order.indexOf(s)), 0, s);
    out.order = [...new Set(order)];
    out.hidden = Array.isArray(t.hidden) ? t.hidden.map(map).filter((s) => d.order.includes(s)) : [];
    delete out.title;
    // texts carried over from the old "PDF Editor" (made for a car service): back to automatic
    const LEGACY = { signClient: ['Client — am primit autovehiculul și factura'], titleInvoice: ['FACTURA', 'FACTURĂ'] };
    for (const [k, vals] of Object.entries(LEGACY)) if (vals.includes(out.labels[k])) out.labels[k] = '';
    for (const k of ['car', 'plate', 'vin', 'km', 'groupParts', 'groupLabor', 'groupOther', 'totalParts', 'totalLabor', 'totalOther']) delete out.labels[k];
    return out;
  }

  // Ready-made looks for the documents (the structure and texts stay yours)
  const TEMPLATES = [
    { id: 'clasic', name: 'Clasic', desc: 'Echilibrat, potrivit oricui', set: { color: '#1d5b79', text: '#1b1b1f', font: 'Segoe UI', size: 9.6, margin: 14, header: 'light', boxes: 'outline', tableHead: 'line', tableRows: 'lines', totalStyle: 'outline', logo: { shape: 'rounded', size: 26 } } },
    { id: 'modern', name: 'Modern', desc: 'Antet colorat, bold', set: { color: '#3d5afe', text: '#1b1b1f', font: 'Segoe UI', size: 9.6, margin: 14, header: 'band', boxes: 'tint', tableHead: 'fill', tableRows: 'zebra', totalStyle: 'fill', logo: { shape: 'circle', size: 24 } } },
    { id: 'corporate', name: 'Corporate', desc: 'Sobru, pentru firme', set: { color: '#1f5fa8', text: '#1d2b3a', font: 'Calibri', size: 9.8, margin: 15, header: 'tint', boxes: 'tint', tableHead: 'fill', tableRows: 'grid', totalStyle: 'fill', logo: { shape: 'square', size: 24 } } },
    { id: 'minimal', name: 'Minimal', desc: 'Doar esențialul, aerisit', set: { color: '#111111', text: '#111111', font: 'Arial', size: 9.4, margin: 18, header: 'light', boxes: 'none', tableHead: 'line', tableRows: 'lines', totalStyle: 'outline', logo: { shape: 'square', size: 20 } } },
    { id: 'elegant', name: 'Elegant', desc: 'Font clasic, nuanțe calde', set: { color: '#7a5c2e', text: '#2a2118', font: 'Georgia', size: 9.8, margin: 16, header: 'tint', boxes: 'outline', tableHead: 'tint', tableRows: 'none', totalStyle: 'tint', logo: { shape: 'circle', size: 26 } } },
    { id: 'tehnic', name: 'Tehnic', desc: 'Grilă clară, multe rânduri', set: { color: '#2e7d4f', text: '#1b1b1f', font: 'Tahoma', size: 8.8, margin: 11, header: 'light', boxes: 'outline', tableHead: 'tint', tableRows: 'grid', totalStyle: 'tint', logo: { shape: 'rounded', size: 20 } } },
    { id: 'econom', name: 'Econom', desc: 'Cel mai puțin tuș la imprimare', set: { color: '#3b3f46', text: '#1b1b1f', font: 'Arial', size: 9.4, margin: 13, header: 'light', boxes: 'none', tableHead: 'line', tableRows: 'lines', totalStyle: 'outline', logo: { shape: 'square', size: 18 } } },
    { id: 'roz', name: 'Boutique', desc: 'Pentru saloane și magazine', set: { color: '#c2185b', text: '#2b1a22', font: 'Trebuchet MS', size: 9.6, margin: 15, header: 'tint', boxes: 'tint', tableHead: 'tint', tableRows: 'zebra', totalStyle: 'fill', logo: { shape: 'circle', size: 26 } } },
  ];
  function applyTemplate(T, tm) {
    const set = clone(tm.set);
    Object.assign(T, set, { logo: { ...T.logo, ...set.logo }, template: tm.id });
  }
  let tplDraft = null; // while "Aspect" is open
  const tplOf = (b = biz) => withDefaults(b && b.tpl);

  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const v = m ? parseInt(m[1], 16) : 0x1d5b79;
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  }

  function titleFor(data, T, b = biz) {
    const lang = docLang(data);
    const L = labelsFor(T, lang);
    const custom = { invoice: L.titleInvoice, proforma: L.titleProforma, quote: L.titleQuote }[data.docType];
    const t = Biz.docTitle(data.docType, Biz.industry(b && b.industry));
    return custom || trDoc(lang, t);
  }

  /** The document as a web page (made into a PDF by the app). */
  function html(data = inv, T = tplDraft || tplOf(), b = biz) {
    const lang = docLang(data);
    const en = lang !== 'ro'; // any language but Romanian: RON instead of "lei", the decimal point of the language
    const D = (s) => trDoc(lang, s);
    const loc = docLocale(lang);
    const rtl = !!(XL()[lang] && XL()[lang].rtl);
    const money = (v) => (Number.isFinite(v) ? v : 0).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const c = b || Biz.blankProfile(), t = compute(data, b), L = labelsFor(T, lang), A = T.color;
    const I = Biz.industry(c.industry);
    const cur = en && (data.currency || 'RON') === 'RON' ? 'RON' : Biz.curSymbol(data.currency || 'RON');
    const kv = (k, v) => (v ? `<div><span>${esc(D(k))}</span> ${esc(v)}</div>` : '');
    const cl = data.client || {};
    const ex = data.extra || {};
    const exFields = I.extra ? I.extra.fields.filter((f) => ex[f.key]) : [];
    const order0 = I.cats.map((x) => x.id);
    const typeOf = (r) => (order0.includes(r.type) ? r.type : order0[order0.length - 1]);
    const used = order0.filter((ty) => t.rows.some((r) => typeOf(r) === ty));
    const grouped = T.group && used.length > 1;
    const cols = T.columns;
    const ncols = 2 + (cols.nr ? 1 : 0) + (cols.um ? 1 : 0) + (cols.qty ? 1 : 0) + (cols.price ? 1 : 0) + (t.vat ? 1 : 0) - 1;
    let n = 0;
    const rowHtml = (r) => {
      n++;
      const cat = I.cats.find((x) => x.id === typeOf(r));
      return `<tr>${cols.nr ? `<td class="c">${n}</td>` : ''}<td>${esc(r.desc)}</td>${cols.um ? `<td class="c">${esc(D(r.um || (cat ? cat.um : 'buc')))}</td>` : ''}${cols.qty ? `<td class="r">${esc(r.qtyN.toLocaleString(loc, { maximumFractionDigits: 3 }))}</td>` : ''}
        ${cols.price ? `<td class="r">${money(r.unit)}</td>` : ''}<td class="r">${money(r.base)}</td>${t.vat ? `<td class="r">${money(r.tva)}</td>` : ''}</tr>`;
    };
    let body = '';
    for (const ty of order0) {
      const rs = t.rows.filter((r) => typeOf(r) === ty);
      if (!rs.length) continue;
      const cat = I.cats.find((x) => x.id === ty);
      if (grouped) body += `<tr class="grp"><td colspan="${ncols + 1}">${esc(D(cat.group))}</td></tr>`;
      body += rs.map(rowHtml).join('');
    }
    if (!t.rows.length) body = `<tr><td colspan="${ncols + 1}" class="empty">${esc(D('Adaugă produse sau servicii'))}</td></tr>`;

    const supplierName = c.legal || c.name || 'Numele firmei';
    const addr = [c.address, c.city, c.county && !/^bucure/i.test(c.county) ? D('jud.') + ' ' + c.county : ''].filter(Boolean).join(', ');
    const logo = T.logo.show && c.logo ? `<img class="logo" src="${c.logo}">` : '';
    const vis = (s) => !T.hidden.includes(s);
    const band = T.header === 'band';
    const isInv = data.docType === 'invoice';
    const signClient = L.signClient || D(I.signClient || 'Client — semnătura de primire');
    const nonVat = c.nonVatNote ? D(c.nonVatNote) : '';

    const blocks = {
      parties: () => `<div class="parties">
        <div class="party"><h3>${esc(L.supplier)}</h3><div class="nm">${esc(supplierName)}</div>
          ${kv('CUI:', c.cui)}${kv('Nr. Reg. Com.:', c.regcom)}${kv('Capital social:', c.capital)}${kv('Adresă:', addr)}
          ${kv('IBAN:', c.iban)}${kv('Banca:', c.bank)}<div><span>${D(c.vatPayer ? 'Plătitor de TVA' : 'Neplătitor de TVA')}</span></div></div>
        <div class="party"><h3>${esc(L.client)}</h3><div class="nm">${esc(cl.name || '—')}</div>
          ${cl.kind === 'pj' ? kv('CUI:', cl.cui) + kv('Nr. Reg. Com.:', cl.regcom) : kv('CNP:', cl.cnp)}
          ${kv('Adresă:', [cl.address, cl.city, cl.county && !/^bucure/i.test(cl.county) ? D('jud.') + ' ' + cl.county : '', cl.country && !/^rom[aâ]nia$/i.test(String(cl.country).trim()) ? cl.country : ''].filter(Boolean).join(', '))}${kv('Telefon:', cl.phone)}${kv('Email:', cl.email)}</div></div>`,
      extra: () => (exFields.length ? `<div class="car">${I.extra.title ? `<b class="et">${esc(D(I.extra.title))}</b>` : ''}${exFields.map((f) => kv(D(f.label) + ':', f.upper ? String(ex[f.key]).toUpperCase() : ex[f.key])).join('')}</div>` : ''),
      table: () => `<table><thead><tr>${cols.nr ? `<th class="c" style="width:8mm">${esc(L.colNr)}</th>` : ''}<th>${esc(L.colDesc)}</th>
          ${cols.um ? `<th class="c" style="width:13mm">${esc(L.colUm)}</th>` : ''}${cols.qty ? `<th class="r" style="width:13mm">${esc(L.colQty)}</th>` : ''}
          ${cols.price ? `<th class="r" style="width:24mm">${esc(L.colPrice)}${t.vat ? '<br>' + D('(fără TVA)') : ''}</th>` : ''}
          <th class="r" style="width:24mm">${esc(L.colValue)}${t.vat ? '<br>' + D('(fără TVA)') : ''}</th>${t.vat ? `<th class="r" style="width:20mm">${esc(L.totalVat)} ${esc(c.vatRate)}%</th>` : ''}</tr></thead>
        <tbody>${body}</tbody></table>`,
      totals: () => {
        let h = '';
        if (T.subtotals && used.length > 1) for (const ty of used) h += `<div><span>${esc(D('Total'))} ${esc(D(I.cats.find((x) => x.id === ty).group).toLocaleLowerCase(loc))}</span><b>${money(t.groups[ty] || 0)} ${cur}</b></div>`;
        if (t.discount > 0) h += `<div><span>${esc(L.subtotal)}</span><b>${money(t.subGross)} ${cur}</b></div><div><span>${esc(L.discount)} ${esc(String(r2(t.discount * 100)).replace('.', ','))}%</span><b>−${money(t.discountValue)} ${cur}</b></div>`;
        if (t.vat) h += `<div><span>${esc(L.totalBase)}</span><b>${money(t.base)} ${cur}</b></div><div><span>${esc(L.totalVat)} ${esc(c.vatRate)}%</span><b>${money(t.tva)} ${cur}</b></div>`;
        const rate = (data.currency || 'RON') !== 'RON' ? num(data.rate) : 0;
        let ron = '';
        if (rate > 0) {
          const rr = (v) => (Number.isFinite(v) ? v : 0).toLocaleString(loc, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
          ron = `<div class="fx"><span>${esc(D('Curs BNR'))}: 1 ${esc(data.currency)} = ${rr(rate)} ${en ? 'RON' : 'lei'}</span></div>`
            + (t.vat ? `<div><span>${esc(D('TVA în lei'))}</span><b>${money(r2(t.tva * rate))} ${en ? 'RON' : 'lei'}</b></div>` : '')
            + `<div><span>${esc(D('Total în lei'))}</span><b>${money(r2(t.total * rate))} ${en ? 'RON' : 'lei'}</b></div>`;
        }
        return `<div class="totals">${h}<div class="grand"><span>${esc(L.grand)}</span>${money(t.total)} ${cur}</div>${ron}</div>`;
      },
      notes: () => `<div class="notes">
          <p><span class="lbl">${esc(L.payment)}:</span> ${esc(D(data.pay))}</p>
          ${data.due ? `<p><span class="lbl">${esc(isInv ? L.due : L.valid)}:</span> ${dateRo(data.due)}</p>` : ''}
          ${!c.vatPayer && nonVat ? `<p>${esc(nonVat)}</p>` : ''}
          ${data.notes ? `<p><span class="lbl">${esc(L.notes)}:</span> ${esc(data.notes).replace(/\n/g, '<br>')}</p>` : ''}</div>`,
      signatures: () => `<div class="sign"><div>${esc(L.signSupplier)}</div><div>${esc(signClient)}</div></div>`,
      footer: () => `<div class="foot">${esc(T.footer || [supplierName, c.phone, c.email, c.web].filter(Boolean).join(' · '))}</div>`,
    };

    const order = T.order.filter(vis);
    let content = '';
    for (let i = 0; i < order.length; i++) {
      const s = order[i], nx = order[i + 1];
      if ((s === 'totals' && nx === 'notes') || (s === 'notes' && nx === 'totals')) {
        content += `<div class="sum">${blocks.notes()}${blocks.totals()}</div>`;
        i++;
      } else if (s === 'totals') content += `<div class="sum"><div class="notes"></div>${blocks.totals()}</div>`;
      else content += blocks[s]();
    }
    const sigIdx = order.indexOf('signatures');
    const pushDown = sigIdx >= 0 && order.slice(sigIdx).every((s) => s === 'signatures' || s === 'footer');

    const box = T.boxes === 'tint' ? `background:${rgba(A, 0.06)}; border: 0;` : T.boxes === 'none' ? 'border: 0; padding-left: 0; padding-right: 0;' : `border: 0.3mm solid ${rgba(A, 0.28)};`;
    const head = T.tableHead === 'fill' ? `background:${A}; color:#fff;` : T.tableHead === 'tint' ? `background:${rgba(A, 0.1)}; color:${A};` : `color:${A}; border-bottom: 0.5mm solid ${A};`;
    const rowLine = T.tableRows === 'none' ? 'border: 0;' : T.tableRows === 'grid' ? `border: 0.25mm solid ${rgba(A, 0.25)};` : `border-bottom: 0.25mm solid #e3e3e8;`;
    const grand = T.totalStyle === 'fill' ? `background:${A}; color:#fff;` : T.totalStyle === 'tint' ? `background:${rgba(A, 0.1)}; color:${A};` : `border: 0.5mm solid ${A}; color:${A};`;
    const headerCss = band
      ? `background:${A}; color:#fff; padding: 7mm ${T.margin}mm;`
      : T.header === 'tint'
        ? `background:${rgba(A, 0.07)}; padding: 7mm ${T.margin}mm; border-bottom: 0.6mm solid ${A};`
        : `padding: ${Math.max(8, T.margin - 2)}mm ${T.margin}mm 5mm; border-bottom: 0.6mm solid ${A}; margin: 0 ${T.margin}mm; padding-left: 0; padding-right: 0;`;
    const radius = T.logo.shape === 'circle' ? '50%' : T.logo.shape === 'rounded' ? '3mm' : '0';
    const fontStack = `"${T.font}", ${/times|georgia|cambria/i.test(T.font) ? '"Liberation Serif", "Noto Serif", Georgia, serif' : 'Arial, "Liberation Sans", Roboto, sans-serif'}`;
    const docTitle = titleFor(data, T, b);

    return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(docTitle)} ${esc(data.series)}-${pad(data.number)}</title><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { width: 210mm; font: ${T.size}pt/1.4 ${fontStack}; color: ${T.text}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { padding: 0 0 12mm; min-height: 297mm; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 5mm; ${headerCss} }
.head.right { flex-direction: row-reverse; }
.head .logo { width: ${T.logo.size}mm; height: ${T.logo.size}mm; object-fit: ${T.logo.shape === 'square' ? 'contain' : 'cover'}; border-radius: ${radius}; flex: none; }
.head .co { flex: 1; font-size: ${(T.size * 0.9).toFixed(1)}pt; line-height: 1.5; color: ${band ? 'rgba(255,255,255,.85)' : '#55555c'}; }
.head .co b { display: block; font-size: ${(T.size * 1.35).toFixed(1)}pt; color: ${band ? '#fff' : T.text}; margin-bottom: .6mm; }
.head .doc { text-align: right; }
.head.right .doc { text-align: left; }
.head .doc h1 { margin: 0 0 1.5mm; font-size: ${(T.size * (docTitle.length > 12 ? 1.8 : 2.4)).toFixed(1)}pt; letter-spacing: 2px; font-weight: 800; color: ${band ? '#fff' : A}; }
.head .doc div { font-size: ${(T.size * 0.94).toFixed(1)}pt; color: ${band ? 'rgba(255,255,255,.85)' : '#55555c'}; }
.head .doc strong { color: ${band ? '#fff' : T.text}; }
.wrap { padding: 6mm ${T.margin}mm 0; flex: 1; display: flex; flex-direction: column; }
.wrap > * + * { margin-top: 5mm; }
.parties { display: flex; gap: 7mm; }
.party { flex: 1; border-radius: 2mm; padding: 3.5mm 4.5mm; ${box} }
.party h3 { margin: 0 0 1.5mm; font-size: ${(T.size * 0.8).toFixed(1)}pt; letter-spacing: 1.5px; color: ${A}; }
.party .nm { font-size: ${(T.size * 1.15).toFixed(1)}pt; font-weight: 700; margin-bottom: .8mm; }
.party div span, .car div span, .notes .lbl { color: #77777f; }
.car { display: flex; flex-wrap: wrap; align-items: baseline; gap: 1.5mm 8mm; border-radius: 2mm; padding: 2.5mm 4.5mm; ${box} }
.car .et { font-size: ${(T.size * 0.8).toFixed(1)}pt; letter-spacing: 1.2px; color: ${A}; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; }
th { ${head} font-size: ${(T.size * 0.82).toFixed(1)}pt; font-weight: 700; text-align: left; padding: 2mm; }
th.r, td.r { text-align: right; } th.c, td.c { text-align: center; }
td { padding: 2mm; vertical-align: top; ${rowLine} }
${T.tableRows === 'zebra' ? `tbody tr:nth-child(even) td { background: ${rgba(A, 0.05)}; } td { border: 0; }` : ''}
tr.grp td { font-weight: 700; font-size: ${(T.size * 0.84).toFixed(1)}pt; letter-spacing: .5px; color: ${A}; padding-top: 3mm; background: none; }
td.empty { text-align: center; color: #9a9aa2; padding: 8mm; }
.sum { display: flex; justify-content: space-between; gap: 10mm; }
.notes { flex: 1; font-size: ${(T.size * 0.9).toFixed(1)}pt; }
.notes p { margin: 0 0 1.6mm; }
.totals { width: 80mm; margin-left: auto; }
.totals div { display: flex; justify-content: space-between; padding: 1.2mm 0; border-bottom: 0.25mm solid #ececf0; }
.totals div span { color: #55555c; }
.totals .grand { margin-top: 2mm; border-radius: 1.5mm; padding: 2.8mm 4mm; font-size: ${(T.size * 1.3).toFixed(1)}pt; font-weight: 800; border-bottom-width: 0.5mm; ${grand} }
.totals .fx { border: 0; padding-top: 2.5mm; } .totals .fx span { font-size: ${(T.size * 0.85).toFixed(1)}pt; }
.totals .grand span { color: inherit; font-weight: 600; font-size: ${(T.size * 0.92).toFixed(1)}pt; align-self: center; }
.sign { display: flex; gap: 20mm; padding-top: 12mm; ${pushDown ? 'margin-top: auto !important;' : ''} }
.sign div { flex: 1; border-top: 0.3mm solid #9a9aa2; padding-top: 1.5mm; font-size: ${(T.size * 0.84).toFixed(1)}pt; color: #66666d; }
.foot { font-size: ${(T.size * 0.78).toFixed(1)}pt; color: #9a9aa2; text-align: center; ${order.indexOf('footer') === order.length - 1 && !pushDown ? 'margin-top: auto !important; padding-top: 6mm;' : ''} }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
</style></head><body><div class="page">
<div class="head${T.logo.pos === 'right' ? ' right' : ''}">
  ${logo}
  <div class="co"><b>${esc(supplierName)}</b>${[c.cui && D('CUI') + ' ' + c.cui, c.regcom && D('Reg. Com.') + ' ' + c.regcom].filter(Boolean).map(esc).join(' · ')}
    ${addr ? `<br>${esc(addr)}` : ''}
    ${c.phone || c.email ? `<br>${esc([c.phone && D('Tel.') + ' ' + c.phone, c.email].filter(Boolean).join(' · '))}` : ''}</div>
  <div class="doc"><h1>${esc(docTitle)}</h1>
    <div>${esc(L.series)} <strong>${esc(data.series)}</strong> ${esc(L.number)} <strong>${pad(data.number)}</strong></div>
    <div>${esc(L.date)}: <strong>${dateRo(data.date)}</strong></div></div>
</div>
<div class="wrap">${content}</div></div></body></html>`;
  }

  /** File name from the pattern in "Aspect". */
  function fileNameFor(data = inv, T = tplOf()) {
    const I = ind();
    const firstExtra = I.extra ? (data.extra || {})[I.extra.fields[0].key] || '' : '';
    const plate = (data.extra || {}).plate || (data.extra || {}).vehicle || firstExtra;
    const name = String(T.fileName || DEFAULT_TPL.fileName)
      .replace(/\{tip\}/gi, trDoc(docLang(data), Biz.docLabel(data.docType, I)))
      .replace(/\{serie\}/gi, data.series)
      .replace(/\{nr\}/gi, pad(data.number))
      .replace(/\{client\}/gi, (data.client.name || '').trim())
      .replace(/\{data\}/gi, dateRo(data.date))
      .replace(/\{masina\}|\{detalii\}/gi, String(plate || '').toUpperCase());
    const base = clean(name) || `${data.series}-${pad(data.number)}`;
    const lbl = trDoc(docLang(data), Biz.docLabel(data.docType, I));
    return data.docType === 'invoice' || /\{tip\}/i.test(T.fileName) ? base : `${lbl} ${base}`;
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  function get(path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), inv); }
  function set(path, v) {
    const ks = path.split('.');
    let o = inv;
    for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]]) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  function field(label, path, opts = {}) {
    const input = el(opts.multiline ? 'textarea' : 'input', {
      class: 'in', type: opts.type || 'text', placeholder: opts.placeholder || '', spellcheck: 'false',
      list: opts.list || null, inputmode: opts.inputmode || null, autocapitalize: opts.upper ? 'characters' : null,
      enterkeyhint: 'next',
    });
    input.value = get(path) == null ? '' : get(path);
    input.dataset.path = path;
    input.addEventListener('input', () => { set(path, input.value); if (opts.onInput) opts.onInput(input.value); changed(); });
    return el('label', { class: 'fld-l' + (opts.wide ? ' wide' : '') }, [el('span', { text: label }), input]);
  }

  /** County as a list (e-Factura needs the exact county); an old free-text value is kept as it is. */
  function countyField(o, label = 'Județ') {
    const list = typeof EFactura !== 'undefined' ? EFactura.COUNTIES : [];
    const cur = String(o.county || '');
    const code = typeof EFactura !== 'undefined' ? EFactura.countyCode(cur) : '';
    const s = el('select', { class: 'in' });
    s.append(el('option', { value: '', text: '—' }));
    let matched = false;
    for (const [c, n] of list) { const on = !!cur && c === code; matched = matched || on; s.append(el('option', { value: n, text: n, selected: on })); }
    if (cur && !matched) s.append(el('option', { value: cur, text: cur, selected: true }));
    s.addEventListener('change', () => { o.county = s.value; if (o === (inv && inv.client)) changed(); });
    return el('label', { class: 'fld-l' }, [el('span', { text: label }), s]);
  }

  function selectField(label, value, options, onPick) {
    const s = el('select', { class: 'in' });
    for (const [v, t] of options) s.append(el('option', { value: v, text: t, selected: v === value }));
    s.addEventListener('change', () => onPick(s.value));
    return el('label', { class: 'fld-l' }, [el('span', { text: label }), s]);
  }

  function chips(options, value, onPick) {
    const box = el('div', { class: 'chips' });
    for (const [v, label] of options) {
      const b = el('button', { class: 'chip' + (v === value ? ' on' : ''), text: label, type: 'button' });
      b.dataset.v = v;
      b.addEventListener('click', () => { box.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); onPick(v); });
      box.append(b);
    }
    return box;
  }

  function section(title, children, extra) {
    return el('section', { class: 'inv-card' }, [el('div', { class: 'inv-h' }, [el('h3', { text: title }), extra || null]), ...children]);
  }

  function setDocType(type) {
    if (inv.docType === type) return;
    const wasAuto = inv.series === biz.series[inv.docType] && +inv.number === +biz.next[inv.docType];
    inv.docType = type;
    if (wasAuto || !inv.series) { inv.series = biz.series[type]; inv.number = biz.next[type]; }
    if (type !== 'invoice' && !inv.due) inv.due = addDays(inv.date || today(), 30);
    if (type === 'invoice') inv.due = biz.payDays ? addDays(inv.date || today(), biz.payDays) : '';
    buildForm();
    changed();
  }

  function buildForm() {
    const form = $('inv-form');
    const keep = form.scrollTop;
    form.innerHTML = '';
    const I = ind();
    if (!addType || !catOf(addType)) addType = cats()[0].id;

    if (!biz.cui || !biz.address) {
      form.append(el('div', { class: 'inv-warn' }, [
        el('span', { html: svg('building') }),
        el('div', {}, [el('b', { text: 'Completează datele firmei' }), el('span', { text: 'CUI, adresă, IBAN — apar pe fiecare document. Le scrii o singură dată.' })]),
        el('button', { class: 'btn primary', text: 'Completează', type: 'button', onclick: () => openSettings(biz.id) }),
      ]));
    }

    // Document
    const typeChips = chips(Object.keys(Biz.DOC_TYPES).map((k) => [k, Biz.docLabel(k, I)]), inv.docType, setDocType);
    const isInv = inv.docType === 'invoice';
    form.append(section('Document', [el('div', { class: 'grid' }, [
      field('Serie', 'series', { upper: true }),
      field('Număr', 'number', { inputmode: 'numeric' }),
      field('Data', 'date', { type: 'date' }),
      field(isInv ? 'Scadență (termen de plată)' : 'Valabilă până la', 'due', { type: 'date', onInput: () => { const sm = document.querySelector('.payopts .payopt:nth-child(2) small'); if (sm && inv.due) sm.textContent = `Până pe ${dateRo(inv.due)}`; } }),
      selectField('Cum plătește', inv.pay, ['Numerar', 'Card', 'Ordin de plată', 'Transfer bancar', 'Ramburs'].map((p) => [p, p]), (v) => {
        const wasAuto = inv.paid === null;
        inv.pay = v;
        if (wasAuto) { buildForm(); }
        changed();
      }),
      selectField('Monedă', inv.currency, Biz.CURRENCIES.map(([c, s]) => [c, c === 'RON' ? 'RON (lei)' : c]), (v) => {
        inv.currency = v;
        if (v !== 'RON') { inv.rate = ''; fetchRate(true); }
        buildForm();
        changed();
      }),
      inv.currency !== 'RON' ? rateField() : null,
      selectField('Limba documentului', inv.lang || 'ro', DOC_LANGS, (v) => { inv.lang = v; changed(); }),
    ].filter(Boolean)), isInv ? payStatus() : null].filter(Boolean), typeChips));

    // Client
    const clientGrid = el('div', { class: 'grid' });
    const fillClient = () => {
      clientGrid.innerHTML = '';
      const pj = inv.client.kind === 'pj';
      clientGrid.append(
        field(pj ? 'Denumire firmă *' : 'Nume și prenume *', 'client.name', { wide: true, list: 'inv-clients', onInput: (v) => recallClient(v) }),
        ...(pj ? [field('CUI', 'client.cui', { upper: true }), field('Nr. Reg. Com.', 'client.regcom', { upper: true })] : [field('Telefon', 'client.phone', { inputmode: 'tel', type: 'tel' }), field('CNP (opțional)', 'client.cnp', { inputmode: 'numeric' })]),
        field('Adresă', 'client.address', { wide: true, placeholder: 'Str., nr.' }),
        field('Localitate', 'client.city', { placeholder: 'București: Sector 1…6' }), countyField(inv.client),
        field('Țara', 'client.country', { placeholder: 'România' }),
        ...(pj ? [field('Telefon', 'client.phone', { inputmode: 'tel', type: 'tel' })] : []),
        field('Email (opțional)', 'client.email', { inputmode: 'email', type: 'email' }),
      );
    };
    fillClient();
    const nSaved = clientsList().length;
    const pickBtn = el('button', { class: 'pick-client', type: 'button', html: svg('user') + `<span>${esc(I18n.t('Alege din clienții salvați'))}</span><i>${nSaved}</i>` });
    pickBtn.addEventListener('click', pickClient);
    form.append(section('Client', [nSaved ? pickBtn : null, clientGrid].filter(Boolean), chips([['pf', 'Persoană fizică'], ['pj', 'Firmă']], inv.client.kind, (v) => { inv.client.kind = v; fillClient(); changed(); })));

    // Details for the kind of business (car, site, project…)
    if (I.extra) {
      form.append(section(I.extra.title, [el('div', { class: 'grid' }, I.extra.fields.map((f) => field(f.label, 'extra.' + f.key, { wide: f.wide, placeholder: f.placeholder, inputmode: f.inputmode, upper: f.upper })))]));
    }

    // Lines
    const desc = el('input', { class: 'in', placeholder: I.hint, list: 'inv-items', spellcheck: 'false', enterkeyhint: 'next' });
    const qty = el('input', { class: 'in qty', value: '1', inputmode: 'decimal', title: 'Cantitate', enterkeyhint: 'next' });
    const price = el('input', { class: 'in price', placeholder: '0,00', inputmode: 'decimal', title: 'Preț', enterkeyhint: 'done' });
    const add = el('button', { class: 'btn primary add', html: svg('plus') + '<span>Adaugă</span>', type: 'button' });
    const doAdd = () => {
      const d = desc.value.trim();
      if (!d) { desc.focus(); return; }
      if (!num(price.value)) { price.focus(); price.classList.add('bad'); return; }
      inv.lines.push({ id: Date.now() + Math.random(), type: addType, desc: d, qty: num(qty.value) || 1, price: num(price.value) });
      rememberItem(d, num(price.value), addType);
      desc.value = ''; price.value = ''; qty.value = '1';
      price.classList.remove('bad');
      renderLines();
      changed();
      if (!UI.phone()) desc.focus();
    };
    add.addEventListener('click', doAdd);
    for (const i of [desc, qty, price]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (i === desc && !price.value) price.focus(); else doAdd(); } });
    desc.addEventListener('input', () => {
      const known = load(KEY_ITEMS, {})[desc.value.trim().toLowerCase()];
      if (known) { price.value = String(known.price).replace('.', ','); if (catOf(known.type)) setAddType(known.type); }
    });
    const typeChips2 = cats().length > 1 ? chips(cats().map((c) => [c.id, c.label]), addType, (v) => { addType = v; }) : null;
    const setAddType = (v) => { addType = v; if (typeChips2) typeChips2.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
    const quick = el('div', { class: 'quick-add' }, [desc, qty, el('span', { class: 'x', text: '×' }), price, el('span', { class: 'cur', text: Biz.curSymbol(inv.currency) }), add]);
    const list = el('div', { id: 'inv-lines' });
    form.append(section('Produse și servicii', [typeChips2, quick, list].filter(Boolean)));

    // More: discount, notes, paid
    const moreBox = el('div', { class: showMore ? '' : 'hidden' });
    moreBox.append(
      el('div', { class: 'grid' }, [
        field('Discount (%)', 'discount', { inputmode: 'decimal', placeholder: '0' }),
        el('span'),
        field('Observații', 'notes', { multiline: true, wide: true, placeholder: 'ex. Garanție 12 luni. Mulțumim!' }),
      ]),
    );
    const moreBtn = el('button', { class: 'inv-more', type: 'button', html: svg(showMore ? 'up' : 'down') + `<span>${showMore ? 'Mai puține opțiuni' : 'Discount și observații'}</span>` });
    moreBtn.addEventListener('click', () => { showMore = !showMore; buildForm(); });
    form.append(el('section', { class: 'inv-card' }, [moreBox, moreBtn]));

    // datalists
    const dl = $('inv-items') || el('datalist', { id: 'inv-items' });
    dl.innerHTML = '';
    for (const [, v] of Object.entries(load(KEY_ITEMS, {})).sort((a, b) => b[1].n - a[1].n).slice(0, 200)) dl.append(el('option', { value: v.desc }));
    const dc = $('inv-clients') || el('datalist', { id: 'inv-clients' });
    dc.innerHTML = '';
    for (const c of load(KEY_CLIENTS, []).slice(0, 200)) dc.append(el('option', { value: c.name }));
    document.body.append(dl, dc);

    renderLines();
    form.scrollTop = keep;
    if (!UI.phone()) setTimeout(() => { const f = form.querySelector('[data-path="client.name"]'); if (f && !inv.client.name && document.activeElement === document.body) f.focus(); }, 50);
  }

  function paidState() {
    if (inv.paid === true || inv.paid === false) return inv.paid;
    return /numerar|card/i.test(inv.pay || '');
  }

  /** Exchange rate for documents in another currency (Romanian law: amounts also shown in lei). */
  function rateField() {
    const input = el('input', { class: 'in', inputmode: 'decimal', placeholder: 'ex. 4,9750', spellcheck: 'false' });
    input.value = inv.rate ? String(inv.rate).replace('.', ',') : '';
    input.addEventListener('input', () => { inv.rate = num(input.value) || ''; changed(); });
    const btn = el('button', { class: 'rate-btn', type: 'button', text: I18n.t('Curs BNR azi') });
    btn.addEventListener('click', () => fetchRate(false));
    return el('label', { class: 'fld-l' }, [el('span', { text: `Curs (1 ${inv.currency} = ? lei)` }), el('div', { class: 'rate-row' }, [input, btn])]);
  }

  /** Today's rate from the National Bank of Romania (needs internet). */
  async function fetchRate(quiet) {
    const cur = inv.currency;
    if (cur === 'RON') return;
    try {
      const xml = await Host.fetchText('https://www.bnr.ro/nbrfxrates.xml');
      const m = new RegExp('<Rate currency="' + cur + '"(?: multiplier="(\\d+)")?>([\\d.]+)</Rate>').exec(xml);
      if (!m) throw new Error(I18n.t('Moneda nu apare în cursul BNR.'));
      const rate = Math.round((parseFloat(m[2]) / (m[1] ? +m[1] : 1)) * 10000) / 10000;
      if (inv.currency !== cur) return;
      inv.rate = rate;
      buildForm();
      changed();
      if (!quiet) UI.toast(`${I18n.t('Curs BNR')}: 1 ${cur} = ${String(rate).replace('.', I18n.lang !== 'ro' ? '.' : ',')} lei`);
    } catch (e) {
      if (!quiet) UI.toast(I18n.t('Nu am putut lua cursul BNR (verifică internetul). Îl poți scrie de mână.'), { error: true });
    }
  }

  /** "Has the client paid?" — two clear choices, with the date the money is due. */
  function payStatus() {
    const paid = paidState();
    const box = el('div', { class: 'paybox' });
    const opt = (v, icon, title, sub) => {
      const b = el('button', { class: 'payopt' + (paid === v ? ' on' : ''), type: 'button' }, [
        el('span', { class: 'pi ' + (v ? 'ok' : 'later'), html: svg(icon) }),
        el('span', { class: 'pt' }, [el('b', { text: title }), el('small', { text: sub })]),
      ]);
      b.addEventListener('click', () => {
        inv.paid = v;
        if (!v && !inv.due) inv.due = addDays(inv.date || today(), (biz && biz.payDays) || 15);
        buildForm();
        changed();
      });
      return b;
    };
    box.append(
      el('div', { class: 'payq', text: 'Clientul a plătit?' }),
      el('div', { class: 'payopts' }, [
        opt(true, 'paid', 'Da, a plătit', 'Banii sunt deja primiți'),
        opt(false, 'calendar', 'Plătește mai târziu', inv.due ? `Până pe ${dateRo(inv.due)}` : 'Alege data scadenței'),
      ]),
    );
    return box;
  }

  function renderLines() {
    const list = $('inv-lines');
    if (!list) return;
    list.innerHTML = '';
    if (!inv.lines.length) {
      list.append(el('div', { class: 'inv-empty', text: 'Scrie ce ai vândut sau lucrat, pune prețul și apasă Adaugă. Totalul se calculează singur.' }));
      return;
    }
    const cs = cats();
    inv.lines.forEach((l, idx) => {
      let ci = cs.findIndex((c) => c.id === l.type);
      if (ci < 0) { ci = cs.length - 1; l.type = cs[ci].id; }
      const tag = el('button', { class: 'tag c' + (ci % 4), text: cs[ci].label, title: 'Schimbă categoria', type: 'button' });
      tag.addEventListener('click', () => {
        if (cs.length < 2) return;
        l.type = cs[(ci + 1) % cs.length].id;
        renderLines(); changed();
      });
      const d = el('input', { class: 'in d', value: l.desc, spellcheck: 'false' });
      d.addEventListener('input', () => { l.desc = d.value; changed(false); });
      const q = el('input', { class: 'in q', value: String(l.qty).replace('.', ','), inputmode: 'decimal' });
      q.addEventListener('input', () => { l.qty = num(q.value); changed(false); });
      const p = el('input', { class: 'in p', value: String(l.price).replace('.', ','), inputmode: 'decimal' });
      p.addEventListener('input', () => { l.price = num(p.value); changed(false); });
      const val = el('span', { class: 'v', text: money(r2(num(l.qty) * num(l.price))) });
      const del = el('button', { class: 'ib', html: svg('del'), title: 'Șterge rândul', type: 'button' });
      del.addEventListener('click', () => { inv.lines.splice(idx, 1); renderLines(); changed(); });
      const row = el('div', { class: 'line' }, [el('span', { class: 'n', text: String(idx + 1) }), tag, d, q, el('span', { class: 'x', text: '×' }), p, val, del]);
      row.dataset.idx = idx;
      list.append(row);
    });
  }

  function recallClient(name) {
    const c = load(KEY_CLIENTS, []).find((x) => x.name.toLowerCase() === String(name).trim().toLowerCase());
    if (!c) return;
    applyClient(c, true);
  }

  /** Puts a saved client on the document, with the way this client usually pays. */
  function applyClient(c, typing) {
    const keepName = typing ? inv.client.name : c.name;
    inv.client = { ...blank().client, ...c.client, name: keepName };
    if (c.extra && Object.keys(c.extra).length) inv.extra = { ...c.extra };
    if (c.pay) inv.pay = c.pay;
    if (c.currency) { if (c.currency !== inv.currency) inv.rate = ''; inv.currency = c.currency; if (c.currency !== 'RON' && !inv.rate) fetchRate(true); }
    if (c.lang) inv.lang = c.lang;
    if (inv.docType === 'invoice' && (c.paid === true || c.paid === false)) {
      inv.paid = c.paid;
      inv.due = c.paid ? '' : addDays(inv.date || today(), c.payDays || biz.payDays || Biz.preset(biz.industry).payDays || 15);
    }
    if (typing) {
      // keep the caret in the name box: refresh only the other fields
      clearTimeout(applyClient.t);
      applyClient.t = setTimeout(() => { const f = document.activeElement; const pos = f && f.selectionStart; buildForm(); const n = document.querySelector('#inv-form [data-path="client.name"]'); if (n && f && f.dataset && f.dataset.path === 'client.name') { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } changed(); }, 350);
    } else { buildForm(); changed(); }
  }

  function clientsList() { return load(KEY_CLIENTS, []); }

  /** Saved clients: search, pick, remove. */
  function pickClient() {
    return UI.modal((box, close) => {
      box.classList.add('inv-settings');
      const q = el('input', { type: 'text', placeholder: 'Caută după nume, CUI sau telefon', spellcheck: 'false' });
      const list = el('div', { class: 'list-card cpick-list' });
      const draw = () => {
        list.innerHTML = '';
        const t = q.value.trim().toLowerCase();
        const all = clientsList().filter((c) => !t || [c.name, c.client && c.client.cui, c.client && c.client.phone].filter(Boolean).join(' ').toLowerCase().includes(t));
        if (!all.length) list.append(el('div', { class: 'row', style: { cursor: 'default' } }, [el('span', { class: 'rt' }, [el('b', { text: clientsList().length ? 'Niciun client găsit' : 'Niciun client salvat încă' }), el('small', { text: 'Clienții se salvează singuri când creezi un document.' })])]));
        for (const c of all.slice(0, 200)) {
          const cl = c.client || {};
          const sub = [cl.kind === 'pj' ? (cl.cui ? I18n.t('CUI') + ' ' + cl.cui : I18n.t('Firmă')) : cl.phone || I18n.t('Persoană fizică'), c.pay ? I18n.t(c.pay) : null, c.currency && c.currency !== 'RON' ? c.currency : null].filter(Boolean).join(' · ');
          const del = el('span', { class: 'rmore', title: 'Șterge clientul', html: svg('del') });
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!(await UI.confirm(`Ștergi „${c.name}” din clienți?`, 'Documentele emise rămân neschimbate.', 'Șterge'))) return;
            store(KEY_CLIENTS, clientsList().filter((x) => x.name.toLowerCase() !== c.name.toLowerCase()));
            draw();
          });
          const row = el('button', { class: 'row', type: 'button' }, [
            el('span', { class: 'av', style: { background: Biz.colorFor(c.name) }, text: Biz.initials(c.name) }),
            el('span', { class: 'rt' }, [el('b', { class: 'no-tr', text: c.name }), el('small', { text: sub })]),
            del,
          ]);
          row.addEventListener('click', () => close(c));
          list.append(row);
        }
        hydrateIcons(list);
      };
      q.addEventListener('input', draw);
      box.append(el('h2', { text: 'Clienți salvați' }), el('p', { text: 'Alege un client și datele lui se completează singure, inclusiv cum plătește de obicei.' }), q, el('div', { style: { height: '12px' } }), list,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) })]));
      draw();
      if (!UI.phone()) setTimeout(() => q.focus(), 40);
    }).then((c) => { if (c) applyClient(c, false); });
  }

  function rememberItem(desc, price, type) {
    const items = load(KEY_ITEMS, {});
    const k = desc.toLowerCase();
    items[k] = { desc, price, type, n: ((items[k] && items[k].n) || 0) + 1 };
    store(KEY_ITEMS, items);
  }

  function rememberClient() {
    if (!inv.client.name.trim()) return;
    const list = load(KEY_CLIENTS, []).filter((x) => x.name.toLowerCase() !== inv.client.name.trim().toLowerCase());
    list.unshift({
      name: inv.client.name.trim(), client: { ...inv.client }, extra: { ...(inv.extra || {}) },
      pay: inv.pay, currency: inv.currency, lang: inv.lang || 'ro', paid: inv.docType === 'invoice' ? paidState() : undefined, time: Date.now(),
    });
    store(KEY_CLIENTS, list.slice(0, 500));
  }

  // ---------------------------------------------------------------------------
  // Live totals + preview
  // ---------------------------------------------------------------------------

  function changed() {
    saveDraft();
    const t = compute();
    const cur = Biz.curSymbol(inv.currency);
    $('inv-total').innerHTML = `${money(t.total)}<small>${esc(cur)}</small>`;
    const parts = [];
    const I = ind();
    const usedCats = I.cats.filter((c) => t.groups[c.id]);
    if (usedCats.length > 1) for (const c of usedCats) parts.push(`${I18n.t(c.group)} ${money(t.groups[c.id])}`);
    if (t.discount > 0) parts.push(`discount ${money(t.discountValue)}`);
    if (t.vat) parts.push(`${I18n.t('din care TVA')} ${money(t.tva)}`);
    $('inv-sub').textContent = parts.join(' · ') || (inv.lines.length ? `${inv.lines.length} ${inv.lines.length === 1 ? 'poziție' : 'poziții'}` : 'Nicio poziție încă');
    document.querySelectorAll('#inv-lines .line').forEach((row) => {
      const l = inv.lines[+row.dataset.idx];
      if (l) row.querySelector('.v').textContent = money(r2(num(l.qty) * num(l.price)));
    });
    const cu = document.querySelector('#inv-form .quick-add .cur');
    if (cu) cu.textContent = cur;
    $('inv-title').textContent = `${I18n.t(Biz.docLabel(inv.docType, I))} ${inv.series}-${pad(inv.number)}`;
    $('inv-subtitle').textContent = biz.name || 'Firma ta';
    document.querySelectorAll('#pv-lang, #pv-lang-top').forEach((sel) => { sel.value = docLang(inv); });
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 140);
  }

  function renderPreview() {
    const frame = $('inv-preview');
    const box = $('inv-preview-box');
    if (!box.offsetWidth) return; // hidden (phone, preview closed)
    const k = Math.min(1, (box.clientWidth - (UI.phone() ? 20 : 40)) / 794);
    frame.style.transform = `scale(${k})`;
    frame.srcdoc = html();
    frame.onload = () => {
      try {
        const h = Math.max(1123, frame.contentDocument.documentElement.scrollHeight);
        frame.style.height = h + 'px';
        $('inv-preview-wrap').style.height = h * k + 'px';
        $('inv-preview-wrap').style.width = 794 * k + 'px';
      } catch (e) {}
    };
  }

  function togglePreview(open) {
    $('invoice').classList.toggle('pv-open', open);
    if (open) setTimeout(renderPreview, 10);
  }

  // ---------------------------------------------------------------------------
  // Business data (also used for a new business)
  // ---------------------------------------------------------------------------

  function industryGrid(value, onPick) {
    const grid = el('div', { class: 'ind-grid' });
    for (const [id, I] of Object.entries(Biz.INDUSTRIES)) {
      const b = el('button', { class: 'ind' + (id === value ? ' on' : ''), type: 'button' }, [
        el('span', { class: 'ii', style: { background: I.color }, html: svg(I.icon) }),
        el('b', { text: I.label }), el('small', { text: I.desc }),
      ]);
      b.addEventListener('click', () => { grid.querySelectorAll('.ind').forEach((x) => x.classList.remove('on')); b.classList.add('on'); onPick(id); });
      grid.append(b);
    }
    return grid;
  }

  /** Wizard for the first business: what you do, then name and tax code. */
  function onboarding() {
    return UI.modal((box, close) => {
      box.classList.add('inv-settings');
      const p = Biz.blankProfile('general');
      let step = 1;
      const render = () => {
        box.querySelectorAll(':scope > :not(.sheet-grip)').forEach((n) => n.remove());
        box.append(el('div', { class: 'steps' }, [el('i', { class: 'on' }), el('i', { class: step === 2 ? 'on' : '' })]));
        if (step === 1) {
          box.append(
            el('h2', { text: 'Cu ce se ocupă firma ta?' }),
            el('p', { text: 'Pregătim documentele pentru activitatea ta: categorii, câmpuri și texte potrivite. Poți schimba oricând.' }),
            industryGrid(p.industry, (id) => { const keep = { ...p }; Object.assign(p, Biz.blankProfile(id), { id: keep.id, name: keep.name, cui: keep.cui, vatPayer: keep.vatPayer }); }),
            el('div', { class: 'actions' }, [el('button', { class: 'btn', text: 'Anulează', type: 'button', onclick: () => close(null) }), el('button', { class: 'btn primary', text: 'Continuă', type: 'button', onclick: () => { step = 2; render(); } })]),
          );
        } else {
          const name = el('input', { class: 'in', placeholder: 'ex. Popescu Construct SRL', spellcheck: 'false' });
          name.value = p.name;
          name.addEventListener('input', () => { p.name = name.value; });
          const cui = el('input', { class: 'in', placeholder: 'ex. RO12345678', spellcheck: 'false', autocapitalize: 'characters' });
          cui.value = p.cui;
          cui.addEventListener('input', () => { p.cui = cui.value.trim(); });
          const vat = el('input', { type: 'checkbox', checked: p.vatPayer });
          vat.addEventListener('change', () => { p.vatPayer = vat.checked; });
          const ok = () => {
            if (!p.name.trim()) { name.classList.add('bad'); name.focus(); return; }
            p.name = p.name.trim();
            close(Biz.save(p));
          };
          name.addEventListener('keydown', (e) => { if (e.key === 'Enter') cui.focus(); });
          cui.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
          box.append(
            el('h2', { text: 'Cum se numește firma?' }),
            el('p', { text: 'Restul datelor (adresă, IBAN, logo) le poți adăuga acum sau mai târziu.' }),
            el('div', { class: 'grid' }, [
              el('label', { class: 'fld-l wide' }, [el('span', { text: 'Numele firmei *' }), name]),
              el('label', { class: 'fld-l wide' }, [el('span', { text: 'CUI (cod fiscal)' }), cui]),
            ]),
            el('label', { class: 'chk', style: { margin: '14px 2px 0' } }, [vat, 'Firma este plătitoare de TVA']),
            el('div', { class: 'actions' }, [
              el('button', { class: 'btn', text: 'Înapoi', type: 'button', onclick: () => { step = 1; render(); } }),
              el('div', { class: 'spacer' }),
              el('button', { class: 'btn primary', text: 'Gata', type: 'button', onclick: ok }),
            ]),
          );
          setTimeout(() => name.focus(), 60);
        }
        hydrateIcons(box);
      };
      render();
    });
  }

  /** Full business data. [id]: business to edit (null = new). Resolves the saved business or null. */
  function openSettings(id) {
    const existing = id ? Biz.get(id) : null;
    return UI.modal((box, close) => {
      box.classList.add('inv-settings');
      const draft = clone(existing || Biz.blankProfile('general'));
      const f = (label, key, opts = {}) => {
        const i = el('input', { class: 'in', type: opts.type || 'text', placeholder: opts.placeholder || '', spellcheck: 'false', inputmode: opts.inputmode || null });
        const getV = () => key.split('.').reduce((o, k) => (o ? o[k] : undefined), draft);
        i.value = getV() == null ? '' : getV();
        i.addEventListener('input', () => {
          const ks = key.split('.');
          let o = draft;
          for (let j = 0; j < ks.length - 1; j++) o = o[ks[j]];
          o[ks[ks.length - 1]] = opts.number ? num(i.value) : i.value;
        });
        return el('label', { class: 'fld-l' + (opts.wide ? ' wide' : '') }, [el('span', { text: label }), i]);
      };
      const vat = el('input', { type: 'checkbox', checked: draft.vatPayer });
      const incl = el('input', { type: 'checkbox', checked: draft.pricesInclVat });
      const vatBox = el('div', { class: 'grid' + (draft.vatPayer ? '' : ' hidden'), style: { marginTop: '10px' } }, [f('Cota TVA (%)', 'vatRate', { number: true, inputmode: 'decimal' }), el('label', { class: 'chk wide' }, [incl, 'Prețurile pe care le scriu includ TVA'])]);
      const noteBox = el('div', { class: draft.vatPayer ? 'hidden' : '', style: { marginTop: '10px' } }, [f('Mențiune pentru neplătitor de TVA', 'nonVatNote', { wide: true })]);
      vat.addEventListener('change', () => { draft.vatPayer = vat.checked; vatBox.classList.toggle('hidden', !vat.checked); noteBox.classList.toggle('hidden', vat.checked); });
      incl.addEventListener('change', () => { draft.pricesInclVat = incl.checked; });

      const logoHolder = el('div');
      const drawLogo = () => { logoHolder.innerHTML = ''; logoHolder.append(Biz.badge({ ...draft, name: draft.name || '?' })); };
      drawLogo();
      const logoBtn = el('button', { class: 'btn', text: draft.logo ? 'Schimbă logo-ul' : 'Adaugă logo', type: 'button' });
      logoBtn.addEventListener('click', async () => {
        const img = await App.pickImage();
        if (!img) return;
        const c = el('canvas', { width: img.width, height: img.height });
        c.getContext('2d').putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
        const k = Math.min(1, 640 / Math.max(img.width, img.height));
        const c2 = el('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) });
        c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height);
        draft.logo = c2.toDataURL('image/png');
        drawLogo();
        logoBtn.textContent = 'Schimbă logo-ul';
        rmLogo.classList.remove('hidden');
      });
      const rmLogo = el('button', { class: 'btn plain' + (draft.logo ? '' : ' hidden'), text: 'Fără logo', type: 'button' });
      rmLogo.addEventListener('click', () => { draft.logo = null; drawLogo(); rmLogo.classList.add('hidden'); logoBtn.textContent = 'Adaugă logo'; });

      const indSel = el('select', { class: 'in' });
      for (const [k, I] of Object.entries(Biz.INDUSTRIES)) indSel.append(el('option', { value: k, text: I.label, selected: draft.industry === k }));
      indSel.addEventListener('change', () => { draft.industry = indSel.value; });
      const langSel = el('select', { class: 'in' });
      for (const [c, n] of DOC_LANGS) langSel.append(el('option', { value: c, text: n, selected: (draft.docLang || 'ro') === c }));
      langSel.addEventListener('change', () => { draft.docLang = langSel.value; });
      const curSel = el('select', { class: 'in' });
      for (const [c] of Biz.CURRENCIES) curSel.append(el('option', { value: c, text: c, selected: draft.currency === c }));
      curSel.addEventListener('change', () => { draft.currency = curSel.value; });

      const save = () => {
        if (!String(draft.name || '').trim()) { UI.toast('Scrie numele firmei.', { error: true }); box.querySelector('input').focus(); return; }
        draft.name = draft.name.trim();
        for (const t of Object.keys(Biz.DOC_TYPES)) {
          draft.series[t] = String(draft.series[t] || '').trim().toUpperCase() || Biz.DOC_TYPES[t].series;
          draft.next[t] = Math.max(1, Math.round(num(draft.next[t])) || 1);
        }
        draft.payDays = Math.max(0, Math.round(num(draft.payDays)) || 0);
        close(Biz.save(draft));
      };

      box.append(
        el('h2', { text: existing ? 'Datele firmei' : 'Firmă nouă' }),
        el('p', { text: 'Le completezi o singură dată. Apar pe fiecare factură, proformă sau ofertă.' }),
        el('div', { class: 'set-logo' }, [logoHolder, el('div', {}, [el('b', { text: 'Logo' }), el('div', { class: 'muted', text: 'Apare în capul documentelor. Opțional.' }), el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [logoBtn, rmLogo])])]),
        el('div', { class: 'grid' }, [
          f('Nume afișat *', 'name', { placeholder: 'ex. Atelierul lui Ion' }), f('Denumire legală', 'legal', { placeholder: 'ex. ION SERVICE SRL' }),
          el('label', { class: 'fld-l wide' }, [el('span', { text: 'Domeniu de activitate' }), indSel]),
        ]),
        el('div', { class: 'msec', text: 'Date fiscale' }),
        el('div', { class: 'grid' }, [
          f('CUI', 'cui', { placeholder: 'RO12345678 sau 12345678' }), f('Nr. Reg. Com.', 'regcom', { placeholder: 'J05/123/2026' }),
          f('Capital social', 'capital', { placeholder: 'ex. 200 lei' }),
        ]),
        el('label', { class: 'chk', style: { margin: '12px 2px 0' } }, [vat, 'Firma este plătitoare de TVA']),
        vatBox, noteBox,
        el('div', { class: 'msec', text: 'Adresă și contact' }),
        el('div', { class: 'grid' }, [
          f('Adresă', 'address', { wide: true, placeholder: 'Str., nr.' }), f('Localitate', 'city', { placeholder: 'ex. Cluj-Napoca · București: Sector 3' }), countyField(draft),
          f('Telefon', 'phone', { inputmode: 'tel' }), f('Email', 'email', { inputmode: 'email' }), f('Site', 'web', { wide: true, placeholder: 'opțional' }),
        ]),
        el('div', { class: 'msec', text: 'Bancă' }),
        el('div', { class: 'grid' }, [f('IBAN', 'iban', { wide: true }), f('Banca', 'bank')]),
        el('div', { class: 'msec', text: 'Serii și numerotare' }),
        el('div', { class: 'grid' }, [
          f('Serie facturi', 'series.invoice'), f('Următorul număr', 'next.invoice', { inputmode: 'numeric' }),
          f('Serie proforme', 'series.proforma'), f('Următorul număr', 'next.proforma', { inputmode: 'numeric' }),
          f('Serie oferte / devize', 'series.quote'), f('Următorul număr', 'next.quote', { inputmode: 'numeric' }),
        ]),
        el('div', { class: 'msec', text: 'Implicit pe documente' }),
        el('div', { class: 'grid' }, [
          el('label', { class: 'fld-l' }, [el('span', { text: 'Moneda' }), curSel]),
          el('label', { class: 'fld-l' }, [el('span', { text: 'Limba documentelor' }), langSel]),
          f('Termen de plată (zile)', 'payDays', { inputmode: 'numeric', placeholder: '0 = fără scadență' }),
          f('Observații implicite', 'notes', { wide: true }),
        ]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn', text: 'Anulează', type: 'button', onclick: () => close(null) }),
          el('button', { class: 'btn primary', text: 'Salvează', type: 'button', onclick: save }),
        ]),
      );
    }).then((saved) => {
      if (saved && inv && saved.id === (biz && biz.id)) {
        biz = saved;
        if (!inv.lines.length && !inv.client.name) { const t = inv.docType; inv = blank(t); }
        if (!$('invoice').classList.contains('hidden')) { buildForm(); changed(); }
      }
      return saved || null;
    });
  }

  // ---------------------------------------------------------------------------
  // Create the PDF
  // ---------------------------------------------------------------------------

  async function folder() {
    const docs = await Host.specialDir('documents');
    if (biz.folder && Host.mkdirp(biz.folder)) return biz.folder;
    const many = Biz.list().length > 1;
    const f = many ? Host.join(docs, 'Facturi', clean(biz.name) || 'Firma') : Host.join(docs, 'Facturi');
    Host.mkdirp(f);
    return f;
  }

  async function create() {
    if (!inv.client.name.trim()) {
      UI.toast('Scrie numele clientului.', { error: true });
      const f = document.querySelector('#inv-form [data-path="client.name"]');
      if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    if (!inv.lines.length) {
      UI.toast('Adaugă cel puțin un produs sau serviciu.', { error: true });
      const d = document.querySelector('#inv-form .quick-add input');
      if (d) { d.focus(); d.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    inv.number = Math.max(1, Math.round(num(inv.number)) || 1);
    inv.series = String(inv.series || '').trim().toUpperCase();
    // e-Factura: what ANAF would refuse, said before the invoice exists (it can still be created)
    if (inv.docType === 'invoice' && typeof EFactura !== 'undefined' && (await EFactura.connected())) {
      const problems = EFactura.problemsFor(inv, biz);
      if (problems.length) {
        const go = await UI.modal((box, close) => {
          box.classList.add('acm-ui', 'ef-details');
          box.append(el('h2', { text: 'Lipsesc date pentru SPV' }),
            el('p', { class: 'muted', text: 'Fără ele, ANAF nu primește factura. Le poți completa acum, sau creezi factura și o trimiți în SPV după ce le corectezi.' }),
            el('div', { class: 'ef-msgs' }, problems.map((m) => el('div', { class: 'ef-msg', text: I18n.t(m) }))),
            el('div', { class: 'actions col' }, [el('button', { class: 'btn primary', type: 'button', text: 'Completez acum', onclick: () => close(false) }), el('button', { class: 'btn', type: 'button', text: 'Creează oricum', onclick: () => close(true) })]));
        });
        if (!go) return;
      }
    }
    const dir = await folder();
    const suggested = fileNameFor() + '.pdf';
    const label = Biz.docLabel(inv.docType, ind());

    const target = await UI.modal((box, close) => {
      const input = el('input', { type: 'text', spellcheck: 'false' });
      input.value = suggested.replace(/\.pdf$/i, '');
      const where = dir;
      const other = Host.mobile ? null : el('button', { class: 'btn', text: 'Altă locație…', type: 'button' });
      if (other) other.addEventListener('click', async () => { const p = await Host.saveDialog(clean(input.value) + '.pdf', where); if (p) close(p); });
      const ok = () => {
        const name = clean(input.value);
        if (!name) { input.focus(); return; }
        close(Host.join(where, name + '.pdf'));
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      box.append(...[
        el('h2', { text: `Creează ${label.toLowerCase()} PDF` }),
        el('p', { text: 'Numele fișierului (îl poți schimba):' }),
        el('div', { class: 'name-row' }, [input, el('span', { text: '.pdf' })]),
        Host.mobile ? null : el('div', { class: 'muted small', style: { marginTop: '8px' }, text: 'Se salvează în: ' + where }),
        el('div', { class: 'actions' }, [other, el('div', { class: 'spacer' }), el('button', { class: 'btn', text: 'Anulează', type: 'button', onclick: () => close(null) }), el('button', { class: 'btn primary', text: 'Creează PDF', type: 'button', onclick: ok })]),
      ].filter(Boolean));
      if (!UI.phone()) setTimeout(() => { input.focus(); input.select(); }, 40);
    });
    if (!target) return;
    if (Host.exists(target) && !(await UI.confirm('Fișierul există deja', `„${Host.baseName(target)}” există. Îl înlocuiesc?`, 'Înlocuiește'))) return;
    // one document of the plan per series + number (creating it again does not count twice)
    if (typeof Plan !== 'undefined' && !(await Plan.allow('invoices', [biz.id, inv.docType, inv.series, inv.number].join('|')))) return;

    UI.busy(`Se creează ${label.toLowerCase()}…`);
    try {
      const bytes = await Host.htmlToPdf(html(inv, tplOf()));
      Host.writeFile(target, bytes);
      const t = compute();
      const snapshot = clone(inv);
      const docId = Biz.addDoc({
        bizId: biz.id, type: inv.docType, series: inv.series, number: inv.number, client: inv.client.name.trim(), total: t.total,
        currency: inv.currency, date: inv.date, due: inv.due || '', path: target, paid: inv.docType === 'invoice' ? paidState() : null,
        paidAt: inv.docType === 'invoice' && paidState() ? inv.date : null, lang: inv.lang || 'ro', data: snapshot,
      });
      if (inv.docType === 'invoice' && typeof EFactura !== 'undefined') EFactura.enqueue(docId);
      rememberClient();
      learn();
      if (inv.series === biz.series[inv.docType]) { Biz.bumpNumber(biz.id, inv.docType, inv.number); biz = Biz.get(biz.id); }
      App.rememberFile(target, 'invoice', bytes);
      UI.busy(null);
      const created = { path: target };
      const type = inv.docType;
      inv = blank(type);
      saveDraft();
      buildForm();
      changed();
      togglePreview(false);
      const act = await UI.modal((box, close) => {
        box.classList.add('done');
        box.append(
          el('div', { class: 'done-ic', html: svg('done') }),
          el('h2', { text: `${label} e gata` }),
          el('p', { text: Host.baseName(created.path) }),
          el('div', { class: 'actions' }, [
            el('button', { class: 'btn', html: svg('share') + (Host.mobile ? 'Trimite' : 'Arată în folder'), type: 'button', onclick: () => close('share') }),
            el('button', { class: 'btn', text: 'Încă una', type: 'button', onclick: () => close('new') }),
            el('button', { class: 'btn primary', text: 'Deschide PDF-ul', autofocus: !Host.mobile, type: 'button', onclick: () => close('open') }),
          ]),
        );
      });
      if (act === 'share') Host.share(created.path, `${label} ${Host.baseName(created.path)}`);
      if (act === 'open') App.openPath(created.path);
    } catch (e) {
      UI.busy(null);
      console.error(e);
      if (e && e.code === 'PRINT_DIALOG') {
        // Saved by the phone's own print screen: keep it in the list and move to the next number.
        const t = compute();
        const docId = Biz.addDoc({ bizId: biz.id, type: inv.docType, series: inv.series, number: inv.number, client: inv.client.name.trim(), total: t.total, currency: inv.currency, date: inv.date, due: inv.due || '', path: '', paid: inv.docType === 'invoice' ? paidState() : null, paidAt: inv.docType === 'invoice' && paidState() ? inv.date : null, lang: inv.lang || 'ro', data: clone(inv) });
        if (inv.docType === 'invoice' && typeof EFactura !== 'undefined') EFactura.enqueue(docId);
        rememberClient(); learn();
        if (inv.series === biz.series[inv.docType]) { Biz.bumpNumber(biz.id, inv.docType, inv.number); biz = Biz.get(biz.id); }
        const type = inv.docType; inv = blank(type); saveDraft(); buildForm(); changed();
        UI.toast(e.message, { duration: 9000 });
        return;
      }
      UI.errorDetails('Nu am putut crea documentul', e);
    }
  }

  // ---------------------------------------------------------------------------
  // "Aspect": change the whole structure, colors and texts (live preview)
  // ---------------------------------------------------------------------------

  const PRESETS = [
    ['#1d5b79', 'Petrol'], ['#1f5fa8', 'Albastru'], ['#3b3f46', 'Grafit'], ['#2e7d4f', 'Verde'],
    ['#c4161c', 'Roșu'], ['#d9661f', 'Portocaliu'], ['#5b3fa0', 'Mov'], ['#111111', 'Negru'],
  ];
  const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Tahoma', 'Verdana', 'Trebuchet MS', 'Times New Roman', 'Georgia', 'Cambria'];
  const SECTION_NAMES = () => ({
    parties: 'Furnizor și client', extra: ind().extra ? ind().extra.title : 'Detalii (după domeniu)', table: 'Tabelul cu produse / servicii', totals: 'Totaluri',
    notes: 'Plată, mențiuni, observații', signatures: 'Semnături', footer: 'Subsol',
  });
  /** The document's language: a compact list (short code shown, the language's own name in the list). */
  function langSelect(value, onPick) {
    const sel = el('select', { class: 'in lang-sel no-tr', title: I18n.t('Limba facturii') });
    for (const [c, n] of DOC_LANGS) sel.append(el('option', { value: c, text: `${c.toUpperCase()} · ${n}`, selected: c === value }));
    sel.value = value;
    sel.addEventListener('change', () => onPick(sel.value));
    return sel;
  }

  const LABEL_NAMES = [
    ['titleInvoice', 'Titlu factură (gol = FACTURĂ)'], ['titleProforma', 'Titlu proformă'], ['titleQuote', 'Titlu ofertă'],
    ['series', 'Seria'], ['number', 'Număr'], ['date', 'Data emiterii'], ['due', 'Scadență'], ['valid', 'Valabilă până la'],
    ['supplier', 'Furnizor'], ['client', 'Client'],
    ['colNr', 'Coloana Nr.'], ['colDesc', 'Coloana Denumire'], ['colUm', 'Coloana U.M.'], ['colQty', 'Coloana Cantitate'], ['colPrice', 'Coloana Preț unitar'], ['colValue', 'Coloana Valoare'],
    ['subtotal', 'Subtotal'], ['discount', 'Discount'], ['totalBase', 'Total fără TVA'], ['totalVat', 'TVA'], ['grand', 'Total de plată'],
    ['payment', 'Modalitate de plată'], ['notes', 'Observații'], ['signSupplier', 'Semnătura furnizor'], ['signClient', 'Semnătura client (gol = automat)'],
  ];

  let advOpen = false;
  const advDirty = () => advOpen && JSON.stringify(tplDraft) !== JSON.stringify(tplOf());

  function openAdvanced() {
    tplDraft = tplOf();
    advOpen = true;
    $('inv-form').classList.add('hidden');
    $('inv-bar').classList.add('hidden');
    $('inv-adv').classList.remove('hidden');
    $('inv-adv-btn').classList.add('active');
    buildAdvanced();
    renderPreview();
  }

  async function closeAdvanced(force) {
    if (!advOpen) return true;
    if (!force && advDirty()) {
      const r = await UI.modal((box, close) => {
        box.append(
          el('h2', { text: 'Salvezi modificările?' }),
          el('p', { text: 'Ai schimbat aspectul documentelor și nu ai salvat.' }),
          el('div', { class: 'actions' }, [
            el('button', { class: 'btn', text: 'Anulează', type: 'button', onclick: () => close('cancel') }),
            el('button', { class: 'btn', text: 'Nu salva', type: 'button', onclick: () => close('discard') }),
            el('button', { class: 'btn primary', text: 'Salvează', type: 'button', autofocus: true, onclick: () => close('save') }),
          ]),
        );
      });
      if (!r || r === 'cancel') return false;
      if (r === 'save') saveAdvanced(true);
    }
    advOpen = false;
    tplDraft = null;
    $('inv-adv').classList.add('hidden');
    $('inv-form').classList.remove('hidden');
    $('inv-bar').classList.remove('hidden');
    $('inv-adv-btn').classList.remove('active');
    togglePreview(false);
    renderPreview();
    return true;
  }

  function saveAdvanced(quiet) {
    biz = Biz.save({ ...biz, tpl: withDefaults(clone(tplDraft)) });
    tplDraft = tplOf();
    refreshAdvTop();
    if (!quiet) UI.toast('Aspectul a fost salvat. Se folosește la toate documentele noi.');
  }

  async function resetAdvanced() {
    if (!(await UI.confirm('Revii la setările inițiale?', 'Culorile, structura și textele revin la cum erau la început. Apasă apoi Salvează ca să rămână așa.', 'Revino la inițial'))) return;
    tplDraft = withDefaults(null);
    buildAdvanced();
    renderPreview();
  }

  function refreshAdvTop() {
    const s = document.getElementById('adv-save');
    if (s) s.classList.toggle('pulse', advDirty());
  }

  function advChanged(rebuild) {
    refreshAdvTop();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 80);
    if (rebuild) buildAdvanced();
  }

  function buildAdvanced() {
    const T = tplDraft;
    const root = $('inv-adv');
    const scroll = root.querySelector('.adv-body');
    const keep = scroll ? scroll.scrollTop : 0;
    root.innerHTML = '';

    const seg = (options, getV, setV) => {
      const box = el('div', { class: 'chips' });
      for (const [v, label] of options) {
        const b = el('button', { class: 'chip' + (getV() === v ? ' on' : ''), text: label, type: 'button' });
        b.addEventListener('click', () => { setV(v); box.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); b.classList.add('on'); advChanged(); });
        box.append(b);
      }
      return box;
    };
    const row = (label, control, hint) => el('div', { class: 'adv-row' }, [el('div', { class: 'adv-l' }, [el('span', { text: label }), hint ? el('small', { text: hint }) : null]), control]);
    const toggle = (getV, setV) => {
      const i = el('input', { type: 'checkbox', checked: getV() });
      i.addEventListener('change', () => { setV(i.checked); advChanged(); });
      return el('label', { class: 'switch' }, [i, el('i')]);
    };
    const range = (getV, setV, min, max, step, unit) => {
      const out = el('span', { class: 'rv', text: getV() + ' ' + unit });
      const r = el('input', { type: 'range', min, max, step, value: getV() });
      r.addEventListener('input', () => { setV(+r.value); out.textContent = r.value + ' ' + unit; advChanged(); });
      return el('div', { class: 'range' }, [r, out]);
    };
    const colorPick = (getV, setV, presets) => {
      const box = el('div', { class: 'colors' });
      const custom = el('input', { type: 'color', value: getV(), title: 'Altă culoare' });
      const mark = () => box.querySelectorAll('.cdot').forEach((d) => d.classList.toggle('on', d.dataset.c.toLowerCase() === getV().toLowerCase()));
      for (const [c, name] of presets) {
        const d = el('button', { class: 'cdot', title: name, type: 'button', html: `<i style="background:${c}"></i>` });
        d.dataset.c = c;
        d.addEventListener('click', () => { setV(c); custom.value = c; mark(); advChanged(); });
        box.append(d);
      }
      custom.addEventListener('input', () => { setV(custom.value); mark(); advChanged(); });
      box.append(el('label', { class: 'cpick', title: 'Alege orice culoare' }, [custom, el('span', { text: 'Alta…' })]));
      mark();
      return box;
    };
    const card = (title, children) => el('section', { class: 'inv-card' }, [el('div', { class: 'inv-h' }, [el('h3', { text: title })]), ...children]);

    const back = el('button', { class: 'tb', html: svg('back') + '<span>Înapoi</span>', type: 'button' });
    back.addEventListener('click', () => closeAdvanced(false));
    const reset = el('button', { class: 'tb', html: svg('refresh') + '<span>Setări inițiale</span>', type: 'button', title: 'Revino la aspectul de la început' });
    reset.addEventListener('click', resetAdvanced);
    const pv = el('button', { class: 'tb phone-only', html: svg('eye') + '<span>Vezi</span>', type: 'button' });
    pv.addEventListener('click', () => togglePreview(true));
    const save = el('button', { class: 'tb primary', id: 'adv-save', html: svg('save') + '<span>Salvează</span>', type: 'button' });
    save.addEventListener('click', () => saveAdvanced(false));
    root.append(el('div', { class: 'adv-top' }, [back, el('div', { class: 'adv-tt' }, [el('b', { text: 'Aspect' }), el('small', { text: 'Structura, culorile și textele documentelor' })]), el('div', { class: 'spacer' }), reset, pv, save]));

    const body = el('div', { class: 'adv-body' });
    root.append(body);

    // Templates: a real miniature of each, with the user's own data
    const gal = el('div', { class: 'tpl-grid' });
    const tsample = inv && (inv.lines.length || inv.client.name) ? inv : { ...blank(), client: { ...blank().client, name: 'Client Exemplu SRL' }, lines: [{ id: 1, type: cats()[0].id, desc: I18n.t('Produs sau serviciu'), qty: 2, price: 250 }, { id: 2, type: cats()[cats().length > 1 ? 1 : 0].id, desc: I18n.t('Alt produs'), qty: 1, price: 120 }] };
    for (const tm of TEMPLATES) {
      const T2 = withDefaults(clone(T));
      applyTemplate(T2, tm);
      const fr = el('iframe', { class: 'tpl-fr', tabindex: '-1', title: tm.name });
      fr.srcdoc = html(tsample, T2);
      const b = el('button', { class: 'tpl' + (T.template === tm.id ? ' on' : ''), type: 'button' }, [
        el('span', { class: 'tpl-pv' }, [fr]),
        el('b', { text: tm.name }), el('small', { text: tm.desc }),
      ]);
      b.addEventListener('click', () => { applyTemplate(T, tm); advChanged(true); });
      gal.append(b);
    }
    const fit = () => gal.querySelectorAll('.tpl-pv').forEach((pv) => { if (pv.clientWidth) pv.style.setProperty('--k', String(pv.clientWidth / 794)); });
    try { new ResizeObserver(fit).observe(gal); } catch (e) { setTimeout(fit, 50); }
    body.append(card('Șabloane', [el('p', { class: 'adv-p', text: 'Alege un model; apoi îl poți ajusta mai jos (culori, font, structură). Textele și ordinea părților rămân ale tale.' }), gal]));

    const fontSel = el('select', { class: 'in' });
    for (const f of FONTS) fontSel.append(el('option', { value: f, text: f, selected: T.font === f }));
    fontSel.addEventListener('change', () => { T.font = fontSel.value; advChanged(); });
    body.append(card('Culori și aspect', [
      row('Culoarea principală', colorPick(() => T.color, (v) => { T.color = v; }, PRESETS)),
      row('Culoarea textului', colorPick(() => T.text, (v) => { T.text = v; }, [['#1b1b1f', 'Aproape negru'], ['#333333', 'Gri închis'], ['#1d2b3a', 'Bleumarin'], ['#000000', 'Negru']])),
      row('Font', fontSel),
      row('Mărimea textului', range(() => T.size, (v) => { T.size = v; }, 8, 12, 0.2, 'pt')),
      row('Margini', range(() => T.margin, (v) => { T.margin = v; }, 8, 22, 1, 'mm')),
      row('Antet', seg([['light', 'Alb (econom)'], ['tint', 'Nuanță'], ['band', 'Bandă plină']], () => T.header, (v) => { T.header = v; }), 'Banda plină consumă mult tuș'),
      row('Chenare', seg([['outline', 'Contur'], ['tint', 'Nuanță'], ['none', 'Fără']], () => T.boxes, (v) => { T.boxes = v; })),
      row('Capul tabelului', seg([['line', 'Linie (econom)'], ['tint', 'Nuanță'], ['fill', 'Plin']], () => T.tableHead, (v) => { T.tableHead = v; })),
      row('Rânduri tabel', seg([['lines', 'Linii'], ['zebra', 'Dungi'], ['grid', 'Grilă'], ['none', 'Simplu']], () => T.tableRows, (v) => { T.tableRows = v; })),
      row('Total de plată', seg([['outline', 'Contur (econom)'], ['tint', 'Nuanță'], ['fill', 'Plin']], () => T.totalStyle, (v) => { T.totalStyle = v; })),
    ]));

    body.append(card('Logo', [
      row('Arată logo-ul', toggle(() => T.logo.show, (v) => { T.logo.show = v; })),
      row('Mărime', range(() => T.logo.size, (v) => { T.logo.size = v; }, 12, 50, 1, 'mm'), 'Mai mic = mai puțin tuș'),
      row('Formă', seg([['square', 'Pătrat'], ['rounded', 'Rotunjit'], ['circle', 'Cerc']], () => T.logo.shape, (v) => { T.logo.shape = v; })),
      row('Poziție', seg([['left', 'Stânga'], ['right', 'Dreapta']], () => T.logo.pos, (v) => { T.logo.pos = v; })),
      row('Imaginea', el('button', { class: 'btn', text: biz.logo ? 'Schimbă logo-ul…' : 'Adaugă logo…', type: 'button', onclick: () => openSettings(biz.id).then(() => renderPreview()) })),
    ]));

    const names = SECTION_NAMES();
    const list = el('div', { class: 'sec-list' });
    T.order.forEach((s, i) => {
      const up = el('button', { class: 'ib', html: svg('up'), title: 'Mută mai sus', type: 'button', disabled: i === 0 });
      const down = el('button', { class: 'ib', html: svg('down'), title: 'Mută mai jos', type: 'button', disabled: i === T.order.length - 1 });
      up.addEventListener('click', () => { [T.order[i - 1], T.order[i]] = [T.order[i], T.order[i - 1]]; advChanged(true); });
      down.addEventListener('click', () => { [T.order[i + 1], T.order[i]] = [T.order[i], T.order[i + 1]]; advChanged(true); });
      const shown = !T.hidden.includes(s);
      const sw = toggle(() => shown, (v) => { T.hidden = v ? T.hidden.filter((x) => x !== s) : [...T.hidden, s]; advChanged(true); });
      list.append(el('div', { class: 'sec' + (shown ? '' : ' off') }, [el('span', { class: 'sn', text: String(i + 1) }), el('span', { class: 'st', text: names[s] }), up, down, sw]));
    });
    body.append(card('Structură — ordinea părților', [
      el('p', { class: 'adv-p', text: 'Cu săgețile muți o parte mai sus sau mai jos; cu butonul din dreapta o arăți sau o ascunzi. Antetul rămâne mereu sus.' }),
      list,
      row('Grupează pe categorii', toggle(() => T.group, (v) => { T.group = v; }), cats().map((c) => c.group).join(' / ')),
      row('Arată subtotaluri', toggle(() => T.subtotals, (v) => { T.subtotals = v; })),
      row('Coloana Nr.', toggle(() => T.columns.nr, (v) => { T.columns.nr = v; })),
      row('Coloana U.M.', toggle(() => T.columns.um, (v) => { T.columns.um = v; })),
      row('Coloana Cantitate', toggle(() => T.columns.qty, (v) => { T.columns.qty = v; })),
      row('Coloana Preț unitar', toggle(() => T.columns.price, (v) => { T.columns.price = v; })),
    ]));

    const texts = el('div', { class: 'grid' });
    const LBL = labelsFor(T, docLang(inv));
    for (const [k, name] of LABEL_NAMES) {
      const i = el('input', { class: 'in', spellcheck: 'false' });
      i.value = LBL[k] || '';
      i.addEventListener('input', () => { LBL[k] = i.value; advChanged(); });
      texts.append(el('label', { class: 'fld-l' }, [el('span', { text: name }), i]));
    }
    const foot = el('input', { class: 'in', spellcheck: 'false', placeholder: 'Gol = automat (firma · telefon · email)' });
    foot.value = T.footer;
    foot.addEventListener('input', () => { T.footer = foot.value; advChanged(); });
    texts.append(el('label', { class: 'fld-l wide' }, [el('span', { text: 'Text subsol' }), foot]));
    const langSeg = langSelect(docLang(inv), (c) => { if (inv) { inv.lang = c; saveDraft(); } advChanged(true); });
    body.append(card('Texte de pe document', [
      el('div', { class: 'adv-row' }, [el('div', { class: 'adv-l' }, [el('span', { text: 'Limba documentului' }), el('small', { text: 'Fiecare limbă are textele ei' })]), langSeg]),
      texts,
    ]));

    const fn = el('input', { class: 'in', spellcheck: 'false' });
    fn.value = T.fileName;
    const ex = el('div', { class: 'adv-p' });
    const sample = inv && inv.client.name ? inv : { ...blank(), client: { name: 'Ion Popescu' }, extra: { plate: 'BH12ABC' } };
    const showEx = () => { ex.textContent = 'Exemplu: ' + fileNameFor(sample, T) + '.pdf'; };
    fn.addEventListener('input', () => { T.fileName = fn.value; showEx(); advChanged(); });
    showEx();
    body.append(card('Numele fișierului PDF', [
      el('label', { class: 'fld-l wide' }, [el('span', { text: 'Model nume' }), fn]),
      el('div', { class: 'adv-p', style: { marginTop: '8px' }, text: 'Poți folosi: {tip} {serie} {nr} {client} {data} {detalii}' }),
      ex,
    ]));

    hydrateIcons(root);
    body.scrollTop = keep;
    refreshAdvTop();
  }

  // ---------------------------------------------------------------------------
  // Screen
  // ---------------------------------------------------------------------------

  /** Opens the program. opts: {type, from: issued doc to copy, as: type for the copy}. */
  async function open(opts = {}) {
    // invoices are kept and numbered in the account: ask for it before the form, not after filling it in
    if (typeof Account !== 'undefined' && Account.current && !Account.current() && typeof Plan !== 'undefined' && Plan.needAccount) {
      await Plan.needAccount('invoices');
      return;
    }
    Biz.migrate();
    biz = Biz.active();
    if (!biz) {
      biz = await onboarding();
      if (!biz) return;
    }
    if (advOpen) { advOpen = false; tplDraft = null; $('inv-adv').classList.add('hidden'); $('inv-form').classList.remove('hidden'); $('inv-bar').classList.remove('hidden'); $('inv-adv-btn').classList.remove('active'); }
    const draft = load(KEY_DRAFT, null);
    if (opts.from && opts.from.data) {
      const src = clone(opts.from.data);
      const b2 = Biz.get(opts.from.bizId);
      if (b2) { biz = b2; Biz.setActive(b2.id); }
      const type = opts.as || src.docType || 'invoice';
      inv = { ...blank(type), client: src.client || blank().client, extra: src.extra || {}, lines: (src.lines || []).map((l) => ({ ...l, id: Date.now() + Math.random() })), notes: src.notes || '', discount: src.discount || 0, currency: src.currency || biz.currency, pay: src.pay || 'Numerar' };
    } else if (opts.type) {
      inv = draft && draft.bizId === biz.id && draft.docType === opts.type && (draft.lines.length || draft.client.name) ? draft : blank(opts.type);
    } else {
      inv = draft && draft.client && Array.isArray(draft.lines) && draft.bizId === biz.id ? draft : blank();
    }
    if (!Biz.DOC_TYPES[inv.docType]) inv.docType = 'invoice';
    inv.extra = inv.extra || {};
    App.showScreen('invoice');
    togglePreview(false);
    buildForm();
    changed();
    Host.setTitle(`${Biz.docLabel(inv.docType, ind())} — ACM Docs`);
  }

  async function reset() {
    if ((inv.lines.length || inv.client.name) && !(await UI.confirm('Document nou?', 'Ce ai completat acum se șterge.', 'Începe unul nou'))) return;
    inv = blank(inv.docType);
    saveDraft();
    buildForm();
    changed();
  }

  async function switchBiz() {
    const list = Biz.list();
    UI.menuAt($('inv-settings'), [
      ...list.map((p) => ({ label: (p.id === biz.id ? '✓ ' : '') + p.name, icon: 'building', run: () => {
        if (p.id === biz.id) return;
        Biz.setActive(p.id);
        biz = p;
        inv = blank(inv.docType);
        buildForm(); changed();
      } })),
      '-',
      { label: 'Datele firmei…', icon: 'edit', run: () => openSettings(biz.id) },
      { label: 'Adaugă altă firmă…', icon: 'plus', run: async () => { const p = await onboarding(); if (p) { biz = p; inv = blank(inv.docType); buildForm(); changed(); } } },
    ], 'Firma care emite');
  }

  /** Phone Back button while the program is open. */
  async function back() {
    if ($('invoice').classList.contains('pv-open')) { togglePreview(false); return; }
    if (advOpen) { await closeAdvanced(false); return; }
    App.showHome();
  }

  function init() {
    $('inv-back').addEventListener('click', async () => { if (await closeAdvanced(false)) App.showHome(); });
    $('inv-adv-btn').addEventListener('click', () => (advOpen ? closeAdvanced(false) : openAdvanced()));
    $('inv-new').addEventListener('click', reset);
    $('inv-settings').addEventListener('click', switchBiz);
    $('inv-create').addEventListener('click', create);
    $('inv-pv-btn').addEventListener('click', () => togglePreview(true));
    $('inv-pv-close').addEventListener('click', () => togglePreview(false));
    // language of the document, right above the preview
    const pickLang = (c) => { if (!inv || inv.lang === c) return; inv.lang = c; if (advOpen) buildAdvanced(); else buildForm(); changed(); };
    const pvl = langSelect('ro', pickLang);
    pvl.id = 'pv-lang';
    const lbl = document.querySelector('#inv-preview-box .pv-label');
    lbl.insertBefore(el('span', { class: 'pv-l2', text: 'Limba facturii' }), lbl.children[1] || null);
    lbl.insertBefore(pvl, lbl.children[2] || null);
    // on the phone the same switch sits at the top of the form (the preview is a separate screen there)
    const top = el('div', { class: 'inv-lang-top phone-only', id: 'inv-lang-top' }, [el('span', { text: 'Limba facturii' })]);
    const pvl2 = langSelect('ro', pickLang);
    pvl2.id = 'pv-lang-top';
    top.append(pvl2);
    $('inv-left').insertBefore(top, $('inv-left').firstChild);
    window.addEventListener('resize', () => { if (!$('invoice').classList.contains('hidden')) renderPreview(); });
    I18n.onChange(() => { if (inv && !$('invoice').classList.contains('hidden')) { buildForm(); changed(); } });
  }

  // ---------------------------------------------------------------------------
  // "Facturi": the list of issued documents
  // ---------------------------------------------------------------------------

  let filter = 'all';
  let span = 6; // months in the chart
  const ym = (iso) => (iso || '').slice(0, 7);
  const pl = (n, one, many) => `${n} ${I18n.t(n === 1 ? one : many)}`;
  const monthName = (k, opts = { month: 'long' }) => new Date(k + '-15T12:00:00').toLocaleDateString(I18n.locale(), opts);
  const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
  const shortMoney = (v) => (v >= 1e6 ? (v / 1e6).toLocaleString(I18n.locale(), { maximumFractionDigits: 1 }) + 'M' : v >= 1e3 ? (v / 1e3).toLocaleString(I18n.locale(), { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v)));
  const isPaid = (d) => d.paid !== false;
  const isLate = (d) => d.paid === false && d.due && d.due < today();
  const daysLate = (d) => Math.round((new Date(today() + 'T12:00:00') - new Date(d.due + 'T12:00:00')) / 864e5);

  function monthsBack(n) {
    const out = [];
    const d = new Date();
    d.setDate(15);
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); out.push(isoDate(x).slice(0, 7)); }
    return out;
  }

  /** Monthly bars: paid (money received) and still unpaid, stacked; tap/hover a month for details. */
  function monthChart(invs, cs) {
    const months = monthsBack(span);
    const data = months.map((k) => {
      const list = invs.filter((d) => ym(d.date) === k);
      const paid = r2(list.filter(isPaid).reduce((a, d) => a + (d.total || 0), 0));
      const due = r2(list.filter((d) => !isPaid(d)).reduce((a, d) => a + (d.total || 0), 0));
      const late = r2(list.filter(isLate).reduce((a, d) => a + (d.total || 0), 0));
      return { k, paid, due, late, total: r2(paid + due), n: list.length };
    });
    const max = Math.max(1, ...data.map((x) => x.total));
    // nice top of the scale
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / pow / (max / pow > 5 ? 2 : 1)) * pow * (max / pow > 5 ? 2 : 1);
    const small = UI.phone();
    const W = small ? 360 : 640, H = small ? 210 : 220, L = small ? 38 : 46, R = 6, T = 12, B = 30;
    const cw = (W - L - R) / data.length;
    const bw = Math.min(38, cw * 0.56);
    const y = (v) => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let i = 0; i <= 3; i++) {
      const v = (top / 3) * i, yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="gl${i === 0 ? ' base' : ''}"/><text x="${L - 8}" y="${yy + 4}" class="yl">${shortMoney(v)}</text>`;
    }
    let bars = '';
    data.forEach((m, i) => {
      const cx = L + cw * i + cw / 2, x = cx - bw / 2;
      const yp = y(m.paid), yd = y(m.paid + m.due);
      const r = 4;
      const seg = (y0, y1, cls, roundTop) => {
        const h = y1 - y0;
        if (h <= 0.5) return '';
        const rr = roundTop ? Math.min(r, h) : 0;
        return `<path class="${cls}" d="M${x},${y1} V${y0 + rr} Q${x},${y0} ${x + rr},${y0} H${x + bw - rr} Q${x + bw},${y0} ${x + bw},${y0 + rr} V${y1} Z"/>`;
      };
      // paid at the bottom; a 2px gap, then unpaid on top
      const gap = m.paid > 0 && m.due > 0 ? 2 : 0;
      bars += seg(yp, y(0), 'b-paid', m.due <= 0);
      bars += seg(yd, yp - gap, 'b-due', true);
      const cur = m.k === ym(today());
      if (!(small && data.length > 6 && i % 2 && !cur)) bars += `<text x="${cx}" y="${H - 10}" class="xl${cur ? ' cur' : ''}">${esc(cap(monthName(m.k, { month: 'short' })).replace('.', ''))}</text>`;
      bars += `<rect class="hit" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B + 4}" data-i="${i}"/>`;
    });
    const svgEl = `<svg viewBox="0 0 ${W} ${H}" class="mchart" role="img" aria-label="Facturi pe luni">${g}${bars}</svg>`;
    const tip = el('div', { class: 'ctip hidden' });
    const wrap = el('div', { class: 'cwrap', html: svgEl });
    wrap.append(tip);
    const showTip = (i, ev) => {
      const m = data[i];
      wrap.querySelectorAll('.hit').forEach((h) => h.classList.toggle('on', +h.dataset.i === i));
      tip.innerHTML = `<b>${esc(cap(monthName(m.k, { month: 'long', year: 'numeric' })))}</b>
        <div><span>Facturat</span><b>${money(m.total)} ${esc(cs)}</b></div>
        <div><span><i class="sw paid"></i>Plătit</span><b>${money(m.paid)} ${esc(cs)}</b></div>
        <div><span><i class="sw due"></i>Neplătit încă</span><b>${money(m.due)} ${esc(cs)}</b></div>
        ${m.late ? `<div class="late"><span>din care restant</span><b>${money(m.late)} ${esc(cs)}</b></div>` : ''}
        <small>${pl(m.n, 'factură', 'facturi')}</small>`;
      tip.classList.remove('hidden');
      const wr = wrap.getBoundingClientRect();
      const hr = wrap.querySelector(`.hit[data-i="${i}"]`).getBoundingClientRect();
      // beside the month, never on top of it
      const right = hr.right - wr.left + 4, leftSide = hr.left - wr.left - tip.offsetWidth - 4;
      tip.style.left = (right + tip.offsetWidth <= wr.width ? right : Math.max(0, leftSide)) + 'px';
    };
    wrap.addEventListener('pointermove', (e) => { const h = e.target.closest && e.target.closest('.hit'); if (h) showTip(+h.dataset.i, e); });
    wrap.addEventListener('pointerdown', (e) => { const h = e.target.closest && e.target.closest('.hit'); if (h) showTip(+h.dataset.i, e); });
    wrap.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { tip.classList.add('hidden'); wrap.querySelectorAll('.hit.on').forEach((h) => h.classList.remove('on')); } });

    const seg = el('div', { class: 'chips' });
    for (const [n, label] of [[6, `6 ${I18n.t('luni')}`], [12, `12 ${I18n.t('luni')}`]]) {
      const b = el('button', { class: 'chip' + (span === n ? ' on' : ''), type: 'button', text: label });
      b.addEventListener('click', () => { span = n; const r = document.getElementById('inv-list-root'); if (r) renderList(r); });
      seg.append(b);
    }
    // table view of the same numbers
    const tbl = el('table', { class: 'ctable hidden' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Luna' }), el('th', { text: 'Facturat' }), el('th', { text: 'Plătit' }), el('th', { text: 'Neplătit' }), el('th', { text: 'Facturi' })])]),
      el('tbody', {}, data.slice().reverse().map((m) => el('tr', {}, [el('td', { text: cap(monthName(m.k, { month: 'long', year: 'numeric' })) }), el('td', { text: money(m.total) }), el('td', { text: money(m.paid) }), el('td', { text: money(m.due) }), el('td', { text: String(m.n) })]))),
    ]);
    const tblBtn = el('button', { class: 'link', type: 'button', text: 'Vezi ca tabel' });
    tblBtn.addEventListener('click', () => { const h = tbl.classList.toggle('hidden'); wrap.classList.toggle('hidden', !h); tblBtn.textContent = h ? I18n.t('Vezi ca tabel') : I18n.t('Vezi graficul'); });
    const sumPaid = r2(data.reduce((a, m) => a + m.paid, 0)), sumDue = r2(data.reduce((a, m) => a + m.due, 0));
    return el('section', { class: 'ccard' }, [
      el('div', { class: 'chead' }, [
        el('div', {}, [el('h3', { text: 'Evoluție pe luni' }), el('p', { text: 'Cât ai facturat în fiecare lună și cât din acei bani ai primit deja.' })]),
        seg,
      ]),
      el('div', { class: 'legend' }, [
        el('span', {}, [el('i', { class: 'sw paid' }), el('span', { text: 'Plătit' }), el('b', { text: `${money(sumPaid)} ${cs}` })]),
        el('span', {}, [el('i', { class: 'sw due' }), el('span', { text: 'Neplătit încă' }), el('b', { text: `${money(sumDue)} ${cs}` })]),
        el('span', { class: 'spacer' }), tblBtn,
      ]),
      wrap, tbl,
    ]);
  }

  /** Who brings the most money this year. */
  function topClients(invs, cs) {
    const year = String(new Date().getFullYear());
    const by = new Map();
    for (const d of invs.filter((x) => (x.date || '').slice(0, 4) === year)) {
      const k = (d.client || '—').trim();
      const o = by.get(k) || { name: k, total: 0, due: 0, n: 0 };
      o.total = r2(o.total + (d.total || 0)); o.n++;
      if (!isPaid(d)) o.due = r2(o.due + (d.total || 0));
      by.set(k, o);
    }
    const list = [...by.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    if (!list.length) return null;
    const max = list[0].total || 1;
    return el('section', { class: 'ccard' }, [
      el('div', { class: 'chead' }, [el('div', {}, [el('h3', { text: `Clienți principali ${year}` }), el('p', { text: 'După valoarea facturată în acest an.' })])]),
      el('div', { class: 'tops' }, list.map((c) => el('div', { class: 'top' }, [
        el('span', { class: 'av', style: { background: Biz.colorFor(c.name) }, text: Biz.initials(c.name) }),
        el('div', { class: 'tb2' }, [
          el('div', { class: 'tl' }, [el('b', { text: c.name }), el('b', { class: 'tv', text: `${money(c.total)} ${cs}` })]),
          el('div', { class: 'bar' }, [el('i', { style: { width: Math.max(3, (c.total / max) * 100) + '%' } })]),
          el('small', { text: `${pl(c.n, 'factură', 'facturi')}${c.due ? ` · ${money(c.due)} ${cs} ${I18n.t('neplătit')}` : ''}` }),
        ]),
      ]))),
    ]);
  }

  function renderList(root) {
    try { renderListInner(root); } catch (e) {
      console.error(e);
      root.innerHTML = '';
      root.append(el('div', { class: 'empty-state' }, [el('span', { class: 'ei', html: svg('info') }), el('b', { text: 'Lista nu s-a putut afișa' }), el('span', { text: String(e && e.message || e) }),
        el('button', { class: 'btn', type: 'button', text: 'Copiază eroarea', onclick: () => Lib.clipboard.writeText(String(e && e.stack || e)) })]));
      hydrateIcons(root);
    }
  }
  function renderListInner(root) {
    Biz.migrate();
    root.innerHTML = '';
    const b = Biz.active();
    const all = Biz.docs();
    const mine = all.filter((d) => !b || !d.bizId || d.bizId === b.id);
    const head = el('header', { class: 'vhead' }, [
      el('h1', { text: 'Facturi' }), el('div', { class: 'spacer' }),
      el('button', { class: 'pill primary', html: svg('plus') + '<span class="lbl">Document nou</span>', type: 'button', onclick: () => newDocMenu(head.querySelector('.pill')) }),
    ]);
    root.append(head);

    if (!b) {
      root.append(el('div', { class: 'empty-state' }, [
        el('span', { class: 'ei', html: svg('receipt') }), el('b', { text: 'Facturi profesionale pentru firma ta' }),
        el('span', { text: 'Configurezi firma o singură dată (durează un minut), apoi emiți facturi, proforme și oferte direct din telefon sau calculator.' }),
        el('button', { class: 'btn primary', text: 'Configurează firma', type: 'button', onclick: () => open() }),
      ]));
      hydrateIcons(root);
      return;
    }

    const now = new Date();
    const thisMonth = isoDate(now).slice(0, 7);
    const lastMonth = monthsBack(2)[0];
    const curMain = b.currency || 'RON';
    const invs = mine.filter((d) => d.type === 'invoice' && (d.currency || 'RON') === curMain);
    const sumOf = (list) => r2(list.reduce((s, d) => s + (d.total || 0), 0));
    const month = invs.filter((d) => ym(d.date) === thisMonth);
    const prev = invs.filter((d) => ym(d.date) === lastMonth);
    const received = invs.filter((d) => isPaid(d) && ym(d.paidAt || d.date) === thisMonth);
    const unpaid = invs.filter((d) => !isPaid(d));
    const late = unpaid.filter(isLate);
    const cs = I18n.lang !== 'ro' && curMain === 'RON' ? 'RON' : Biz.curSymbol(curMain);
    const mSum = sumOf(month), pSum = sumOf(prev);
    const delta = pSum > 0 ? Math.round(((mSum - pSum) / pSum) * 100) : null;
    const mName = monthName(thisMonth), pName = monthName(lastMonth);
    root.append(el('div', { class: 'stats' }, [
      el('div', { class: 'stat hl' }, [
        el('small', { text: `Facturat în ${mName}` }),
        el('b', { html: `${money(mSum)}<small>${esc(cs)}</small>` }),
        el('small', { text: delta === null ? `${month.length} ${month.length === 1 ? 'factură' : 'facturi'}` : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% față de ${pName}` }),
      ]),
      el('div', { class: 'stat' }, [
        el('small', { text: `Bani primiți în ${mName}` }),
        el('b', { html: `${money(sumOf(received))}<small>${esc(cs)}</small>` }),
        el('small', { class: 'muted', text: `${received.length} ${received.length === 1 ? 'factură plătită' : 'facturi plătite'}` }),
      ]),
      el('div', { class: 'stat' + (late.length ? ' bad' : unpaid.length ? ' warn' : '') }, [
        el('small', { text: 'Clienții îți datorează' }),
        el('b', { html: `${money(sumOf(unpaid))}<small>${esc(cs)}</small>` }),
        el('small', { class: 'muted', text: !unpaid.length ? 'Toate facturile sunt plătite' : late.length ? `${money(sumOf(late))} ${cs} au trecut de scadență` : `${unpaid.length} ${unpaid.length === 1 ? 'factură neplătită' : 'facturi neplătite'}, în termen` }),
      ]),
    ]));

    if (invs.length) {
      const grid = el('div', { class: 'cgrid' }, [monthChart(invs, cs), topClients(invs, cs)].filter(Boolean));
      root.append(grid);
    }

    const F = [['all', 'Toate'], ['invoice', 'Facturi'], ['proforma', 'Proforme'], ['quote', Biz.industry(b.industry).quote ? 'Devize' : 'Oferte'], ['unpaid', 'Neplătite'], ['late', 'Restante']];
    const fbar = el('div', { class: 'fchips' });
    for (const [k, label] of F) {
      const c = el('button', { class: 'fchip' + (filter === k ? ' on' : ''), text: label, type: 'button' });
      c.addEventListener('click', () => { filter = k; renderList(root); });
      fbar.append(c);
    }
    root.append(fbar);

    const shown = mine.filter((d) => filter === 'all' || (filter === 'unpaid' ? d.type === 'invoice' && !isPaid(d) : filter === 'late' ? d.type === 'invoice' && isLate(d) : d.type === filter));
    if (!shown.length) {
      root.append(el('div', { class: 'empty-state', style: { marginTop: '14px' } }, [
        el('span', { class: 'ei', html: svg('receipt') }),
        el('b', { text: mine.length ? 'Nimic aici' : 'Niciun document emis încă' }),
        el('span', { text: mine.length ? 'Schimbă filtrul de mai sus.' : 'Apasă „Document nou”, completezi clientul și ce ai vândut, apoi „Creează PDF”.' }),
        mine.length ? null : el('button', { class: 'btn primary', text: 'Emite prima factură', type: 'button', onclick: () => open({ type: 'invoice' }) }),
      ]));
      hydrateIcons(root);
      return;
    }
    const groups = new Map();
    for (const d of shown.sort((a, c) => (c.date || '').localeCompare(a.date || '') || (c.time || 0) - (a.time || 0))) {
      const k = ym(d.date) || 'fără dată';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    for (const [k, items] of groups) {
      const label = /^\d{4}-\d{2}$/.test(k) ? cap(monthName(k, { month: 'long', year: 'numeric' })) : k;
      const tot = sumOf(items.filter((d) => d.type === 'invoice' && (d.currency || 'RON') === curMain));
      root.append(el('div', { class: 'grp-h' }, [el('span', { text: label }), tot ? el('b', { text: `${money(tot)} ${cs}` }) : el('span')]));
      const card = el('div', { class: 'list-card' });
      for (const d of items) card.append(docRow(d, () => renderList(root)));
      root.append(card);
    }
    hydrateIcons(root);
  }

  function statusOf(d) {
    if (d.type !== 'invoice') return ['doc', Biz.docLabel(d.type, Biz.industry((Biz.get(d.bizId) || {}).industry)), ''];
    if (d.paid === false) {
      if (isLate(d)) return ['late', 'Restantă', I18n.t(`${daysLate(d)} ${daysLate(d) === 1 ? 'zi' : 'zile'} întârziere`)];
      return ['due', 'Neplătită', d.due ? `${I18n.t('scadentă')} ${dateRo(d.due)}` : ''];
    }
    return ['paid', 'Plătită', ''];
  }

  function docRow(d, refresh) {
    const [st, stLabel, stSub] = statusOf(d);
    const row = el('button', { class: 'row', type: 'button' }, [
      el('span', { class: 'av', style: { background: Biz.colorFor(d.client) }, text: Biz.initials(d.client) }),
      el('span', { class: 'rt' }, [el('b', { text: d.client || '—' }), el('small', { text: `${d.series}-${pad(d.number)} · ${dateRo(d.date)}${stSub ? ' · ' + stSub : ''}` })]),
      el('span', { class: 'rr' }, [el('b', { text: moneyC(d.total || 0, d.currency) }), el('span', { class: 'st ' + st, html: (st === 'paid' ? svg('check') : st === 'late' ? svg('info') : st === 'due' ? svg('calendar') : '') + `<span>${esc(stLabel)}</span>` })]),
    ]);
    const ef = typeof EFactura !== 'undefined' && EFactura.badge(d);
    if (ef) row.querySelector('.rt small').after(el('span', { class: 'ef-chip ' + ef[0], title: I18n.t(ef[2]), text: I18n.t(ef[1]) }));
    row.addEventListener('click', () => docMenu(d, row, refresh));
    return row;
  }

  function docMenu(d, anchor, refresh) {
    const exists = Host.exists(d.path);
    const items = [
      d.type === 'invoice' && d.paid === false ? { label: 'Clientul a plătit — marchează ca plătită', icon: 'paid', run: () => { Biz.updateDoc(d.id, { paid: true, paidAt: today() }); refresh(); UI.toast('Factura e marcată ca plătită.'); } } : null,
      d.type === 'invoice' && typeof EFactura !== 'undefined' && EFactura.badge(d) ? { label: 'e-Factura (SPV)', icon: 'receipt', run: () => EFactura.details(d).then(() => refresh()) } : null,
      { label: 'Deschide PDF-ul', icon: 'pdf', disabled: !exists, run: () => App.openPath(d.path) },
      Host.mobile ? { label: 'Trimite (WhatsApp, email…)', icon: 'share', disabled: !exists, run: () => Host.share(d.path) } : { label: 'Arată în folder', icon: 'folder', disabled: !exists, run: () => Host.showInFolder(d.path) },
      Host.mobile ? { label: 'Salvează o copie în telefon…', icon: 'download', disabled: !exists, run: () => Host.exportCopy(d.path) } : null,
      '-',
      d.type === 'invoice' && d.paid !== false ? { label: 'Marchează ca neplătită', icon: 'calendar', run: () => { Biz.updateDoc(d.id, { paid: false, paidAt: null, due: d.due || addDays(d.date || today(), 15) }); refresh(); } } : null,
      d.type !== 'invoice' && d.data ? { label: 'Transformă în factură', icon: 'swap', run: () => open({ from: d, as: 'invoice' }) } : null,
      d.data ? { label: 'Duplică (document nou la fel)', icon: 'copy', run: () => open({ from: d }) } : null,
      '-',
      { label: 'Scoate din listă', icon: 'del', danger: true, run: async () => { if (await UI.confirm('Scot documentul din listă?', 'Fișierul PDF rămâne unde e; doar nu mai apare aici.', 'Scoate')) { Biz.removeDoc(d.id); refresh(); } } },
    ];
    UI.menuAt(anchor, items, `${Biz.docLabel(d.type, Biz.industry((Biz.get(d.bizId) || {}).industry))} ${d.series}-${pad(d.number)} · ${d.client || ''}`);
  }

  function newDocMenu(anchor) {
    const b = Biz.active();
    const I = Biz.industry(b && b.industry);
    UI.menuAt(anchor, [
      { label: 'Factură', icon: 'receipt', run: () => open({ type: 'invoice' }) },
      { label: 'Factură proformă', icon: 'doc', run: () => open({ type: 'proforma' }) },
      { label: I.quote ? 'Deviz' : 'Ofertă de preț', icon: 'edit', run: () => open({ type: 'quote' }) },
    ], 'Ce vrei să emiți?');
  }

  /** Numbers for the home screen card. */
  function summary() {
    Biz.migrate();
    const b = Biz.active();
    if (!b) return null;
    const thisMonth = today().slice(0, 7);
    const invs = Biz.docs().filter((d) => d.type === 'invoice' && (!d.bizId || d.bizId === b.id) && (d.currency || 'RON') === (b.currency || 'RON'));
    const month = invs.filter((d) => (d.date || '').slice(0, 7) === thisMonth);
    const unpaid = invs.filter((d) => d.paid === false);
    return {
      currency: I18n.lang !== 'ro' && (b.currency || 'RON') === 'RON' ? 'RON' : Biz.curSymbol(b.currency || 'RON'), month: r2(month.reduce((s, d) => s + (d.total || 0), 0)), monthCount: month.length,
      unpaid: r2(unpaid.reduce((s, d) => s + (d.total || 0), 0)), unpaidCount: unpaid.length, late: unpaid.filter(isLate).length, last: Biz.docs().find((d) => d.bizId === b.id) || null,
    };
  }

  const history = () => Biz.docs();

  return {
    init, open, back, history, html, compute, money, moneyC, openSettings, onboarding, openAdvanced, fileNameFor, renderList, newDocMenu, summary, docMenu,
    get company() { return biz; },
    get isOpen() { return !$('invoice').classList.contains('hidden'); },
  };
})();
