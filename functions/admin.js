// The control panel's API: one callable function ("admin") with one operation per request.
//
// Who gets in: only an account that carries the "admin" claim (set from GitHub, workflow Admin, with
// the service account; it cannot be given from any app or from the panel itself), signed in with its
// password AND its authenticator app (second factor), within the last 12 hours. Everything the panel
// changes is written to adminLog.
//
// What the panel never sees: documents, invoices, files, names of files, contacts or keys. They are
// encrypted on the devices and the server cannot read them. The panel works with accounts, plans,
// counters, devices (ids and dates), sign-in addresses (90 days), reports and settings.

const ADMIN_ORIGINS = ['https://acm-docs-52280.web.app', 'https://acm-docs-52280.firebaseapp.com', 'https://acmdocs.acmandrut.com'];
const SESSION_MS = 12 * 3600 * 1000;

export function makeAdmin(d) {
  const { db, fail, onCall, getAuth, FieldValue, Timestamp, Stripe, PLANS, ACTIONS, FEATURES, REASONS, DAY, monthOf } = d;
  const emulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : null);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const isUid = (u) => typeof u === 'string' && /^[A-Za-z0-9]{10,64}$/.test(u);

  function needAdmin(req) {
    const t = req.auth && req.auth.token;
    if (!t || t.admin !== true) fail('permission-denied', 'not allowed');
    if (!emulator) {
      if (!t.firebase || t.firebase.sign_in_provider !== 'password') fail('permission-denied', 'not allowed');
      // the authenticator app is required for every panel session
      if (t.firebase.sign_in_second_factor !== 'totp') fail('permission-denied', 'admin needs totp');
      if (t.auth_time * 1000 < Date.now() - SESSION_MS) fail('unauthenticated', 'admin sign in again');
      const origin = req.rawRequest && req.rawRequest.headers && req.rawRequest.headers.origin;
      if (origin && !ADMIN_ORIGINS.includes(origin)) fail('permission-denied', 'not allowed');
    }
    return { uid: req.auth.uid, email: t.email || '' };
  }
  async function log(req, who, op, target, detail) {
    await db.collection('adminLog').add({
      admin: who.uid, email: who.email, op, target: target || null, detail: detail || null,
      ip: d.clientAddress(req), at: FieldValue.serverTimestamp(), expires: Timestamp.fromMillis(Date.now() + 730 * DAY),
    });
  }

  // ---------------------------------------------------------------- accounts
  async function profileOf(uid) {
    const p = (await db.collection('users').doc(uid).get()).data() || {};
    return { handle: p.handle || null, name: p.name || null };
  }
  function userRow(u, extra = {}) {
    return {
      uid: u.uid, email: u.email || null, verified: !!u.emailVerified, disabled: !!u.disabled,
      created: Date.parse(u.metadata.creationTime) || null, lastSignIn: Date.parse(u.metadata.lastSignInTime) || null,
      admin: !!(u.customClaims && u.customClaims.admin), ...extra,
    };
  }
  async function allUsers(max = 20000) {
    const out = [];
    let page;
    do {
      const r = await getAuth().listUsers(1000, page);
      out.push(...r.users);
      page = r.pageToken;
    } while (page && out.length < max);
    return out;
  }
  async function findUid(q) {
    q = str(q, 200);
    if (!q) return null;
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(q)) { try { return (await getAuth().getUserByEmail(q.toLowerCase())).uid; } catch (e) { return null; } }
    const h = q.toLowerCase().replace(/^@/, '');
    if (/^[a-z0-9_]{3,20}$/.test(h)) { const u = await db.collection('usernames').doc(h).get(); if (u.exists) return u.data().uid; }
    if (isUid(q)) { try { return (await getAuth().getUser(q)).uid; } catch (e) { return null; } }
    return null;
  }
  async function planOf(uid) {
    const m = (await d.metaOf(uid, 'plan').get()).data();
    return m ? m.plan : 'basic';
  }

  async function overview() {
    const users = await allUsers();
    const now = Date.now();
    const byPlan = { basic: 0, personal: 0, pro: 0, family: 0, business: 0 };
    const metas = await db.collectionGroup('meta').get();
    const plan = {}, cloud = {};
    metas.forEach((m) => {
      const uid = m.ref.parent.parent.id;
      if (m.id === 'plan') plan[uid] = m.data();
      if (m.id === 'cloud') cloud[uid] = m.data();
    });
    const real = users.filter((u) => !(u.customClaims && u.customClaims.admin));
    for (const u of real) byPlan[(plan[u.uid] && plan[u.uid].plan) || 'basic']++;
    // anomalies: more encrypted data than the plan allows, nearly full, many reports, suspended
    const anomalies = [];
    for (const [uid, c] of Object.entries(cloud)) {
      const p = (plan[uid] && plan[uid].plan) || 'basic';
      const planLimit = PLANS[p] ? PLANS[p].cloud : PLANS.basic.cloud;
      if ((c.used || 0) > Math.max(c.limit || 0, planLimit)) anomalies.push({ uid, kind: 'cloud-over', used: c.used, limit: Math.max(c.limit || 0, planLimit), plan: p });
      else if ((c.used || 0) > 0.9 * (c.limit || planLimit)) anomalies.push({ uid, kind: 'cloud-high', used: c.used, limit: c.limit || planLimit, plan: p });
    }
    const open = await db.collection('reports').where('status', '==', 'open').get();
    const against = {};
    open.forEach((r) => { against[r.data().target] = (against[r.data().target] || 0) + 1; });
    for (const [uid, n] of Object.entries(against)) if (n >= 3) anomalies.push({ uid, kind: 'reports', count: n });
    for (const u of real) if (u.disabled) anomalies.push({ uid: u.uid, kind: 'suspended' });
    const byUid = Object.fromEntries(users.map((u) => [u.uid, u]));
    for (const a of anomalies) {
      const u = byUid[a.uid];
      a.email = u ? u.email || null : null;
      a.handle = (await profileOf(a.uid)).handle;
    }
    return {
      accounts: real.length,
      new7: real.filter((u) => Date.parse(u.metadata.creationTime) > now - 7 * DAY).length,
      new30: real.filter((u) => Date.parse(u.metadata.creationTime) > now - 30 * DAY).length,
      active30: real.filter((u) => Date.parse(u.metadata.lastRefreshTime || u.metadata.lastSignInTime) > now - 30 * DAY).length,
      byPlan, anomalies: anomalies.slice(0, 200), openReports: open.size,
      switches: await d.switches(), stripe: await stripeStatus(),
    };
  }

  async function search(q) {
    q = str(q, 200);
    if (!q) {
      const users = (await allUsers(5000)).filter((u) => !(u.customClaims && u.customClaims.admin));
      users.sort((a, b) => Date.parse(b.metadata.creationTime) - Date.parse(a.metadata.creationTime));
      return Promise.all(users.slice(0, 50).map(async (u) => userRow(u, { ...(await profileOf(u.uid)), plan: await planOf(u.uid) })));
    }
    const uid = await findUid(q);
    if (!uid) return [];
    const u = await getAuth().getUser(uid);
    return [userRow(u, { ...(await profileOf(uid)), plan: await planOf(uid) })];
  }

  async function account(uid) {
    if (!isUid(uid)) fail('invalid-argument', 'uid');
    const u = await getAuth().getUser(uid).catch(() => null);
    if (!u) fail('not-found', 'no such account');
    const [prof, eff, billing, cloud, usage, devs, priv, signins, reportsOn, reportsBy, sec] = await Promise.all([
      profileOf(uid), d.effective(uid), d.billingOf(uid).get(), d.metaOf(uid, 'cloud').get(),
      db.collection('accounts').doc(uid).collection('usage').doc(monthOf()).get(),
      d.devicesOf(uid).get(), d.privOf(uid).get(),
      d.signinsOf(uid).orderBy('at', 'desc').limit(100).get(),
      db.collection('reports').where('target', '==', uid).get(),
      db.collection('reports').where('from', '==', uid).get(),
      d.metaOf(uid, 'security').get(),
    ]);
    const b = billing.data() || {};
    const last = priv.data() || {};
    const us = usage.data() || {};
    const mfa = (u.multiFactor && u.multiFactor.enrolledFactors) || [];
    return {
      user: userRow(u, prof),
      plan: { plan: eff.plan, until: eff.until, source: eff.source, group: eff.group, cancelAt: eff.cancelAt, period: eff.period },
      billing: { source: b.source || null, plan: b.plan || null, until: b.until || null, status: b.status || null, customer: b.customer || null, sub: b.sub || null, suspended: b.suspended || null, note: b.note || null },
      cloud: cloud.data() || { used: 0, limit: eff.cloud },
      usage: Object.fromEntries(ACTIONS.map((a) => [a, { used: us[a] || 0, limit: eff.month[a] }])),
      security: { emailCode: (sec.data() || {}).emailCode !== false, totp: mfa.some((f) => f.factorId === 'totp') },
      devices: devs.docs.map((x) => {
        const v = x.data();
        return { id: x.id, role: v.role, status: v.status, via: v.via, created: ms(v.created), lastSeen: ms(v.lastSeen), ip: (last[x.id] || {}).ip || null, agent: (last[x.id] || {}).agent || null };
      }).sort((x, y) => (y.lastSeen || 0) - (x.lastSeen || 0)),
      signins: signins.docs.map((x) => { const v = x.data(); return { kind: v.kind, ip: v.ip, agent: v.agent, dev: v.dev, at: ms(v.at) }; }),
      reportsOn: reportsOn.docs.map((x) => reportRow(x)),
      reportsBy: reportsBy.size,
    };
  }

  /** A plan given by hand (family, friends, partners): Personal or Pro for a number of days; Basic takes it away. */
  async function setPlan(uid, plan, days, note, force) {
    if (!isUid(uid)) fail('invalid-argument', 'uid');
    if (!['basic', 'personal', 'pro'].includes(plan)) fail('invalid-argument', 'plan');
    days = Number(days);
    if (plan !== 'basic' && (!Number.isFinite(days) || days < 1 || days > 3650)) fail('invalid-argument', 'days');
    const ref = d.billingOf(uid);
    const cur = (await ref.get()).data() || {};
    if (cur.source === 'stripe' && (cur.until || 0) > Date.now() && !force) fail('failed-precondition', 'pays through stripe');
    if (plan === 'basic') await ref.set({ plan: FieldValue.delete(), until: FieldValue.delete(), source: FieldValue.delete(), note: FieldValue.delete() }, { merge: true });
    else await ref.set({ plan, until: Date.now() + days * DAY, source: 'manual', note: str(note, 200) || null }, { merge: true });
    await d.refresh(uid);
    return d.effective(uid);
  }

  /** Suspends an account: no sign-in, no session, no action, until it is lifted. Its data is kept. */
  async function suspend(uid, on, reason) {
    if (!isUid(uid)) fail('invalid-argument', 'uid');
    const u = await getAuth().getUser(uid).catch(() => null);
    if (!u) fail('not-found', 'no such account');
    if (u.customClaims && u.customClaims.admin) fail('failed-precondition', 'admin account');
    if (on) {
      await d.billingOf(uid).set({ suspended: { at: Date.now(), reason: str(reason, 300) || null } }, { merge: true });
      await getAuth().updateUser(uid, { disabled: true });
      await getAuth().revokeRefreshTokens(uid);
    } else {
      await d.billingOf(uid).set({ suspended: FieldValue.delete() }, { merge: true });
      await getAuth().updateUser(uid, { disabled: false });
    }
    return { suspended: !!on };
  }

  /** Blocks one device of an account for good (it signs out and forgets the keys, as when the owner blocks it). */
  async function blockDevice(uid, dev) {
    if (!isUid(uid) || typeof dev !== 'string' || !/^[0-9a-f]{32}$/.test(dev)) fail('invalid-argument', 'device');
    const ref = d.devicesOf(uid).doc(dev);
    const s = await ref.get();
    if (!s.exists) fail('not-found', 'no such device');
    await ref.update({ status: 'blocked', blockedAt: FieldValue.serverTimestamp(), blockedBy: 'support' });
    await d.event(uid, { type: 'blocked', dev, by: 'support' });
    return { ok: true };
  }

  // ---------------------------------------------------------------- kill switches
  async function setSwitches(v) {
    const off = {};
    for (const f of FEATURES) if (v.off && v.off[f] === true) off[f] = true;
    const doc = { off, all: v.all === true, msg: str(v.msg, 300), at: FieldValue.serverTimestamp() };
    await db.collection('server').doc('switches').set(doc);
    d.resetSwitches();
    return d.switches();
  }

  // ---------------------------------------------------------------- reports
  function reportRow(x) {
    const v = x.data();
    return { id: x.id, from: v.from, target: v.target, handle: v.handle, reason: v.reason, details: v.details, status: v.status, note: v.note || null, at: ms(v.at), resolvedAt: ms(v.resolvedAt) };
  }
  async function reports(status) {
    const st = ['open', 'resolved', 'dismissed'].includes(status) ? status : 'open';
    const qs = await db.collection('reports').where('status', '==', st).limit(300).get();
    const rows = qs.docs.map(reportRow).sort((a, b) => (b.at || 0) - (a.at || 0));
    for (const r of rows) r.fromHandle = (await profileOf(r.from)).handle;
    return rows;
  }
  async function resolveReport(id, status, note) {
    if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) fail('invalid-argument', 'id');
    if (!['open', 'resolved', 'dismissed'].includes(status)) fail('invalid-argument', 'status');
    await db.collection('reports').doc(id).update({ status, note: str(note, 500) || null, resolvedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }

  // ---------------------------------------------------------------- promotions
  function cleanPromo(v) {
    const kind = v.kind === 'trial' ? 'trial' : 'discount';
    const plans = (Array.isArray(v.plans) ? v.plans : []).filter((p) => ['personal', 'pro', 'family', 'business'].includes(p));
    const periods = (Array.isArray(v.periods) ? v.periods : []).filter((p) => ['month', 'year'].includes(p));
    if (!plans.length || !periods.length) fail('invalid-argument', 'plans');
    const p = {
      kind, title: str(v.title, 60), plans, periods, active: v.active === true, newOnly: v.newOnly !== false,
      start: Number(v.start) || Date.now(), end: Number(v.end) || null, maxUses: Math.max(0, Math.floor(Number(v.maxUses) || 0)),
    };
    if (!p.title) fail('invalid-argument', 'title');
    if (p.end && p.end <= p.start) fail('invalid-argument', 'dates');
    if (kind === 'discount') {
      p.percent = Math.floor(Number(v.percent));
      if (!(p.percent >= 1 && p.percent <= 100)) fail('invalid-argument', 'percent');
      p.months = Math.floor(Number(v.months) || 0); // 0 = first payment, N = first N months, -1 = always
      if (p.months < -1 || p.months > 36) fail('invalid-argument', 'months');
      p.trialDays = 0;
    } else {
      p.trialDays = Math.floor(Number(v.trialDays));
      if (!(p.trialDays >= 1 && p.trialDays <= 90)) fail('invalid-argument', 'trialDays');
      p.percent = 0; p.months = 0;
    }
    return p;
  }
  async function promos() {
    const qs = await db.collection('promos').get();
    return qs.docs.map((x) => ({ id: x.id, ...x.data(), created: ms(x.data().created) })).sort((a, b) => (b.created || 0) - (a.created || 0));
  }
  async function savePromo(v) {
    const p = cleanPromo(v || {});
    const id = typeof v.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(v.id) ? v.id : null;
    if (id) {
      const cur = await db.collection('promos').doc(id).get();
      if (!cur.exists) fail('not-found', 'promo');
      // a discount that changed needs a new Stripe coupon
      const c = cur.data();
      const reset = c.percent !== p.percent || c.months !== p.months ? { coupon_test: FieldValue.delete(), coupon_live: FieldValue.delete() } : {};
      await cur.ref.update({ ...p, ...reset });
    } else {
      await db.collection('promos').add({ ...p, used: 0, created: FieldValue.serverTimestamp() });
    }
    d.resetPromos();
    return promos();
  }

  // ---------------------------------------------------------------- Stripe
  async function stripeStatus() {
    const s = (await db.collection('server').doc('secrets').get()).data() || {};
    const c = await d.stripeConf();
    return {
      active: !!c.key, source: c.source, mode: c.mode, tax: c.tax,
      keyEnd: c.key ? c.key.slice(0, 8) + '…' + c.key.slice(-4) : null,
      webhook: c.hooks.length > 0, webhookId: s.webhookId || null, account: s.account || null, setAt: ms(s.setAt),
    };
  }
  const HOOK_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed'];
  /** Checks a Stripe key, creates the webhook for it and keeps both where only the server can read them. */
  async function stripeSet(key, tax) {
    key = str(key, 300);
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{20,}$/.test(key)) fail('invalid-argument', 'stripe key');
    const st = new Stripe(key);
    let acct = null;
    try { acct = await st.accounts.retrieve(); } catch (e) {
      try { await st.balance.retrieve(); } catch (e2) { fail('invalid-argument', 'stripe key refused: ' + (e2.message || '').slice(0, 120)); }
    }
    const url = `https://europe-west1-acm-docs-52280.cloudfunctions.net/stripeWebhook`;
    const cur = (await db.collection('server').doc('secrets').get()).data() || {};
    // one endpoint for ACM Docs: an older one (same key or another) is replaced
    try {
      const list = await st.webhookEndpoints.list({ limit: 100 });
      for (const w of list.data) if (w.url === url || w.id === cur.webhookId) await st.webhookEndpoints.del(w.id);
    } catch (e) { fail('failed-precondition', 'stripe webhooks: ' + (e.message || '').slice(0, 120)); }
    const hook = await st.webhookEndpoints.create({ url, enabled_events: HOOK_EVENTS, description: 'ACM Docs (set from the control panel)' });
    await db.collection('server').doc('secrets').set({
      stripeKey: key, webhookSecret: hook.secret, webhookId: hook.id, tax: tax === true,
      account: acct ? { id: acct.id, name: (acct.settings && acct.settings.dashboard && acct.settings.dashboard.display_name) || acct.business_profile?.name || null, country: acct.country || null } : null,
      setAt: FieldValue.serverTimestamp(),
    });
    d.resetStripe();
    return stripeStatus();
  }
  async function stripeTax(on) {
    const ref = db.collection('server').doc('secrets');
    if (!(await ref.get()).exists) fail('failed-precondition', 'no stripe key from the panel');
    await ref.update({ tax: on === true });
    d.resetStripe();
    return stripeStatus();
  }
  async function stripeClear() {
    const ref = db.collection('server').doc('secrets');
    const s = (await ref.get()).data() || {};
    if (s.stripeKey && s.webhookId) { try { await new Stripe(s.stripeKey).webhookEndpoints.del(s.webhookId); } catch (e) { /* already gone */ } }
    await ref.delete();
    d.resetStripe();
    return stripeStatus();
  }

  // ---------------------------------------------------------------- the callable
  const WRITE = new Set(['setPlan', 'suspend', 'blockDevice', 'switches.set', 'resolveReport', 'savePromo', 'deletePromo', 'stripeSet', 'stripeTax', 'stripeClear']);
  return onCall({ cors: emulator ? true : ADMIN_ORIGINS, memory: '512MiB', timeoutSeconds: 120 }, async (req) => {
    const who = needAdmin(req);
    const v = req.data || {};
    const op = String(v.op || '');
    let out;
    switch (op) {
      case 'whoami': out = { uid: who.uid, email: who.email }; break;
      case 'overview': out = await overview(); break;
      case 'search': out = await search(v.q); break;
      case 'account': out = await account(v.uid); break;
      case 'setPlan': out = await setPlan(v.uid, v.plan, v.days, v.note, v.force === true); break;
      case 'suspend': out = await suspend(v.uid, v.on === true, v.reason); break;
      case 'blockDevice': out = await blockDevice(v.uid, v.dev); break;
      case 'switches': out = await d.switches(); break;
      case 'switches.set': out = await setSwitches(v); break;
      case 'reports': out = await reports(v.status); break;
      case 'resolveReport': out = await resolveReport(v.id, v.status, v.note); break;
      case 'promos': out = await promos(); break;
      case 'savePromo': out = await savePromo(v.promo || {}); break;
      case 'deletePromo':
        if (typeof v.id !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(v.id)) fail('invalid-argument', 'id');
        await db.collection('promos').doc(v.id).delete(); d.resetPromos(); out = await promos(); break;
      case 'stripe': out = await stripeStatus(); break;
      case 'stripeSet': out = await stripeSet(v.key, v.tax === true); break;
      case 'stripeTax': out = await stripeTax(v.on === true); break;
      case 'stripeClear': out = await stripeClear(); break;
      case 'log': {
        const qs = await db.collection('adminLog').orderBy('at', 'desc').limit(200).get();
        out = qs.docs.map((x) => { const l = x.data(); return { op: l.op, target: l.target, detail: l.detail, email: l.email, ip: l.ip, at: ms(l.at) }; });
        break;
      }
      case 'meta': out = { features: FEATURES, reasons: REASONS, plans: PLANS }; break;
      default: fail('invalid-argument', 'op');
    }
    if (WRITE.has(op)) {
      // the log never carries a key: only which operation, on what
      const detail = op === 'setPlan' ? `${v.plan} ${v.days || ''}d ${str(v.note, 80)}`.trim()
        : op === 'suspend' ? (v.on ? 'on: ' + str(v.reason, 120) : 'off')
          : op === 'switches.set' ? JSON.stringify({ all: v.all === true, off: Object.keys(v.off || {}).filter((k) => v.off[k] === true) })
            : op === 'resolveReport' ? v.status : op === 'stripeTax' ? String(v.on === true)
              : op === 'savePromo' ? str((v.promo || {}).title, 60) : null;
      await log(req, who, op, v.uid || v.id || (v.promo && v.promo.id) || null, detail);
    }
    return out;
  });
}
