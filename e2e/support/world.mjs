// The world of one scenario: a copy of the examples, a running `gherkit edit` and a browser page on it.
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repo = join(here, '..', '..');
export const bin = process.env.GHERKIT_BIN || join(repo, 'bin', process.platform === 'win32' ? 'gherkit.exe' : 'gherkit');

export class World {
  constructor(browser) { this.browser = browser; this.errors = []; }

  async start() {
    this.dir = mkdtempSync(join(tmpdir(), 'gherkit-feature-'));
    cpSync(join(repo, 'examples'), join(this.dir, 'ws'), { recursive: true });
    this.proc = spawn(bin, ['edit', '--no-open', '--addr', '127.0.0.1:0', join(this.dir, 'ws')]);
    this.url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the editor did not start')), 10000);
      this.proc.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/[^\s]+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
      this.proc.on('exit', (c) => reject(new Error('the editor exited with ' + c)));
    });
    this.page = await this.browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
    this.page.on('pageerror', (e) => this.errors.push(e.message));
  }

  async openEditor(hash) {
    await this.page.goto(this.url + (hash || '#variant=code&file=bibliothek/katalogsuche.feature'));
    await this.page.waitForFunction(() => window.gherkit && window.gherkit.parsed);
  }

  // The folder of the one manual run of the scenario (.gherkit/runs/<id>).
  runDir() {
    const runs = join(this.dir, 'ws', '.gherkit', 'runs');
    return join(runs, readdirSync(runs)[0]);
  }
  runId() { return this.runDir().split(/[\\/]/).pop(); }

  async close() {
    await this.page?.close();
    this.proc?.kill();
    rmSync(this.dir, { recursive: true, force: true });
  }
}
