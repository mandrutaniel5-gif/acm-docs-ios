'use strict';
// Plans and limits. The server counts and decides (functions useQuota / planStatus); this file only
// asks before an action, shows what is left and opens the payment page. Nothing here can raise a
// limit: a paid plan works offline only with a token signed by the server (checked here with the
// server's public key), for at most 7 days, and never past the end of the subscription.

Object.assign(Icons, {
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  cloud: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
  devices: 'M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z',
  family: 'M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.01 2.01 0 0 0 18.06 7h-.12a2 2 0 0 0-1.9 1.37l-.86 2.58c1.08.6 1.82 1.73 1.82 3.05v8h3zm-7.5-10.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6h1.5v7h4zm6.5 0v-4h1v-4c0-.82-.68-1.5-1.5-1.5h-2c-.82 0-1.5.68-1.5 1.5v4h1v4h3z',
});

const Plan = (() => {
  // the server's public key for plan tokens (its private half never leaves the server)
  const SERVER_PK = 'PLAN_PUBLIC_KEY';
  const A = () => window.__lib.acmcrypto;
  const uid = () => (typeof Account !== 'undefined' && Account.current() ? Account.current().uid : null);
  const LS = { status: (u) => 'acm.plan.' + u, token: (u) => 'acm.plan.tok.' + u, clock: 'acm.plan.clock' };
  const ls = {
    get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const NAMES = { basic: 'Basic', personal: 'Personal', pro: 'Pro', family: 'Family', business: 'Business' };
  const ACTIONS = {
    docs: { label: 'Documente editate', icon: 'edit', color: 'blue' },
    scans: { label: 'Scanări', icon: 'scan', color: 'teal' },
    invoices: { label: 'Facturi, proforme, oferte', icon: 'receipt', color: 'green' },
    acmSend: { label: 'Documente criptate trimise', icon: 'lockfile', color: 'indigo' },
    acmOpen: { label: 'Documente criptate deschise', icon: 'lock', color: 'purple' },
  };
  // shown before the first answer from the server (the server's numbers win)
  const MB = 1048576, GB = 1024 * MB;
  const FALLBACK = {
    plans: {
      basic: { devices: 1, cloud: 100 * MB, month: { docs: 3, scans: 3, invoices: 2, acmSend: 3, acmOpen: 5 } },
      personal: { devices: 2, cloud: 5 * GB, month: { docs: 60, scans: 60, invoices: 30, acmSend: 30, acmOpen: 100 } },
      family: { devices: 2, cloud: 10 * GB, month: { docs: 150, scans: 150, invoices: 60, acmSend: 60, acmOpen: 200 }, seats: 5 },
      pro: { devices: 3, cloud: 50 * GB, month: { docs: 2000, scans: 2000, invoices: 2000, acmSend: 1000, acmOpen: 3000 } },
      business: { devices: 3, cloud: 25 * GB, month: { docs: 2000, scans: 2000, invoices: 2000, acmSend: 1000, acmOpen: 3000 }, minSeats: 3, maxSeats: 500 },
    },
    prices: { personal: { month: 399, year: 3900 }, pro: { month: 899, year: 8900 }, family: { month: 1299, year: 12900 }, business: { month: 699, year: 6900 } },
  };

  // ---------------------------------------------------------------- the signed plan token
  /** Device clock that only moves forward (turning the clock back does not stretch a token). */
  function now() {
    const t = Date.now();
    const seen = Number(ls.get(LS.clock) || 0);
    if (t > seen) ls.set(LS.clock, t);
    return Math.max(t, seen);
  }
  function tokenPlan(u) {
    const tok = ls.get(LS.token(u));
    if (!tok || typeof tok !== 'string' || SERVER_PK === 'PLAN' + '_PUBLIC_KEY') return null;
    const [body, sig] = tok.split('.');
    try {
      if (!A().verifyEd(Host.fromB64(SERVER_PK), 'acm-plan\n' + body, Host.fromB64(sig))) return null;
      const p = JSON.parse(new TextDecoder().decode(Host.fromB64(body)));
      const dev = typeof Devices !== 'undefined' ? Devices.myDevice() : null;
      if (p.u !== u || (dev && p.d !== dev) || !(p.e > now()) || !NAMES[p.p]) return null;
      return p;
    } catch (e) { return null; }
  }
  function keepToken(u, tok) { if (tok) ls.set(LS.token(u), tok); else ls.del(LS.token(u)); }

  // ---------------------------------------------------------------- state
  let last = null;
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) {} });
  function cached() { const u = uid(); return u ? last || ls.get(LS.status(u)) : null; }
  /** The plan as last known on this device: name only (the server decides everything else). */
  function current() {
    const u = uid();
    if (!u) return 'basic';
    const t = tokenPlan(u);
    if (t) return t.p;
    const s = cached();
    return s && NAMES[s.plan] ? s.plan : 'basic';
  }
  const label = (p) => NAMES[p || current()] || 'Basic';

  async function sessionReady() {
    if (!uid() || typeof Devices === 'undefined') return false;
    if (Account.needsVerification()) return false;
    try { return (await Devices.ensure()) === 'ok'; } catch (e) { return false; }
  }
  /** Fresh numbers from the server (and a fresh offline token). */
  async function refresh() {
    const u = uid();
    if (!u || !(await sessionReady())) return cached();
    const s = await Account.call('planStatus', {});
    last = s;
    ls.set(LS.status(u), s);
    keepToken(u, s.token);
    emit();
    return s;
  }

  async function sha(text) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(d).slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  }
  const resetDay = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long' }); };

  // ---------------------------------------------------------------- before an action
  /**
   * Asks the server for one action (edit / scan / invoice / encrypted send / open). `ref` names the
   * document so the same one counts once a month. true = go ahead.
   */
  async function allow(action, ref) {
    if (!ACTIONS[action]) return false;
    if (!uid()) { await needAccount(action); return false; }
    if (Account.needsVerification()) { AccountUI.show('verify'); return false; }
    let st;
    try { st = await Account.keyState(); } catch (e) { st = 'offline'; }
    if (st !== 'ok' && st !== 'offline') { await AccountUI.route(); return false; }
    const u = uid();
    const r = ref ? await sha(action + '|' + ref) : null;
    try {
      if (!(await sessionReady())) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const res = await Account.call('useQuota', r ? { action, ref: r } : { action });
      keepToken(u, res.token);
      const s = cached();
      if (s && s.usage && s.usage[action]) { s.usage[action].used = res.used; s.usage[action].limit = res.limit; s.plan = res.plan; last = s; ls.set(LS.status(u), s); emit(); }
      return true;
    } catch (e) {
      const m = String(e.server || e.message || '');
      if (/^limit:/.test(m) || /limit:/.test(m)) { await limitReached(action); return false; }
      if (/no device session|device blocked|device removed/.test(m)) { await AccountUI.route(); return false; }
      // no connection: a paid plan carries on with its signed token (up to 7 days)
      if (tokenPlan(u)) return true;
      await UI.confirm('Ai nevoie de internet', 'Fără abonament, fiecare acțiune se confirmă cu serverul ACM Docs. Conectează-te la internet și încearcă din nou. Abonamentele funcționează și fără internet, până la 7 zile.', 'Am înțeles', 'Închide');
      return false;
    }
  }

  async function needAccount(action) {
    const P = (cached() && cached().plans) || FALLBACK.plans;
    const m = P.basic.month;
    const go = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'plan-ask');
      box.append(
        el('div', { class: 'plan-ico', html: svg('user') }),
        el('h2', { text: 'Creează un cont ACM Docs' }),
        el('p', { text: 'Ca să salvezi, ai nevoie de un cont. Durează un minut, iar documentele tale rămân criptate, doar ale tale.' }),
        el('div', { class: 'plan-incl' }, [
          el('b', { text: 'Fără abonament primești în fiecare lună:' }),
          ...Object.keys(ACTIONS).map((k) => el('div', { class: 'plan-li' + (k === action ? ' on' : '') }, [el('span', { class: 'n no-tr', text: String(m[k]) }), el('span', { text: ACTIONS[k].label })])),
        ]),
        el('div', { class: 'actions col' }, [
          el('button', { class: 'btn primary', type: 'button', text: 'Creează cont sau intră', onclick: () => close(true) }),
          el('button', { class: 'btn', type: 'button', text: 'Nu acum', onclick: () => close(false) }),
        ]),
      );
    });
    if (go) { Account.setSkipped(false); AccountUI.show('signin'); }
  }

  async function limitReached(action) {
    const s = cached() || {};
    const P = s.plans || FALLBACK.plans;
    const plan = s.plan || 'basic';
    const lim = (s.usage && s.usage[action] && s.usage[action].limit) || P[plan].month[action];
    const next = plan === 'basic' ? 'personal' : plan === 'personal' || plan === 'family' ? 'pro' : null;
    const go = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'plan-ask');
      box.append(
        el('div', { class: 'plan-ico warn', html: svg(ACTIONS[action].icon) }),
        el('h2', { text: 'Ai ajuns la limita lunii' }),
        el('p', {}, [el('span', { text: ACTIONS[action].label }), el('span', { class: 'no-tr', text: `: ${lim} / ${lim} · ${NAMES[plan]}` })]),
        el('p', { class: 'muted small' }, [el('span', { text: 'Limita se reînnoiește pe' }), el('span', { class: 'no-tr', text: ' ' + resetDay() + '.' })]),
        next ? el('div', { class: 'plan-up' }, [el('b', { class: 'no-tr', text: NAMES[next] }), el('span', { class: 'no-tr', text: ' · ' + P[next].month[action] + ' / ' }), el('span', { text: 'lună' })]) : null,
        el('div', { class: 'actions col' }, [
          el('button', { class: 'btn primary', type: 'button', text: next ? 'Vezi abonamentele' : 'Scrie-ne', onclick: () => close(next ? 'plans' : 'mail') }),
          el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
        ]),
      );
    });
    if (go === 'plans') return show();
    if (go === 'mail') Host.openExternal('mailto:mandrutaniel5@gmail.com?subject=' + encodeURIComponent('ACM Docs ' + NAMES[plan]));
  }

  // ---------------------------------------------------------------- the Subscription screen
  const money = (cents) => (cents / 100).toLocaleString(I18n.locale(), { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const size = (b) => (b >= GB ? (b / GB).toLocaleString(I18n.locale(), { maximumFractionDigits: b % GB ? 1 : 0 }) + ' GB' : Math.round(b / MB) + ' MB');
  const bar = (used, limit) => {
    const p = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    return el('div', { class: 'plan-bar' + (p >= 100 ? ' full' : p >= 80 ? ' high' : '') }, [el('span', { style: { width: p + '%' } })]);
  };
  function meter(icon, color, name, used, limit, fmt = String) {
    return el('div', { class: 'plan-meter' }, [
      el('span', { class: 'si ' + color, html: svg(icon) }),
      el('div', { class: 'pm-tx' }, [
        el('div', { class: 'pm-top' }, [el('b', { text: name }), el('span', { class: 'no-tr', text: `${fmt(used)} / ${fmt(limit)}` })]),
        bar(used, limit),
      ]),
    ]);
  }

  async function show() {
    if (!uid()) return needAccount(null);
    let s = cached();
    UI.busy(s ? null : 'Se încarcă…');
    try { s = await refresh(); } catch (e) { if (!s) { UI.busy(); return UI.toast(Account.say(e), { error: true }); } }
    UI.busy();
    let invites = [];
    try {
      const { F: f, db } = Account.internals();
      const snap = await f.firestore.getDocs(f.firestore.collection(db, 'accounts', uid(), 'invites'));
      invites = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {}
    const act = await UI.modal((box, close) => render(box, close, s, invites));
    if (!act) return;
    if (act.do === 'buy') return buy(act.plan, act.period, act.seats, s);
    if (act.do === 'change') return change(act.plan, act.period);
    if (act.do === 'manage') return portal();
    if (act.do === 'group') { await groupScreen(s); return show(); }
    if (act.do === 'invite') { await answerInvite(act.inv); return show(); }
    if (act.do === 'security') { await Security.show(); return show(); }
  }

  function render(box, close, s, invites) {
    box.classList.add('acm-ui', 'plans');
    const P = s.plans || FALLBACK.plans, PR = s.prices || FALLBACK.prices;
    let period = 'year';
    const head = el('div', { class: 'plan-head' }, [
      el('span', { class: 'plan-badge ' + s.plan, html: svg(s.plan === 'family' ? 'family' : s.plan === 'business' ? 'briefcase' : 'star') }),
      el('div', {}, [
        el('small', { class: 'muted', text: 'Planul tău' }),
        el('h2', { class: 'no-tr', text: NAMES[s.plan] || 'Basic' }),
        s.plan === 'basic' ? el('small', { class: 'muted', text: 'Fără abonament · pentru folosire ocazională' })
          : el('small', { class: 'muted' }, [
            el('span', { text: s.cancelAt ? 'Activ până pe' : s.source === 'group' ? 'Inclus în grup · până pe' : 'Se reînnoiește pe' }),
            el('span', { class: 'no-tr', text: ' ' + new Date(s.cancelAt || s.until).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }) }),
          ]),
      ]),
    ]);
    const usage = el('div', { class: 'list-card plan-usage' }, [
      ...Object.keys(ACTIONS).map((k) => meter(ACTIONS[k].icon, ACTIONS[k].color, ACTIONS[k].label, s.usage[k].used, s.usage[k].limit)),
      meter('cloud', 'blue', 'Cloud criptat', s.cloud.used, s.cloud.limit, size),
      meter('devices', 'gray', 'Dispozitive', s.devices.used, s.devices.limit),
    ]);
    const invBox = invites.length ? el('div', { class: 'list-card' }, invites.map((inv) => {
      const r = el('button', { class: 'srow', type: 'button' }, [
        el('span', { class: 'si green', html: svg('family') }),
        el('span', { class: 'stx' }, [el('b', { text: 'Invitație într-un abonament' }), el('small', { class: 'no-tr', text: `${NAMES[inv.plan] || ''} · @${inv.from}` })]),
        el('span', { class: 'chev', html: svg('right') }),
      ]);
      r.addEventListener('click', () => close({ do: 'invite', inv }));
      return r;
    })) : null;

    // the plans
    const cards = el('div', { class: 'plan-cards' });
    const seg = el('div', { class: 'plan-seg', role: 'group' });
    const segBtn = (v, t) => { const b = el('button', { type: 'button', text: t, class: v === period ? 'on' : '' }); b.addEventListener('click', () => { period = v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); }); return b; };
    seg.append(segBtn('month', 'Lunar'), segBtn('year', 'Anual · 2 luni incluse'));
    const ORDER = ['personal', 'pro', 'family', 'business'];
    const BLURB = {
      personal: 'Pentru tine, săptămânal',
      pro: 'Pentru lucru zilnic, fără griji',
      family: 'Până la 5 conturi, fiecare cu datele lui',
      business: 'Pentru echipe: câte conturi ai nevoie',
    };
    const feats = (p) => {
      const q = P[p];
      const lim = (n) => n >= 1000;
      const out = [];
      if (p === 'family') out.push(['family', 'Până la 5 conturi separate']);
      if (p === 'business') out.push(['briefcase', `De la ${q.minSeats} conturi, plătești pe cont`]);
      out.push(['devices', `${q.devices} dispozitive pe cont`]);
      out.push(['cloud', p === 'family' || p === 'business' ? `${size(q.cloud)} cloud criptat pe cont` : `${size(q.cloud)} cloud criptat`]);
      out.push(['edit', lim(q.month.docs) ? 'Documente, scanări și facturi fără limite practice' : `${q.month.docs} documente editate pe lună`]);
      if (!lim(q.month.docs)) out.push(['scan', `${q.month.scans} scanări pe lună`]);
      if (!lim(q.month.docs)) out.push(['receipt', `${q.month.invoices} facturi pe lună`]);
      out.push(['lockfile', lim(q.month.acmSend) ? 'Documente criptate fără limite practice' : `${q.month.acmSend} documente criptate trimise pe lună`]);
      return out;
    };
    const draw = () => {
      cards.innerHTML = '';
      for (const p of ORDER) {
        const mine = s.plan === p;
        const price = PR[p][period];
        const per = period === 'year' ? 'an' : 'lună';
        let seats = P.business.minSeats;
        const seatIn = p === 'business' ? el('input', { class: 'in seat-in no-tr', type: 'number', min: String(P.business.minSeats), max: String(P.business.maxSeats), value: String(seats), inputmode: 'numeric' }) : null;
        const total = p === 'business' ? el('small', { class: 'muted no-tr' }) : null;
        const upd = () => { if (total) total.textContent = `= ${money(price * seats)} / ${I18n.t(per)}`; };
        if (seatIn) seatIn.addEventListener('input', () => { seats = Math.max(P.business.minSeats, Math.min(P.business.maxSeats, parseInt(seatIn.value, 10) || P.business.minSeats)); upd(); });
        upd();
        const canChange = ['personal', 'pro'].includes(p) && ['personal', 'pro'].includes(s.plan) && s.source === 'stripe';
        const btn = el('button', { class: 'btn ' + (mine ? '' : 'primary'), type: 'button', disabled: mine && s.period === period ? true : !s.payments ? true : null,
          text: mine ? (s.period === period ? 'Planul tău' : period === 'year' ? 'Treci la anual' : 'Treci la lunar') : !s.payments ? 'În curând' : canChange ? 'Schimbă planul' : `Alege ${NAMES[p]}` });
        btn.addEventListener('click', () => close(canChange || mine ? { do: 'change', plan: p, period } : { do: 'buy', plan: p, period, seats }));
        cards.append(el('div', { class: 'plan-card' + (p === 'pro' ? ' best' : '') + (mine ? ' mine' : '') }, [
          p === 'pro' ? el('span', { class: 'plan-tag', text: 'Recomandat' }) : null,
          el('div', { class: 'pc-head' }, [el('b', { class: 'no-tr', text: NAMES[p] }), el('small', { class: 'muted', text: BLURB[p] })]),
          el('div', { class: 'pc-price' }, [el('span', { class: 'no-tr', text: money(price) }), el('small', { text: p === 'business' ? (period === 'year' ? '/ cont / an' : '/ cont / lună') : period === 'year' ? '/ an' : '/ lună' })]),
          seatIn ? el('label', { class: 'seat-row' }, [el('span', { text: 'Conturi' }), seatIn, total]) : null,
          el('ul', { class: 'pc-feats' }, feats(p).map(([ic, t]) => el('li', {}, [el('span', { html: svg(ic) }), el('span', { text: t })]))),
          btn,
        ]));
      }
      hydrateIcons(cards);
    };
    draw();

    const groupRow = s.group ? el('div', { class: 'list-card' }, [(() => {
      const r = el('button', { class: 'srow', type: 'button' }, [
        el('span', { class: 'si green', html: svg(s.group.plan === 'business' ? 'briefcase' : 'family') }),
        el('span', { class: 'stx' }, [el('b', { text: s.group.owner ? 'Conturile din abonament' : 'Faci parte dintr-un abonament' }), el('small', { class: 'no-tr', text: `${NAMES[s.group.plan]} · ${s.group.used} / ${s.group.seats}` })]),
        el('span', { class: 'chev', html: svg('right') }),
      ]);
      r.addEventListener('click', () => close({ do: 'group' }));
      return r;
    })()]) : null;

    box.append(
      head,
      invBox,
      el('h3', { class: 'plan-h', text: 'Luna aceasta' }),
      usage,
      el('p', { class: 'muted small' }, [el('span', { text: 'Limitele lunare se reînnoiesc pe' }), el('span', { class: 'no-tr', text: ' ' + resetDay() + '. ' }), el('span', { text: 'Același document salvat de mai multe ori se numără o singură dată.' })]),
      groupRow,
      el('h3', { class: 'plan-h', text: 'Abonamente' }),
      seg,
      cards,
      !s.payments ? el('div', { class: 'acm-note warn', html: `${svg('info')}<span>${escHtml(I18n.t('Plata abonamentelor va fi disponibilă în curând.'))}</span>` }) : null,
      el('div', { class: 'acm-note ok', html: `${svg('shield')}<span>${escHtml(I18n.t('Orice plan are aceeași securitate: criptare de la un capăt la altul, post-cuantică. Abonamentul mărește doar limitele, nu protecția.'))}</span>` }),
      el('div', { class: 'actions col' }, [
        s.manage ? el('button', { class: 'btn', type: 'button', html: svg('wallet') + '<span>' + escHtml(I18n.t('Plată, facturi și anulare')) + '</span>', onclick: () => close({ do: 'manage' }) }) : null,
        el('button', { class: 'btn', type: 'button', html: svg('shield') + '<span>' + escHtml(I18n.t('Cum îți protejăm datele')) + '</span>', onclick: () => close({ do: 'security' }) }),
        el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
      ]),
      el('p', { class: 'muted small plan-legal' }, [
        el('span', { text: 'Prețuri în euro, cu TVA inclus. Abonamentul se reînnoiește automat și îl poți anula oricând; rămâne activ până la sfârșitul perioadei plătite.' }), ' ',
        (() => { const a = el('a', { href: '#', text: 'Termeni' }); a.addEventListener('click', (e) => { e.preventDefault(); Host.openExternal('https://acmdocs.acmandrut.com/termeni'); }); return a; })(), ' · ',
        (() => { const a = el('a', { href: '#', text: 'Confidențialitate' }); a.addEventListener('click', (e) => { e.preventDefault(); Host.openExternal('https://acmdocs.acmandrut.com/confidentialitate'); }); return a; })(),
      ]),
    );
  }

  // ---------------------------------------------------------------- paying
  async function buy(plan, period, seats, s) {
    const P = s.plans || FALLBACK.plans, PR = s.prices || FALLBACK.prices;
    const qty = plan === 'business' ? seats : 1;
    const ok = await UI.modal((box, close) => {
      const chk = el('input', { type: 'checkbox', id: 'plan-consent' });
      const go = el('button', { class: 'btn primary', type: 'button', text: 'Continuă la plată', disabled: true });
      chk.addEventListener('change', () => { go.disabled = !chk.checked; });
      go.addEventListener('click', () => close(true));
      box.classList.add('acm-ui', 'plan-ask');
      box.append(
        el('div', { class: 'plan-ico', html: svg('star') }),
        el('h2', { class: 'no-tr', text: 'ACM Docs ' + NAMES[plan] }),
        el('div', { class: 'plan-sum' }, [
          el('b', { class: 'no-tr', text: money(PR[plan][period] * qty) }),
          el('span', { text: period === 'year' ? '/ an' : '/ lună' }),
          plan === 'business' ? el('small', { class: 'muted' }, [el('span', { class: 'no-tr', text: qty + ' × ' + money(PR[plan][period]) + ' · ' }), el('span', { text: 'conturi' })]) : null,
        ]),
        el('p', { class: 'muted small', text: 'Plata se face pe pagina securizată Stripe, în browser. ACM Docs nu vede și nu păstrează datele cardului.' }),
        el('label', { class: 'chk' }, [chk, el('span', { text: 'Cer începerea imediată a abonamentului. Știu că, dacă renunț în primele 14 zile, primesc banii înapoi mai puțin partea deja folosită, și că abonamentul se reînnoiește automat până îl anulez.' })]),
        el('div', { class: 'actions col' }, [go, el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(false) })]),
      );
      void P;
    });
    if (!ok) return show();
    UI.busy('Se deschide plata…');
    try {
      const r = await Account.call('billingCheckout', { plan, period, seats: qty, consent: true });
      UI.busy();
      Host.openExternal(r.url);
      waitForPayment();
    } catch (e) {
      UI.busy();
      const m = String(e.server || e.message || '');
      UI.toast(/subscription exists/.test(m) ? I18n.t('Ai deja un abonament. Îl poți schimba din ecranul Abonament.') : /group exists/.test(m) ? I18n.t('Ai deja un abonament de grup.') : /payments not active/.test(m) ? I18n.t('Plata abonamentelor va fi disponibilă în curând.') : Account.say(e), { error: true, duration: 7000 });
    }
  }
  /** After the browser: the plan appears as soon as Stripe confirms it (checked when the app comes back). */
  function waitForPayment() {
    const before = current();
    let tries = 0;
    const check = async () => {
      if (document.hidden) return;
      tries++;
      try {
        const s = await refresh();
        if (s && s.plan !== 'basic' && s.plan !== before) { stop(); UI.toast(I18n.t('Abonamentul este activ. Mulțumim!'), { duration: 6000 }); return; }
      } catch (e) {}
      if (tries > 40) stop();
    };
    const timer = setInterval(check, 4000);
    const onVis = () => check();
    const stop = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
    document.addEventListener('visibilitychange', onVis);
  }
  async function change(plan, period) {
    const ok = await UI.confirm(I18n.t('Schimbi abonamentul?'), I18n.t('Diferența de preț se calculează automat pentru zilele rămase și apare pe următoarea factură.'), I18n.t('Schimbă'));
    if (!ok) return show();
    UI.busy('Se schimbă…');
    try { await Account.call('billingChange', { plan, period }); await refresh(); UI.busy(); UI.toast(I18n.t('Abonamentul a fost schimbat.')); }
    catch (e) { UI.busy(); UI.toast(Account.say(e), { error: true }); }
    return show();
  }
  async function portal() {
    UI.busy('Se deschide…');
    try { const r = await Account.call('billingPortal', {}); UI.busy(); Host.openExternal(r.url); waitForPayment(); }
    catch (e) { UI.busy(); UI.toast(Account.say(e), { error: true }); }
  }

  // ---------------------------------------------------------------- Family / Business
  async function groupScreen(s) {
    UI.busy('Se încarcă…');
    let g;
    try { g = (await Account.call('groupInfo', {})).group; } catch (e) { UI.busy(); return UI.toast(Account.say(e), { error: true }); }
    UI.busy();
    if (!g) return;
    const act = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'plans');
      const person = (p, right) => el('div', { class: 'srow' }, [el('span', { class: 'pf-av sm', text: ((p.name || p.handle || '?')[0] || '?').toUpperCase() }), el('span', { class: 'stx' }, [el('b', { class: 'no-tr', text: p.name || '@' + p.handle }), el('small', { class: 'no-tr', text: '@' + p.handle })]), right || null]);
      if (!g.owner) {
        box.append(
          el('h2', { class: 'no-tr', text: 'ACM Docs ' + NAMES[g.plan] }),
          el('p', { class: 'muted small', text: 'Abonamentul este plătit de:' }),
          el('div', { class: 'list-card' }, [person(g.by)]),
          el('p', { class: 'muted small', text: 'Datele tale rămân doar ale tale: cine plătește abonamentul nu vede documentele, facturile sau contactele tale.' }),
          el('div', { class: 'actions col' }, [
            el('button', { class: 'btn danger-text', type: 'button', text: 'Ieși din abonament', onclick: () => close({ do: 'leave' }) }),
            el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) }),
          ]),
        );
        return;
      }
      const inp = el('input', { class: 'in no-tr', placeholder: '@nume', autocapitalize: 'none', autocomplete: 'off' });
      const err = el('p', { class: 'auth-err', role: 'alert' });
      const add = el('button', { class: 'btn primary', type: 'button', text: 'Invită' });
      add.addEventListener('click', () => { const h = inp.value.trim().replace(/^@/, '').toLowerCase(); if (!/^[a-z0-9_]{3,20}$/.test(h)) { err.textContent = I18n.t('Scrie @numele exact al contului.'); err.classList.add('on'); return; } close({ do: 'invite', handle: h }); });
      const used = 1 + g.members.length + g.pending.length;
      box.append(
        el('h2', { class: 'no-tr', text: 'ACM Docs ' + NAMES[g.plan] }),
        el('p', { class: 'muted small' }, [el('span', { text: 'Conturi folosite' }), el('span', { class: 'no-tr', text: `: ${used} / ${g.seats}` })]),
        el('div', { class: 'list-card' }, [
          person({ name: I18n.t('Tu'), handle: Account.handle() || '' }, el('small', { class: 'muted', text: 'Plătitor' })),
          ...g.members.map((m) => person(m, el('button', { class: 'btn sm', type: 'button', text: 'Scoate', onclick: () => close({ do: 'remove', who: m }) }))),
          ...g.pending.map((m) => person(m, el('button', { class: 'btn sm', type: 'button', text: 'Anulează invitația', onclick: () => close({ do: 'remove', who: m }) }))),
        ]),
        used < g.seats ? el('div', { class: 'plan-invite' }, [inp, add]) : el('p', { class: 'muted small', text: g.plan === 'business' ? 'Toate conturile sunt ocupate. Adaugă conturi mai jos.' : 'Toate cele 5 conturi sunt ocupate.' }),
        err,
        el('p', { class: 'muted small', text: 'Fiecare persoană își păstrează contul, cheile și datele. Tu plătești abonamentul, dar nu le poți vedea documentele.' }),
        g.plan === 'business' ? el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', html: svg('plus') + '<span>' + escHtml(I18n.t('Schimbă numărul de conturi')) + '</span>', onclick: () => close({ do: 'seats' }) })]) : null,
        el('div', { class: 'actions col' }, [el('button', { class: 'btn', type: 'button', text: 'Închide', onclick: () => close(null) })]),
      );
    });
    if (!act) return;
    try {
      if (act.do === 'invite') { UI.busy('Se trimite…'); await Account.call('groupInvite', { handle: act.handle }); UI.busy(); UI.toast(I18n.t('Invitația a fost trimisă. Persoana o vede în Setări › Abonament.')); }
      if (act.do === 'remove') {
        if (!(await UI.confirm(I18n.t('Scoți contul din abonament?'), I18n.t('Contul rămâne al persoanei, cu toate datele, dar revine la Basic.'), I18n.t('Scoate')))) return groupScreen(s);
        UI.busy('Se scoate…'); await Account.call('groupRemove', { uid: act.who.uid }); UI.busy();
      }
      if (act.do === 'leave') {
        if (!(await UI.confirm(I18n.t('Ieși din abonament?'), I18n.t('Contul și datele tale rămân, dar treci la Basic.'), I18n.t('Ieși')))) return groupScreen(s);
        UI.busy('Se iese…'); await Account.call('groupLeave', {}); UI.busy(); await refresh(); return;
      }
      if (act.do === 'seats') {
        const n = await askSeats(g);
        if (n) { UI.busy('Se schimbă…'); await Account.call('groupSeats', { seats: n }); UI.busy(); UI.toast(I18n.t('Numărul de conturi a fost schimbat.')); }
      }
    } catch (e) {
      UI.busy();
      const m = String(e.server || e.message || '');
      UI.toast(/no such account/.test(m) ? I18n.t('Nu există niciun cont cu acest @nume.') : /seats/.test(m) ? I18n.t('Nu mai sunt conturi libere în abonament.') : /already a member/.test(m) ? I18n.t('Persoana face deja parte din abonament.') : /remove accounts first/.test(m) ? I18n.t('Scoate întâi conturi din abonament.') : Account.say(e), { error: true, duration: 6000 });
    }
    return groupScreen(s);
  }
  function askSeats(g) {
    return UI.modal((box, close) => {
      const inp = el('input', { class: 'in no-tr', type: 'number', min: '3', max: '500', value: String(g.seats), inputmode: 'numeric' });
      box.classList.add('acm-ui');
      box.append(
        el('h2', { text: 'Câte conturi?' }),
        el('p', { class: 'muted small', text: 'Diferența de preț se calculează automat pentru zilele rămase.' }),
        inp,
        el('div', { class: 'actions' }, [el('button', { class: 'btn', type: 'button', text: 'Anulează', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'Salvează', onclick: () => { const n = parseInt(inp.value, 10); if (n >= 3 && n <= 500) close(n); } })]),
      );
    });
  }
  async function answerInvite(inv) {
    const yes = await UI.modal((box, close) => {
      box.classList.add('acm-ui', 'plan-ask');
      box.append(
        el('div', { class: 'plan-ico', html: svg('family') }),
        el('h2', { text: 'Invitație într-un abonament' }),
        el('p', {}, [el('b', { class: 'no-tr', text: '@' + inv.from }), el('span', { text: ' te invită în abonamentul ' }), el('b', { class: 'no-tr', text: NAMES[inv.plan] || '' }), el('span', { text: '.' })]),
        el('p', { class: 'muted small', text: 'Primești limitele abonamentului. Contul, cheile și datele tale rămân doar ale tale: cine plătește nu le poate vedea.' }),
        el('div', { class: 'actions col' }, [
          el('button', { class: 'btn primary', type: 'button', text: 'Acceptă', onclick: () => close(true) }),
          el('button', { class: 'btn', type: 'button', text: 'Refuză', onclick: () => close(false) }),
          el('button', { class: 'btn', type: 'button', text: 'Mai târziu', onclick: () => close(null) }),
        ]),
      );
    });
    if (yes === null) return;
    UI.busy(yes ? 'Se acceptă…' : 'Se refuză…');
    try { await Account.call('groupAnswer', { gid: inv.id, accept: yes }); await refresh(); UI.busy(); if (yes) UI.toast(I18n.t('Bun venit în abonament!')); }
    catch (e) { UI.busy(); UI.toast(Account.say(e), { error: true }); }
  }

  /** Settings row text: "Pro · se reînnoiește…" or "Basic · 2 / 3 documente…" */
  function summary() {
    const s = cached();
    const p = s ? s.plan : current();
    return NAMES[p] + (p === 'basic' ? ' · ' + I18n.t('fără abonament') : '');
  }

  // refreshed quietly when the app starts and comes back to the front
  function start() {
    const go = () => { if (uid() && !document.hidden) refresh().catch(() => {}); };
    setTimeout(go, 4000);
    document.addEventListener('visibilitychange', go);
  }
  if (typeof Account !== 'undefined' && Account.onChange) Account.onChange(() => { last = null; });

  return { allow, show, refresh, current, label, summary, start, needAccount, onChange: (f) => listeners.push(f), ACTIONS, NAMES };
})();
