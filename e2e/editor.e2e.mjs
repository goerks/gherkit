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

test('code view indents by itself: Enter, Tab, Shift+Tab and comments', async () => {
  writeFileSync(join(dir, 'ws', 'indent.feature'), 'Feature: Indent\n');
  const page = await open('code', 'indent.feature');
  const value = () => page.inputValue('#src');
  await page.click('#src');
  await page.keyboard.press('Control+End');
  // Enter puts the finished line on the grid (a Scenario belongs at 2) and the next one where a step goes
  await page.keyboard.type('Scenario: Editing');
  await page.keyboard.press('Enter');
  assert.equal(await value(), 'Feature: Indent\n  Scenario: Editing\n    ');
  await page.keyboard.type('Given zz');
  await page.keyboard.press('Enter');
  await page.keyboard.type('When yy');
  assert.equal(await value(), 'Feature: Indent\n  Scenario: Editing\n    Given zz\n    When yy');
  // comment out both steps and back, then outdent and indent the block
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Control+/');
  assert.match(await value(), /\n    # Given zz\n    # When yy$/);
  await page.keyboard.press('Control+/');
  assert.match(await value(), /\n    Given zz\n    When yy$/);
  await page.keyboard.press('Shift+Tab');
  assert.match(await value(), /\n  Given zz\n  When yy$/);
  await page.keyboard.press('Tab');
  assert.match(await value(), /\n    Given zz\n    When yy$/);
  // a line typed without indentation is moved onto the grid when Enter is pressed
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type('Then ww');
  await page.keyboard.press('Enter');
  assert.match(await value(), /\n    Then ww\n    $/);
  // Enter on an empty line leaves the steps: no trailing spaces, back at scenario level
  await page.keyboard.press('Enter');
  assert.match(await value(), /\n    Then ww\n\n  $/);
  // Tab walks through the levels on an empty line, Shift+Tab back
  await page.keyboard.press('Tab');
  assert.match(await value(), /ww\n\n    $/);
  await page.keyboard.press('Shift+Tab');
  assert.match(await value(), /ww\n\n  $/);
  // Tab on a line that is off the grid fixes it
  await page.keyboard.type('    Scenario: Three');
  assert.match(await value(), /\n      Scenario: Three$/);
  await page.keyboard.press('Tab');
  assert.match(await value(), /ww\n\n  Scenario: Three$/);
  // a Rule is at 2 and what is inside it moves one level deeper
  await page.keyboard.press('Enter');
  await page.keyboard.type('Rule: R');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Scenario: In rule');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Given qq');
  await page.keyboard.press('Enter');
  assert.match(await value(), /\n  Rule: R\n    Scenario: In rule\n      Given qq\n      $/);
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

test('structure (list): select a block, edit it, reorder by drag, reject an invalid order', async () => {
  const page = await open('struct', 'shop/checkout.feature');
  await page.waitForSelector('.st .block.scenario');
  await page.click('.st-bar [data-layout="list"]');
  await page.waitForSelector('.st .lst-item');
  const names = await page.locator('.st .lst-item .lbl').allTextContents();
  assert.ok(names.some((n) => n.includes('Discount code')), 'outline is listed');
  // selecting shows exactly that block; editing the name updates the list
  await page.locator('.st .lst-item', { hasText: 'Invoice is sent as PDF' }).click();
  assert.equal(await page.locator('.st-detail .block').count(), 1);
  assert.equal(await page.inputValue('.st-detail .block-head input'), 'Invoice is sent as PDF');
  await page.fill('.st-detail .block-head input', 'Invoice as PDF');
  await page.waitForFunction(() => document.querySelector('.st .lst-item.sel .lbl').textContent.includes('Invoice as PDF'));
  // dragging a rule above another rule reorders the file
  await page.locator('.st .lst-item', { hasText: 'Discounts are applied' }).dragTo(page.locator('.st .lst-item', { hasText: 'An order needs' }));
  await page.waitForFunction(() => { const t = window.gherkit.text; return t.indexOf('Rule: Discounts') > 0 && t.indexOf('Rule: Discounts') < t.indexOf('Rule: An order'); });
  // a scenario cannot be dropped behind a rule
  const before = await page.evaluate(() => window.gherkit.text);
  await page.locator('.st .lst-item', { hasText: 'Invoice as PDF' }).dragTo(page.locator('.st .lst-item', { hasText: 'An order needs' }));
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Order not allowed'));
  assert.equal(await page.evaluate(() => window.gherkit.text.indexOf('Scenario: Invoice as PDF') < window.gherkit.text.indexOf('Rule:')), true);
  assert.equal((await page.evaluate(() => window.gherkit.parsed.errors)).length, 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('split: the preview lists test cases and problems', async () => {
  const page = await open('split', 'shop/checkout.feature');
  await page.waitForSelector('.rtabs');
  await page.click('.rtabs [data-rtab="cases"]');
  await page.waitForSelector('table.cases');
  const total = await page.evaluate(() => window.gherkit.parsed.pickles.length);
  assert.equal(await page.locator('tr.case').count(), total);
  await page.locator('tr.case').last().click();
  await page.waitForSelector('tr.case-detail .steps li');
  assert.match(await page.textContent('tr.case-detail'), /NOPE/, 'example values are filled in');
  await page.locator('tr.case').last().click();
  assert.equal(await page.locator('tr.case-detail').count(), 0, 'a second click closes it');
  assert.deepEqual(page.errors, []);
  await page.close();
  const broken = await open('split', 'shop/broken.feature');
  await broken.click('.rtabs [data-rtab="problems"]');
  await broken.waitForSelector('.plist li');
  assert.match(await broken.textContent('.plist'), /inconsistent cell count/);
  await broken.close();
});

test('saving keeps the Windows line endings of a file', async () => {
  const file = join(dir, 'ws', 'crlf.feature');
  writeFileSync(file, 'Feature: Win\r\n\r\n  Scenario: S\r\n    Given x\r\n');
  const page = await open('code', 'crlf.feature');
  await page.click('#src');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('    And zz');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('saved'));
  const disk = readFileSync(file, 'utf8');
  assert.match(disk, /And zz/);
  assert.ok(disk.includes('\r\n'), 'still has CRLF');
  assert.ok(!/(^|[^\r])\n/.test(disk), 'no bare LF: ' + JSON.stringify(disk));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('split: headers line up, the position travels with the switch, Alt+1 and Alt+2, a choice per file', async () => {
  const page = await open('split', 'shop/checkout.feature');
  await page.waitForSelector('.st .block.scenario');
  await page.waitForSelector('.rtabs');
  // both halves have a header of the same height
  const heights = await page.evaluate(() => [document.getElementById('left-head').getBoundingClientRect().height, document.querySelector('.rtabs').getBoundingClientRect().height]);
  assert.equal(heights[0], heights[1], 'headers have the same height');
  // form -> code: the focused step becomes the cursor line
  const step = page.locator('.st .block.scenario').first().locator('input[aria-label="step"]').nth(1);
  const text = await step.inputValue();
  await step.click();
  await page.keyboard.press('Alt+2');
  await page.waitForSelector('#view-code:not([hidden])');
  await page.waitForFunction((t) => {
    const s = document.getElementById('src'), before = s.value.slice(0, s.selectionStart);
    const line = before.slice(before.lastIndexOf('\n') + 1) + s.value.slice(s.selectionStart).split('\n')[0];
    return document.activeElement === s && line.includes(t);
  }, text);
  // code -> form: the cursor line becomes the focused step
  await page.evaluate(() => { const s = document.getElementById('src'), i = s.value.indexOf('an empty shopping cart'); s.focus(); s.setSelectionRange(i, i); });
  await page.keyboard.press('Alt+1');
  await page.waitForFunction(() => (document.activeElement.value || '').includes('an empty shopping cart'));
  // the choice is remembered per file: code here, form in the other file
  await page.keyboard.press('Alt+2');
  await page.waitForSelector('#view-code:not([hidden])');
  await page.click('#files a[data-path="shop/broken.feature"]');
  await page.waitForFunction(() => window.gherkit.path === 'shop/broken.feature');
  await page.keyboard.press('Alt+1');
  await page.waitForSelector('#view-struct:not([hidden])');
  await page.click('#files a[data-path="shop/checkout.feature"]');
  await page.waitForFunction(() => window.gherkit.path === 'shop/checkout.feature');
  await page.waitForSelector('#view-code:not([hidden])');
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
      await page.locator('.st .block.scenario').first().locator('input[aria-label="step"]').last().click();
    }
    await page.screenshot({ path: join(process.env.GHERKIT_SHOTS, name + '.png') });
    await page.close();
  }
  // V1: Split with the code on the left (completion open)
  {
    const page = await open('split', 'shop/checkout.feature');
    await page.click('#split-left [data-left="code"]');
    await page.waitForSelector('#view-code:not([hidden])');
    await page.click('#src');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('    And the inv');
    await page.waitForSelector('#complete:not([hidden]) li');
    await page.screenshot({ path: join(process.env.GHERKIT_SHOTS, 'editor-split-code.png') });
    await page.close();
  }
  // S2: list layout
  {
    const page = await open('struct', 'shop/checkout.feature');
    await page.click('.st-bar [data-layout="list"]');
    await page.locator('.st .lst-item', { hasText: 'Discount code' }).click();
    await page.waitForSelector('.st-detail .block');
    await page.locator('.st-detail input[aria-label="step"]').nth(1).click();
    await page.screenshot({ path: join(process.env.GHERKIT_SHOTS, 'editor-struct-list.png') });
    await page.close();
  }
  // P2: test cases tab
  {
    const page = await open('split', 'shop/checkout.feature');
    await page.click('.rtabs [data-rtab="cases"]');
    await page.waitForSelector('table.cases');
    await page.locator('tr.case').nth(3).click();
    await page.waitForSelector('tr.case-detail');
    await page.screenshot({ path: join(process.env.GHERKIT_SHOTS, 'editor-split-cases.png') });
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
