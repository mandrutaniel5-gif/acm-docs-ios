// The web app for the iOS project: ios/www = app/ + the fonts bundled for phones; also puts the project's
// version into ios/project.yml. ios/www is made here (never edited, not in git): the iOS workflow runs this.
//   node build/sync-www.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, 'ios/www');
fs.rmSync(W, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'app'), W, { recursive: true });
fs.rmSync(path.join(W, 'assets/legacy-logo.jpg'), { force: true });
fs.cpSync(path.join(ROOT, 'build/fonts'), path.join(W, 'fonts'), { recursive: true });

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const [a, b, c] = VERSION.split('.').map(Number);
const yml = path.join(ROOT, 'ios/project.yml');
fs.writeFileSync(yml, fs.readFileSync(yml, 'utf8')
  .replace(/MARKETING_VERSION: "[0-9.]+"/, `MARKETING_VERSION: "${VERSION}"`)
  .replace(/CURRENT_PROJECT_VERSION: "[0-9]+"/, `CURRENT_PROJECT_VERSION: "${a * 10000 + b * 100 + c}"`));
console.log('ios/www', VERSION);
