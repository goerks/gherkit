// Browser tests written as Gherkin: the feature files in features/ are run against the real editor.
//
//   go build -o bin/gherkit ./cmd/gherkit && (cd e2e && npm run test:features)
import { before, after } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFeatures } from './support/gherkin.mjs';
import { World, bin } from './support/world.mjs';
import './steps/manual-run.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let browser;

before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

runFeatures({
  dir: join(dirname(fileURLToPath(import.meta.url)), 'features'),
  bin,
  makeWorld: async () => { const w = new World(browser); await w.start(); return w; },
});
