const { _electron } = require('playwright-core');
const path = require('path');
const OUT = process.env.OUT || '/tmp/claude-0/-home-claude/2da56d3d-6bc5-54d2-b358-3833c82145b9/scratchpad';
(async () => {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const app = await _electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..', 'main.js'), ...(file ? [file] : [])], executablePath: require('electron') });
  const win = await app.firstWindow();
  const logs = [];
  win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  win.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e}`));
  await win.setViewportSize({ width: 1360, height: 860 });
  await win.waitForTimeout(2500);
  await win.screenshot({ path: `${OUT}/s1.png` });
  global.win = win;
  if (process.env.STEPS) await require(path.resolve(process.env.STEPS))(win, OUT);
  console.log(logs.join('\n'));
  await win.evaluate(() => { if (window.Editor) Editor.dirty = false; }).catch(() => {});
  await app.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
