import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDeploy } from './verify-deploy.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t, html = '<script type="module" src="/assets/app.js"></script>') {
  const root = await mkdtemp(resolve(tmpdir(), 'lunar-deploy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['vercel.json', 'package.json', 'package-lock.json']) {
    await copyFile(resolve(repositoryRoot, name), resolve(root, name));
  }
  await mkdir(resolve(root, 'frontend/dist/assets'), { recursive: true });
  await writeFile(resolve(root, 'frontend/dist/index.html'), html);
  await writeFile(resolve(root, 'frontend/dist/assets/app.js'), 'console.log("fixture");');
  return root;
}

test('accepts a deployable workspace build', async (t) => {
  assert.match(await verifyDeploy(await fixture(t)), /Deploy checks passed/);
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
