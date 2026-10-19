'use strict';
// App shell: start screen, opening/saving files, keyboard shortcuts, wiring.

const App = (() => {
  const $ = (id) => document.getElementById(id);
  const FILES_KEY = 'pdfeditor.files';
  const THUMBS_KEY = 'pdfeditor.thumbs';
  const EDITED_RE = /_editat_(\d+)$/i;

  // Where the open document came from, and the copy we save into.
  // Saving never touches the original: the first save makes "<nume>_editat_<n>.pdf"
  // next to it, later saves in the same session update that copy.
  let source = null; // {dir, base, path}
  let copyPath = null;
  let allowClose = false;
  let tab = 'all';

  // ---------------------------------------------------------------------------
  // File list (originals / edited / invoices) and thumbnails
  // ---------------------------------------------------------------------------

  function loadJSON(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function files() {
    let list = loadJSON(FILES_KEY, null);
    if (!list) {
      // first run after update: bring over the old "recent" list
      list = loadJSON('pdfeditor.recent', []).filter((p) => typeof p === 'string').map((p) => ({ path: p, kind: kindFromName(p), time: Date.now() }));
      saveJSON(FILES_KEY, list);
    }
    return list;
  }

  function kindFromName(p) {
    return EDITED_RE.test(Host.baseName(p).replace(/\.pdf$/i, '')) ? 'edited' : 'original';
  }

  function thumbFor(doc) {
    try {
      const s = doc.pageSize(0);
      const w = 220, h = Math.max(1, Math.round((w * s.h) / s.w));
      const img = doc.render(0, w, h);
      const c = el('canvas', { width: img.width, height: img.height });
      c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      return null;
    }
  }

  function setThumb(path, url) {
    if (!url) return;
    const t = loadJSON(THUMBS_KEY, {});
    delete t[path];
    t[path] = { url, m: Host.mtime(path) };
    const keys = Object.keys(t);
    for (const k of keys.slice(0, Math.max(0, keys.length - 80))) delete t[k];
    saveJSON(THUMBS_KEY, t);
  }

  /** Adds a file to the start screen. [docOrBytes]: to draw its thumbnail. */
  function rememberFile(path, kind, docOrBytes, from) {
    if (!path) return;
    const list = files().filter((f) => f.path !== path);
    list.unshift({ path, kind, from: from || null, time: Date.now() });
    saveJSON(FILES_KEY, list.slice(0, 300));
    if (docOrBytes) {
      if (typeof docOrBytes === 'string') setThumb(path, docOrBytes);
      else if (docOrBytes instanceof Uint8Array) {
        try { const d = PDF.Doc.open(docOrBytes); setThumb(path, thumbFor(d)); d.close(); } catch (e) {}
      } else setThumb(path, thumbFor(docOrBytes));
    }
  }

  function forget(path) {
    saveJSON(FILES_KEY, files().filter((f) => f.path !== path));
    renderView();
  }

  const when = (t) => {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    const hm = d.toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `azi, ${hm}`;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return `ieri, ${hm}`;
    return d.toLocaleDateString(I18n.locale(), { day: '2-digit', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };

  const typeOfPath = (path) => {
    const ext = Host.ext(path);
    return /^(docx?|txt|rtf)$/.test(ext) ? 'word' : /^(xlsx?|xlsm|csv|ods)$/.test(ext) ? 'sheet' : /^pptx?$/.test(ext) ? 'slides' : 'pdf';
  };
  const ICON_OF = { word: 'wordapp', sheet: 'sheetapp', slides: 'slidesapp', pdf: 'pdf' };

  function fileActions(path, kind, anchor) {
    UI.menuAt(anchor, [
      { label: 'Deschide', icon: 'folder', run: () => openPath(path) },
      Host.mobile ? { label: 'Trimite (WhatsApp, email…)', icon: 'share', run: () => Host.share(path) } : { label: 'Arată în folder', icon: 'folder', run: () => Host.showInFolder(path) },
      Host.mobile ? { label: 'Salvează o copie în telefon…', icon: 'download', run: () => Host.exportCopy(path) } : null,
      typeof AcmShare !== 'undefined' && Host.ext(path) !== 'acm' ? { label: 'Trimite criptat (.acm)…', icon: 'lockfile', run: () => AcmShare.send(path) } : null,
      '-',
      { label: 'Scoate din listă', icon: 'close', run: () => forget(path) },
    ], Host.baseName(path));
  }

  // ---------------------------------------------------------------------------
  // Views of the main screen: Acasă, Fișiere, Facturi, Setări
  // ---------------------------------------------------------------------------

  let view = 'home';
  function showView(v) {
    view = v;
    for (const id of ['home', 'files', 'invoices', 'settings']) $('v-' + id).classList.toggle('hidden', id !== v);
    document.querySelectorAll('#side .nav button, #tabbar button[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    renderView();
    const sc = $('v-' + v).querySelector('.vscroll');
    if (sc) sc.scrollTop = 0;
  }
  function renderView() {
    if ($('home').classList.contains('hidden')) return;
    renderSide();
    if (view === 'home') renderHome();
    else if (view === 'files') renderFiles();
    else if (view === 'invoices') Invoice.renderList($('inv-list-root'));
    else if (view === 'settings') renderSettings();
  }

  function renderSide() {
    const b = Biz.active();
    const box = $('side-biz');
    box.innerHTML = '';
    if (!b) return;
    const btn = el('button', { type: 'button', title: 'Firma care emite documente' }, [Biz.badge(b), el('span', { class: 't' }, [el('b', { text: b.name }), el('small', { text: Biz.industry(b.industry).label })])]);
    btn.addEventListener('click', () => showView('settings'));
    box.append(btn);
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Noapte bună' : h < 12 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
  }

  function renderHome() {
    Biz.migrate();
    const b = Biz.active();
    $('greet').textContent = greeting();
    $('greet-sub').textContent = new Date().toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());
    // invoices card
    const s = Invoice.summary();
    $('mc-amount').innerHTML = s ? `${Invoice.money(s.month)}<small>${escapeHtml(s.currency)}</small>` : `0,00<small>lei</small>`;
    $('mc-sub').textContent = !s ? 'Configurează firma și emite prima factură' : s.unpaidCount ? `${s.monthCount} ${s.monthCount === 1 ? 'factură' : 'facturi'} · clienții îți datorează ${Invoice.money(s.unpaid)} ${s.currency}` : `${s.monthCount} ${s.monthCount === 1 ? 'factură' : 'facturi'} luna aceasta · toate plătite`;
    $('act-invoice-sub').textContent = s && s.last ? `${I18n.t('Ultima:')} ${s.last.series}-${String(s.last.number).padStart(4, '0')}` : 'Nouă';
    // business card
    const bc = $('home-biz');
    bc.innerHTML = '';
    bc.classList.toggle('empty', !b);
    if (b) {
      bc.append(
        el('div', { class: 'bh' }, [Biz.badge(b), el('div', { class: 'bt' }, [el('b', { text: b.name }), el('small', { text: [b.cui && I18n.t('CUI') + ' ' + b.cui, I18n.t(Biz.industry(b.industry).label)].filter(Boolean).join(' · ') })])]),
        el('div', { class: 'brow' }, [
          el('button', { class: 'pill primary', type: 'button', text: 'Factură nouă', onclick: () => Invoice.open({ type: 'invoice' }) }),
          el('button', { class: 'pill', type: 'button', text: 'Proformă', onclick: () => Invoice.open({ type: 'proforma' }) }),
          el('button', { class: 'pill', type: 'button', text: Biz.industry(b.industry).quote ? 'Deviz' : 'Ofertă', onclick: () => Invoice.open({ type: 'quote' }) }),
        ]),
      );
    } else {
      bc.append(
        el('div', { class: 'bh' }, [el('span', { class: 'bl', html: svg('building') }), el('div', { class: 'bt' }, [el('b', { text: 'Firma ta' }), el('small', { text: 'Facturi profesionale, pentru orice activitate' })])]),
        el('p', { text: 'Configurezi o dată datele firmei și emiți facturi, proforme și oferte în câteva secunde.' }),
        el('div', { class: 'brow' }, [el('button', { class: 'pill primary', type: 'button', text: 'Configurează firma', onclick: () => Invoice.open() })]),
      );
    }
    // recent files
    const thumbs = loadJSON(THUMBS_KEY, {});
    const list = $('recent-list');
    list.innerHTML = '';
    const recent = files().filter((f) => Host.exists(f.path)).slice(0, 6);
    const missing = [];
    for (const f of recent) list.append(fileRow(f, thumbs, missing));
    $('home-all').classList.toggle('hidden', !recent.length);
    if (!recent.length) {
      list.append(el('div', { class: 'row', style: { cursor: 'default' } }, [el('span', { class: 'rt' }, [el('b', { text: 'Niciun fișier încă' }), el('small', { text: Host.mobile ? 'Scanează o foaie sau deschide un PDF din telefon.' : 'Deschide un PDF, o poză sau trage un fișier în fereastră.' })])]));
    }
    hydrateIcons($('v-home'));
    if (missing.length && !quiet) makeThumbs(missing);
  }

  function fileRow(f, thumbs, missing) {
    const path = f.path;
    const th = thumbs[path];
    // Only PDFs get a drawn preview, and each file is tried once per session (reading big files on a phone is slow).
    if (missing && /\.pdf$/i.test(path) && !thumbTried.has(path) && (!th || (th.m && Host.mtime(path) && Math.abs(th.m - Host.mtime(path)) > 1000))) missing.push(path);
    const tk = typeOfPath(path);
    const name = Host.baseName(path);
    const pic = el('span', { class: 'rth' + (tk === 'slides' ? ' wide' : '') }, [th ? el('img', { src: th.url, alt: '' }) : el('span', { class: 'ftype ' + tk, html: svg(ICON_OF[tk]) })]);
    const tag = f.kind === 'edited' ? el('span', { class: 'tag-ed', text: 'editat' }) : f.kind === 'invoice' ? el('span', { class: 'tag-inv', text: 'document emis' }) : null;
    const title = el('b', { class: 'no-tr' }, [name]);
    if (tag) title.append(tag);
    const more = el('span', { class: 'rmore', html: svg('morez'), title: 'Mai multe' });
    more.addEventListener('click', (e) => { e.stopPropagation(); fileActions(path, f.kind, more); });
    const row = el('button', { class: 'row', type: 'button', title: path }, [pic, el('span', { class: 'rt' }, [title, el('small', { text: `${when(Host.mtime(path) || f.time)} · ${Host.baseName(Host.dirName(path))}` })]), more]);
    row.addEventListener('click', () => openPath(path));
    return row;
  }

  function renderFiles() {
    const all = files().filter((f) => Host.exists(f.path));
    const q = ($('files-q').value || '').trim().toLowerCase();
    const counts = {
      all: all.length,
      original: all.filter((f) => f.kind === 'original').length,
      edited: all.filter((f) => f.kind === 'edited').length,
      invoice: all.filter((f) => f.kind === 'invoice').length,
    };
    document.querySelectorAll('#file-tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
      b.querySelector('i').textContent = counts[b.dataset.tab] || '';
    });
    const thumbs = loadJSON(THUMBS_KEY, {});
    const grid = $('file-grid');
    grid.innerHTML = '';
    const notes = {
      all: 'Tot ce ai deschis, editat sau creat în aplicație.',
      original: 'Fișierele tale, neatinse. Editările se salvează separat.',
      edited: 'Copiile salvate după editare (nume_editat_1, _2…).',
      invoice: 'Facturile, proformele și ofertele emise.',
    };
    $('files-note').textContent = notes[tab];

    const missing = [];
    const card = (f) => {
      const path = f.path;
      const th = thumbs[path];
      if (!th || (th.m && Host.mtime(path) && Math.abs(th.m - Host.mtime(path)) > 1000)) missing.push(path);
      const ext = Host.ext(path);
      const tkind = typeOfPath(path);
      const thumb = el('div', { class: 'fthumb' }, [th ? el('img', { src: th.url, alt: '', class: tkind === 'slides' ? 'wide' : '' }) : el('span', { class: 'ftype ' + tkind, html: svg(ICON_OF[tkind]) })]);
      if (tkind !== 'pdf') thumb.append(el('span', { class: 'fext ' + tkind, text: ext.toUpperCase() }));
      const name = Host.baseName(path);
      const m = EDITED_RE.exec(name.replace(/\.[^.]+$/, ''));
      const badge = f.kind === 'edited' ? `editat ${m ? m[1] : ''}`.trim() : f.kind === 'invoice' ? 'emis' : null;
      if (badge) thumb.append(el('span', { class: 'fbadge ' + (f.kind === 'edited' ? 'ed' : 'inv'), text: badge }));
      const moreBtn = el('button', { title: 'Mai multe', html: svg('morez') });
      moreBtn.addEventListener('click', (e) => { e.stopPropagation(); fileActions(path, f.kind, moreBtn); });
      const sub = f.kind === 'edited' && f.from ? `${escapeHtml(I18n.t('din'))} ${escapeHtml(Host.baseName(f.from))}` : `${when(Host.mtime(path) || f.time)}`;
      const c = el('div', { class: 'fcard', title: path }, [thumb, el('div', { class: 'fname', text: name }), el('div', { class: 'fsub', html: sub }), el('div', { class: 'fbtns' }, [moreBtn])]);
      c.addEventListener('click', () => openPath(path));
      return c;
    };
    for (const f of all.filter((x) => (tab === 'all' || x.kind === tab) && (!q || Host.baseName(x.path).toLowerCase().includes(q)))) grid.append(card(f));
    if (!grid.children.length) {
      const empty = q ? ['Nimic găsit', `Niciun fișier nu conține „${q}”.`] : {
        all: ['Niciun fișier încă', Host.mobile ? 'Apasă + ca să scanezi o foaie sau să deschizi un fișier.' : 'Apasă „Deschide” sau trage un fișier în fereastră.'],
        original: ['Niciun document deschis încă', 'Fișierele pe care le deschizi apar aici.'],
        edited: ['Nicio copie editată încă', 'Când salvezi un document, apare aici ca „nume_editat_1”. Originalul rămâne neatins.'],
        invoice: ['Niciun document emis încă', 'Facturile, proformele și ofertele create apar aici.'],
      }[tab];
      grid.append(el('div', { class: 'empty-files' }, [el('div', { class: 'empty-state' }, [el('span', { class: 'ei', html: svg('folder') }), el('b', { text: empty[0] }), el('span', { text: empty[1] })])]));
    }
    if (missing.length && !quiet) makeThumbs(missing);
  }

  function renderSettings() {
    const root = $('settings-root');
    root.innerHTML = '';
    root.append(el('header', { class: 'vhead' }, [el('h1', { text: 'Setări' })]));
    const group = (title, rows, note) => el('div', { class: 'sgroup' }, [title ? el('h3', { text: title }) : null, el('div', { class: 'list-card' }, rows), note ? el('p', { text: note }) : null]);
    const srow = (icon, color, label, sub, right, onClick) => {
      const r = el(onClick ? 'button' : 'div', { class: 'srow', type: onClick ? 'button' : null }, [
        icon ? el('span', { class: 'si ' + color, html: svg(icon) }) : null,
        el('span', { class: 'stx' }, [el('b', { text: label }), sub ? el('small', { text: sub }) : null]),
        right || null,
      ]);
      if (onClick) r.addEventListener('click', onClick);
      return r;
    };
    const chev = () => el('span', { class: 'chev', html: svg('right') });

    // Account (encrypted .acm documents)
    try { if (typeof AccountUI !== 'undefined') root.append(AccountUI.settingsGroup(group, srow, chev)); } catch (e) { console.error(e); }

    // Look
    const pref = Theme.get();
    const themeRow = (k, icon, color, label, sub) => {
      const r = srow(icon, color, label, sub, el('span', { class: 'check', html: pref === k ? svg('check') : '' }), () => { Theme.set(k); renderSettings(); });
      if (pref === k) r.classList.add('on');
      return r;
    };
    root.append(group('Aspect', [
      themeRow('light', 'sun', 'orange', 'Luminos', null),
      themeRow('dark', 'moon', 'indigo', 'Întunecat', null),
      themeRow('auto', 'contrast', 'gray', 'Automat', Host.mobile ? 'La fel ca telefonul' : 'La fel ca Windows'),
    ]));

    // Language of the app (documents have their own, in the invoice form)
    const langRow = (k, flag, label, sub) => {
      const r = srow(null, '', label, sub, el('span', { class: 'check', html: I18n.lang === k ? svg('check') : '' }), () => { I18n.set(k); renderView(); });
      r.prepend(el('span', { class: 'si flag no-tr', text: flag }));
      if (I18n.lang === k) r.classList.add('on');
      return r;
    };
    root.append(group('Limba aplicației', [
      langRow('ro', 'RO', 'Română', null),
      langRow('en', 'EN', 'English', null),
    ], 'Limba facturilor se alege separat, la fiecare document (Limba documentului), sau implicit în Datele firmei.'));

    // Businesses
    const act = Biz.active();
    const bizRows = Biz.list().map((p) => {
      const r = el('button', { class: 'srow', type: 'button' }, [
        Biz.badge(p, 'bl si'), el('span', { class: 'stx' }, [el('b', { text: p.name }), el('small', { text: [p.cui && I18n.t('CUI') + ' ' + p.cui, I18n.t(Biz.industry(p.industry).label)].filter(Boolean).join(' · ') })]),
        p.id === (act && act.id) ? el('span', { class: 'check', style: { color: 'var(--accent)' }, html: svg('check') }) : null, chev(),
      ]);
      r.addEventListener('click', () => UI.menuAt(r, [
        p.id === (act && act.id) ? null : { label: 'Folosește această firmă', icon: 'check', run: () => { Biz.setActive(p.id); renderSettings(); } },
        { label: 'Datele firmei', icon: 'edit', run: () => Invoice.openSettings(p.id).then(() => renderSettings()) },
        { label: 'Aspectul documentelor', icon: 'palette', run: () => { Biz.setActive(p.id); Invoice.open().then(() => Invoice.openAdvanced()); } },
        '-',
        { label: 'Șterge firma', icon: 'del', danger: true, run: async () => {
          if (await UI.confirm(`Ștergi „${p.name}”?`, 'Se șterg doar datele firmei din aplicație. Documentele PDF emise rămân pe dispozitiv.', 'Șterge')) { Biz.remove(p.id); renderSettings(); }
        } },
      ], p.name));
      return r;
    });
    bizRows.push(srow('plus', 'blue', Biz.list().length ? 'Adaugă altă firmă' : 'Configurează firma ta', 'Facturi pentru orice activitate', chev(), async () => { await Invoice.onboarding(); renderSettings(); }));
    root.append(group('Firme', bizRows, 'Documentele se emit pe firma bifată. Poți ține mai multe firme (ex. SRL și PFA).'));

    // Documents
    const docsDir = Host.mobile ? 'Documents/ACM Docs' : 'Documente\\Facturi';
    root.append(group('Documente', [
      srow('receipt', 'green', 'Facturi, proforme, oferte', 'Lista documentelor emise', chev(), () => showView('invoices')),
      srow('folder', 'teal', 'Unde se salvează', Host.mobile ? (Host.info.platform === 'ios' ? I18n.t('Aplicația Fișiere › Pe iPhone › ACM Docs') : Host.info.docs || docsDir) : 'Facturile: ' + docsDir + ' · editările: lângă original', null, null),
    ]));

    // App data (fixes leftovers from older versions)
    root.append(group('Date aplicație', [
      srow('refresh', 'gray', 'Golește memoria temporară', 'Previzualizări și preferințe de imprimare. Nu șterge nimic important.', chev(), async () => {
        for (const k of Object.keys(localStorage)) if (/thumb|acm\.print/i.test(k)) localStorage.removeItem(k);
        UI.toast(I18n.t('Memoria temporară a fost golită.'));
        renderView();
      }),
      srow('del', 'red', 'Șterge toate datele aplicației', 'Firme, clienți, lista documentelor, șabloane și setări. Fișierele salvate rămân.', chev(), () => resetAll()),
    ], 'Folosește ștergerea dacă ai avut o versiune mai veche și ceva nu arată bine. Aplicația pornește ca la prima instalare.'));

    // About
    const ver = Host.appVersion();
    const mail = 'mandrutaniel5@gmail.com';
    const mailBtn = el('button', { class: 'btn primary', type: 'button', html: svg('mail') + '<span>Scrie-ne un e-mail</span>' });
    mailBtn.addEventListener('click', () => Host.openExternal(`mailto:${mail}?subject=${encodeURIComponent('ACM Docs ' + (ver || ''))}`));
    const copyBtn = el('button', { class: 'btn', type: 'button', html: svg('copy') + '<span>Copiază adresa</span>' });
    copyBtn.addEventListener('click', () => { Lib.clipboard.writeText(mail); UI.toast(I18n.t('Adresa a fost copiată.')); });
    root.append(el('div', { class: 'sgroup' }, [el('h3', { text: 'Despre' }), el('div', { class: 'about' }, [
      el('img', { src: 'icon.png', alt: '' }),
      el('b', { text: 'ACM Docs' }),
      el('span', { class: 'ver', text: `Versiunea ${ver || '2.0.5'} · ${Host.mobile ? (Host.info.platform === 'ios' ? 'iOS' : 'Android') : 'Windows'} · 2026` }),
      el('span', { class: 'by', html: 'Dezvoltat de <strong>ACM Code SRL</strong>' }),
      el('span', { class: 'free', text: 'PDF-uri, documente, tabele, prezentări și facturi într-o singură aplicație. Datele tale rămân pe acest dispozitiv.' }),
    ])]));
    root.append(group('Contact', [
      srow('user', 'indigo', 'Mândruț Aniel', 'CEO · Administrator ACM Code SRL', null, null),
      srow('mail', 'blue', mail, 'Întrebări, probleme sau sugestii — răspundem pe e-mail', el('span', { class: 'chev', html: svg('right') }), () => Host.openExternal(`mailto:${mail}`)),
    ]));
    root.append(el('div', { class: 'contact-btns' }, [mailBtn, copyBtn]));
    hydrateIcons(root);
  }

  async function resetAll() {
    const ok = await UI.confirm(I18n.t('Ștergi toate datele aplicației?'),
      I18n.t('Se șterg firmele, clienții, lista documentelor emise, șabloanele și setările. PDF-urile și facturile salvate rămân în folderul lor. Nu se poate anula.'),
      I18n.t('Șterge tot'));
    if (!ok) return;
    const ok2 = await UI.confirm(I18n.t('Sigur?'), I18n.t('Aplicația va porni ca la prima instalare.'), I18n.t('Da, șterge'));
    if (!ok2) return;
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try { localStorage.setItem('acm.reset', '1'); } catch (e) {} // no import from the old "PDF Editor" data
    location.reload();
  }

  /** "Creează" (the + button): what can be made. */
  function createMenu(anchor) {
    const b = Biz.active();
    const I = Biz.industry(b && b.industry);
    UI.menuAt(anchor, [
      { label: Host.mobile ? 'Scanează cu camera' : 'PDF din poză sau scan', icon: 'camera', run: () => scan() },
      { label: 'Factură nouă', icon: 'receipt', run: () => Invoice.open({ type: 'invoice' }) },
      { label: 'Proformă', icon: 'doc', run: () => Invoice.open({ type: 'proforma' }) },
      { label: I.quote ? 'Deviz' : 'Ofertă de preț', icon: 'edit', run: () => Invoice.open({ type: 'quote' }) },
      '-',
      { label: 'Document (Word)', icon: 'wordapp', run: async () => { if (await Office.ensureSaved()) Writer.open(null); } },
      { label: 'Tabel (Excel)', icon: 'sheetapp', run: async () => { if (await Office.ensureSaved()) Sheet.open(null); } },
      { label: 'Prezentare (PowerPoint)', icon: 'slidesapp', run: async () => { if (await Office.ensureSaved()) Slides.open(null); } },
      { label: 'PDF gol', icon: 'pdf', run: () => newBlank() },
      '-',
      { label: 'Deschide un fișier…', icon: 'folder', run: () => openDialog() },
    ], 'Creează');
  }

  /** Photo of a sheet of paper -> PDF (the camera on the phone). */
  async function scan() {
    Scanner.start(null);
  }

  // Draws missing thumbnails in the background, one file at a time.
  let thumbJob = null;
  const thumbTried = new Set();
  function makeThumbs(paths) {
    if (thumbJob || !PDF.ready) return;
    const queue = paths.slice(0, Host.mobile ? 8 : 24);
    for (const p of queue) thumbTried.add(p);
    thumbJob = true;
    const next = () => {
      const p = queue.shift();
      if (!p) { thumbJob = null; if (!$('home').classList.contains('hidden')) renderFilesQuiet(); return; }
      try {
        const bytes = Host.readFile(p);
        if (bytes.length < (Host.mobile ? 15e6 : 40e6) && detect(bytes) === 'pdf') {
          const d = PDF.Doc.open(bytes);
          setThumb(p, thumbFor(d));
          d.close();
        }
      } catch (e) { /* locked or protected: keep the icon */ }
      setTimeout(next, Host.mobile ? 250 : 30);
    };
    setTimeout(next, Host.mobile ? 1200 : 200);
  }
  let quiet = false;
  function renderFilesQuiet() { quiet = true; try { renderView(); } finally { quiet = false; } }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  function showScreen(name) {
    for (const id of ['home', 'editor', 'invoice', 'writer', 'sheet', 'slides', 'scanner']) { const n = $(id); if (n) n.classList.toggle('hidden', id !== name); }
  }

  function showHome() {
    showScreen('home');
    Host.setTitle('ACM Docs');
    renderView();
  }

  function showEditor() {
    showScreen('editor');
  }

  // ---------------------------------------------------------------------------
  // Opening
  // ---------------------------------------------------------------------------

  function detect(bytes) {
    const b = bytes;
    if (!b.length) return 'empty';
    const head = String.fromCharCode(...b.subarray(0, Math.min(1024, b.length)));
    if (head.includes('%PDF')) return 'pdf';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image';
    if (b[0] === 0xff && b[1] === 0xd8) return 'image';
    if (head.startsWith('GIF8') || head.startsWith('BM')) return 'image';
    if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image';
    if (b[0] === 0x50 && b[1] === 0x4b) return 'office';
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'office';
    return 'unknown';
  }

  /** Decodes image bytes to RGBA (max [maxSide] px on the longest side). */
  async function decodeImage(bytes, maxSide = 4000) {
    const url = URL.createObjectURL(new Blob([bytes]));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('Imaginea este goală.');
      const k = Math.min(1, maxSide / Math.max(w, h));
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
      const c = el('canvas', { width: w, height: h });
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      return { rgba: d.data, width: w, height: h };
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  async function openPdfBytes(bytes) {
    let password = null;
    let wrong = false;
    for (;;) {
      try {
        return { doc: PDF.Doc.open(bytes, password), password };
      } catch (e) {
        if (e && e.code === 4) {
          const pw = await UI.askPassword(wrong);
          if (pw === undefined || pw === null) return null;
          password = pw;
          wrong = true;
          continue;
        }
        throw e;
      }
    }
  }

  async function imageToDoc(bytes) {
    const img = await decodeImage(bytes);
    const land = img.width > img.height;
    const W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89;
    const k = Math.min(W / img.width, H / img.height);
    return PDF.Doc.createFromImage(img.rgba, img.width, img.height, img.width * k, img.height * k);
  }

  function explain(kind, name) {
    if (kind === 'slidesOld') {
      UI.confirm('Prezentare în format vechi', `„${name}” e o prezentare PowerPoint veche (.ppt). Deschide-o în PowerPoint și alege Fișier → Salvare ca → Prezentare PowerPoint (.pptx), apoi deschide-o aici.`, 'Am înțeles', 'Închide');
      return;
    }
    if (kind === 'odf') {
      UI.confirm('Format OpenDocument', `„${name}” e un document LibreOffice (.odt/.odp). Salvează-l din LibreOffice ca .docx sau .pptx, apoi deschide-l aici. Tabelele .ods se deschid direct.`, 'Am înțeles', 'Închide');
      return;
    }
    if (kind === 'office') {
      UI.confirm('Documentul nu este PDF', `„${name}” pare a fi un document Word/Excel. Deschide-l în Word și alege Fișier → Salvare ca → PDF, apoi deschide PDF-ul aici.`, 'Am înțeles', 'Închide');
    } else if (kind === 'empty') {
      UI.toast(`„${name}” este gol (0 octeți).`, { error: true });
    } else {
      UI.confirm('Fișier necunoscut', `„${name}” nu este nici PDF, nici imagine. Pot deschide fișiere PDF și poze (JPG, PNG, BMP, GIF, WEBP).`, 'OK', 'Închide');
    }
  }

  async function ensureSaved() {
    if (!Editor.doc || !Editor.dirty) return true;
    Pages.closeEditor(true);
    const r = await UI.askUnsaved(Editor.name);
    if (r === 'cancel') return false;
    if (r === 'save') return save();
    return true;
  }

  function setSource(p, nameNoExt) {
    const base = nameNoExt.replace(EDITED_RE, '');
    source = { dir: p ? Host.dirName(p) : null, base, path: p };
    copyPath = null;
  }

  async function openPath(p) {
    if (!p) return;
    if (!(await ensureSaved())) return;
    if (!(await Office.ensureSaved())) return;
    const name = Host.baseName(p);
    let bytes;
    try {
      bytes = Host.readFile(p);
    } catch (e) {
      UI.toast(`Nu pot citi „${name}”. Poate a fost mutat, șters sau e deschis în alt program.`, { error: true, action: { label: 'Detalii', run: () => UI.errorDetails('Nu pot citi fișierul', e) } });
      forget(p);
      return;
    }
    // encrypted .acm document: unlock it with the account's keys, then open what is inside
    if (typeof AcmShare !== 'undefined' && AcmShare.isAcm(p, bytes)) { await AcmShare.openFile(p, bytes); return; }
    const kind = Office.kindOf(p, bytes);
    // Word, Excel, PowerPoint go to their own editors
    if (['word', 'wordOld', 'text', 'sheet', 'slides'].includes(kind)) {
      const known = files().find((f) => f.path === p);
      if (kind === 'sheet') await Sheet.open(p, bytes);
      else if (kind === 'slides') await Slides.open(p, bytes);
      else await Writer.open(p, bytes, kind);
      rememberFile(p, known ? known.kind : kindFromName(p), null, known && known.from);
      const node = kind === 'sheet' ? $('sh-grid') : kind === 'slides' ? $('sl-wrap') : $('wr-page');
      setTimeout(async () => { const t = await Office.thumbOf(node); if (t) setThumb(p, t); }, 900);
      return;
    }
    UI.busy('Se deschide…');
    await new Promise((r) => setTimeout(r, 20));
    try {
      if (kind === 'pdf') {
        UI.busy(null);
        const res = await openPdfBytes(bytes);
        if (!res) return;
        UI.busy('Se deschide…');
        Editor.openDoc(res.doc, { path: p, name, password: res.password });
        setSource(p, name.replace(/\.pdf$/i, ''));
        const known = files().find((f) => f.path === p);
        const isInvoice = Biz.docs().some((h) => h.path === p);
        if (!isInvoice) rememberFile(p, known ? known.kind : kindFromName(p), res.doc, known && known.from);
      } else if (kind === 'image') {
        const doc = await imageToDoc(bytes);
        Editor.openDoc(doc, { path: null, name: name.replace(/\.[^.]+$/, '') + '.pdf' });
        setSource(p, name.replace(/\.[^.]+$/, ''));
        Editor.dirty = true;
        Editor.emit('state');
      } else {
        UI.busy(null);
        explain(kind, name);
        return;
      }
      showEditor();
      afterOpen(kind === 'image');
    } catch (e) {
      console.error(e);
      UI.errorDetails(`Nu am putut deschide „${name}”`, e);
    } finally {
      UI.busy(null);
    }
  }

  // a scan saved just now gets its hidden text in a moment: no "make text editable" hint
  let quietPath = null;
  function quietScanHint(path) { quietPath = path; }
  function afterOpen(fromImage) {
    requestAnimationFrame(() => {
      Editor.zoom = Pages.fitWidthZoom();
      Pages.layout();
      Editor.emit('zoom');
      Pages.scrollToPage(0);
      $('viewport').focus();
    });
    hint();
    // Scanned document: offer to make its text editable.
    setTimeout(() => {
      if (!Editor.doc) return;
      if (quietPath && Editor.path === quietPath) { quietPath = null; return; }
      let scanned = [];
      try { scanned = ImageText.scannedPages(); } catch (e) {}
      if (scanned.length) {
        UI.toast(fromImage ? 'Poza a devenit PDF. Vrei ca textul din ea să fie editabil?' : 'Documentul pare scanat (doar poze). Vrei ca textul să fie editabil?', {
          duration: 12000,
          action: { label: 'Fă textul editabil', run: () => ImageText.run(scanned[0], null, scanned) },
        });
      } else if (fromImage) {
        UI.toast('Poza a fost pusă într-un PDF nou. Salvează ca să-l păstrezi.');
      }
    }, 400);
  }

  async function openDialog() {
    const p = await Host.openDialog('pdf');
    if (p) openPath(p);
  }

  async function openImage() {
    const p = await Host.openDialog('image');
    if (p) openPath(p);
  }

  async function newBlank() {
    if (!(await ensureSaved())) return;
    const doc = PDF.Doc.createBlank();
    Editor.openDoc(doc, { path: null, name: 'Document nou.pdf' });
    const docs = await Host.specialDir('documents');
    source = { dir: docs, base: 'Document nou', path: null };
    copyPath = null;
    showEditor();
    afterOpen(false);
    Editor.setTool('text');
  }

  async function addPdf() {
    if (!Editor.doc) return;
    const p = await Host.openDialog('pdf');
    if (!p) return;
    const name = Host.baseName(p);
    try {
      const bytes = Host.readFile(p);
      const kind = detect(bytes);
      let other;
      if (kind === 'pdf') {
        const res = await openPdfBytes(bytes);
        if (!res) return;
        other = res.doc;
      } else if (kind === 'image') {
        other = await imageToDoc(bytes);
      } else {
        explain(kind, name);
        return;
      }
      const before = Editor.sizes.length;
      try {
        Editor.appendDoc(other);
      } finally {
        other.close();
      }
      UI.toast(`Am adăugat ${Editor.sizes.length - before} pagini la final.`);
      setTimeout(() => Pages.scrollToPage(before), 60);
    } catch (e) {
      UI.errorDetails(`Nu am putut adăuga „${name}”`, e);
    }
  }

  // ---------------------------------------------------------------------------
  // Saving: always a separate copy, the original stays untouched
  // ---------------------------------------------------------------------------

  async function nextCopyPath() {
    let dir = source && source.dir;
    if (!dir) dir = await Host.specialDir('documents');
    const base = (source && source.base) || 'Document';
    let max = 0;
    const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_editat_(\\d+)\\.pdf$', 'i');
    for (const f of Host.listDir(dir)) {
      const m = re.exec(f);
      if (m) max = Math.max(max, +m[1]);
    }
    return Host.join(dir, `${base}_editat_${max + 1}.pdf`);
  }

  async function save() {
    if (!Editor.doc) return false;
    Pages.closeEditor(true);
    const target = copyPath || (await nextCopyPath());
    return writeTo(target);
  }

  async function saveAs() {
    if (!Editor.doc) return false;
    Pages.closeEditor(true);
    const suggestion = await nextCopyPath();
    const p = await Host.saveDialog(Host.baseName(suggestion), Host.dirName(suggestion));
    if (!p) return false;
    if (source && source.path && p === source.path && !(await UI.confirm('Suprascrii originalul?', 'Ai ales chiar fișierul original. Dacă continui, originalul se pierde.', 'Suprascrie'))) return false;
    return writeTo(p);
  }

  function writeTo(p) {
    UI.busy('Se salvează…');
    try {
      const first = copyPath !== p;
      Editor.saveTo(p);
      copyPath = p;
      rememberFile(p, 'edited', Editor.doc, source && source.path);
      UI.toast(first ? `Salvat separat: ${Host.baseName(p)} — originalul a rămas neatins.` : `Salvat: ${Host.baseName(p)}`, {
        duration: 5000, action: { label: Host.mobile ? 'Trimite' : 'Arată în folder', run: () => Host.showInFolder(p) },
      });
      return true;
    } catch (e) {
      console.error(e);
      const busyFile = /EBUSY|EPERM|EACCES|EROFS/.test(String(e && (e.code || e.message)));
      UI.toast(
        busyFile ? 'Nu pot scrie în acel folder (e protejat sau fișierul e deschis în alt program). Alege alt loc.' : 'Salvarea nu a reușit: ' + (e.message || e),
        { error: true, action: { label: 'Salvează ca', run: () => saveAs() } },
      );
      return false;
    } finally {
      UI.busy(null);
    }
  }

  async function closeDoc() {
    if (!(await ensureSaved())) return;
    Pages.closeEditor(false);
    Editor.close();
    Search.close();
    source = null;
    copyPath = null;
    showHome();
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  const HINTS = {
    select: 'Click pe orice din pagină ca să-l selectezi · trage ca să-l muți · colțurile îl redimensionează · dublu-click pe text ca să-l editezi',
    text: 'Click pe un text ca să-l modifici sau oriunde în pagină ca să scrii text nou (fontul și mărimea se potrivesc automat)',
    pen: 'Desenează cu mouse-ul ținând apăsat',
    highlight: 'Trage peste text ca să-l marchezi',
    whiteout: 'Trage un dreptunghi peste ce vrei să acoperi cu alb',
    check: 'Click unde vrei bifa',
    cross: 'Click unde vrei X-ul',
    place: 'Click în pagină ca să pui imaginea (sau trage un dreptunghi pentru mărime) · Esc renunță',
  };

  function hint() {
    $('hint').textContent = HINTS[Editor.tool] || '';
  }

  async function chooseTool(id) {
    if (!Editor.doc) return;
    Pages.closeEditor(true);
    if (id === 'sign') {
      const sig = await Signature.open();
      if (!sig) return;
      Editor.setTool('place');
      Editor.pending = sig;
      Editor.emit('tool');
      return;
    }
    if (id === 'image') {
      const img = await pickImage();
      if (!img) return;
      Editor.setTool('place');
      Editor.pending = { ...img, isSignature: false };
      Editor.emit('tool');
      return;
    }
    Editor.setTool(Editor.tool === id && id !== 'select' ? 'select' : id);
  }

  async function pickImage() {
    const p = await Host.openDialog('image');
    if (!p) return null;
    try {
      const bytes = Host.readFile(p);
      if (detect(bytes) !== 'image') {
        UI.toast('Fișierul ales nu este o imagine.', { error: true });
        return null;
      }
      return await decodeImage(bytes, 2400);
    } catch (e) {
      UI.toast('Nu am putut citi imaginea: ' + (e.message || e), { error: true });
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Top bar, menus, status
  // ---------------------------------------------------------------------------

  function moreMenu() {
    const r = $('btn-more').getBoundingClientRect();
    const cur = Pages.current;
    UI.menu(r.right - 260, r.bottom + 6, [
      { label: 'Salvează ca…', icon: 'save', run: () => saveAs() },
      { label: 'Fă editabil textul din poze (pagina asta)', icon: 'text', run: () => ImageText.run(cur, null) },
      { label: 'Adaugă pagini din alt PDF…', icon: 'addpage', run: () => addPdf() },
      { label: 'Pagină goală după pagina curentă', icon: 'doc', run: () => Pages.guard(() => { Editor.insertBlank(cur + 1); setTimeout(() => Pages.scrollToPage(cur + 1), 60); }) },
      '-',
      { label: 'Rotește pagina la stânga', icon: 'rotl', run: () => Pages.guard(() => Editor.rotatePage(cur, 3)) },
      { label: 'Rotește pagina la dreapta', icon: 'rotr', run: () => Pages.guard(() => Editor.rotatePage(cur, 1)) },
      { label: 'Șterge pagina curentă', icon: 'del', disabled: Editor.sizes.length <= 1, run: () => deletePage(cur) },
      '-',
      { label: 'Închide documentul', icon: 'close', run: () => closeDoc() },
    ]);
  }

  async function deletePage(i) {
    if (await UI.confirm('Șterg pagina?', `Pagina ${i + 1} va fi scoasă din document. Poți anula cu Ctrl+Z.`, 'Șterge')) {
      Pages.guard(() => Editor.deletePage(i));
    }
  }

  function updateState() {
    const E = Editor;
    $('doc-name').textContent = E.name;
    $('dirty-dot').classList.toggle('hidden', !E.dirty);
    $('btn-undo').disabled = !E.canUndo();
    $('btn-redo').disabled = !E.canRedo();
    $('btn-save').title = copyPath ? `Salvează în ${Host.baseName(copyPath)} (Ctrl+S)` : 'Salvează ca fișier separat „…_editat_N.pdf”; originalul rămâne neatins (Ctrl+S)';
    Host.setTitle((E.dirty ? '• ' : '') + (E.name || 'PDF') + ' — ACM Docs');
    updatePage();
    Toolbar.refresh();
  }

  function updatePage() {
    const n = Editor.sizes.length;
    const c = Math.min(Pages.current, Math.max(0, n - 1));
    $('page-ind').textContent = `${n ? c + 1 : 0} / ${n}`;
    $('btn-prev').disabled = c <= 0;
    $('btn-next').disabled = c >= n - 1;
    const s = Editor.sizes[c];
    if (s) {
      const mm = (pt) => Math.round((pt / 72) * 25.4);
      const a4 = Math.abs(mm(s.w) - 210) <= 2 && Math.abs(mm(s.h) - 297) <= 2 ? 'A4 · ' : '';
      $('status-right').textContent = `${a4}${mm(s.w)} × ${mm(s.h)} mm · ${n} ${n === 1 ? 'pagină' : 'pagini'}`;
    }
  }

  function wire() {
    $('act-open').addEventListener('click', openDialog);
    $('act-scan').addEventListener('click', scan);
    $('act-invoice').addEventListener('click', () => Invoice.open({ type: 'invoice' }));
    $('act-doc').addEventListener('click', async () => { if (await Office.ensureSaved()) Writer.open(null); });
    $('act-sheet').addEventListener('click', async () => { if (await Office.ensureSaved()) Sheet.open(null); });
    $('act-slides').addEventListener('click', async () => { if (await Office.ensureSaved()) Slides.open(null); });
    $('home-money').addEventListener('click', () => showView('invoices'));
    $('home-all').addEventListener('click', () => showView('files'));
    $('files-open').addEventListener('click', openDialog);
    $('side-new').addEventListener('click', () => createMenu($('side-new')));
    $('tab-new').addEventListener('click', () => createMenu($('tab-new')));
    document.querySelectorAll('#side .nav button, #tabbar button[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
    document.querySelectorAll('#file-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderFiles(); }));
    $('files-q').addEventListener('input', () => renderFiles());
    Biz.onChange(() => { if (!$('home').classList.contains('hidden')) renderView(); });

    $('btn-home').addEventListener('click', closeDoc);
    $('btn-open').addEventListener('click', openDialog);
    $('btn-save').addEventListener('click', save);
    $('btn-more').addEventListener('click', moreMenu);
    $('btn-undo').addEventListener('click', () => { Pages.closeEditor(true); Pages.guard(() => Editor.undo()); });
    $('btn-redo').addEventListener('click', () => { Pages.closeEditor(true); Pages.guard(() => Editor.redo()); });
    $('btn-prev').addEventListener('click', () => Pages.scrollToPage(Pages.current - 1));
    $('btn-next').addEventListener('click', () => Pages.scrollToPage(Pages.current + 1));
    $('btn-search').addEventListener('click', () => (Search.isOpen() ? Search.close() : Search.open()));
    $('zoom-in').addEventListener('click', () => Pages.zoomStep(1));
    $('zoom-out').addEventListener('click', () => Pages.zoomStep(-1));
    $('zoom-val').addEventListener('click', () => Pages.setZoom(Pages.fitWidthZoom()));
    $('zoom-fit').addEventListener('click', () => Pages.setZoom(Pages.fitWidthZoom()));

    Editor.on('state', updateState);
    Editor.on('doc', () => { Thumbs.build(); Search.reset(); updateState(); });
    Editor.on('page', (i) => Thumbs.refresh(i));
    Editor.on('current', (i) => { updatePage(); Thumbs.setCurrent(i); });
    Editor.on('zoom', () => { $('zoom-val').textContent = Pages.zoomPercent() + '%'; });
    Editor.on('tool', () => { Toolbar.refresh(); hint(); });

    // Drag & drop a file anywhere in the window
    const overlay = $('drop-overlay');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth++;
      if (!$('home').classList.contains('hidden')) overlay.classList.remove('hidden');
    });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; overlay.classList.add('hidden'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      overlay.classList.add('hidden');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.path) openPath(f.path);
    });

    // Closing the window with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (allowClose) return;
      const pdfDirty = Editor.doc && Editor.dirty;
      const officeDirty = Office.anyDirty();
      if (!pdfDirty && !officeDirty) return;
      e.returnValue = false;
      setTimeout(async () => {
        const ok = pdfDirty ? await ensureSaved() : await Office.ensureSaved(Office.active() || undefined);
        if (ok) {
          allowClose = true;
          window.close();
        }
      }, 0);
    });

    Host.onOpenFile((p) => openPath(p));
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  const TOOL_KEYS = { v: 'select', t: 'text', p: 'pen', h: 'highlight', w: 'whiteout', e: 'eraser', c: 'check', x: 'cross', s: 'sign', i: 'image' };

  function typing(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onKey(e) {
    if (document.querySelector('#modal-root .backdrop')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const inEditor = !!Editor.doc && !$('editor').classList.contains('hidden');

    if (ctrl && k === 'o') { e.preventDefault(); openDialog(); return; }
    if (!inEditor) return;
    if (ctrl && k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); return; }
    if (ctrl && k === 'f') { e.preventDefault(); Search.open(); return; }
    if (ctrl && (k === '=' || k === '+')) { e.preventDefault(); Pages.zoomStep(1); return; }
    if (ctrl && k === '-') { e.preventDefault(); Pages.zoomStep(-1); return; }
    if (ctrl && k === '0') { e.preventDefault(); Pages.setZoom(Pages.fitWidthZoom()); return; }

    if (typing(e.target)) return;

    if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? Pages.guard(() => Editor.redo()) : Pages.guard(() => Editor.undo()); return; }
    if (ctrl && k === 'y') { e.preventDefault(); Pages.guard(() => Editor.redo()); return; }
    if (ctrl && k === 'c') {
      const it = Editor.selectedItem();
      if (it) { e.preventDefault(); Pages.copyText(it); }
      return;
    }
    if (ctrl || e.altKey) return;

    const item = Editor.selectedItem();
    if (k === 'Escape') {
      if (Search.isOpen()) { Search.close(); return; }
      if (Editor.tool !== 'select') { Editor.setTool('select'); return; }
      if (Editor.selected) Editor.select(null);
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && item) { e.preventDefault(); Pages.guard(() => Editor.deleteItem(item)); return; }
    if (k === 'Enter' && item && item.kind === 'text') { e.preventDefault(); Pages.beginEdit(item); return; }
    if (k.startsWith('Arrow')) {
      if (item) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
        Pages.guard(() => Editor.nudge(d[0], d[1]));
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const v = $('viewport');
        if (v.scrollWidth <= v.clientWidth + 2) { e.preventDefault(); Pages.scrollToPage(Pages.current + (k === 'ArrowRight' ? 1 : -1)); }
      }
      return;
    }
    if (TOOL_KEYS[k]) { e.preventDefault(); chooseTool(TOOL_KEYS[k]); }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  // Phone Back button: close what is on top, then go back one screen.
  async function back() {
    if (UI.back()) return true;
    if (!$('sl-present').classList.contains('hidden')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; }
    if (Search.isOpen()) { Search.close(); return true; }
    if (Scanner.isOpen) { Scanner.back(); return true; }
    if (!$('editor').classList.contains('hidden')) { closeDoc(); return true; }
    if (Invoice.isOpen) { Invoice.back(); return true; }
    const off = Office.active();
    if (off) { const b = $(off.screen).querySelector('.otop .ib'); if (b) b.click(); return true; }
    if (view !== 'home') { showView('home'); return true; }
    return false;
  }

  function hideSplash() {
    const sp = $('splash');
    if (!sp) return;
    sp.classList.add('out');
    setTimeout(() => sp.remove(), 450);
  }

  async function boot() {
    const t0 = Date.now();
    Theme.apply();
    I18n.init();
    I18n.onChange((l) => { try { if (window.AndroidBridge && AndroidBridge.setLang) AndroidBridge.setLang(l); } catch (e) {} });
    try { if (window.AndroidBridge && AndroidBridge.setLang) AndroidBridge.setLang(I18n.lang); } catch (e) {}
    hydrateIcons();
    try { Biz.migrate(); } catch (e) { console.error(e); }
    wire();
    Invoice.init();
    Sheet.init();
    Writer.init();
    Slides.init();
    // accounts: sign-in screen on first start, then the account's keys (does not wait for the PDF engine)
    try { if (typeof AccountUI !== 'undefined') AccountUI.start().catch((e) => console.error('account', e)); } catch (e) { console.error('account', e); }
    window.addEventListener('keydown', onKey);
    // The page itself never scrolls (only the panels inside it do).
    window.addEventListener('scroll', () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); });
    document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('screen') && t.scrollTop) t.scrollTop = 0; }, true);
    window.addEventListener('error', (e) => console.error(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => {
      console.error(e.reason);
      UI.toast('A apărut o eroare: ' + ((e.reason && e.reason.message) || e.reason), { error: true, action: { label: 'Detalii', run: () => UI.errorDetails('Eroare', e.reason) } });
    });
    window.__onBack = () => { back().then((handled) => { if (!handled) Host.exitApp(); }); return true; };
    try {
      await PDF.init(await Host.wasmBytes());
    } catch (e) {
      showHome();
      hideSplash();
      UI.errorDetails('Motorul PDF nu a pornit', e);
      return;
    }
    showHome();
    setTimeout(hideSplash, Math.max(0, 650 - (Date.now() - t0)));
    Pages.init();
    Search.init();
    Toolbar.build();
    setTimeout(() => { try { SystemFonts.findTrueType('Arial', false, false); } catch (e) {} }, 400);
    const f = await Host.startupFile();
    if (f) openPath(f);
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    chooseTool, pickImage, openPath, ensureClosed: async () => (await ensureSaved()) && (await Office.ensureSaved()), quietScanHint, save, saveAs, closeDoc, addPdf, showScreen, showHome, showView, rememberFile, scan, back,
    get copyPath() { return copyPath; },
  };
})();
