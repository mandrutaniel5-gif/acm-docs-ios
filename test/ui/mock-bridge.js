// A stand-in for the phone apps' native bridge (window.AndroidBridge), so the real app page runs in a
// browser exactly as it does on a phone: same layout, same code paths. Files live in memory.
// Injected before the page loads by test/ui/screens.mjs; settings come from window.__ACM_TEST.
(() => {
  const T = window.__ACM_TEST || {};
  const files = new Map(Object.entries(T.files || {})); // path -> base64
  const secure = new Map();
  const mtimes = new Map();
  const dirs = new Set(['/docs', '/priv']);
  const parent = (p) => p.replace(/\/[^/]*$/, '') || '/';
  const reply = (id, err, res) => setTimeout(() => window.__bridgeCb && window.__bridgeCb(id, err, res), 15);
  function assetB64(path) {
    const x = new XMLHttpRequest();
    x.open('GET', '/' + path, false);
    x.overrideMimeType('text/plain; charset=x-user-defined');
    x.send();
    if (x.status !== 200) throw new Error('no asset ' + path);
    let s = '';
    const t = x.responseText;
    for (let i = 0; i < t.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(t.slice(i, i + 0x8000), (c) => c.charCodeAt(0) & 0xff));
    return btoa(s);
  }
  window.__acmFiles = files;
  window.AndroidBridge = {
    info: () => JSON.stringify({ platform: T.platform || 'ios', docs: '/docs', priv: '/priv', version: T.version || 'test', args: ['-uitest'], model: 'UI test', density: 3, sdk: 34 }),
    readB64: (p) => { if (!files.has(p)) throw new Error('no file ' + p); return files.get(p); },
    readAsset: (p) => assetB64(p),
    writeB64: (p, b) => { files.set(p, b); mtimes.set(p, Date.now()); dirs.add(parent(p)); return true; },
    isFile: (p) => files.has(p),
    listDir: (d) => JSON.stringify([...new Set([...files.keys(), ...dirs].filter((p) => parent(p) === d && p !== d).map((p) => p.slice(d.length + 1)))]),
    mkdirs: (d) => { dirs.add(d); return true; },
    mtime: (p) => mtimes.get(p) || (files.has(p) ? 1700000000000 : 0),
    remove: (p) => files.delete(p),
    fonts: () => '[]',
    setTheme: () => {},
    exit: () => {},
    request(id, op, argsJson) {
      const a = JSON.parse(argsJson || '{}');
      (window.__acmCalls = window.__acmCalls || []).push(op);
      switch (op) {
        case 'secureSet': secure.set(a.name, a.data); return reply(id, null, 'true');
        case 'secureGet': return reply(id, null, secure.get(a.name) || null);
        case 'secureHas': return reply(id, null, secure.has(a.name) ? 'true' : 'false');
        case 'secureDelete': secure.delete(a.name); return reply(id, null, 'true');
        case 'confirmOwner': return reply(id, null, 'true');
        case 'open': return reply(id, null, T.openPick || null);
        case 'startup': return reply(id, null, null);
        case 'integrity': return reply(id, null, JSON.stringify({ risk: false, signs: [] }));
        case 'privacy': case 'external': case 'share': case 'view': case 'export': return reply(id, null, 'true');
        case 'images': return reply(id, null, '[]');
        case 'fetch': return reply(id, 'offline (UI test)', null);
        case 'pdf': return reply(id, 'no native printing in the UI test', null);
        default: return reply(id, null, null);
      }
    },
  };
})();
