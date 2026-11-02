// Browser tests for `gherkit edit`: they start the real binary on a copy of
// the examples and drive the editor with Playwright.
//
//   go build -o bin/gherkit ./cmd/gherkit && (cd e2e && npm test)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.env.GHERKIT_BIN || join(repo, 'bin', process.platform === 'win32' ? 'gherkit.exe' : 'gherkit');

let dir, proc, url, browser;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gherkit-e2e-'));
  cpSync(join(repo, 'examples'), join(dir, 'ws'), { recursive: true });
  mkdirSync(join(dir, 'other'));
  writeFileSync(join(dir, 'other', 'elsewhere.feature'), 'Feature: Elsewhere\n');
  proc = spawn(bin, ['edit', '--no-open', '--addr', '127.0.0.1:0', join(dir, 'ws')]);
  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('editor did not start')), 10000);
    proc.stdout.on('data', (d) => {
      const m = String(d).match(/http:\/\/[^\s]+/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    });
    proc.on('exit', (c) => reject(new Error('editor exited ' + c)));
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  proc?.kill();
  rmSync(dir, { recursive: true, force: true });
});

async function open(variant, file) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}#variant=${variant}&file=${encodeURIComponent(file)}`);
  await page.waitForFunction(() => window.gherkit && window.gherkit.parsed);
  page.errors = errors;
  return page;
}

test('code view highlights by scanner tokens and lists problems', async () => {
  const page = await open('code', 'shop/broken.feature');
  await page.waitForSelector('#problems li .sev.error');
  assert.match(await page.textContent('#problems'), /inconsistent cell count/);
  assert.ok(await page.$('.hl .c-kw-feature'), 'feature keyword highlighted');
  assert.ok(await page.$('.gutter .err'), 'error marker in gutter');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('code view completes steps used in the folder and saves', async () => {
  const page = await open('code', 'de/anmeldung.feature');
  await page.click('#src');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\n  Szenario: Neu\n    Angenommen die Kundin');
  await page.waitForSelector('#complete:not([hidden]) li');
  assert.match(await page.textContent('#complete'), /die Kundin "anna@example.ch" ist registriert/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('saved'));
  const disk = readFileSync(join(dir, 'ws', 'de', 'anmeldung.feature'), 'utf8');
  assert.match(disk, /Angenommen die Kundin "anna@example.ch" ist registriert\n?$/);
  await page.close();
});

test('document view renders the AST with test case counts', async () => {
  const page = await open('doc', 'shop/checkout.feature');
  await page.waitForSelector('.doc h1');
  assert.equal(await page.textContent('.doc h1'), 'Checkout');
  assert.match(await page.textContent('.doc .stats'), /5\s*Test cases/);
  assert.match(await page.textContent('.doc'), /yields 3 test cases/);
  assert.equal(await page.locator('.doc .rule').count(), 2);
  // edit button jumps to the code view
  await page.locator('.doc .card .edit').first().click({ force: true });
  await page.waitForFunction(() => window.gherkit.variant === 'code');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('structure view edits the AST and prints canonical Gherkin', async () => {
  const page = await open('struct', 'shop/checkout.feature');
  await page.waitForSelector('.st input.name');
  await page.fill('.st input.name', 'Checkout and payment');
  await page.waitForFunction(() => window.gherkit.text.includes('Feature: Checkout and payment'));
  // add a scenario at the end of the feature
  await page.locator('.st > .add button', { hasText: '+ Scenario' }).first().click();
  // a Feature-level scenario is inserted before the first Rule (spec!)
  await page.waitForFunction(() => /\n  (Scenario|Example):\n    Given \n\n  Rule:/.test(window.gherkit.text));
  // translate keywords to German
  await page.selectOption('.st .grid2 select[aria-label="Language"]', 'de');
  await page.waitForFunction(() => window.gherkit.text.startsWith('# language: de\n'));
  const text = await page.evaluate(() => window.gherkit.text);
  assert.match(text, /Funktionalität: Checkout and payment/);
  assert.match(text, /Szenariogrundriss|Szenarien|Szenario/);
  assert.equal((await page.evaluate(() => window.gherkit.parsed.errors)).length, 0, 'printed text parses');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('another folder can be opened while the editor runs', async () => {
  const page = await open('code', 'shop/checkout.feature');
  await page.click('#ws-btn');
  await page.fill('#folder-input', join(dir, 'other'));
  await page.press('#folder-input', 'Enter');
  await page.click('#folder-open');
  await page.waitForFunction(() => window.gherkit.files.includes('elsewhere.feature'));
  assert.match(await page.textContent('#ws-path'), /other$/);
  // the server is shared by all tests: go back to the examples copy
  await page.evaluate((root) => fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root }) }).then((r) => { if (!r.ok) throw new Error('reset failed'); }), join(dir, 'ws'));
  await page.close();
});

test('code view keeps indentation on Enter, indents blocks and toggles comments', async () => {
  const page = await open('code', 'shop/checkout.feature');
  await page.click('#src');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\n  Scenario: Editing\n');
  // after a block header the next line is indented one level deeper
  await page.keyboard.type('Given zz');
  assert.match(await page.inputValue('#src'), /\n  Scenario: Editing\n    Given zz$/);
  // the next step keeps the indentation
  await page.keyboard.type('\nWhen yy');
  assert.match(await page.inputValue('#src'), /\n    Given zz\n    When yy$/);
  // comment out both steps and back
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Control+/');
  assert.match(await page.inputValue('#src'), /\n    # Given zz\n    # When yy$/);
  await page.keyboard.press('Control+/');
  assert.match(await page.inputValue('#src'), /\n    Given zz\n    When yy$/);
  // Shift+Tab outdents the selected lines
  await page.keyboard.press('Shift+Tab');
  assert.match(await page.inputValue('#src'), /\n  Given zz\n  When yy$/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('gutter marker explains the problem on hover', async () => {
  const page = await open('code', 'shop/broken.feature');
  await page.waitForSelector('.gutter .err');
  assert.match(await page.getAttribute('.gutter .err', 'title'), /inconsistent cell count/);
  await page.close();
});

test('document view filters scenarios by tag', async () => {
  const page = await open('doc', 'shop/checkout.feature');
  await page.waitForSelector('.doc .tagbar');
  const all = await page.locator('.doc .card:not(.bg)').count();
  await page.locator('.doc .tagbar button[data-tag="@discount"]').click();
  const some = await page.locator('.doc .card:not(.bg)').count();
  assert.ok(some > 0 && some < all, `filtered ${some} of ${all}`);
  await page.locator('.doc .tagbar .clear').click();
  assert.equal(await page.locator('.doc .card:not(.bg)').count(), all);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('split view marks the document block of the cursor line', async () => {
  const page = await open('split', 'shop/checkout.feature');
  await page.waitForSelector('.doc h1');
  await page.click('#src');
  await page.keyboard.press('Control+End');
  await page.waitForSelector('.doc .cur');
  await page.keyboard.press('Control+Home');
  await page.waitForFunction(() => document.querySelector('.doc .cur')?.tagName === 'H1');
  await page.close();
});
