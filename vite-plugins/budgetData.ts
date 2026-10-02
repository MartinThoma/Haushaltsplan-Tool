import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Plugin } from 'vite';
import { checkKommunenAgainstDatasets, kommunenSchema, validateKommunen } from '../src/lib/kommunen.ts';
import { QUELLEN_FILE, checkQuellenAgainstDatasets, quellenSchema, validateQuellen } from '../src/lib/quellen.ts';
import { budgetJsonSchema, validateDatasetText, type ValidationResult } from '../src/lib/schema.ts';

const KOMMUNEN_FILE = 'kommunen.json';
const SCHEMA_DIR = 'schema';

function readJson(file: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { ok: false, problem: `${path.basename(file)} enthält kein gültiges JSON: ${String(error)}` };
  }
}

/**
 * Checks public/data: kommunen.json and quellen.json must be valid and agree with the dataset
 * files ([ags]_[jahr].json), which must all be valid. Returns human-readable problems.
 */
export function checkDataDirectory(dataDir: string): string[] {
  const indexPath = path.join(dataDir, KOMMUNEN_FILE);
  if (!fs.existsSync(indexPath)) return [`${KOMMUNEN_FILE} fehlt in ${dataDir}`];

  const index = readJson(indexPath);
  if (!index.ok) return [index.problem];
  const kommunen = validateKommunen(index.value);
  if (!kommunen.ok) return kommunen.errors.map((e) => `${KOMMUNEN_FILE}: ${e}`);

  const problems: string[] = [];
  const datasets = new Map<string, ValidationResult>();
  const indexFiles = new Set([KOMMUNEN_FILE, QUELLEN_FILE]);
  for (const file of fs.readdirSync(dataDir).filter((f) => f.endsWith('.json') && !indexFiles.has(f))) {
    const result = validateDatasetText(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    datasets.set(file, result);
    if (result.ok && !file.startsWith(`${result.data.metadata.ags}_${result.data.metadata.jahr}`)) {
      problems.push(`${file}: Dateiname sollte "${result.data.metadata.ags}_${result.data.metadata.jahr}.json" lauten`);
    }
  }
  problems.push(...checkKommunenAgainstDatasets(kommunen.data, datasets));

  const quellenPath = path.join(dataDir, QUELLEN_FILE);
  if (!fs.existsSync(quellenPath)) return [...problems, `${QUELLEN_FILE} fehlt in ${dataDir}`];
  const json = readJson(quellenPath);
  if (!json.ok) return [...problems, json.problem];
  const quellen = validateQuellen(json.value);
  if (!quellen.ok) return [...problems, ...quellen.errors.map((e) => `${QUELLEN_FILE}: ${e}`)];
  const ids = [...datasets.keys()].map((file) => file.replace(/\.json$/, ''));
  return [...problems, ...checkQuellenAgainstDatasets(quellen.data, ids)];
}

/**
 * Validates the bundled data on every build (failing it on errors) and while the dev
 * server runs. Also keeps the JSON Schemas in public/data/schema in sync with the Zod
 * schemas, for auto-completion when editing data files.
 */
export function budgetData(): Plugin {
  let dataDir = '';

  function writeIfChanged(file: string, data: unknown) {
    const target = path.join(dataDir, SCHEMA_DIR, file);
    const content = JSON.stringify(data, null, 2) + '\n';
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  return {
    name: 'budget-data',
    configResolved(config) {
      dataDir = path.join(config.publicDir, 'data');
    },
    buildStart() {
      writeIfChanged('budget-schema.json', budgetJsonSchema());
      writeIfChanged('kommunen-schema.json', z.toJSONSchema(kommunenSchema, { target: 'draft-2020-12', io: 'input' }));
      writeIfChanged('quellen-schema.json', z.toJSONSchema(quellenSchema, { target: 'draft-2020-12', io: 'input' }));
    },
    configureServer(server) {
      const report = () => {
        for (const problem of checkDataDirectory(dataDir)) server.config.logger.warn(`[daten] ${problem}`);
      };
      report();
      server.watcher.on('change', (file) => {
        if (file.startsWith(dataDir) && !file.includes(`${path.sep}${SCHEMA_DIR}${path.sep}`)) report();
      });
    },
    generateBundle() {
      const problems = checkDataDirectory(dataDir);
      if (problems.length) this.error(`Fehler in den Daten (${dataDir}):\n${problems.join('\n')}`);
    },
  };
}
