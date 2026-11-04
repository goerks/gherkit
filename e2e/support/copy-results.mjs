// Stands in for a test runner: copies a Cucumber JSON file to the place gherkit expects the results.
// Usage (as the command of `gherkit run --cmd`): node copy-results.mjs <results.json>
import { copyFileSync } from 'node:fs';
copyFileSync(process.argv[2], process.env.GHERKIT_RESULTS);
