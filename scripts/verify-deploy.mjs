import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// No Vercel credentials or network required: inspect the actual publishable output.
export async function verifyDeploy(root = repositoryRoot) {
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

  const output = await realpath(resolve(root, config.outputDirectory));
  const html = await readFile(resolve(output, 'index.html'), 'utf8');
  // Vite emits quoted src/href attributes. Inspect scripts and stylesheet links only.
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) ?? [];
  let scripts = 0;
  for (const tag of tags) {
    const script = /^<script\b/i.test(tag);
    if (!script && !/\brel=["']stylesheet["']/i.test(tag)) continue;
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
  }
  assert(scripts > 0, 'Built index.html must reference at least one local JavaScript bundle');
  return `Deploy checks passed: root npm workspace, ${config.outputDirectory}, ${scripts} JavaScript bundle(s).`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await verifyDeploy());
  } catch (error) {
    console.error(`Deploy check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
