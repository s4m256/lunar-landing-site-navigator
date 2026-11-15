import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDeploy } from './verify-deploy.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

const DATASET_BYTES = '{"schema_version":"1.1.0"}\n';
const DATASET_ASSET = 'south_pole_precomputed.v1-Fx1.json';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const APP_JS = `console.log("fixture");fetch("/assets/${DATASET_ASSET}");`;

async function fixture(t, html = '<script type="module" src="/assets/app.js"></script>') {
  const root = await mkdtemp(resolve(tmpdir(), 'lunar-deploy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['vercel.json', 'package.json', 'package-lock.json']) {
    await copyFile(resolve(repositoryRoot, name), resolve(root, name));
  }
  await mkdir(resolve(root, 'frontend/dist/assets'), { recursive: true });
  await mkdir(resolve(root, 'frontend/src/data'), { recursive: true });
  await writeFile(resolve(root, 'frontend/dist/index.html'), html);
  await writeFile(resolve(root, 'frontend/dist/assets/app.js'), APP_JS);
  await writeFile(resolve(root, `frontend/dist/assets/${DATASET_ASSET}`), DATASET_BYTES);
  await writeFile(
    resolve(root, 'frontend/src/data/south_pole_precomputed.v1.json.sha256'),
    `${sha256(DATASET_BYTES)}  south_pole_precomputed.v1.json\n`,
  );
  return root;
}

test('accepts a deployable workspace build', async (t) => {
  assert.match(await verifyDeploy(await fixture(t)), /Deploy checks passed/);
});

test('CA-8: reports the SHA-256 of the published dataset and fails when it differs from the committed one', async (t) => {
  const root = await fixture(t);
  assert.match(await verifyDeploy(root), new RegExp(`dataset ${DATASET_ASSET} SHA-256 ${sha256(DATASET_BYTES)}`));
  await writeFile(resolve(root, `frontend/dist/assets/${DATASET_ASSET}`), DATASET_BYTES.replace('1.1.0', '1.0.0'));
  await assert.rejects(verifyDeploy(root), /Published dataset SHA-256 [0-9a-f]{64} differs/);
});

test('CA-8: fails without exactly one dataset asset or when the page does not reference it', async (t) => {
  const root = await fixture(t);
  await writeFile(resolve(root, 'frontend/dist/assets/south_pole_precomputed.v1-Other2.json'), DATASET_BYTES);
  await assert.rejects(verifyDeploy(root), /exactly one published dataset asset, found 2/);
  await rm(resolve(root, 'frontend/dist/assets/south_pole_precomputed.v1-Other2.json'));
  await writeFile(resolve(root, 'frontend/dist/assets/app.js'), 'console.log("no dataset");');
  await assert.rejects(verifyDeploy(root), /No JavaScript loaded by index.html references/);
});

test('fails when HTML references a missing bundle', async (t) => {
  const root = await fixture(t, '<script src="/assets/missing.js"></script>');
  await assert.rejects(verifyDeploy(root), /ENOENT/);
});

test('fails when uncompiled TypeScript is published', async (t) => {
  const root = await fixture(t, '<script src="/src/main.tsx"></script>');
  await assert.rejects(verifyDeploy(root), /Uncompiled source/);
});

test('fails when a referenced asset escapes the published directory', async (t) => {
  const root = await fixture(t, '<script src="../private.js"></script>');
  await writeFile(resolve(root, 'frontend/private.js'), 'private');
  await assert.rejects(verifyDeploy(root), /escapes output/);
});

test('fails when the build contains an empty stylesheet', async (t) => {
  const root = await fixture(t, '<link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js"></script>');
  await writeFile(resolve(root, 'frontend/dist/assets/app.css'), '');
  await assert.rejects(verifyDeploy(root), /Empty or invalid asset/);
});

test('fails when the JavaScript bundle exceeds the size budget', async (t) => {
  const root = await fixture(t);
  await assert.rejects(verifyDeploy(root, { maxJsBytes: 10 }), /bundle budget exceeded/);
  assert.match(await verifyDeploy(root, { maxJsBytes: 1024 }), /of 1024 budgeted bytes/);
});

test('checks module preloads and counts them once towards the budget', async (t) => {
  const html =
    '<script type="module" src="/assets/app.js"></script>' +
    '<link rel="modulepreload" href="/assets/vendor.js"><link rel="modulepreload" href="/assets/app.js">';
  const root = await fixture(t, html);
  await assert.rejects(verifyDeploy(root), /ENOENT/);
  await writeFile(resolve(root, 'frontend/dist/assets/vendor.js'), 'x'.repeat(100));
  const appBytes = Buffer.byteLength(APP_JS);
  assert.match(await verifyDeploy(root), new RegExp(`1 JavaScript bundle\\(s\\), ${appBytes + 100} of`));
  await assert.rejects(verifyDeploy(root, { maxJsBytes: appBytes + 99 }), /bundle budget exceeded/);
});

test('fails when the lockfile no longer matches the root package', async (t) => {
  const root = await fixture(t);
  const lockPath = resolve(root, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  lock.packages[''].engines = { node: '>=18' };
  await writeFile(lockPath, JSON.stringify(lock));
  await assert.rejects(verifyDeploy(root), /engines\.node must match/);
});
