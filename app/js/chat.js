'use strict';
// Encrypted chat: conversations with contacts and groups.
//
//  - every message is an .acm envelope sealed on this device for each member of the conversation
//    (End-to-End Encryption + Post-Quantum Cryptography) and signed by the sender; the server keeps
//    only envelopes it cannot open
//  - a document sent in a chat is sealed the same way and stored as an encrypted block; it is never
//    downloaded or decrypted on its own: only when someone taps "Deschide"
//  - forwarding a document seals it again, for the members of the other conversation
//  - groups: the group name is sealed for the members too

Object.assign(Icons, {
  chat: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  attach: 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
  group: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  forward: 'M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z',
  block: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z',
});

const Chat = (() => {
  const A = () => window.__lib.acmcrypto;
  const F = () => Account.internals();
  const me = () => (Account.current() ? Account.current().uid : null);
  const BUCKET = 'acm-docs-52280.firebasestorage.app';
  const MAX_FILE = 100 * 1024 * 1024;
  const PAGE = 40;
  const ls = {
    get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const readKey = () => 'acm.chat.read.' + me();
  const hiddenKey = () => 'acm.chat.hidden.' + me();

  // ---------------------------------------------------------------- state
  let chats = new Map();      // cid -> chat document (+ id)
  let unlistenList = null;
  const titles = new Map();   // cid -> decrypted group name
  const people = new Map();   // uid -> { uid, handle, name, key (Uint8Array), fp }
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) {} });
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);

  function unreadCount() {
    const read = ls.get(readKey()) || {};
    const hidden = ls.get(hiddenKey()) || {};
    let n = 0;
    for (const c of chats.values()) if (!hidden[c.id] && c.lastFrom && c.lastFrom !== me() && c.lastFrom !== 'system' && ms(c.lastAt) > (read[c.id] || 0)) n++;
    return n;
  }
  function markRead(cid) { const r = ls.get(readKey()) || {}; r[cid] = Date.now(); ls.set(readKey(), r); emit(); }

  /** The conversation list, live (only ids, members and times: nothing to decrypt). */
  let startedFor = null;
  function start() {
    if (unlistenList && startedFor === me()) return;
    stop();
    if (!me() || typeof Devices === 'undefined' || !Devices.myDevice()) return;
    startedFor = me();
    try {
      const { F: f, db } = F();
      const q = f.firestore.query(f.firestore.collection(db, 'chats'), f.firestore.where('members', 'array-contains', me()), f.firestore.orderBy('lastAt', 'desc'), f.firestore.limit(200));
      unlistenList = f.firestore.onSnapshot(q, (snap) => {
        chats = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
        emit();
      }, (e) => { console.warn('chat list', e && e.code); stop(); setTimeout(start, 60000); });
    } catch (e) { console.warn('chat', e); }
  }
  function stop() { if (unlistenList) { try { unlistenList(); } catch (e) {} unlistenList = null; } startedFor = null; }

  // ---------------------------------------------------------------- people and their padlocks
  async function person(uid) {
    if (people.has(uid)) return people.get(uid);
    const c = Contacts.get(uid);
    let p = null;
    try { p = await Account.profileOf(uid); } catch (e) {}
    const out = p ? { uid, handle: p.handle, name: p.name, key: p.key, fp: p.fp, contact: c || null } : c ? { uid, handle: c.handle, name: c.name, key: Host.fromB64(c.key), fp: c.fp, contact: c, gone: true } : { uid, handle: '?', name: '', gone: true };
    // a contact's padlock that changed is never used silently: the conversation stops and warns
    if (c && p && c.fp !== p.fp) { out.changed = true; Contacts.refresh(c).catch(() => {}); }
    people.set(uid, out);
    return out;
  }
  const label = (p) => (p ? p.name || '@' + p.handle : '');
  async function chatName(c) {
    if (c.kind === 'group') return titles.get(c.id) || (await openTitle(c)) || I18n.t('Grup');
    const other = c.members.find((u) => u !== me());
    return other ? label(await person(other)) : I18n.t('Doar tu');
  }
  async function openTitle(c) {
    if (!c.title) return null;
    try {
      const r = A().open(Host.fromB64(c.title), await Account.unlock('Deblochează mesajele'));
      const t = JSON.parse(new TextDecoder().decode(r.bytes)).title;
      titles.set(c.id, String(t || '').slice(0, 60));
      return titles.get(c.id);
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- sealing
  /** Everyone's padlock, mine included; refused if a member's padlock changed and was not confirmed. */
  async function bundlesFor(members) {
    const out = [];
    for (const uid of members) {
      const p = await person(uid);
      if (uid === me()) { out.push(await myKey()); continue; }
      if (p.changed) throw Object.assign(new Error('changed'), { who: p });
      if (!p.key) continue; // an account that no longer exists
      out.push(p.contact && !p.contact.pending ? Host.fromB64(p.contact.key) : p.key);
    }
    return out;
  }
  let myKeyCache = null;
  async function myKey() {
    if (myKeyCache) return myKeyCache;
    const p = await Account.profileOf(me());
    if (!p) throw new Error('Profilul contului nu este încă finalizat.');
    myKeyCache = p.key;
    return myKeyCache;
  }
  async function sealFor(members, obj, name) {
    const id = await Account.unlock('Deblochează mesajele');
    const bundles = await bundlesFor(members);
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    return A().seal({ bytes, name: name || 'm', mime: 'application/x-acm-chat' }, id, bundles, { hint: members.length > 2, handle: Account.handle() || undefined });
  }
  const sealTitle = async (members, title) => Host.toB64(await sealFor(members, { title: String(title).slice(0, 60) }, 'title'));

  // ---------------------------------------------------------------- opening a conversation
  async function withPerson(uid) {
    if (!(await AcmShare.ensureAccount())) return;
    if (typeof Service !== 'undefined' && Service.blocked('chat')) return;
    UI.busy('Se deschide…');
    try {
      const r = await Account.call('chatDirect', { uid });
      UI.busy();
      return openChat(r.id);
    } catch (e) {
      UI.busy();
      if (typeof Service !== 'undefined' && Service.handle(e)) return;
      UI.toast(Account.say(e), { error: true });
    }
  }

  // ---------------------------------------------------------------- the pages (list, conversation)
  let page = null;
  function openPage(build) {
    closePage();
    page = el('div', { class: 'chat-page acm-ui', role: 'dialog' });
    document.body.append(page);
    build(page);
    hydrateIcons(page);
    return page;
  }
  function closePage() { if (page) { if (page.__cleanup) page.__cleanup(); page.remove(); page = null; } }
  /** Phone Back button: a conversation goes back to the list, the list closes. */
  function back() {
    if (!page) return false;
    if (page.dataset.kind === 'conv') show(); else closePage();
    return true;
  }
  const head = (title, sub, left, right) => el('header', { class: 'chat-head' }, [
    left, el('div', { class: 'ch-t' }, [el('b', { class: 'no-tr', text: title }), sub ? el('small', { text: sub }) : null]), right || el('span', { class: 'ch-sp' }),
  ]);
  const iconBtn = (icon, label, onclick, cls) => el('button', { class: 'ch-ib ' + (cls || ''), type: 'button', title: label, 'aria-label': label, html: svg(icon), onclick });
  // every person keeps the same colour (from the name), in the system's own palette
  const HUES = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff9f0a', '#30b0c7', '#34c759', '#64d2ff'];
  const hueOf = (s) => { let h = 0; for (const ch of String(s || '?')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return HUES[h % HUES.length]; };
  const avatarOf = (name, group) => {
    const a = el('span', { class: 'ch-av' + (group ? ' grp' : ''), html: group ? svg('group') : '', text: group ? null : ((name || '?').replace(/^@/, '')[0] || '?').toUpperCase() });
    if (!group) a.style.setProperty('--av', hueOf(name));
    return a;
  };

  async function show() {
    if (!(await AcmShare.ensureAccount())) return;
    try { await Account.unlock('Deblochează mesajele'); } catch (e) { return; }
    if (!unlistenList) start();
    openPage((p) => {
      p.dataset.kind = 'list';
      const list = el('div', { class: 'chat-list' }, [el('div', { class: 'ch-empty muted', text: 'Se încarcă…' })]);
      const q = el('input', { class: 'ch-q', type: 'search', placeholder: I18n.t('Caută'), spellcheck: 'false' });
      p.append(
        head('', null, iconBtn('back', 'Înapoi', closePage), el('span', { class: 'ch-acts' }, [
          iconBtn('group', 'Grup nou', () => newGroup()),
          iconBtn('plus', 'Conversație nouă', () => newChat()),
        ])),
        el('div', { class: 'chat-scroll' }, [
          el('h1', { class: 'ch-title', text: 'Mesaje' }),
          el('div', { class: 'ch-lock', html: `${svg('lock')}<span>${escHtml(I18n.t('End-to-End Encryption · Post-Quantum Cryptography'))}</span>`, title: I18n.t('Mesajele și documentele sunt protejate prin End-to-End Encryption și Post-Quantum Cryptography. Nici ACM Docs nu le poate citi.') }),
          el('label', { class: 'ch-search', html: svg('search') }, [q]),
          list,
        ]),
      );
      q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); for (const r of list.querySelectorAll('.ch-row')) r.hidden = !!t && !r.dataset.name.includes(t); });
      const draw = async () => {
        const hidden = ls.get(hiddenKey()) || {};
        const read = ls.get(readKey()) || {};
        const rows = [...chats.values()].filter((c) => !hidden[c.id] || ms(c.lastAt) > hidden[c.id]);
        if (!rows.length) {
          list.replaceChildren(el('div', { class: 'ch-empty' }, [
            el('span', { class: 'ch-empty-i', html: svg('chat') }), el('b', { text: 'Nicio conversație încă' }),
            el('small', { class: 'muted', text: 'Scrie unui contact sau creează un grup. Totul este criptat pe dispozitiv.' }),
            el('button', { class: 'btn primary', type: 'button', text: 'Conversație nouă', onclick: () => newChat() }),
          ]));
          hydrateIcons(list);
          return;
        }
        const out = [];
        for (const c of rows) {
          const name = await chatName(c);
          const unread = c.lastFrom && c.lastFrom !== me() && c.lastFrom !== 'system' && ms(c.lastAt) > (read[c.id] || 0);
          const r = el('button', { class: 'ch-row' + (unread ? ' unread' : ''), type: 'button', 'data-name': String(name || '').toLowerCase() }, [
            avatarOf(name, c.kind === 'group'),
            el('span', { class: 'ch-rt' }, [el('b', { class: 'no-tr', text: name }), el('small', { class: 'muted', text: unread ? 'Mesaj nou' : c.kind === 'group' ? `${c.members.length} ${I18n.t('membri')}` : 'Conversație criptată' })]),
            el('span', { class: 'ch-time no-tr', text: when(ms(c.lastAt)) }),
            unread ? el('i', { class: 'ch-dot' }) : null,
          ]);
          r.addEventListener('click', () => openChat(c.id));
          out.push(r);
        }
        if (page === p) list.replaceChildren(...out);
      };
      listeners.add(draw);
      p.__cleanup = () => listeners.delete(draw);
      draw();
    });
  }

  function when(t) {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short' });
  }

  async function newChat() {
    const contacts = Contacts.list();
    const pick = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'acm-pick');
      box.append(el('h2', { text: 'Conversație nouă' }));
      box.append(Contacts.searchBox((p) => close(p.uid)));
      const list = el('div', { class: 'clist' }, contacts.map((c) => Contacts.contactRow(c, () => close(c.uid), Contacts.badge(c))));
      if (contacts.length) box.append(el('h3', { class: 'csub', text: 'Contacte' }), list);
      box.append(el('div', { class: 'actions col' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]));
    });
    if (pick) await withPerson(pick);
  }

  async function newGroup() {
    if (typeof Service !== 'undefined' && Service.blocked('chat')) return;
    const contacts = Contacts.list().filter((c) => !c.gone);
    if (!contacts.length) return UI.toast(I18n.t('Adaugă mai întâi contacte, apoi creează grupul.'), { duration: 5000 });
    const r = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'acm-pick');
      const name = el('input', { class: 'in', type: 'text', maxlength: '60', placeholder: 'Numele grupului' });
      const chosen = new Set();
      const go = el('button', { class: 'btn primary', type: 'button', text: 'Creează grupul', disabled: true });
      const upd = () => { go.disabled = !chosen.size || !name.value.trim(); };
      name.addEventListener('input', upd);
      const list = el('div', { class: 'clist' }, contacts.slice(0, 200).map((c) => {
        const tick = el('span', { class: 'ctick', html: svg('check') });
        const row = Contacts.contactRow(c, () => { if (chosen.has(c.uid)) chosen.delete(c.uid); else if (chosen.size < 49) chosen.add(c.uid); row.classList.toggle('on', chosen.has(c.uid)); upd(); }, el('span', { class: 'cright' }, [Contacts.badge(c), tick]));
        return row;
      }));
      go.addEventListener('click', () => close({ name: name.value.trim(), uids: [...chosen] }));
      box.append(el('h2', { text: 'Grup nou' }), el('label', { class: 'auth-fld' }, [el('span', { text: 'Numele grupului' }), name]),
        el('h3', { class: 'csub', text: 'Membri (până la 49)' }), list,
        el('p', { class: 'muted small', text: 'Numele grupului și mesajele sunt criptate pentru membri. Serverul vede doar cine face parte din grup.' }),
        el('div', { class: 'actions col' }, [go, el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]));
    });
    if (!r) return;
    UI.busy('Se creează grupul…');
    try {
      const title = await sealTitle([me(), ...r.uids], r.name);
      const res = await Account.call('chatGroup', { op: 'create', uids: r.uids, title });
      titles.set(res.id, r.name);
      UI.busy();
      return openChat(res.id);
    } catch (e) { UI.busy(); failSay(e); }
  }

  function failSay(e) {
    if (typeof Service !== 'undefined' && Service.handle(e)) return;
    if (e && e.message === 'changed') {
      UI.toast(I18n.t('Cheia unui membru s-a schimbat. Verifică-l înainte de a-i trimite ceva.'), { error: true, duration: 7000 });
      if (e.who && e.who.contact) Contacts.showContact(e.who.uid);
      return;
    }
    const m = String((e && (e.server || e.message)) || '');
    UI.toast(/left the group/.test(m) ? I18n.t('Cine a ieșit din grup nu poate fi adăugat din nou.') : /group full/.test(m) ? I18n.t('Grupul are deja numărul maxim de membri.') : /permission|blocked/i.test(m) ? I18n.t('Mesajul nu a putut fi trimis în această conversație.') : Account.say(e), { error: true });
  }

  // ---------------------------------------------------------------- one conversation
  async function openChat(cid) {
    let c = chats.get(cid);
    if (!c) {
      try { const { F: f, db } = F(); const s = await f.firestore.getDoc(f.firestore.doc(db, 'chats', cid)); if (s.exists()) c = { id: cid, ...s.data() }; } catch (e) {}
    }
    if (!c) return UI.toast(I18n.t('Conversația nu mai este disponibilă.'), { error: true });
    let id;
    try { id = await Account.unlock('Deblochează mesajele'); } catch (e) { return; }
    people.clear(); // padlocks are read fresh for every conversation (a changed one must show)
    const hidden = ls.get(hiddenKey()) || {};
    const name = await chatName(c);
    const others = c.members.filter((u) => u !== me());
    const otherP = c.kind === 'direct' && others[0] ? await person(others[0]) : null;
    const msgs = new Map();   // mid -> rendered element
    let oldest = null, unlisten = null;

    openPage((p) => {
      p.dataset.kind = 'conv';
      const sub = c.kind === 'group' ? `${c.members.length} ${I18n.t('membri')}` : otherP && otherP.contact && otherP.contact.verified ? I18n.t('Verificat · End-to-End Encryption') : 'End-to-End Encryption';
      const scroller = el('div', { class: 'chat-msgs' });
      const more = el('button', { class: 'ch-more', type: 'button', text: 'Mesaje mai vechi', hidden: true });
      const warn = el('div', { class: 'chat-warn', hidden: true });
      const input = el('textarea', { class: 'chat-in', rows: '1', maxlength: '4000', placeholder: I18n.t('Mesaj criptat') });
      const sendB = iconBtn('send', 'Trimite', () => sendText(), 'primary');
      const attach = iconBtn('attach', 'Trimite un document', () => sendFile());
      const composer = el('div', { class: 'chat-compose' }, [attach, input, sendB]);
      const blockedBar = el('div', { class: 'chat-blocked', hidden: true });
      scroller.append(more, el('div', { class: 'chat-e2e' }, [el('span', { html: svg('lock') }), el('span', { text: I18n.t('Mesajele și documentele sunt protejate prin End-to-End Encryption și Post-Quantum Cryptography. Nici ACM Docs nu le poate citi.') })]));
      const subEl = el('small', { text: sub });
      const convHead = el('header', { class: 'chat-head conv' }, [
        iconBtn('back', 'Înapoi', () => show()),
        el('button', { class: 'ch-who', type: 'button', onclick: () => menu() }, [avatarOf(name, c.kind === 'group'), el('span', { class: 'ch-t' }, [el('b', { class: 'no-tr', text: name }), subEl])]),
        iconBtn('more', 'Opțiuni', () => menu()),
      ]);
      p.append(convHead, warn, scroller, blockedBar, composer);
      const typed = () => composer.classList.toggle('has-text', !!input.value.trim());
      input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; typed(); typing(); });
      input.addEventListener('blur', () => typingStop());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !Host.mobile) { e.preventDefault(); sendText(); } });

      const refreshBars = () => {
        const cur = chats.get(cid) || c;
        const bl = cur.blocked || [];
        blockedBar.hidden = !bl.length;
        composer.hidden = !!bl.length || !cur.members.includes(me());
        blockedBar.textContent = I18n.t(bl.includes(me()) ? 'Ai blocat această conversație.' : 'Conversația nu mai primește mesaje.');
        const changed = otherP && otherP.changed;
        warn.hidden = !changed;
        if (changed) {
          warn.replaceChildren(el('span', { html: svg('warn') }), el('span', { text: I18n.t('Cheia acestui contact s-a schimbat. Verifică-l înainte de a-i trimite mesaje.') }), el('button', { class: 'btn small', type: 'button', text: 'Verifică', onclick: () => Contacts.showContact(otherP.uid) }));
          composer.hidden = true;
        }
      };
      refreshBars();
      listeners.add(refreshBars);

      // ---- messages: the latest page live, older ones on request
      const { F: f, db } = F();
      const col = f.firestore.collection(db, 'chats', cid, 'msgs');
      const render = async (d) => {
        if (msgs.has(d.id)) return;
        const m = d.data();
        const node = await bubble(c, d.id, m, id);
        msgs.set(d.id, node);
        // keep the order by time
        const t = ms(m.at) || Date.now();
        node.dataset.t = String(t);
        const after = [...scroller.querySelectorAll('.ch-msg:not(.typing)')].find((x) => Number(x.dataset.t) > t);
        if (after) after.before(node); else if (typingNode.isConnected) typingNode.before(node); else scroller.append(node);
        // a message that arrives while the conversation is open comes in with a small spring
        if (live && !(typeof Feel !== 'undefined' && !Feel.on)) {
          node.classList.add('arrive');
          setTimeout(() => node.classList.remove('arrive'), 700);
          if (typeof Feel !== 'undefined') Feel.haptic(m.from === me() ? 'light' : 'selection');
        }
        regroup();
      };
      // messages of one person close together form a group: one tail, one time, a day label between days
      const dayKey = (t) => new Date(t).toDateString();
      const dayLabel = (t) => {
        const d = new Date(t), today = new Date(), y = new Date(Date.now() - 864e5);
        if (d.toDateString() === today.toDateString()) return I18n.t('Azi');
        if (d.toDateString() === y.toDateString()) return I18n.t('Ieri');
        return d.toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
      };
      function regroup() {
        scroller.querySelectorAll('.ch-day').forEach((x) => x.remove());
        const list = [...scroller.querySelectorAll('.ch-msg:not(.typing)')];
        list.forEach((n, i) => {
          const prev = list[i - 1], next = list[i + 1], t = Number(n.dataset.t);
          const near = (a, b) => a && b && !a.classList.contains('sys') && !b.classList.contains('sys') && a.dataset.from === b.dataset.from && Math.abs(Number(a.dataset.t) - Number(b.dataset.t)) < 180000 && dayKey(Number(a.dataset.t)) === dayKey(Number(b.dataset.t));
          n.classList.toggle('first', !near(prev, n));
          n.classList.toggle('last', !near(n, next));
          if (!prev || dayKey(Number(prev.dataset.t)) !== dayKey(t)) n.before(el('div', { class: 'ch-day' }, [el('span', { text: dayLabel(t) })]));
        });
      }
      // "is writing": three dots that move like a small wave
      const typingNode = el('div', { class: 'ch-msg typing first last' }, [el('div', { class: 'ch-bub' }, [el('span', { class: 'ch-dots' }, [el('i'), el('i'), el('i')])])]);
      let live = false;
      const atBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
      const q = f.firestore.query(col, f.firestore.orderBy('at', 'desc'), f.firestore.limit(PAGE));
      unlisten = f.firestore.onSnapshot(q, async (snap) => {
        const stick = atBottom() || !msgs.size;
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed' && msgs.has(ch.doc.id) && !snap.docs.find((x) => x.id === ch.doc.id)) {
            // deleted by its sender (a page change keeps it)
            try { const still = await f.firestore.getDoc(ch.doc.ref); if (!still.exists()) { msgs.get(ch.doc.id).remove(); msgs.delete(ch.doc.id); } } catch (e) {}
          }
        }
        const docs = snap.docs.slice().reverse();
        if (docs.length && (!oldest || ms(docs[0].data().at) < ms(oldest.data().at))) oldest = docs[0];
        for (const d of docs) if (!snap.metadata.hasPendingWrites || d.data().at) await render(d);
        more.hidden = snap.size < PAGE;
        if (stick) scroller.scrollTo({ top: scroller.scrollHeight, behavior: live ? 'smooth' : 'auto' });
        if (document.visibilityState === 'visible') markRead(cid);
        hydrateIcons(scroller);
        live = true;
      }, (e) => { console.warn('chat msgs', e && e.code); UI.toast(I18n.t('Mesajele nu pot fi încărcate acum.'), { error: true }); });
      more.addEventListener('click', async () => {
        if (!oldest) return;
        const h0 = scroller.scrollHeight;
        const snap = await f.firestore.getDocs(f.firestore.query(col, f.firestore.orderBy('at', 'desc'), f.firestore.startAfter ? f.firestore.startAfter(oldest) : f.firestore.where('at', '<', oldest.data().at), f.firestore.limit(PAGE)));
        const docs = snap.docs.slice().reverse();
        if (docs.length) oldest = docs[0];
        for (const d of docs) await render(d);
        more.hidden = snap.size < PAGE;
        scroller.scrollTop = scroller.scrollHeight - h0;
        hydrateIcons(scroller);
      });

      // only the time of the last key press is written (no content), at most every 3 s, removed on send
      const tdoc = () => f.firestore.doc(db, 'chats', cid, 'typing', me());
      let lastTyping = 0;
      function typing() {
        if (!input.value.trim()) return typingStop();
        if (Date.now() - lastTyping < 3000) return;
        lastTyping = Date.now();
        f.firestore.setDoc(tdoc(), { at: f.firestore.serverTimestamp() }).catch(() => {});
      }
      function typingStop() {
        if (!lastTyping) return;
        lastTyping = 0;
        f.firestore.deleteDoc(tdoc()).catch(() => {});
      }
      let writers = new Map(), tTimer = null;
      const showTyping = async () => {
        const now = Date.now();
        const who = [...writers].filter(([u, t]) => u !== me() && now - t < 7000).map(([u]) => u);
        const on = who.length > 0;
        if (on && !typingNode.isConnected) { const stick = atBottom(); scroller.append(typingNode); if (stick) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }); }
        if (!on && typingNode.isConnected) { typingNode.classList.add('leaving'); setTimeout(() => { typingNode.classList.remove('leaving'); if (!writers.size || ![...writers].some(([u, t]) => u !== me() && Date.now() - t < 7000)) typingNode.remove(); }, 220); }
        if (on) {
          const names = c.kind === 'group' ? (await Promise.all(who.slice(0, 2).map(async (u) => label(await person(u))))).join(', ') + ' ' : '';
          subEl.textContent = names + I18n.t('scrie…');
          subEl.classList.add('writing');
        } else { subEl.textContent = sub; subEl.classList.remove('writing'); }
      };
      let unTyping = null;
      try {
        unTyping = f.firestore.onSnapshot(f.firestore.collection(db, 'chats', cid, 'typing'), (snap) => {
          writers = new Map(snap.docs.map((d) => [d.id, ms(d.data().at) || Date.now()]));
          showTyping();
        }, () => {});
      } catch (e) {}
      tTimer = setInterval(showTyping, 2000);
      p.__cleanup = () => { if (unlisten) unlisten(); if (unTyping) unTyping(); clearInterval(tTimer); typingStop(); listeners.delete(refreshBars); };

      // ---- sending
      async function post(kind, box, fid) {
        const data = { from: me(), at: f.firestore.serverTimestamp(), kind, box: Host.toB64(box) };
        if (fid) data.fid = fid;
        await f.firestore.setDoc(f.firestore.doc(col), data);
        try { await f.firestore.updateDoc(f.firestore.doc(db, 'chats', cid), { lastAt: f.firestore.serverTimestamp(), lastFrom: me() }); } catch (e) {}
        if (hidden[cid]) { delete hidden[cid]; ls.set(hiddenKey(), hidden); }
      }
      async function sendText() {
        const text = input.value.trim();
        if (!text) return;
        if (typeof Service !== 'undefined' && Service.blocked('chat')) return;
        sendB.disabled = true;
        try {
          const cur = chats.get(cid) || c;
          const box = await sealFor(cur.members, { t: 'text', text });
          input.value = ''; input.style.height = 'auto'; composer.classList.remove('has-text');
          typingStop();
          await post('text', box);
        } catch (e) { failSay(e); } finally { sendB.disabled = false; input.focus(); }
      }
      async function sendFile(fromBytes) {
        if (typeof Service !== 'undefined' && Service.blocked('chat')) return;
        let bytes, fname;
        if (fromBytes) ({ bytes, name: fname } = fromBytes);
        else {
          const path = await Host.openDialog('pdf');
          if (!path) return;
          fname = Host.baseName(path);
          bytes = await Host.readFileAsync(path);
        }
        if (bytes.length > MAX_FILE) return UI.toast(I18n.t('Documentul este prea mare (cel mult 100 MB).'), { error: true });
        const cur = chats.get(cid) || c;
        const mode = fromBytes && fromBytes.mode ? fromBytes.mode : await askMode(fname, cur);
        if (!mode) return;
        await uploadAndPost(cur, bytes, fname, post, mode);
      }
      page.__sendFile = sendFile;

      async function menu() {
        const cur = chats.get(cid) || c;
        const isAdmin = (cur.admins || []).includes(me());
        const act = await UI.modal((box, close) => {
          box.classList.add('acm-ui');
          const row = (icon, color, t, s, v) => { const r = el('button', { class: 'srow', type: 'button' }, [el('span', { class: 'si ' + color, html: svg(icon) }), el('span', { class: 'stx' }, [el('b', { text: t }), s ? el('small', { text: s }) : null]), el('span', { class: 'chev', html: svg('right') })]); r.addEventListener('click', () => close(v)); return r; };
          const rows = [];
          if (cur.kind === 'group') {
            rows.push(row('group', 'blue', 'Membrii grupului', `${cur.members.length} ${I18n.t('membri')}`, 'members'));
            if (isAdmin) rows.push(row('edit', 'indigo', 'Schimbă numele grupului', null, 'rename'));
            rows.push(row('logout', 'gray', 'Ieși din grup', null, 'leave'));
          } else if (otherP) {
            rows.push(row('user', 'blue', 'Contact', otherP.handle ? '@' + otherP.handle : '', 'contact'));
            rows.push(row('block', 'orange', (cur.blocked || []).includes(me()) ? 'Deblochează conversația' : 'Blochează conversația', 'Nu se mai pot trimite mesaje', 'block'));
            rows.push(row('warn', 'red', 'Raportează contul', 'Ajunge doar la echipa ACM Docs', 'report'));
          }
          rows.push(row('close', 'gray', 'Șterge conversația de aici', 'Mesajele rămân la ceilalți', 'hide'));
          box.append(el('h2', { class: 'no-tr', text: name }), el('div', { class: 'list-card' }, rows), el('div', { class: 'actions col' }, [el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) })]));
        });
        if (!act) return;
        try {
          if (act === 'contact') return Contacts.showContact(otherP.uid);
          if (act === 'report') return Service.report(otherP.handle);
          if (act === 'block') { await Account.call('chatBlock', { cid, on: !(cur.blocked || []).includes(me()) }); return; }
          if (act === 'hide') { hidden[cid] = Date.now(); ls.set(hiddenKey(), hidden); return show(); }
          if (act === 'members') return membersScreen(cur);
          if (act === 'rename') {
            const nn = await askText('Numele grupului', titles.get(cid) || '');
            if (!nn || !nn.trim()) return;
            await Account.call('chatGroup', { op: 'title', cid, title: await sealTitle(cur.members, nn.trim()) });
            titles.set(cid, nn.trim().slice(0, 60));
            return openChat(cid);
          }
          if (act === 'leave') {
            if (!(await UI.confirm(I18n.t('Ieși din grup?'), I18n.t('Nu vei mai primi mesajele grupului.'), I18n.t('Ieși')))) return;
            await Account.call('chatGroup', { op: 'leave', cid });
            return show();
          }
        } catch (e) { failSay(e); }
      }
    });
    markRead(cid);
  }
  async function askText(title, value) {
    return UI.modal((box, close) => {
      box.classList.add('acm-ui');
      const inp = el('input', { class: 'in', type: 'text', maxlength: '60', value });
      box.append(el('h2', { text: title }), el('label', { class: 'auth-fld' }, [inp]),
        el('div', { class: 'actions col' }, [el('button', { class: 'btn primary', type: 'button', text: 'Salvează', onclick: () => close(inp.value) }), el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]));
      setTimeout(() => inp.focus(), 50);
    });
  }
  // a group name sealed for a new set of members (by someone who can read it now)
  async function sealTitleFor(members, cid) { return sealTitle(members, titles.get(cid) || I18n.t('Grup')); }

  async function membersScreen(c) {
    const isAdmin = (c.admins || []).includes(me());
    const list = [];
    for (const u of c.members) list.push(await person(u));
    const act = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'acm-pick');
      const rows = list.map((p) => {
        const right = el('span', { class: 'cright' }, [
          (c.admins || []).includes(p.uid) ? el('small', { class: 'cbadge', text: 'Admin' }) : null,
          isAdmin && p.uid !== me() ? el('button', { class: 'btn small', type: 'button', text: 'Scoate', onclick: (e) => { e.stopPropagation(); close({ do: 'remove', uid: p.uid }); } }) : null,
        ]);
        return Contacts.contactRow({ uid: p.uid, handle: p.handle, name: p.uid === me() ? I18n.t('Tu') : p.name, verified: !!(p.contact && p.contact.verified) }, null, right);
      });
      box.append(el('h2', { text: 'Membrii grupului' }), el('div', { class: 'clist' }, rows),
        el('div', { class: 'actions col' }, [
          isAdmin ? el('button', { class: 'btn primary', type: 'button', text: 'Adaugă membri', onclick: () => close({ do: 'add' }) }) : null,
          el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
        ]));
    });
    if (!act) return;
    try {
      if (act.do === 'remove') {
        if (!(await UI.confirm(I18n.t('Scoți membrul din grup?'), I18n.t('Nu va mai primi mesajele noi ale grupului.'), I18n.t('Scoate')))) return;
        const rest = c.members.filter((u) => u !== act.uid);
        await Account.call('chatGroup', { op: 'remove', cid: c.id, uids: [act.uid], title: await sealTitleFor(rest, c.id) });
      }
      if (act.do === 'add') {
        const cand = Contacts.list().filter((x) => !c.members.includes(x.uid) && !x.gone);
        if (!cand.length) return UI.toast(I18n.t('Toate contactele tale sunt deja în grup.'));
        const pick = await UI.modal((box, close) => {
          box.classList.add('acm-ui', 'acm-pick');
          const chosen = new Set();
          const go = el('button', { class: 'btn primary', type: 'button', text: 'Adaugă', disabled: true });
          box.append(el('h2', { text: 'Adaugă membri' }), el('div', { class: 'clist' }, cand.map((x) => {
            const tick = el('span', { class: 'ctick', html: svg('check') });
            const row = Contacts.contactRow(x, () => { if (chosen.has(x.uid)) chosen.delete(x.uid); else chosen.add(x.uid); row.classList.toggle('on', chosen.has(x.uid)); go.disabled = !chosen.size; }, el('span', { class: 'cright' }, [Contacts.badge(x), tick]));
            return row;
          })), el('div', { class: 'actions col' }, [go, el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]));
          go.addEventListener('click', () => close([...chosen]));
        });
        if (!pick || !pick.length) return;
        await Account.call('chatGroup', { op: 'add', cid: c.id, uids: pick, title: await sealTitleFor([...c.members, ...pick], c.id) });
        UI.toast(I18n.t('Membrii noi văd doar mesajele trimise de acum înainte.'), { duration: 6000 });
      }
    } catch (e) { failSay(e); }
  }

  // ---------------------------------------------------------------- one message on screen
  const decrypted = new Map(); // mid -> { obj, sender } (memory only)
  async function bubble(c, mid, m, id) {
    if (m.kind === 'sys') return sysBubble(m);
    const mine = m.from === me();
    const wrap = el('div', { class: 'ch-msg' + (mine ? ' mine' : ''), 'data-from': m.from || '' });
    let got = decrypted.get(mid);
    if (!got) {
      try {
        const r = A().open(Host.fromB64(m.box), id);
        const sender = await person(m.from);
        // the signature must be the sender's own padlock (not just any valid one)
        // a contact's padlock is the one pinned on this device (verified by QR or accepted), never just
        // what the server says now: a server that swapped someone's key cannot pass messages as theirs
        const pinned = sender.contact && !sender.contact.pending ? sender.contact.fp : null;
        const ok = m.from === me() ? r.sender.fingerprint === Account.fingerprint() : (pinned || sender.fp) ? r.sender.fingerprint === (pinned || sender.fp) : false;
        got = { obj: JSON.parse(new TextDecoder().decode(r.bytes)), ok, sender };
      } catch (e) {
        got = { err: e && e.code === 'NOT_FOR_YOU' ? 'Trimis înainte să faci parte din conversație.' : 'Mesajul nu poate fi deschis.', sender: await person(m.from) };
      }
      decrypted.set(mid, got);
    }
    const body = el('div', { class: 'ch-bub' });
    if (c.kind === 'group' && !mine) body.append(el('small', { class: 'ch-from no-tr', text: label(got.sender) }));
    if (got.err) body.append(el('em', { class: 'muted', text: got.err }));
    else if (got.obj.t === 'text') body.append(el('div', { class: 'ch-text no-tr', text: String(got.obj.text || '') }));
    else if (got.obj.t === 'file') body.append(fileCard(c, mid, m, got.obj));
    if (got.ok === false && !got.err) body.append(el('small', { class: 'ch-bad', html: `${svg('warn')}<span>${escHtml(I18n.t('Semnătura nu corespunde cheii cunoscute a expeditorului.'))}</span>` }));
    // the day is shown between days; a message shows only its time
    body.append(el('small', { class: 'ch-at no-tr', text: new Date(ms(m.at) || Date.now()).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' }) }));
    wrap.append(body);
    if (mine) {
      wrap.addEventListener('contextmenu', async (e) => { e.preventDefault(); await deleteMine(c.id, mid); });
      let tm = null;
      wrap.addEventListener('touchstart', () => { tm = setTimeout(() => deleteMine(c.id, mid), 650); }, { passive: true });
      ['touchend', 'touchmove'].forEach((ev) => wrap.addEventListener(ev, () => clearTimeout(tm), { passive: true }));
    }
    return wrap;
  }
  async function deleteMine(cid, mid) {
    if (!(await UI.confirm(I18n.t('Ștergi mesajul?'), I18n.t('Mesajul se șterge pentru toți membrii conversației.'), I18n.t('Șterge')))) return;
    try { const { F: f, db } = F(); await f.firestore.deleteDoc(f.firestore.doc(db, 'chats', cid, 'msgs', mid)); } catch (e) { failSay(e); }
  }
  function sysBubble(m) {
    const s = m.sys || {};
    const T = { created: 'Grupul a fost creat', added: 'Membri noi în grup', removed: 'Un membru a fost scos din grup', left: 'Un membru a ieșit din grup', renamed: 'Numele grupului a fost schimbat', admin: 'Un membru a devenit administrator' };
    return el('div', { class: 'ch-msg sys' }, [el('span', { text: T[s.type] || '' })]);
  }

  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  function fileCard(c, mid, m, o) {
    // older messages (before 2.6.1) were always .acm
    const acm = o.mode !== 'doc';
    const mine = m.from === me();
    const ext = (String(o.name || '').match(/\.([a-z0-9]{1,5})$/i) || [])[1] || '';
    const icon = acm ? 'lockfile' : /^pdf$/i.test(ext) ? 'pdf' : /^(docx?|odt|rtf|txt)$/i.test(ext) ? 'wordapp' : /^(xlsx?|csv|ods)$/i.test(ext) ? 'sheetapp' : /^(pptx?|odp)$/i.test(ext) ? 'slidesapp' : 'doc';
    const card = el('div', { class: 'ch-file' + (acm ? ' acm' : '') }, [
      el('span', { class: 'ch-fi', html: svg(icon) }),
      el('span', { class: 'ch-ft' }, [el('b', { class: 'no-tr', text: String(o.name || 'document') }), el('small', { class: 'muted', text: size(Number(o.size) || 0) + (acm ? ' · .acm · ' + I18n.t('doar pentru destinatar') : ext ? ' · ' + ext.toUpperCase() : '') })]),
    ]);
    const lockedForMe = acm && mine;
    const acts = el('div', { class: 'ch-fa' }, [
      lockedForMe
        ? el('span', { class: 'ch-locked', html: `${svg('lock')}<span>${escHtml(I18n.t('Blocat pentru destinatar'))}</span>` })
        : el('button', { class: 'btn small primary', type: 'button', text: 'Deschide', onclick: () => (acm ? openDoc(c.id, m.fid, o, 'open') : openPlain(c.id, m.fid, o, m)) }),
      lockedForMe ? null : el('button', { class: 'btn small', type: 'button', title: I18n.t('Trimite mai departe'), html: svg('forward'), onclick: () => forward(c.id, m.fid, o) }),
    ]);
    return el('div', {}, [card, acts]);
  }

  // ---------------------------------------------------------------- documents
  async function token() { return F().auth.currentUser.getIdToken(); }
  const fileUrl = (cid, fid) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`chats/${cid}/files/${fid}`)}`;
  async function upload(cid, fid, bytes) {
    const boundary = 'acm' + fid;
    const meta = JSON.stringify({ name: `chats/${cid}/files/${fid}`, contentType: 'application/octet-stream', metadata: { uploader: me() } });
    const enc = new TextEncoder();
    const body = new Blob([enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, enc.encode(`\r\n--${boundary}--`)]);
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(`chats/${cid}/files/${fid}`)}`;
    const headers = { Authorization: 'Firebase ' + (await token()), 'X-Goog-Upload-Protocol': 'multipart', 'Content-Type': `multipart/related; boundary=${boundary}` };
    const nat = await Host.nativeStorage(url, { method: 'POST', headers, body: new Uint8Array(await body.arrayBuffer()) });
    if (nat) { if (!nat.ok) throw Object.assign(new Error('storage ' + nat.status), { status: nat.status }); return; }
    const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(`chats/${cid}/files/${fid}`)}`, {
      method: 'POST', headers: { Authorization: 'Firebase ' + (await token()), 'X-Goog-Upload-Protocol': 'multipart', 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    if (!r.ok) throw Object.assign(new Error('storage ' + r.status), { status: r.status });
  }
  async function download(cid, fid) {
    const nat = await Host.nativeStorage(fileUrl(cid, fid) + '?alt=media', { headers: { Authorization: 'Firebase ' + (await token()) } });
    if (nat) {
      if (!nat.ok) throw Object.assign(new Error(nat.status === 404 ? 'Documentul nu mai este disponibil.' : 'storage ' + nat.status), { status: nat.status });
      return nat.bytes;
    }
    const r = await fetch(fileUrl(cid, fid) + '?alt=media', { headers: { Authorization: 'Firebase ' + (await token()) } });
    if (!r.ok) throw Object.assign(new Error(r.status === 404 ? 'Documentul nu mai este disponibil.' : 'storage ' + r.status), { status: r.status });
    return new Uint8Array(await r.arrayBuffer());
  }
  /** How the document goes: as a normal document every member opens (the sender too), or as a .acm
   *  document locked to the recipients only (the sender cannot open it either). Both are end-to-end
   *  encrypted on the way and on the server. */
  function askMode(fname, c) {
    return UI.modal((box, close) => {
      box.classList.add('acm-ui', 'ch-mode');
      const opt = (mode, icon, title, sub, primary) => {
        const b = el('button', { class: 'ch-opt' + (primary ? ' on' : ''), type: 'button' }, [el('span', { class: 'ch-opt-i', html: svg(icon) }), el('span', { class: 'ch-opt-t' }, [el('b', { text: title }), el('small', { text: sub })])]);
        b.addEventListener('click', () => close(mode));
        return b;
      };
      box.append(
        el('h2', { class: 'no-tr', text: fname }),
        opt('doc', 'doc', 'Trimite documentul', c.kind === 'group' ? 'Îl deschid toți membrii grupului, și tu. Rămâne criptat pe drum și pe server.' : 'Îl deschideți amândoi, ca pe orice document. Rămâne criptat pe drum și pe server.', true),
        opt('acm', 'lockfile', 'Trimite ca .acm, doar pentru destinatar', 'Blocat pe cheia destinatarului: doar el îl poate deschide, nici tu.'),
        el('div', { class: 'actions col' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]),
      );
      hydrateIcons(box);
    });
  }
  /** Seals a document for the chat's members (or only for the others, as .acm), stores it, then posts the card. */
  async function uploadAndPost(c, bytes, fname, post, mode = 'doc') {
    const fid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
    // one encrypted-document action of the plan, counted by the server BEFORE the upload
    if (typeof Plan !== 'undefined' && !(await Plan.allow('acmSend', fid, { wait: true }))) return;
    UI.busy('Se criptează documentul…');
    try {
      const id = await Account.unlock('Deblochează mesajele');
      const to = mode === 'acm' ? c.members.filter((u) => u !== me()) : c.members;
      const sealed = A().seal({ bytes, name: fname, mime: 'application/octet-stream' }, id, await bundlesFor(to), { hint: to.length > 1, handle: Account.handle() || undefined });
      UI.busy('Se trimite…');
      await upload(c.id, fid, sealed);
      const card = await sealFor(c.members, { t: 'file', name: fname, size: bytes.length, mode });
      await post('file', card, fid);
      UI.busy();
    } catch (e) { UI.busy(); failSay(e); }
  }
  /** Only now is the document downloaded and decrypted (never on its own). */
  async function openDoc(cid, fid, o) {
    if (typeof Service !== 'undefined' && Service.blocked('acmOpen')) return;
    UI.busy('Se descarcă documentul criptat…');
    let bytes;
    try { bytes = await download(cid, fid); } catch (e) { UI.busy(); return UI.toast(e.message, { error: true }); }
    UI.busy();
    closePage(); // the document opens in the viewer, above everything
    // the usual .acm flow: plan count, signature check, open for viewing or save
    const dir = Host.join(await Host.specialDir('documents'), 'Chat');
    Host.mkdirp(dir);
    let path = Host.join(dir, safe(o.name) + '.acm'), i = 2;
    while (Host.exists(path)) path = Host.join(dir, `${safe(o.name)} (${i++}).acm`);
    Host.writeFile(path, bytes);
    return AcmShare.openFile(path, bytes);
  }
  /** A normal document: decrypted on this device and opened like any other (PDF, Word, Excel…). */
  async function openPlain(cid, fid, o, m) {
    if (typeof Service !== 'undefined' && Service.blocked('acmOpen')) return;
    if (typeof Plan !== 'undefined' && !(await Plan.allow('acmOpen', fid))) return;
    UI.busy('Se descarcă documentul…');
    let res;
    try {
      const raw = await download(cid, fid);
      res = A().open(raw, await Account.unlock('Deblochează mesajele'));
      // the signature must be the sender's own key, as for messages
      const sender = await person(m.from);
      const pinned = sender.contact && !sender.contact.pending ? sender.contact.fp : null;
      const ok = m.from === me() ? res.sender.fingerprint === Account.fingerprint() : res.sender.fingerprint === (pinned || sender.fp);
      if (!ok) { UI.busy(); return UI.toast(I18n.t('Semnătura nu corespunde cheii cunoscute a expeditorului.'), { error: true, duration: 7000 }); }
    } catch (e) { UI.busy(); return UI.toast(e && e.code === 'NOT_FOR_YOU' ? I18n.t('Trimis înainte să faci parte din conversație.') : (e && e.message) || String(e), { error: true }); }
    UI.busy();
    const dir = Host.join(await Host.specialDir('documents'), 'Chat');
    Host.mkdirp(dir);
    const base = safe(res.name || o.name);
    const dot = base.lastIndexOf('.');
    let path = Host.join(dir, base), i = 2;
    while (Host.exists(path)) path = Host.join(dir, dot > 0 ? `${base.slice(0, dot)} (${i++})${base.slice(dot)}` : `${base} (${i++})`);
    Host.writeFile(path, res.bytes);
    closePage();
    return App.openPath(path);
  }
  const safe = (n) => String(n || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);
  /** Forward: decrypted on this device, sealed again for the other conversation's members. */
  async function forward(cid, fid, o) {
    const target = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'acm-pick');
      const rows = [...chats.values()].filter((x) => x.id !== cid && !(x.blocked || []).length).map((x) => {
        const r = el('button', { class: 'crow', type: 'button' }, [avatarOf(titles.get(x.id) || '', x.kind === 'group'), el('span', { class: 'ctx' }, [el('b', { class: 'no-tr', text: titles.get(x.id) || '…' })])]);
        if (x.kind === 'direct') chatName(x).then((n) => { r.querySelector('b').textContent = n; r.querySelector('.ch-av').textContent = (n[0] || '?').toUpperCase(); });
        r.addEventListener('click', () => close(x.id));
        return r;
      });
      box.append(el('h2', { text: 'Trimite mai departe' }), el('p', { class: 'muted small', text: 'Documentul se criptează din nou, doar pentru membrii conversației alese.' }),
        rows.length ? el('div', { class: 'clist' }, rows) : el('p', { class: 'muted', text: 'Nicio altă conversație.' }),
        el('div', { class: 'actions col' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) })]));
    });
    if (!target) return;
    const t = chats.get(target);
    UI.busy('Se descarcă documentul criptat…');
    try {
      const raw = await download(cid, fid);
      const res = A().open(raw, await Account.unlock('Deblochează mesajele'));
      UI.busy();
      const { F: f, db } = F();
      const col = f.firestore.collection(db, 'chats', target, 'msgs');
      const post = async (kind, box, fid2) => {
        await f.firestore.setDoc(f.firestore.doc(col), { from: me(), at: f.firestore.serverTimestamp(), kind, box: Host.toB64(box), fid: fid2 });
        try { await f.firestore.updateDoc(f.firestore.doc(db, 'chats', target), { lastAt: f.firestore.serverTimestamp(), lastFrom: me() }); } catch (e) {}
      };
      const mode = await askMode(res.name || o.name, t);
      if (!mode) return;
      await uploadAndPost(t, res.bytes, res.name || o.name, post, mode);
      UI.toast(I18n.t('Documentul a fost trimis.'));
    } catch (e) { UI.busy(); failSay(e); }
  }

  // ---------------------------------------------------------------- the button on Home
  let btnListener = null;
  function button() {
    const b = el('button', { class: 'hb', type: 'button', id: 'home-chat', title: I18n.t('Mesaje'), 'aria-label': I18n.t('Mesaje'), html: svg('chat') });
    if (btnListener) listeners.delete(btnListener);
    const dot = () => { b.querySelector('.hb-n') && b.querySelector('.hb-n').remove(); const n = unreadCount(); if (n) b.append(el('i', { class: 'hb-n no-tr', text: n > 9 ? '9+' : String(n) })); };
    listeners.add(dot);
    btnListener = dot;
    dot();
    b.addEventListener('click', () => show());
    return b;
  }

  return { start, stop, show, back, openChat, withPerson, button, unreadCount, onChange: (f) => listeners.add(f) };
})();
