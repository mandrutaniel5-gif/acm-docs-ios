// The Windows main process: text from the page must never become part of a PowerShell script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const hello = main.slice(main.indexOf('function windowsHello'), main.indexOf("handle('secure'"));

test('the Windows Hello text stays out of the script', () => {
  assert.ok(hello.includes('RequestVerificationAsync($env:ACM_HELLO_MSG)'), 'the script reads the text from the environment');
  assert.ok(!/\$\{\s*(msg|message)/.test(hello), 'no text is pasted into the script');
  assert.ok(/ACM_HELLO_MSG: String\(message/.test(hello), 'the text is passed as a variable');
});

test('quotes in the text run nothing', { skip: process.platform !== 'win32' }, () => {
  for (const quote of ["'", '‘', '’', '‚', '‛', '"', '`']) {
    const text = `x${quote}; Write-Output INJECTED; #`;
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '$a = $env:ACM_HELLO_MSG; Write-Output "len=$($a.Length)"'],
      { env: { ...process.env, ACM_HELLO_MSG: text }, encoding: 'utf8', windowsHide: true });
    assert.ok(!out.includes('INJECTED'), `quote ${quote} stayed text`);
    assert.ok(/len=\d+/.test(out));
  }
});

test('every handler that reads or writes files checks the path first', () => {
  assert.ok(/readFile: \(p\) => fs\.readFileSync\(checkRead\(p\)\)/.test(main));
  assert.ok(/writeFile: \(p, data\) => \{\s*checkWrite\(p\);/.test(main));
  assert.ok(/handle\('fs-read', async \(_e, p\) => fs\.promises\.readFile\(checkRead\(String\(p\)\)\)\)/.test(main));
});
