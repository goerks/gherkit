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
  await page.click('#split-left [data-left="code"]');
  await page.click('#src');
  await page.keyboard.press('Control+End');
  await page.waitForSelector('.doc .cur');
  await page.keyboard.press('Control+Home');
  await page.waitForFunction(() => document.querySelector('.doc .cur')?.tagName === 'H1');
  await page.close();
});

test('structure view duplicates and folds blocks', async () => {
  const page = await open('struct', 'shop/checkout.feature');
  await page.waitForSelector('.st .block.scenario');
  const before = await page.locator('.st .block.scenario').count();
  await page.locator('.st .block.scenario .dup').first().click();
  await page.waitForFunction(() => window.gherkit.text.includes('(copy)'));
  assert.equal(await page.locator('.st .block.scenario').count(), before + 1);
  assert.equal((await page.evaluate(() => window.gherkit.parsed.errors)).length, 0, 'printed text parses');
  await page.locator('.st .block.scenario .fold').first().click();
  assert.equal(await page.locator('.st .block.collapsed').count(), 1);
  assert.match(await page.textContent('.st .block.collapsed .summary'), /\d+ steps/);
  await page.locator('.st .block.collapsed .fold').click();
  assert.equal(await page.locator('.st .block.collapsed').count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('structure view pastes a table from a spreadsheet', async () => {
  const page = await open('struct', 'shop/checkout.feature');
  await page.waitForSelector('.st table.grid input');
  await page.evaluate(() => {
    const input = document.querySelector('.st table.grid input');
    const data = new DataTransfer();
    data.setData('text/plain', 'a\tb\tc\n1\t2\t3\n4\t5\t6\n');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => /\|\s*a\s*\|\s*b\s*\|\s*c\s*\|/.test(window.gherkit.text));
  const text = await page.evaluate(() => window.gherkit.text);
  assert.match(text, /\|\s*4\s*\|\s*5\s*\|\s*6\s*\|/);
  assert.equal((await page.evaluate(() => window.gherkit.parsed.errors)).length, 0, 'printed text parses');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('split view: resize the panes and click a block to move the code cursor', async () => {
  const page = await open('split', 'shop/checkout.feature');
  await page.waitForSelector('.doc h1');
  await page.click('#split-left [data-left="code"]');
  const width = () => page.evaluate(() => document.getElementById('view-code').getBoundingClientRect().width);
  await page.waitForSelector('#view-code:not([hidden])');
  const w0 = await width();
  await page.focus('#split-handle');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.ok((await width()) > w0 + 50, 'code pane grew');
  await page.dblclick('#split-handle');
  assert.ok(Math.abs((await width()) - w0) < 4, 'double click resets to half');
  // clicking a step in the document selects its line in the code
  await page.locator('.doc ol.steps li').nth(2).click();
  await page.waitForFunction(() => document.activeElement.id === 'src');
  const picked = await page.evaluate(() => { const s = document.getElementById('src'); return s.value.slice(s.selectionStart, s.selectionEnd).trim(); });
  assert.match(picked, /^(Given|When|Then|And|But|\*)\s/);
  assert.equal(await page.evaluate(() => window.gherkit.variant), 'split');
  assert.deepEqual(page.errors, []);
  await page.close();
});

// Screenshots for the docs: GHERKIT_SHOTS=<dir> npm test
test('screenshots', { skip: !process.env.GHERKIT_SHOTS }, async () => {
  mkdirSync(process.env.GHERKIT_SHOTS, { recursive: true });
  for (const [variant, name] of [['struct', 'editor-struct'], ['split', 'editor-split']]) {
    const page = await open(variant, 'shop/checkout.feature');
    await page.waitForSelector(variant === 'struct' ? '.st .block' : '.st .block, .doc h1');
    if (variant === 'split') {
      await page.locator('.st input[aria-label="step"]').nth(2).click();
      await page.waitForSelector('.doc .cur');
    } else {
      await page.locator('.st .block.scenario input[aria-label="step"]').last().click();
    }
    await page.screenshot({ path: join(process.env.GHERKIT_SHOTS, name + '.png') });
    await page.close();
  }
});

test('structure (calm cards): chips offer optional fields, keywords are pills, Enter continues the steps', async () => {
  const page = await open('struct', 'shop/checkout.feature');
  await page.waitForSelector('.st .block.scenario');
  const block = () => page.locator('.st .block.scenario').first();
  // a scenario without tags shows a chip, not an empty tags field
  assert.equal(await block().locator('[data-key$=":tags"]').count(), 0);
  await block().locator('.chips button', { hasText: '+ Tags' }).click();
  await page.waitForFunction(() => (document.activeElement.dataset.key || '').endsWith(':tags'));
  await page.keyboard.type('@smoke');
  await page.waitForFunction(() => /@smoke\n\s+Scenario/.test(window.gherkit.text));
  // the keyword is a pill; Alt+Down changes it
  const first = block().locator('input[aria-label="step"]').first();
  assert.equal((await block().locator('.step .pill').first().textContent()).trim(), 'Given');
  await first.click();
  await page.keyboard.press('Alt+ArrowDown');
  assert.equal((await block().locator('.step .pill').first().textContent()).trim(), 'When');
  await page.waitForFunction(() => /When a paid order/.test(window.gherkit.text));
  // Enter after a "When" step adds a "Then" step and focuses it
  const second = block().locator('input[aria-label="step"]').nth(1);
  await second.click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.getAttribute('aria-label') === 'step' && document.activeElement.value === '');
  await page.keyboard.type('zzz');
  await page.waitForFunction(() => /Then zzz/.test(window.gherkit.text));
  assert.equal((await page.evaluate(() => window.gherkit.parsed.errors)).length, 0, 'printed text parses');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('split (form and preview): edits appear in the preview, clicks sync both ways', async () => {
  const page = await open('split', 'shop/checkout.feature');
  await page.waitForSelector('.st .block.scenario');
  await page.waitForSelector('.doc h1');
  assert.equal(await page.locator('#view-code').isHidden(), true, 'left half is the form by default');
  const input = (n) => page.locator('.st .block.scenario').first().locator('input[aria-label="step"]').nth(n);
  await input(1).fill('the order is confirmed by the customer');
  await page.waitForFunction(() => document.querySelector('.doc').textContent.includes('confirmed by the customer'));
  // focusing a form step marks it in the preview
  await input(0).click();
  await page.waitForFunction(() => (document.querySelector('.doc .cur') || { textContent: '' }).textContent.includes('a paid order'));
  // clicking a step in the preview focuses it in the form
  await page.locator('.doc ol.steps li', { hasText: 'confirmed by the customer' }).click();
  await page.waitForFunction(() => (document.activeElement.value || '').includes('confirmed by the customer'));
  // the left half can show the code instead
  await page.click('#split-left [data-left="code"]');
  await page.waitForSelector('#view-code:not([hidden])');
  assert.match(await page.inputValue('#src'), /confirmed by the customer/);
  assert.deepEqual(page.errors, []);
  await page.close();
});
