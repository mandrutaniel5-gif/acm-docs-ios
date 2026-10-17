// Loads the app's engine scripts into Node exactly like the browser would.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..', 'app');
global.require = require;
for (const f of ['js/pdfium-runtime.js', 'js/fonts.js', 'js/engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
// Fonts on this Linux box, as the Windows registry would list them.
vm.runInThisContext(`SystemFonts.provider = {
  list() {
    const out = [];
    const walk = (d) => { for (const e of require('fs').readdirSync(d, { withFileTypes: true })) {
      const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (/\\.(ttf|otf)$/i.test(e.name)) {
        const base = e.name.replace(/\\.(ttf|otf)$/i, '').replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
        out.push({ name: base, path: p });
      } } };
    try { walk('/usr/share/fonts'); } catch (e) {}
    return out;
  },
  read(p) { return new Uint8Array(require('fs').readFileSync(p)); },
};`);
module.exports = {
  PDF: vm.runInThisContext('PDF'),
  async init() { await vm.runInThisContext('PDF').init(fs.readFileSync(path.join(root, 'pdfium/pdfium.wasm'))); },
};
