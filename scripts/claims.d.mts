export const CLAIM_PATTERN: RegExp;
export const QUALIFIER_PATTERN: RegExp;
export const IDENTIFIERS: string[];
export const CLAIM_DOCS: string[];
export function stripNonProse(text: string): string;
export function splitSentences(text: string): string[];
export function findUnqualifiedClaims(text: string): string[];
export function datasetDisplayTexts(dataset: unknown): string[];
