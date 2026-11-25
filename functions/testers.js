// Testers before the launch: accounts marked from the control panel see a floating button in the app that sends a
// report (a screenshot, a category, a description and what the app knows about itself) straight to the panel.
//   testers/{uid}       — the mark (the account reads only its own; only the server writes)
//   bugReports/{id}     — the reports (only the server reads and writes)
//   storage bugshots/{id}.jpg — the screenshots (only the server)
export const BUG_CATS = {
  visual: ['layout', 'text', 'colors', 'animation', 'other'],
  technical: ['broken', 'crash', 'slow', 'data', 'sync', 'other'],
  idea: ['idea'],
};
export const BUG_STATUS = ['new', 'working', 'fixed', 'wontfix'];
const SEV = ['low', 'medium', 'high'];
const MAX_SHOT = 3 * 1048576;

export function makeTesters({ db, fail, onCall, needDevice, rateLimit, FieldValue, getStorage, BUCKET, randomBytes, DAY }) {
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const bugReport = onCall({ memory: '512MiB' }, async (req) => {
    const { uid } = await needDevice(req);
    const t = await db.collection('testers').doc(uid).get();
    if (!t.exists || t.data().active === false) fail('permission-denied', 'not a tester');
    await rateLimit(req, 'bug|' + uid, 80, DAY, true);
    const v = req.data || {};
    if (!BUG_CATS[v.cat] || !BUG_CATS[v.cat].includes(v.sub)) fail('invalid-argument', 'category');
    const text = s(v.text, 4000);
    if (text.length < 3) fail('invalid-argument', 'text');
    const m = v.meta && typeof v.meta === 'object' ? v.meta : {};
    const meta = {
      version: s(m.version, 20), platform: s(m.platform, 20), model: s(m.model, 120), screen: s(m.screen, 40),
      view: s(m.view, 80), lang: s(m.lang, 8), theme: s(m.theme, 12), online: m.online !== false,
      errors: (Array.isArray(m.errors) ? m.errors : []).slice(-25).map((e) => s(e, 600)).filter(Boolean),
    };
    const id = randomBytes(16).toString('hex');
    let shot = false;
    if (typeof v.shot === 'string' && v.shot) {
      const b64 = v.shot.replace(/^data:image\/jpeg;base64,/, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(b64)) fail('invalid-argument', 'shot');
      const buf = Buffer.from(b64, 'base64');
      // a JPEG and nothing else, not too big
      if (buf.length > MAX_SHOT || buf[0] !== 0xff || buf[1] !== 0xd8) fail('invalid-argument', 'shot');
      await getStorage().bucket(BUCKET).file(`bugshots/${id}.jpg`).save(buf, { contentType: 'image/jpeg', resumable: false });
      shot = true;
    }
    const prof = (await db.collection('users').doc(uid).get()).data() || {};
    await db.collection('bugReports').doc(id).set({
      from: uid, handle: prof.handle || null, name: prof.name || null,
      cat: v.cat, sub: v.sub, sev: SEV.includes(v.sev) ? v.sev : 'medium', text, meta, shot,
      status: 'new', at: FieldValue.serverTimestamp(),
    });
    await db.collection('testers').doc(uid).set({ reports: FieldValue.increment(1), lastReport: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true, id };
  });

  // ---------------------------------------------------------------- for the control panel (admin.js checks the caller)
  const ms = (t) => (t && t.toMillis ? t.toMillis() : null);
  async function testers() {
    const qs = await db.collection('testers').get();
    const rows = await Promise.all(qs.docs.map(async (x) => {
      const v = x.data();
      const p = (await db.collection('users').doc(x.id).get()).data() || {};
      return { uid: x.id, handle: p.handle || null, name: p.name || null, active: v.active !== false, since: ms(v.since), reports: v.reports || 0, lastReport: ms(v.lastReport), note: v.note || null };
    }));
    return rows.sort((a, b) => (b.lastReport || b.since || 0) - (a.lastReport || a.since || 0));
  }
  async function setTester(uid, on, note) {
    const ref = db.collection('testers').doc(uid);
    if (on) await ref.set({ active: true, since: FieldValue.serverTimestamp(), note: s(note, 200) || null }, { merge: true });
    else await ref.delete();
    return { ok: true };
  }
  const row = (x) => { const v = x.data(); return { id: x.id, ...v, at: ms(v.at), doneAt: ms(v.doneAt) }; };
  async function bugReports(status) {
    let q = db.collection('bugReports');
    if (BUG_STATUS.includes(status)) q = q.where('status', '==', status);
    const qs = await q.limit(500).get();
    return qs.docs.map(row).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  async function bugShot(id) {
    if (!/^[0-9a-f]{32}$/.test(String(id))) fail('invalid-argument', 'id');
    const f = getStorage().bucket(BUCKET).file(`bugshots/${id}.jpg`);
    const [ok] = await f.exists();
    if (!ok) return { shot: null };
    const [buf] = await f.download();
    return { shot: 'data:image/jpeg;base64,' + buf.toString('base64') };
  }
  async function bugStatus(id, status, note) {
    if (!/^[0-9a-f]{32}$/.test(String(id))) fail('invalid-argument', 'id');
    if (!BUG_STATUS.includes(status)) fail('invalid-argument', 'status');
    await db.collection('bugReports').doc(id).update({ status, note: s(note, 1000) || null, doneAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }
  async function bugDelete(id) {
    if (!/^[0-9a-f]{32}$/.test(String(id))) fail('invalid-argument', 'id');
    try { await getStorage().bucket(BUCKET).file(`bugshots/${id}.jpg`).delete(); } catch (e) { /* none */ }
    await db.collection('bugReports').doc(id).delete();
    return { ok: true };
  }
  return { bugReport, testers, setTester, bugReports, bugShot, bugStatus, bugDelete };
}
