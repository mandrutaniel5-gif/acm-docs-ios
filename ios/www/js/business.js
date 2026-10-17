'use strict';
// Businesses ("firme") that issue documents, the kinds of activity, and the
// list of issued documents. Everything is stored on the device only.

const Biz = (() => {
  const KEY_LIST = 'acm.businesses';
  const KEY_ACTIVE = 'acm.business';
  const KEY_DOCS = 'acm.docs';

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { UI.toast('Memoria aplicației e plină: nu am putut salva.', { error: true }); return false; } };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------------------------------------------------------------------
  // Kinds of activity: categories of lines, extra fields, wording
  // ---------------------------------------------------------------------------

  const INDUSTRIES = {
    general: {
      label: 'Servicii', desc: 'Orice activitate, servicii diverse', icon: 'briefcase', color: '#007aff',
      cats: [{ id: 'serv', label: 'Serviciu', group: 'Servicii', um: 'serv.' }, { id: 'prod', label: 'Produs', group: 'Produse', um: 'buc' }, { id: 'other', label: 'Altele', group: 'Altele', um: 'buc' }],
      extra: null,
      hint: 'Ce ai vândut sau ce serviciu ai prestat…',
      notes: '',
    },
    retail: {
      label: 'Comerț', desc: 'Vânzare de produse, magazin, online', icon: 'store', color: '#ff9500',
      cats: [{ id: 'prod', label: 'Produs', group: 'Produse', um: 'buc' }, { id: 'ship', label: 'Transport', group: 'Livrare', um: 'serv.' }, { id: 'other', label: 'Altele', group: 'Altele', um: 'buc' }],
      extra: null,
      hint: 'Denumirea produsului…',
      notes: '',
    },
    auto: {
      label: 'Service auto', desc: 'Reparații, piese, manoperă', icon: 'car', color: '#ff3b30',
      cats: [{ id: 'labor', label: 'Manoperă', group: 'Manoperă', um: 'serv.' }, { id: 'parts', label: 'Piesă', group: 'Piese', um: 'buc' }, { id: 'other', label: 'Altele', group: 'Altele', um: 'buc' }],
      extra: { title: 'Autovehicul', fields: [
        { key: 'model', label: 'Marcă și model', placeholder: 'ex. Dacia Logan', wide: true },
        { key: 'plate', label: 'Nr. înmatriculare', placeholder: 'BH 12 ABC', upper: true },
        { key: 'km', label: 'Km la bord', inputmode: 'numeric' },
        { key: 'vin', label: 'Serie șasiu (VIN)', upper: true, wide: true },
      ] },
      hint: 'Ce ai reparat sau ce piesă ai pus…',
      quote: 'DEVIZ',
      signClient: 'Client — am primit autovehiculul și documentul',
      notes: 'Garanție manoperă 3 luni.',
    },
    construct: {
      label: 'Construcții', desc: 'Renovări, instalații, amenajări', icon: 'hammer', color: '#a2845e',
      cats: [{ id: 'labor', label: 'Manoperă', group: 'Manoperă', um: 'ore' }, { id: 'mat', label: 'Materiale', group: 'Materiale', um: 'buc' }, { id: 'equip', label: 'Utilaje', group: 'Utilaje', um: 'ore' }, { id: 'other', label: 'Altele', group: 'Altele', um: 'buc' }],
      extra: { title: 'Lucrare', fields: [
        { key: 'site', label: 'Adresa lucrării', wide: true },
        { key: 'work', label: 'Ce lucrare', placeholder: 'ex. Renovare baie', wide: true },
        { key: 'period', label: 'Perioada', placeholder: 'ex. 1–15 octombrie' },
        { key: 'contract', label: 'Contract nr.' },
      ] },
      hint: 'Lucrare sau material…',
      quote: 'DEVIZ',
      notes: '',
    },
    it: {
      label: 'IT și consultanță', desc: 'Proiecte, ore, abonamente', icon: 'code', color: '#5856d6',
      cats: [{ id: 'hours', label: 'Ore', group: 'Ore lucrate', um: 'ore' }, { id: 'proj', label: 'Proiect', group: 'Proiecte', um: 'buc' }, { id: 'sub', label: 'Abonament', group: 'Abonamente', um: 'lună' }, { id: 'other', label: 'Altele', group: 'Altele', um: 'buc' }],
      extra: { title: 'Proiect', fields: [
        { key: 'project', label: 'Proiect', wide: true },
        { key: 'period', label: 'Perioada', placeholder: 'ex. octombrie 2026' },
        { key: 'contract', label: 'Contract nr.' },
      ] },
      hint: 'Ce ai livrat…',
      notes: '',
    },
    transport: {
      label: 'Transport', desc: 'Curse, marfă, persoane', icon: 'truck', color: '#30b0c7',
      cats: [{ id: 'trip', label: 'Cursă', group: 'Curse', um: 'cursă' }, { id: 'km', label: 'Km', group: 'Kilometri', um: 'km' }, { id: 'extra', label: 'Extra', group: 'Servicii extra', um: 'serv.' }],
      extra: { title: 'Transport', fields: [
        { key: 'route', label: 'Traseu', placeholder: 'ex. Oradea – Cluj-Napoca', wide: true },
        { key: 'vehicle', label: 'Nr. auto', upper: true },
        { key: 'cmr', label: 'CMR / aviz' },
      ] },
      hint: 'Cursa sau serviciul…',
      notes: '',
    },
    beauty: {
      label: 'Frumusețe', desc: 'Salon, cosmetică, wellness', icon: 'face', color: '#ff2d55',
      cats: [{ id: 'serv', label: 'Serviciu', group: 'Servicii', um: 'serv.' }, { id: 'prod', label: 'Produs', group: 'Produse', um: 'buc' }],
      extra: null,
      hint: 'Serviciul sau produsul…',
      notes: '',
    },
    food: {
      label: 'Restaurant', desc: 'Catering, evenimente, meniuri', icon: 'store', color: '#34c759',
      cats: [{ id: 'food', label: 'Mâncare', group: 'Mâncare', um: 'porție' }, { id: 'drink', label: 'Băuturi', group: 'Băuturi', um: 'buc' }, { id: 'event', label: 'Eveniment', group: 'Servicii', um: 'serv.' }],
      extra: { title: 'Eveniment', fields: [
        { key: 'event', label: 'Eveniment', wide: true },
        { key: 'when', label: 'Data evenimentului' },
        { key: 'guests', label: 'Nr. persoane', inputmode: 'numeric' },
      ] },
      hint: 'Produs sau serviciu…',
      notes: '',
    },
  };
  const industry = (id) => INDUSTRIES[id] || INDUSTRIES.general;
  // How each kind of business usually gets paid (used until the app learns the user's own habits).
  const PRESETS = {
    general: { pay: 'Ordin de plată', paid: false, kind: 'pj', payDays: 15 },
    retail: { pay: 'Card', paid: true, kind: 'pf', payDays: 0 },
    auto: { pay: 'Numerar', paid: true, kind: 'pf', payDays: 0 },
    construct: { pay: 'Ordin de plată', paid: false, kind: 'pf', payDays: 30 },
    it: { pay: 'Ordin de plată', paid: false, kind: 'pj', payDays: 15 },
    transport: { pay: 'Ordin de plată', paid: false, kind: 'pj', payDays: 30 },
    beauty: { pay: 'Card', paid: true, kind: 'pf', payDays: 0 },
    food: { pay: 'Card', paid: true, kind: 'pf', payDays: 0 },
  };
  const preset = (id) => PRESETS[id] || PRESETS.general;

  const DOC_TYPES = {
    invoice: { label: 'Factură', plural: 'Facturi', title: 'FACTURĂ', series: 'FCT' },
    proforma: { label: 'Proformă', plural: 'Proforme', title: 'FACTURĂ PROFORMĂ', series: 'PRF' },
    quote: { label: 'Ofertă', plural: 'Oferte', title: 'OFERTĂ DE PREȚ', series: 'OF' },
  };
  const docLabel = (type, ind) => (type === 'quote' && ind && ind.quote ? ind.quote.charAt(0) + ind.quote.slice(1).toLowerCase() : DOC_TYPES[type].label);
  const docTitle = (type, ind) => (type === 'quote' && ind && ind.quote ? ind.quote : DOC_TYPES[type].title);

  const CURRENCIES = [['RON', 'lei'], ['EUR', 'EUR'], ['USD', 'USD'], ['GBP', 'GBP'], ['CHF', 'CHF'], ['HUF', 'HUF'], ['MDL', 'MDL']];
  const curSymbol = (c) => (CURRENCIES.find((x) => x[0] === c) || [c, c || 'lei'])[1];

  // ---------------------------------------------------------------------------
  // Businesses
  // ---------------------------------------------------------------------------

  function blankProfile(industryId = 'general') {
    const ind = industry(industryId);
    return {
      id: uid(), industry: industryId,
      name: '', legal: '', cui: '', regcom: '', capital: '',
      address: '', city: '', county: '', country: 'România',
      phone: '', email: '', web: '', iban: '', bank: '',
      vatPayer: false, vatRate: 21, pricesInclVat: true,
      nonVatNote: 'Furnizor neplătitor de TVA (regim special de scutire, art. 310 Cod fiscal).',
      currency: 'RON', payDays: (PRESETS[industryId] || PRESETS.general).payDays, docLang: 'ro', habits: {},
      series: { invoice: DOC_TYPES.invoice.series, proforma: DOC_TYPES.proforma.series, quote: ind.quote === 'DEVIZ' ? 'DEV' : DOC_TYPES.quote.series },
      next: { invoice: 1, proforma: 1, quote: 1 },
      notes: ind.notes || '', logo: null, folder: '', tpl: null,
      created: Date.now(),
    };
  }

  function normalize(p) {
    const b = blankProfile(p.industry || 'general');
    const out = { ...b, ...p };
    out.series = { ...b.series, ...(p.series || {}) };
    out.next = { ...b.next, ...(p.next || {}) };
    if (!INDUSTRIES[out.industry]) out.industry = 'general';
    return out;
  }

  let cache = null;
  function list() {
    if (!cache) cache = load(KEY_LIST, []).map(normalize);
    return cache;
  }
  function saveList(l) { cache = l; store(KEY_LIST, l); emit(); }
  function get(id) { return list().find((p) => p.id === id) || null; }
  function active() {
    const l = list();
    return l.find((p) => p.id === load(KEY_ACTIVE, null)) || l[0] || null;
  }
  function setActive(id) { store(KEY_ACTIVE, id); emit(); }
  function save(p) {
    const l = list().slice();
    const i = l.findIndex((x) => x.id === p.id);
    const n = normalize(p);
    if (i >= 0) l[i] = n; else l.push(n);
    saveList(l);
    if (l.length === 1 || i < 0) setActive(n.id);
    return n;
  }
  function remove(id) {
    saveList(list().filter((p) => p.id !== id));
    if (load(KEY_ACTIVE, null) === id) setActive(list()[0] ? list()[0].id : null);
  }
  /** Takes the next number for a document type and remembers it. */
  function bumpNumber(id, type, used) {
    const p = get(id);
    if (!p) return;
    if (used >= (p.next[type] || 1)) { p.next = { ...p.next, [type]: used + 1 }; save(p); }
  }

  const COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5856d6', '#30b0c7', '#a2845e'];
  function colorFor(s) {
    let h = 0;
    for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function initials(s) {
    const w = String(s || '').replace(/\b(srl|sa|pfa|ii|if|s\.r\.l\.|s\.a\.)\b/gi, '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }
  /** Small square with the logo or the initials. */
  function badge(p, cls = 'bl') {
    const n = el('span', { class: cls });
    if (p && p.logo) n.append(el('img', { src: p.logo, alt: '' }));
    else { n.textContent = initials(p ? p.name : '?'); n.style.background = `linear-gradient(150deg, ${colorFor(p && p.name)}, ${colorFor((p && p.name) + 'x')})`; }
    return n;
  }

  // ---------------------------------------------------------------------------
  // Issued documents
  // ---------------------------------------------------------------------------

  // Dates may be saved as text (2026-10-16) or, by older versions, as a timestamp: always give text.
  function isoOf(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' || (typeof v === 'string' && /^\d{10,}$/.test(v))) {
      const d = new Date(+v);
      if (isNaN(d)) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const s = String(v);
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    if (m) return m[1];
    const ro = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    return ro ? `${ro[3]}-${ro[2].padStart(2, '0')}-${ro[1].padStart(2, '0')}` : '';
  }
  function cleanDoc(d) {
    if (!d || typeof d !== 'object') return null;
    return {
      ...d,
      type: DOC_TYPES[d.type] ? d.type : 'invoice',
      series: String(d.series == null ? '' : d.series), number: Math.max(0, Math.round(+d.number) || 0),
      client: String(d.client == null ? '' : d.client), total: Number.isFinite(+d.total) ? +d.total : 0,
      currency: d.currency || 'RON', date: isoOf(d.date) || isoOf(d.time), due: isoOf(d.due), paidAt: isoOf(d.paidAt) || null,
      path: d.path || '',
    };
  }
  function docs() { const l = load(KEY_DOCS, []); return Array.isArray(l) ? l.map(cleanDoc).filter(Boolean) : []; }
  function saveDocs(d) { store(KEY_DOCS, d.slice(0, 2000)); emit(); }
  function addDoc(entry) {
    const d = docs().filter((x) => x.path !== entry.path || x.id === entry.id);
    d.unshift({ id: uid(), time: Date.now(), ...entry });
    saveDocs(d);
  }
  function updateDoc(id, patch) {
    saveDocs(docs().map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeDoc(id) { saveDocs(docs().filter((x) => x.id !== id)); }

  // ---------------------------------------------------------------------------
  // First start after the update: bring over the data of "PDF Editor"
  // ---------------------------------------------------------------------------

  function migrate() {
    if (localStorage.getItem(KEY_LIST) !== null) return;
    const old = load('pdfeditor.company', null);
    const oldDocs = load('pdfeditor.invoices', []);
    if (!old && !oldDocs.length) { store(KEY_LIST, []); return; }
    const c = { name: 'Mai Eur Atelier', phone: '', series: 'MEA', next: 1, ...(old || {}) };
    const p = blankProfile('auto');
    for (const k of ['name', 'legal', 'cui', 'regcom', 'capital', 'address', 'city', 'county', 'phone', 'email', 'iban', 'bank', 'vatPayer', 'vatRate', 'pricesInclVat', 'nonVatNote', 'notes', 'folder', 'logo']) {
      if (c[k] !== undefined && c[k] !== null) p[k] = c[k];
    }
    p.series.invoice = c.series || 'FCT';
    p.next.invoice = Math.max(1, Math.round(+c.next) || 1);
    if (!p.logo) p.logo = legacyLogo();
    const oldTpl = load('pdfeditor.invoiceTemplate', null);
    if (oldTpl) {
      const t = { ...oldTpl };
      if (Array.isArray(t.order)) t.order = t.order.map((s) => (s === 'car' ? 'extra' : s));
      if (Array.isArray(t.hidden)) t.hidden = t.hidden.map((s) => (s === 'car' ? 'extra' : s));
      t.labels = { ...(t.labels || {}) };
      if (t.title) t.labels.titleInvoice = t.title;
      p.tpl = t;
    }
    store(KEY_LIST, [p]);
    store(KEY_ACTIVE, p.id);
    cache = null;
    if (oldDocs.length && !load(KEY_DOCS, []).length) {
      store(KEY_DOCS, oldDocs.map((h) => ({
        id: uid(), bizId: p.id, type: 'invoice', series: h.series, number: h.number, client: h.client, total: h.total,
        currency: 'RON', date: h.date, time: h.time || Date.now(), path: h.path, paid: true,
      })));
    }
    const draft = load('pdfeditor.invoiceDraft', null);
    if (draft && draft.client && Array.isArray(draft.lines) && !localStorage.getItem('acm.invoiceDraft')) {
      store('acm.invoiceDraft', {
        ...draft, bizId: p.id, docType: 'invoice', currency: 'RON', extra: draft.car || {}, discount: 0,
        lines: draft.lines.map((l) => ({ ...l, type: l.type === 'parts' ? 'parts' : l.type === 'labor' ? 'labor' : 'other' })),
      });
    }
  }

  function legacyLogo() {
    // The logo the old version used when none was chosen (Windows only).
    if (Host.platform !== 'electron') return null;
    try {
      const file = require('url').fileURLToPath(new URL('assets/legacy-logo.jpg', location.href));
      return 'data:image/jpeg;base64,' + Host.toB64(Host.readFile(file));
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------------------
  // Change notifications (home screen, lists)
  // ---------------------------------------------------------------------------

  const listeners = [];
  let emitTimer = 0;
  function emit() { clearTimeout(emitTimer); emitTimer = setTimeout(() => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }), 0); }
  function onChange(f) { listeners.push(f); }

  return {
    INDUSTRIES, DOC_TYPES, CURRENCIES, industry, preset, docLabel, docTitle, curSymbol,
    list, get, active, setActive, save, remove, blankProfile, normalize, bumpNumber,
    docs, addDoc, updateDoc, removeDoc, migrate, colorFor, initials, badge, onChange, uid, load, store,
  };
})();
