// RO e-Factura: invoices made with ACM Docs are also sent, automatically, to the company's SPV at ANAF.
//
//  - the invoice becomes an XML file in the format ANAF accepts (UBL 2.1, EN 16931 with the Romanian
//    rules, CIUS-RO), built from the same data as the PDF;
//  - it goes from this device straight to ANAF (never through the ACM Docs server);
//  - ANAF checks it; its answer ("validată" / "respinsă" and why) is kept next to the invoice, and the
//    message signed by ANAF is saved as a .zip in the same folder as the PDF;
//  - the company is connected once a year, with its qualified certificate (OAuth at ANAF). The access
//    keys are kept on this device, in the system's secure storage.
const EFactura = (() => {
  const KEY = 'acm.anaf';           // secure storage: access keys of the connected company
  const PREF = 'acm.efactura.auto'; // send automatically (default on)
  const BOX_INFO = 'acm-anaf-v1';
  const API = (env) => `https://api.anaf.ro/${env === 'prod' ? 'prod' : 'test'}/FCTEL/rest`;
  const VALIDATE = 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1';
  const A = () => window.__lib.acmcrypto;
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) {} });

  // ---------------------------------------------------------------- Romanian counties (ISO 3166-2:RO)
  const COUNTIES = [['AB', 'Alba'], ['AR', 'Arad'], ['AG', 'Argeș'], ['BC', 'Bacău'], ['BH', 'Bihor'], ['BN', 'Bistrița-Năsăud'], ['BT', 'Botoșani'], ['BV', 'Brașov'], ['BR', 'Brăila'], ['B', 'București'], ['BZ', 'Buzău'], ['CS', 'Caraș-Severin'], ['CL', 'Călărași'], ['CJ', 'Cluj'], ['CT', 'Constanța'], ['CV', 'Covasna'], ['DB', 'Dâmbovița'], ['DJ', 'Dolj'], ['GL', 'Galați'], ['GR', 'Giurgiu'], ['GJ', 'Gorj'], ['HR', 'Harghita'], ['HD', 'Hunedoara'], ['IL', 'Ialomița'], ['IS', 'Iași'], ['IF', 'Ilfov'], ['MM', 'Maramureș'], ['MH', 'Mehedinți'], ['MS', 'Mureș'], ['NT', 'Neamț'], ['OT', 'Olt'], ['PH', 'Prahova'], ['SM', 'Satu Mare'], ['SJ', 'Sălaj'], ['SB', 'Sibiu'], ['SV', 'Suceava'], ['TR', 'Teleorman'], ['TM', 'Timiș'], ['TL', 'Tulcea'], ['VS', 'Vaslui'], ['VL', 'Vâlcea'], ['VN', 'Vrancea']];
  const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(jud(etul)?\.?|judet)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function countyCode(text) {
    const p = plain(text);
    if (!p) return '';
    if (/^(municipiul )?bucuresti|^sector \d/.test(p)) return 'B';
    for (const [c, n] of COUNTIES) if (p === plain(n) || p === c.toLowerCase()) return c;
    return '';
  }
  const COUNTRIES = { romania: 'RO', ro: 'RO', 'republica moldova': 'MD', moldova: 'MD', md: 'MD', ungaria: 'HU', hungary: 'HU', bulgaria: 'BG', germania: 'DE', germany: 'DE', austria: 'AT', italia: 'IT', italy: 'IT', spania: 'ES', spain: 'ES', franta: 'FR', france: 'FR', olanda: 'NL', netherlands: 'NL', belgia: 'BE', polonia: 'PL', cehia: 'CZ', slovacia: 'SK', grecia: 'GR', portugalia: 'PT', irlanda: 'IE', suedia: 'SE', danemarca: 'DK', finlanda: 'FI', croatia: 'HR', slovenia: 'SI', serbia: 'RS', ucraina: 'UA', elvetia: 'CH', norvegia: 'NO', 'marea britanie': 'GB', 'regatul unit': 'GB', uk: 'GB', sua: 'US', usa: 'US', 'statele unite': 'US', turcia: 'TR', israel: 'IL', canada: 'CA', china: 'CN' };
  function countryCode(text) {
    const p = plain(text);
    if (!p) return 'RO';
    if (COUNTRIES[p]) return COUNTRIES[p];
    return /^[a-z]{2}$/.test(p) ? p.toUpperCase() : '';
  }
  /** Bucharest: the city is the sector (SECTOR1 … SECTOR6), as ANAF asks. */
  function sectorOf(text) { const m = /sector(?:ul)?\s*(\d)/i.exec(String(text || '')); return m && +m[1] >= 1 && +m[1] <= 6 ? 'SECTOR' + m[1] : ''; }

  // ---------------------------------------------------------------- units of measure (UN/ECE Rec. 20)
  const UNITS = { buc: 'H87', bucata: 'H87', bucati: 'H87', 'serv': 'C62', serviciu: 'C62', servicii: 'C62', ora: 'HUR', ore: 'HUR', h: 'HUR', zi: 'DAY', zile: 'DAY', luna: 'MON', luni: 'MON', an: 'ANN', km: 'KMT', kg: 'KGM', g: 'GRM', t: 'TNE', tona: 'TNE', m: 'MTR', ml: 'MTR', mp: 'MTK', 'm2': 'MTK', mc: 'MTQ', 'm3': 'MTQ', l: 'LTR', litru: 'LTR', litri: 'LTR', set: 'SET', pachet: 'PK', cutie: 'BX', kwh: 'KWH', cursa: 'C62', portie: 'C62', pers: 'C62', persoana: 'C62' };
  function unitCode(um) { const p = plain(um).replace(/ /g, ''); return UNITS[p] || UNITS[p.replace(/\.$/, '')] || 'C62'; }

  /** Romanian CUI/CIF check digit (key 753217532). */
  function cuiValid(v) {
    const d = String(v || '').toUpperCase().replace(/^RO/, '').replace(/\s+/g, '');
    if (!/^\d{2,10}$/.test(d)) return false;
    const body = d.slice(0, -1).padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += +body[i] * +'753217532'[i];
    return (sum * 10) % 11 % 10 === +d.slice(-1);
  }
  /** CNP check digit (key 279146358279). */
  function cnpValid(v) {
    const d = String(v || '').replace(/\s+/g, '');
    if (!/^\d{13}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += +d[i] * +'279146358279'[i];
    const c = sum % 11;
    return (c === 10 ? 1 : c) === +d[12];
  }

  // ---------------------------------------------------------------- the XML (UBL 2.1, CIUS-RO)
  const x = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const amt = (n) => (Math.round((+n || 0) * 100) / 100).toFixed(2);
  const digits = (s) => String(s || '').replace(/[^0-9]/g, '');
  const cleanCui = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  const price = (n) => { const v = (+n || 0).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return /\./.test(v) && v.split('.')[1].length < 2 ? (+v).toFixed(2) : v.includes('.') ? v : (+v).toFixed(2); };
  const cut = (s, n) => String(s || '').trim().slice(0, n);
  const idOf = (d) => `${d.series}-${String(d.number).padStart(4, '0')}`;
  const PAY = { Numerar: '10', Card: '48', 'Ordin de plată': '42', 'Transfer bancar': '42', Ramburs: '1' };

  function addressXml(street, city, county, country) {
    return `<cac:PostalAddress>${street ? `<cbc:StreetName>${x(cut(street, 150))}</cbc:StreetName>` : ''}<cbc:CityName>${x(cut(city, 50))}</cbc:CityName>${county ? `<cbc:CountrySubentity>${x(county)}</cbc:CountrySubentity>` : ''}<cac:Country><cbc:IdentificationCode>${x(country)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`;
  }
  function placeOf(addr, city, county, country) {
    const cc = countryCode(country);
    if (cc !== 'RO') return { street: addr, city: city || '', county: '', country: cc };
    const code = countyCode(county) || countyCode(city);
    const cityName = code === 'B' ? sectorOf(city) || sectorOf(addr) : city;
    return { street: addr, city: cityName, county: code ? 'RO-' + code : '', country: 'RO' };
  }

  /** Everything ANAF needs, from the invoice as it was created. Returns { xml, problems[] }. */
  function build(d) {
    const inv = d.data || {};
    const b = Biz.get(d.bizId) || Biz.active();
    const problems = [];
    if (!b) return { xml: '', problems: ['Datele firmei lipsesc.'] };
    const t = Invoice.compute(inv, b);
    const cats = Biz.industry(b.industry).cats || [];
    const cur = inv.currency || 'RON';
    // seller
    const sCui = digits(b.cui);
    if (!sCui) problems.push('Completează CUI-ul firmei (Date firmă).');
    else if (!cuiValid(sCui)) problems.push('CUI-ul firmei nu este corect. Verifică cifrele (Date firmă).');
    const sp = placeOf(b.address, b.city, b.county, b.country || 'România');
    if (!sp.city) problems.push(sp.county === 'RO-B' ? 'Pentru București, scrie sectorul la localitatea firmei (de exemplu „Sector 3”).' : 'Completează localitatea firmei (Date firmă).');
    if (sp.country === 'RO' && !sp.county) problems.push('Alege județul firmei (Date firmă).');
    if (!b.address) problems.push('Completează adresa firmei (Date firmă).');
    // buyer
    const c = inv.client || {};
    const pj = c.kind === 'pj';
    const cp = placeOf(c.address, c.city, c.county, c.country || 'România');
    if (!c.name) problems.push('Completează numele clientului.');
    if (pj && !digits(c.cui) && cp.country === 'RO') problems.push('Completează CUI-ul clientului.');
    else if (pj && cp.country === 'RO' && !cuiValid(c.cui)) problems.push('CUI-ul clientului nu este corect. Verifică cifrele.');
    if (!pj && digits(c.cnp) && !cnpValid(c.cnp)) problems.push('CNP-ul clientului nu este corect. Verifică cifrele sau lasă câmpul gol.');
    if (!String(c.address || '').trim()) problems.push('Completează adresa clientului (stradă, număr).');
    if (!cp.city) problems.push(cp.county === 'RO-B' ? 'Pentru un client din București, scrie sectorul la localitate (de exemplu „Sector 1”).' : 'Completează localitatea clientului.');
    if (cp.country === 'RO' && !cp.county) problems.push('Alege județul clientului.');
    if (!cp.country) problems.push('Țara clientului nu este recunoscută (scrie-o în română, de exemplu „Germania”).');
    if (!t.rows.length) problems.push('Factura nu are produse sau servicii.');
    if (cur !== 'RON' && t.vat && !(+inv.rate > 0)) problems.push('Completează cursul de schimb (factura în altă monedă decât lei).');

    const vat = t.vat, rate = Math.round(t.rate * 10000) / 100; // e.g. 21
    const catId = vat ? 'S' : 'O';
    const taxCat = (inner) => `<cac:${inner}><cbc:ID>${catId}</cbc:ID>${vat ? `<cbc:Percent>${rate}</cbc:Percent>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${inner}>`;
    const lineNet = (r) => (vat ? r.base : r.gross);
    const lineSum = Math.round(t.rows.reduce((s, r) => s + lineNet(r), 0) * 100) / 100;
    const taxable = Math.round(t.base * 100) / 100;
    const allowance = Math.round((lineSum - taxable) * 100) / 100;
    const tax = vat ? Math.round(taxable * t.rate * 100) / 100 : 0;
    const incl = Math.round((taxable + tax) * 100) / 100;
    const payable = Math.round(t.total * 100) / 100;
    const rounding = Math.round((payable - incl) * 100) / 100;

    const sellerName = b.legal || b.name;
    const buyerId = pj ? digits(c.cui) || cut(c.cui, 30) : digits(c.cnp).length === 13 ? digits(c.cnp) : '0000000000000';
    const notes = [inv.notes, !vat ? b.nonVatNote : ''].filter((n) => n && String(n).trim()).map((n) => `<cbc:Note>${x(cut(n, 300))}</cbc:Note>`).join('');
    const payCode = PAY[inv.pay] || (b.iban ? '42' : '10');
    const iban = String(b.iban || '').replace(/\s+/g, '');

    const lines = t.rows.map((r, i) => {
      const cat = cats.find((k) => k.id === r.type);
      const qty = r.qtyN || 1;
      const net = lineNet(r);
      const name = String(r.desc || '').trim();
      return `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="${unitCode(r.um || (cat && cat.um) || 'buc')}">${+qty.toFixed(3)}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${cur}">${amt(net)}</cbc:LineExtensionAmount>`
        + `<cac:Item>${name.length > 100 ? `<cbc:Description>${x(cut(name, 200))}</cbc:Description>` : ''}<cbc:Name>${x(cut(name, 100))}</cbc:Name>${taxCat('ClassifiedTaxCategory')}</cac:Item>`
        + `<cac:Price><cbc:PriceAmount currencyID="${cur}">${price(net / qty)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    }).join('');

    const ronTax = cur !== 'RON' && vat ? Math.round(tax * (+inv.rate || 0) * 100) / 100 : null;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`
      + `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>`
      + `<cbc:ID>${x(idOf(d))}</cbc:ID><cbc:IssueDate>${x(inv.date || d.date)}</cbc:IssueDate>${inv.due ? `<cbc:DueDate>${x(inv.due)}</cbc:DueDate>` : ''}`
      + `<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${notes}<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>${ronTax != null ? '<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>' : ''}`
      + `<cac:AccountingSupplierParty><cac:Party>${addressXml(sp.street, sp.city, sp.county, sp.country)}`
      + (vat ? `<cac:PartyTaxScheme><cbc:CompanyID>RO${sCui}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '')
      + `<cac:PartyLegalEntity><cbc:RegistrationName>${x(cut(sellerName, 200))}</cbc:RegistrationName><cbc:CompanyID>${x(vat ? cut(b.regcom, 50) || sCui : sCui)}</cbc:CompanyID></cac:PartyLegalEntity>`
      + (b.phone || b.email ? `<cac:Contact>${b.phone ? `<cbc:Telephone>${x(cut(b.phone, 40))}</cbc:Telephone>` : ''}${b.email ? `<cbc:ElectronicMail>${x(cut(b.email, 100))}</cbc:ElectronicMail>` : ''}</cac:Contact>` : '')
      + `</cac:Party></cac:AccountingSupplierParty>`
      + `<cac:AccountingCustomerParty><cac:Party>${addressXml(cp.street, cp.city, cp.county, cp.country)}`
      + (vat && pj && /^[A-Z]{2}/.test(cleanCui(c.cui)) ? `<cac:PartyTaxScheme><cbc:CompanyID>${x(cleanCui(c.cui))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '')
      + `<cac:PartyLegalEntity><cbc:RegistrationName>${x(cut(c.name, 200))}</cbc:RegistrationName>${buyerId ? `<cbc:CompanyID>${x(buyerId)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>`
      + `</cac:Party></cac:AccountingCustomerParty>`
      + `<cac:PaymentMeans><cbc:PaymentMeansCode>${payCode}</cbc:PaymentMeansCode>${payCode === '42' && iban ? `<cac:PayeeFinancialAccount><cbc:ID>${x(iban)}</cbc:ID></cac:PayeeFinancialAccount>` : ''}</cac:PaymentMeans>`
      + (allowance > 0 ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason><cbc:Amount currencyID="${cur}">${amt(allowance)}</cbc:Amount>${taxCat('TaxCategory')}</cac:AllowanceCharge>` : '')
      + `<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${amt(tax)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${amt(taxable)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${cur}">${amt(tax)}</cbc:TaxAmount>`
      + `<cac:TaxCategory><cbc:ID>${catId}</cbc:ID>${vat ? `<cbc:Percent>${rate}</cbc:Percent>` : '<cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>'}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`
      + (ronTax != null ? `<cac:TaxTotal><cbc:TaxAmount currencyID="RON">${amt(ronTax)}</cbc:TaxAmount></cac:TaxTotal>` : '')
      + `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${cur}">${amt(lineSum)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="${cur}">${amt(taxable)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="${cur}">${amt(incl)}</cbc:TaxInclusiveAmount>`
      + (allowance > 0 ? `<cbc:AllowanceTotalAmount currencyID="${cur}">${amt(allowance)}</cbc:AllowanceTotalAmount>` : '')
      + (rounding ? `<cbc:PayableRoundingAmount currencyID="${cur}">${amt(rounding)}</cbc:PayableRoundingAmount>` : '')
      + `<cbc:PayableAmount currencyID="${cur}">${amt(payable)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`
      + lines + `</Invoice>`;
    return { xml, problems, cif: sCui, b2c: !pj, extern: cp.country !== 'RO' };
  }

  /** Problems ANAF would refuse, for an invoice still being written. */
  function problemsFor(inv, b) {
    return build({ data: inv, bizId: b && b.id, series: inv.series, number: inv.number, date: inv.date }).problems;
  }

  // ---------------------------------------------------------------- the connection (access keys)
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  async function keys() {
    try { const b = await Host.secureGet(KEY, '', { quiet: true }); return b ? JSON.parse(new TextDecoder().decode(b)) : null; } catch (e) { return null; }
  }
  async function saveKeys(k) { await Host.secureSet(KEY, enc(k), { quiet: true }); emit(); }
  let infoCache = null;
  async function info() {
    if (infoCache && Date.now() - infoCache.at < 600000) return infoCache;
    infoCache = { ...(await Account.call('anafInfo', {})), at: Date.now() };
    return infoCache;
  }
  async function connected() { return !!(await keys()); }
  /** A valid access key, renewed through the server when it is close to expiring. */
  async function access() {
    const k = await keys();
    if (!k) throw Object.assign(new Error('Firma nu este conectată la SPV.'), { code: 'not-connected' });
    const exp = k.at + (k.expiresIn || 7776000) * 1000;
    if (exp - Date.now() < 14 * 864e5 && k.refresh) {
      try {
        const kp = A().boxKeyPair();
        const r = await Account.call('anafRefresh', { refresh: k.refresh, pub: Host.toB64(kp.pub) });
        const t = A().boxOpen(kp.sk, r.sealed, BOX_INFO);
        const nk = { ...k, access: t.access, refresh: t.refresh || k.refresh, expiresIn: t.expiresIn, at: t.at };
        await saveKeys(nk);
        return nk.access;
      } catch (e) {
        if (exp < Date.now()) throw Object.assign(new Error('Conexiunea cu SPV a expirat. Conectează din nou firma.'), { code: 'expired' });
      }
    }
    return k.access;
  }

  /** Connects the company: ANAF's page opens in the browser, where the company's certificate is chosen. */
  async function connect() {
    let i;
    try { i = await info(); } catch (e) { return UI.toast(Account.say(e), { error: true }); }
    if (!i.ready) return UI.toast(I18n.t('Trimiterea în SPV nu este încă disponibilă. Revino puțin mai târziu.'), { error: true, duration: 6000 });
    const kp = A().boxKeyPair();
    let s;
    try { s = await Account.call('anafStart', { pub: Host.toB64(kp.pub) }); } catch (e) { return UI.toast(Account.say(e), { error: true }); }
    let stop = false;
    const done = UI.modal((box, close) => {
      box.classList.add('acm-ui', 'ef-connect');
      box.append(
        el('div', { class: 'ef-spin' }, [el('span', { class: 'spinner' })]),
        el('h2', { text: 'Conectează firma la SPV' }),
        el('p', { text: 'S-a deschis pagina ANAF în browser. Alege certificatul digital al firmei și confirmă. Apoi întoarce-te aici: conectarea se termină singură.' }),
        el('p', { class: 'muted small', text: 'Facturile vor pleca de pe acest dispozitiv direct la ANAF. Cheile de acces rămân doar aici, în spațiul protejat al sistemului.' }),
        el('div', { class: 'actions col' }, [
          el('button', { class: 'btn', type: 'button', text: 'Deschide din nou pagina ANAF', onclick: () => Host.openExternal(s.url) }),
          el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(false) }),
        ]),
      );
      (async () => {
        const end = Date.now() + 10 * 60000;
        while (!stop && Date.now() < end) {
          await new Promise((r) => setTimeout(r, 2500));
          if (stop) return;
          try {
            const r = await Account.call('anafClaim', { state: s.state });
            if (r.ready) {
              const t = A().boxOpen(kp.sk, r.sealed, BOX_INFO);
              await saveKeys({ access: t.access, refresh: t.refresh, expiresIn: t.expiresIn, at: t.at, env: s.env, connectedAt: Date.now() });
              close(true);
              return;
            }
          } catch (e) { if (/not-found|deadline|expired/.test(String(e.code || e.message))) { close(false); return; } }
        }
        close(false);
      })();
    });
    Host.openExternal(s.url);
    const ok = await done;
    stop = true;
    if (ok) {
      if (typeof Feel !== 'undefined') Feel.haptic('success');
      UI.toast(I18n.t('Firma este conectată la SPV. Facturile noi se trimit automat.'), { duration: 6000 });
      process();
    }
    return ok;
  }
  async function disconnect() {
    if (!(await UI.confirm(I18n.t('Deconectezi firma de la SPV?'), I18n.t('Facturile noi nu se mai trimit automat la ANAF de pe acest dispozitiv. Cele trimise rămân în SPV.'), I18n.t('Deconectează')))) return false;
    await Host.secureDelete(KEY, { quiet: true });
    emit();
    return true;
  }
  const auto = () => { try { return localStorage.getItem(PREF) !== '0'; } catch (e) { return true; } };
  const setAuto = (on) => { try { localStorage.setItem(PREF, on ? '1' : '0'); } catch (e) {} emit(); };

  // ---------------------------------------------------------------- sending, status, ANAF's answer
  const tag = (xml, name) => { const m = new RegExp(`<(?:\\w+:)?${name}\\b([^>]*)>`, 'i').exec(xml); return m ? m[1] : null; };
  const attr = (attrs, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs || ''); return m ? m[1] : null; };
  const errorsOf = (xml) => [...String(xml).matchAll(/errorMessage="([^"]*)"/gi)].map((m) => m[1]);

  async function validateXml(xml) {
    try {
      const r = await Host.nativeHttp(VALIDATE, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: xml });
      if (!r.ok) return null;
      const j = JSON.parse(r.text());
      return { ok: j.stare === 'ok', messages: (j.Messages || []).map((m) => m.message || String(m)) };
    } catch (e) { return null; } // no answer: ANAF checks it again at upload
  }

  /** Sends one invoice (by its record); updates the record with what happened. */
  async function send(d) {
    const env = (await info()).env;
    const built = build(d);
    if (built.problems.length) return update(d.id, { status: 'incomplete', msg: built.problems });
    const v = await validateXml(built.xml);
    if (v && !v.ok) return update(d.id, { status: 'invalid', msg: v.messages.slice(0, 8) });
    const tok = await access();
    const q = new URLSearchParams({ standard: 'UBL', cif: built.cif });
    if (built.extern) q.set('extern', 'DA');
    const r = await Host.nativeHttp(`${API(env)}/${built.b2c && !built.extern ? 'uploadb2c' : 'upload'}?${q}`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'text/plain' }, body: built.xml });
    const text = r.text();
    if (r.status === 401 || r.status === 403) return update(d.id, { status: 'queued', msg: ['ANAF nu a acceptat cheile de acces. Conectează din nou firma la SPV.'] });
    const h = tag(text, 'header');
    const ex = attr(h, 'ExecutionStatus');
    const index = attr(h, 'index_incarcare');
    if (ex === '0' && index) return update(d.id, { status: 'sent', index, env, sentAt: Date.now(), msg: null });
    return update(d.id, { status: 'invalid', msg: errorsOf(text).slice(0, 8).concat(errorsOf(text).length ? [] : ['ANAF a refuzat factura (' + r.status + ').']) });
  }
  /** Asks ANAF what happened with a sent invoice; keeps its signed answer next to the PDF. */
  async function check(d) {
    const e = d.efactura || {};
    const tok = await access();
    const r = await Host.nativeHttp(`${API(e.env)}/stareMesaj?id_incarcare=${encodeURIComponent(e.index)}`, { headers: { Authorization: 'Bearer ' + tok } });
    const text = r.text();
    const h = tag(text, 'header');
    const stare = attr(h, 'stare');
    if (!stare || /in prelucrare/i.test(stare)) return update(d.id, { status: 'sent', checkedAt: Date.now() });
    const idd = attr(h, 'id_descarcare');
    let saved = null, reasons = [];
    if (idd) {
      try {
        const z = await Host.nativeHttp(`${API(e.env)}/descarcare?id=${encodeURIComponent(idd)}`, { headers: { Authorization: 'Bearer ' + tok } });
        if (z.ok && z.bytes.length) {
          saved = keepZip(d, z.bytes, stare === 'ok' ? '' : ' - erori');
          if (stare !== 'ok') reasons = await zipErrors(z.bytes);
        }
      } catch (x2) { /* the status is enough; the archive can be fetched later */ }
    }
    if (stare === 'ok') return update(d.id, { status: 'ok', idDescarcare: idd, okAt: Date.now(), zip: saved, msg: null });
    return update(d.id, { status: 'rejected', idDescarcare: idd, zip: saved, msg: reasons.length ? reasons : errorsOf(text).length ? errorsOf(text) : ['ANAF a respins factura.'] });
  }
  function keepZip(d, bytes, suffix) {
    try {
      const dir = Host.join(Host.dirName(d.path), 'e-Factura');
      Host.mkdirp(dir);
      const p = Host.join(dir, `${idOf(d)}${suffix} (SPV).zip`);
      Host.writeFile(p, bytes);
      return p;
    } catch (e) { return null; }
  }
  async function zipErrors(bytes) {
    try {
      await Lib.load('jszip');
      const Z = await Lib.get('jszip').loadAsync(bytes);
      const out = [];
      for (const f of Object.values(Z.files)) {
        if (f.dir || !/\.xml$/i.test(f.name) || /semnatura/i.test(f.name)) continue;
        const t = await f.async('string');
        out.push(...errorsOf(t));
      }
      return out.slice(0, 8);
    } catch (e) { return []; }
  }
  function update(id, patch) {
    const d = Biz.docs().find((y) => y.id === id);
    if (!d) return;
    Biz.updateDoc(id, { efactura: { ...(d.efactura || {}), ...patch } });
    emit();
    return patch.status;
  }

  /** New invoice: queued for SPV (sent at once when the company is connected and sending is automatic). */
  function enqueue(id) {
    const d = Biz.docs().find((y) => y.id === id);
    if (!d || d.type !== 'invoice') return;
    const b = Biz.get(d.bizId);
    if (b && countryCode(b.country || 'România') !== 'RO') return; // only Romanian companies
    update(id, { status: 'queued', queuedAt: Date.now() });
    process();
  }
  let running = false;
  async function process() {
    if (running) return;
    running = true;
    try {
      if (!(await connected())) return;
      const list = Biz.docs().filter((d) => d.type === 'invoice' && d.efactura);
      for (const d of list) {
        const s = d.efactura.status;
        try {
          if (s === 'queued' && auto()) await send(d);
          else if (s === 'sent' && Date.now() - (d.efactura.checkedAt || d.efactura.sentAt || 0) > 20000) await check(d);
        } catch (e) {
          if (e && (e.code === 'not-connected' || e.code === 'expired')) { update(d.id, { msg: [e.message] }); break; }
          console.warn('e-factura', e);
        }
      }
    } finally { running = false; }
  }
  /** Sends again (after the data was corrected) or now (when sending is not automatic). */
  async function sendNow(id) {
    const d = Biz.docs().find((y) => y.id === id);
    if (!d) return;
    if (!(await connected())) { if (await connect()) return sendNow(id); return; }
    UI.busy('Se trimite în SPV…');
    try { update(id, { status: 'queued' }); await send(Biz.docs().find((y) => y.id === id)); } catch (e) { UI.toast(e.message || String(e), { error: true }); } finally { UI.busy(); }
  }

  // ---------------------------------------------------------------- what the lists show
  /** [css class, label, details] for an invoice's SPV state. */
  function badge(d) {
    const e = d.efactura;
    if (!e || d.type !== 'invoice') return null;
    const late = e.status !== 'ok' && workingDaysSince(d.date) >= 4;
    switch (e.status) {
      case 'ok': return ['ok', 'SPV ✓', 'Validată de ANAF'];
      case 'sent': return ['wait', 'În SPV…', 'ANAF o verifică'];
      case 'rejected': case 'invalid': return ['bad', 'Respinsă', 'Vezi ce trebuie corectat'];
      case 'incomplete': return ['warn', 'Date lipsă', 'Completează datele pentru SPV'];
      default: return [late ? 'bad' : 'warn', 'De trimis în SPV', late ? 'Termenul de 5 zile lucrătoare se apropie' : 'Se trimite când firma e conectată'];
    }
  }
  function workingDaysSince(iso) {
    if (!iso) return 0;
    let n = 0;
    for (let t = new Date(iso + 'T12:00:00'); t < new Date(); t.setDate(t.getDate() + 1)) { const w = t.getDay(); if (w && w !== 6) n++; }
    return Math.max(0, n - 1);
  }
  function details(d) {
    const e = d.efactura || {};
    const [, label, sub] = badge(d) || [];
    return UI.modal((box, close) => {
      box.classList.add('acm-ui', 'ef-details');
      box.append(el('h2', { text: `${idOf(d)} · e-Factura` }), el('p', { class: 'muted', text: `${I18n.t(label || '')} · ${I18n.t(sub || '')}` }));
      if (e.msg && e.msg.length) box.append(el('div', { class: 'ef-msgs' }, e.msg.map((m) => el('div', { class: 'ef-msg', text: I18n.t(m) }))));
      if (e.index) box.append(el('p', { class: 'muted small', text: `${I18n.t('Index încărcare')}: ${e.index}${e.env === 'test' ? ' · ' + I18n.t('mediu de test') : ''}` }));
      box.append(el('div', { class: 'actions col' }, [
        e.status !== 'ok' && e.status !== 'sent' ? el('button', { class: 'btn primary', type: 'button', text: 'Trimite în SPV', onclick: () => { close(); sendNow(d.id); } }) : null,
        e.status === 'sent' ? el('button', { class: 'btn primary', type: 'button', text: 'Verifică acum', onclick: async () => { close(); UI.busy('Se verifică la ANAF…'); try { await check(d); } catch (x2) { UI.toast(x2.message, { error: true }); } finally { UI.busy(); } } }) : null,
        e.zip && Host.exists(e.zip) ? el('button', { class: 'btn', type: 'button', text: 'Arată răspunsul ANAF', onclick: () => { close(); Host.showInFolder(e.zip); } }) : null,
        el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close() }),
      ].filter(Boolean)));
    });
  }

  /** The row in Settings › Companies (filled in when the stored keys have been read). */
  function settingsRow(srow, chev) {
    const open = async () => {
      if (!Account.current()) return UI.toast(I18n.t('Intră în cont ca să conectezi firma la SPV.'), { error: true });
      if (!(await connected())) { await connect(); return App.renderView && App.renderView(); }
      const act = await UI.modal((box, close) => {
        box.classList.add('acm-ui');
        const sw = el('input', { type: 'checkbox', checked: auto() });
        box.append(el('h2', { text: 'e-Factura (SPV)' }),
          el('p', { class: 'muted', text: 'Facturile emise din ACM Docs pleacă de pe acest dispozitiv direct la ANAF. Proformele și ofertele nu se trimit.' }),
          el('label', { class: 'chk' }, [sw, I18n.t('Trimite automat fiecare factură nouă')]),
          el('div', { class: 'actions col' }, [el('button', { class: 'btn primary', type: 'button', text: 'Gata', onclick: () => close(sw.checked ? 'on' : 'off') }), el('button', { class: 'btn danger', type: 'button', text: 'Deconectează de la SPV', onclick: () => close('disconnect') })]));
      });
      if (act === 'on' || act === 'off') setAuto(act === 'on');
      if (act === 'disconnect') await disconnect();
      if (App.renderView) App.renderView();
    };
    const row = srow('receipt', 'orange', 'e-Factura (SPV)', I18n.t('Conectează firma ca facturile să ajungă automat în SPV'), chev(), open);
    connected().then(async (on) => {
      if (!on) return;
      let env = null;
      try { env = (await info()).env; } catch (e) {}
      const si = row.querySelector('.si'); if (si) si.className = 'si green';
      const sm = row.querySelector('small');
      if (sm) sm.textContent = I18n.t(auto() ? 'Conectată · facturile se trimit automat la ANAF' : 'Conectată · trimiți tu fiecare factură') + (env === 'test' ? ' · ' + I18n.t('mediu de test') : '');
    });
    return row;
  }

  function init() {
    setTimeout(() => { process().catch(() => {}); }, 6000);
    setInterval(() => { if (document.visibilityState === 'visible') process().catch(() => {}); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') process().catch(() => {}); });
  }
  document.addEventListener('DOMContentLoaded', init);

  return { build, problemsFor, enqueue, process, send, check, sendNow, connect, disconnect, connected, badge, details, settingsRow, countyCode, countryCode, cuiValid, cnpValid, COUNTIES, onChange: (f) => listeners.add(f), _idOf: idOf };
})();
