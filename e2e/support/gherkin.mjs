// A small Gherkin runner for the browser tests: the feature files are parsed by gherkit itself
// (`gherkit parse --pickles`, the official parser) and every scenario becomes a node:test test.
// Steps are matched by their text against regular expressions; the keyword does not matter.
// No dependency beyond Node and the gherkit binary: gherkit tests gherkit.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, test } from 'node:test';

const defs = [];
export const Given = (re, fn) => defs.push({ re, fn });
export const When = Given;
export const Then = Given;

function parse(bin, file) {
  const run = (args) => JSON.parse(execFileSync(bin, ['parse', ...args, file], { maxBuffer: 32 << 20 }).toString());
  const doc = run([]);
  if (doc.errors && doc.errors.length) throw new Error(`${file}: ${JSON.stringify(doc.errors[0])}`);
  return { name: doc.gherkinDocument.feature.name, pickles: run(['--pickles']) };
}

function argument(step) {
  const a = step.argument;
  if (!a) return undefined;
  if (a.docString) return a.docString.content;
  if (a.dataTable) return a.dataTable.rows.map((r) => r.cells.map((c) => c.value));
  return undefined;
}

// Defines one test per scenario of every .feature file in dir. makeWorld() gives each scenario a fresh
// world; its close() runs afterwards, also when a step failed.
export function runFeatures({ dir, bin, makeWorld }) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.feature')).sort();
  for (const f of files) {
    const feature = parse(bin, join(dir, f));
    describe(`${feature.name} (${basename(f)})`, () => {
      for (const pickle of feature.pickles) {
        test(pickle.name, async () => {
          const world = await makeWorld();
          try {
            for (const step of pickle.steps) {
              let match = null, def = null;
              for (const d of defs) { match = step.text.match(d.re); if (match) { def = d; break; } }
              if (!def) throw new Error(`undefined step: ${step.text}`);
              try {
                await def.fn(world, ...match.slice(1), argument(step));
              } catch (e) {
                e.message = `step "${step.text}" failed: ${e.message}`;
                throw e;
              }
            }
            if (world.errors && world.errors.length) throw new Error('the page raised errors: ' + world.errors.join('; '));
          } finally {
            await world.close();
          }
        });
      }
    });
  }
}
