import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIM_DOCS, datasetDisplayTexts, findUnqualifiedClaims, splitSentences } from './claims.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('CA-9 rule: a claim word needs a qualifier in the same sentence', () => {
  for (const unqualified of [
    'The dataset is validated against JPL Horizons.',
    'Ephemeris cross-checked with Skyfield.',
    'Comparação com o Horizons: verified.',
    'O dataset foi validado e o local é seguro para pouso.',
    'Malapert is the best landing site.',
    'Landing Score: 88 of 100.',
    'O ponto tem energia o mês inteiro.',
  ]) {
    assert.deepEqual(findUnqualifiedClaims(unqualified), [unqualified], unqualified);
  }
  for (const qualified of [
    'The comparison was not reproduced, so we do not claim validation against Horizons.',
    'Validação contra o JPL Horizons não confirmada.',
    '"Validated" means conformance with the JSON Schema, not scientific validation.',
    '`verified` só quando toda separação angular está dentro da tolerância declarada.',
    'Um índice ilustrativo (Landing Score) sem fonte.',
    'Nada aqui indica que um local é seguro para pouso, nem garante energia ou comunicação.',
    'Status unverified_no_raw_response.',
  ]) {
    assert.deepEqual(findUnqualifiedClaims(qualified), [], qualified);
  }
});

test('CA-9 rule ignores paths, identifiers, comments and editorial placeholders, and joins wrapped lines', () => {
  assert.deepEqual(findUnqualifiedClaims('- `outputs/validation/horizons_cross_validation.json`'), []);
  assert.deepEqual(findUnqualifiedClaims('Run `lunar-science validate-horizons --elevation-m 1953`.'), []);
  assert.deepEqual(findUnqualifiedClaims('<!-- validated -->\n- Reference [VERIFY recommended citation]'), []);
  assert.deepEqual(splitSentences('- first line\n  continues here. Second one;\n\n| a | b |'), [
    '- first line continues here.',
    'Second one;',
    'a',
    'b',
  ]);
  assert.deepEqual(findUnqualifiedClaims('This dataset was\nnot validated.'), []);
});

test('CA-9: README, contracts, data docs, integration doc and submission page make no unqualified claim', async () => {
  for (const relative of CLAIM_DOCS) {
    const text = await readFile(resolve(root, relative), 'utf8');
    assert.deepEqual(findUnqualifiedClaims(text), [], relative);
  }
});

test('CA-9: dataset texts shown by the interface make no unqualified claim', async () => {
  for (const relative of ['outputs/datasets/south_pole_precomputed.v1.json', 'contracts/examples/navigator-dataset.synthetic.json']) {
    const dataset = JSON.parse(await readFile(resolve(root, relative), 'utf8'));
    for (const text of datasetDisplayTexts(dataset)) assert.deepEqual(findUnqualifiedClaims(text), [], `${relative}: ${text}`);
  }
});
