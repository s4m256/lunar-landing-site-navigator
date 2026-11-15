// CA-9 (docs/product/spa-7-mvp-criterios-aceite.md): no unproven validation, safety or ranking claim.
//
// A sentence that uses a claim word ("verified", "validated", "Skyfield", "Landing Score", "safe",
// "confirmado", ...) must also carry a qualifier in the same sentence: a negation ("not", "não",
// "sem"), a restriction ("only", "só"), the schema meaning of "validated" ("schema",
// "conformidade"), or an explicit honesty label ("hypothetical", "ilustrativo", "declared",
// "unverified"). This is a lexical guard against regressions, not a proof: a qualified sentence can
// still be wrong, so the scanned texts stay subject to human review.
//
// Not scanned as claims: HTML comments, editorial placeholders such as "[VERIFY ...]" or
// "[CONFIRM ...]" (instructions to humans before submission), file paths and code identifiers
// (tokens with "/" or "_", e.g. outputs/validation/, horizons_validation) and the CLI command names
// in IDENTIFIERS. Shared by scripts/claims.test.mjs (docs and dataset texts) and
// frontend/src/claims.test.tsx (rendered interface).

const L = String.raw`[\p{L}\p{N}_]`;
const word = (alternatives) => new RegExp(alternatives.map((a) => `(?<!${L})(?:${a})(?!${L})`).join('|'), 'iu');

export const CLAIM_PATTERN = word([
  String.raw`verif(?:y|ies|ied|ication)`,
  String.raw`verificad[oa]s?`,
  String.raw`validat(?:e|es|ed|ion|ions)`,
  String.raw`valida(?:d[oa]s?|ção|ções|r)`,
  String.raw`cross-(?:check(?:ed|s)?|validat(?:ed|ion))`,
  String.raw`skyfield`,
  String.raw`landing score`,
  String.raw`confirmad[oa]s?`,
  String.raw`safe(?:st)?`,
  String.raw`seguro para pouso`,
  String.raw`(?:best|recommended) (?:landing )?site`,
  String.raw`melhor local`,
  String.raw`recomendad[oa]s?`,
  String.raw`(?:tem|garante|guarantees?) (?:energia|comunicação|energy|communication)`,
]);

export const QUALIFIER_PATTERN = word([
  String.raw`not|no|never|nothing|without|nor|cannot|unverified|unconfirmed|unsourced`,
  String.raw`não|nem|sem|nunca|nada|nenhum|nenhuma|nenhuns|nenhumas|jamais`,
  String.raw`only|só|apenas|somente|unless|exceto`,
  String.raw`schema|formato|conformidade|conformance`,
  String.raw`hypothetical|hipotétic[oa]s?|illustrative|ilustrativ[oa]s?`,
  String.raw`declared|declarad[oa]s?|declara|declaração|overstate[sd]?|removed|removid[oa]s?|retirad[oa]s?`,
]);

/** CLI command names that contain a claim word but are names, not claims. */
export const IDENTIFIERS = ['validate-horizons', 'verify-deploy'];

/** Remove what is not prose: comments, editorial placeholders, paths and code identifiers. */
export function stripNonProse(text) {
  let out = text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\[(?:VERIFY|CONFIRM|TODO)\b[^\]]*\]/g, ' ');
  for (const id of IDENTIFIERS) out = out.split(id).join(' ');
  return out.replace(/[^\s`"'()[\]]*[/_][^\s`"'()[\]]*/g, ' ');
}

/**
 * Sentences of a Markdown or plain text: paragraphs and list items are joined across wrapped
 * lines, table cells are separate, and sentences end at . ! ? or ; followed by whitespace.
 */
export function splitSentences(text) {
  const items = [];
  let current = [];
  const flush = () => {
    if (current.length) items.push(current.join(' '));
    current = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^```/.test(line)) {
      flush();
      continue;
    }
    if (line.startsWith('|')) {
      flush();
      items.push(...line.split('|'));
      continue;
    }
    if (/^(?:[-*+]\s|\d+\.\s|#{1,6}\s|>)/.test(line)) flush();
    current.push(line);
  }
  flush();
  return items
    .flatMap((item) => item.split(/(?<=[.!?;])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Sentences that use a claim word without any qualifier. */
export function findUnqualifiedClaims(text) {
  return splitSentences(stripNonProse(text)).filter((s) => CLAIM_PATTERN.test(s) && !QUALIFIER_PATTERN.test(s));
}

/** Text the submission and the integration read: README, contracts, data docs, submission page. */
export const CLAIM_DOCS = [
  'README.md',
  'contracts/README.md',
  'outputs/README.md',
  'science/README.md',
  'docs/integration.md',
  'docs/submission/project-description-en.md',
];

/** Dataset texts the interface shows (they are part of "o texto da interface"). */
export function datasetDisplayTexts(dataset) {
  const p = dataset.provenance;
  return [
    p.ephemeris.engine,
    p.ephemeris.frame,
    ...p.horizons_validation.notes,
    ...p.limitations,
    ...Object.values(dataset.relay_presets).flatMap((r) => [r.name, r.source ?? '']),
    ...dataset.sites.flatMap((s) => [s.name, s.description, s.coordinates_source ?? '']),
  ].filter(Boolean);
}
