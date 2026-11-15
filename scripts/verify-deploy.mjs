import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// Budget for the sum of JavaScript referenced by index.html (uncompressed bytes).
// The precomputed dataset (~1.4 MB) is a separate static asset fetched at run time (SPA-11), so the
// initial JavaScript is ~0.37 MB. 1 MiB leaves headroom and still fails if the dataset is inlined
// into the bundle again; raise it deliberately, not by accident.
export const DEFAULT_MAX_JS_BYTES = 1024 * 1024;

// The precomputed dataset is published as a hashed static asset and fetched by the page
// (docs/integration.md). Its bytes must be exactly the committed copy, whose SHA-256 is recorded
// next to it in sha256sum format (SPA-7 CA-8).
export const DATASET_CHECKSUM_FILE = 'frontend/src/data/south_pole_precomputed.v1.json.sha256';
const DATASET_ASSET = /^south_pole_precomputed\.v1-[\w-]+\.json$/;

async function verifyDataset(root, output, jsAssets) {
  const line = (await readFile(resolve(root, DATASET_CHECKSUM_FILE), 'utf8')).trim();
  const expected = /^([0-9a-f]{64}) {2}south_pole_precomputed\.v1\.json$/.exec(line)?.[1];
  assert(expected, `Invalid checksum line in ${DATASET_CHECKSUM_FILE}`);
  const assetsDir = resolve(output, 'assets');
  const names = (await readdir(assetsDir)).filter((name) => DATASET_ASSET.test(name));
  assert.equal(names.length, 1, `Expected exactly one published dataset asset, found ${names.length}`);
  const digest = createHash('sha256').update(await readFile(resolve(assetsDir, names[0]))).digest('hex');
  assert.equal(digest, expected, `Published dataset SHA-256 ${digest} differs from ${DATASET_CHECKSUM_FILE} (${expected})`);
  // The page must fetch (and offer for download) this exact file.
  let referenced = false;
  for (const js of jsAssets) referenced ||= (await readFile(js, 'utf8')).includes(`/assets/${names[0]}`);
  assert(referenced, `No JavaScript loaded by index.html references assets/${names[0]}`);
  return { name: names[0], sha256: digest };
}

function resolveJsBudget(value = process.env.DEPLOY_MAX_JS_BYTES) {
  if (value === undefined || value === '') return DEFAULT_MAX_JS_BYTES;
  const budget = Number(value);
  assert(Number.isInteger(budget) && budget > 0, `Invalid DEPLOY_MAX_JS_BYTES: ${value}`);
  return budget;
}

// No Vercel credentials or network required: inspect the actual publishable output.
export async function verifyDeploy(root = repositoryRoot, { maxJsBytes = resolveJsBudget() } = {}) {
  const config = await readJson(resolve(root, 'vercel.json'));
  const pkg = await readJson(resolve(root, 'package.json'));
  const lock = await readJson(resolve(root, 'package-lock.json'));
  assert.equal(config.framework, 'vite', 'Vercel must use the Vite framework');
  assert.equal(config.installCommand, 'npm ci --include=dev', 'Install from the root lockfile, including build tools');
  assert.equal(config.buildCommand, 'npm run build', 'Vercel must use the root build script');
  assert.equal(config.outputDirectory, 'frontend/dist', 'Publish frontend/dist relative to the repository root');
  assert(pkg.workspaces.includes('frontend'), 'frontend must be an npm workspace');
  assert(lock.packages['frontend'], 'Root lockfile must include the frontend workspace');
  assert(pkg.scripts.build, 'Root build script is required');
  // `npm ci` only proves the lockfile is in sync if the deploy really installs from it.
  assert.equal(lock.lockfileVersion, 3, 'Root lockfile must be lockfileVersion 3');
  assert.deepEqual(
    lock.packages['']?.workspaces,
    pkg.workspaces,
    'Root lockfile workspaces must match package.json (run npm install and commit the lockfile)',
  );
  assert.equal(
    lock.packages['']?.engines?.node,
    pkg.engines?.node,
    'Root lockfile engines.node must match package.json',
  );

  const output = await realpath(resolve(root, config.outputDirectory));
  const html = await readFile(resolve(output, 'index.html'), 'utf8');
  // Vite emits quoted src/href attributes. Inspect scripts, module preloads and stylesheet links.
  // Module preloads are fetched on first load too, so they count towards the JavaScript budget.
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) ?? [];
  let scripts = 0;
  let jsBytes = 0;
  const countedJs = new Set();
  for (const tag of tags) {
    const script = /^<script\b/i.test(tag);
    const preload = !script && /\brel=["']modulepreload["']/i.test(tag);
    if (!script && !preload && !/\brel=["']stylesheet["']/i.test(tag)) continue;
    const url = tag.match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (!url) continue;
    assert(!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url), `Expected a local build asset: ${url}`);
    const path = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, '');
    assert(!/\.(?:tsx?|jsx)(?:$)/i.test(path), `Uncompiled source referenced: ${url}`);
    const asset = await realpath(resolve(output, path));
    const rel = relative(output, asset);
    assert(rel && !rel.startsWith('..') && !isAbsolute(rel), `Asset escapes output directory: ${url}`);
    const info = await stat(asset);
    assert(info.isFile() && info.size > 0, `Empty or invalid asset: ${url}`);
    if (script) scripts += 1;
    if ((script || preload) && !countedJs.has(asset)) {
      countedJs.add(asset);
      jsBytes += info.size;
    }
  }
  assert(scripts > 0, 'Built index.html must reference at least one local JavaScript bundle');
  assert(
    jsBytes <= maxJsBytes,
    `JavaScript bundle budget exceeded: ${jsBytes} bytes > ${maxJsBytes} bytes (DEPLOY_MAX_JS_BYTES)`,
  );
  const dataset = await verifyDataset(root, output, countedJs);
  return `Deploy checks passed: root npm workspace, ${config.outputDirectory}, ${scripts} JavaScript bundle(s), ${jsBytes} of ${maxJsBytes} budgeted bytes, dataset ${dataset.name} SHA-256 ${dataset.sha256}.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await verifyDeploy());
  } catch (error) {
    console.error(`Deploy check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
