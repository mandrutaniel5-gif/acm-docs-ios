// ACM Docs for Windows: dist/ACM-Docs-Setup-<version>.exe (Windows 10/11, 64 bit). Runs on Windows or Linux.
//   node build/build-win.mjs
// Needs makensis: on Windows the copy electron-builder keeps in its cache (or MAKENSIS=<path>), on Linux the package nsis.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const win = process.platform === 'win32';
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: win && /\.cmd$/.test(cmd) });

function makensis() {
  if (process.env.MAKENSIS) return process.env.MAKENSIS;
  if (!win) return 'makensis';
  const cache = path.join(os.homedir(), 'AppData/Local/electron-builder/Cache/nsis');
  for (const d of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
    const p = path.join(cache, d, 'Bin/makensis.exe');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('makensis not found (set MAKENSIS)');
}

const dist = path.join(ROOT, 'dist');
const unpacked = path.join(dist, 'win-unpacked');
const out = path.join(dist, `ACM-Docs-Setup-${VERSION}.exe`);
fs.rmSync(unpacked, { recursive: true, force: true });
fs.rmSync(out, { force: true });
run(win ? 'npx.cmd' : 'npx', ['electron-builder', '--win', '--dir', '--x64']);
run(process.execPath, ['build/set-exe-info.js', path.join(unpacked, 'ACM Docs.exe')]);
// only the Romanian and English language packs of Chromium: a smaller installer
const loc = path.join(unpacked, 'locales');
for (const f of fs.readdirSync(loc)) if (!['en-US.pak', 'ro.pak'].includes(f)) fs.rmSync(path.join(loc, f));
const flag = win ? '/' : '-';
run(makensis(), [`${flag}V2`, `${flag}DVERSION=${VERSION}`, `${flag}DSRC=${unpacked}`, `${flag}DOUT=${out}`, `${flag}INPUTCHARSET`, 'UTF8', 'installer.nsi'], path.join(ROOT, 'build'));
console.log(out, Math.round(fs.statSync(out).size / 1048576) + ' MB');
