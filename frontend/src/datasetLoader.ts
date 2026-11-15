import datasetUrl from './data/south_pole_precomputed.v1.json?url';
import { parseNavigatorDataset } from './contract';
import { findAllIssues } from './navigator/integrity';
import type { NavigatorDatasetV1 } from './navigator/types';

/** The file could not be fetched or is not JSON (network, HTTP status, truncated file). */
export class DatasetLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetLoadError';
  }
}

/** The file satisfies the JSON Schema but its arrays do not line up with the shared axes. */
export class DatasetIntegrityError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Dataset inconsistente: ${issues[0] ?? 'erro desconhecido'}`);
    this.name = 'DatasetIntegrityError';
    this.issues = issues;
  }
}

export type DatasetLoader = (signal?: AbortSignal) => Promise<unknown>;

/** Fetches the precomputed file shipped as a static asset (kept out of the JS bundle). */
export const fetchBundledDataset: DatasetLoader = async (signal) => {
  let response: Response;
  try {
    response = await fetch(datasetUrl, { signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new DatasetLoadError('Não foi possível baixar o arquivo de dados (falha de rede).');
  }
  if (!response.ok) {
    throw new DatasetLoadError(`O servidor respondeu com o código HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new DatasetLoadError('O arquivo de dados foi recebido, mas não é um JSON válido.');
  }
};

/** URL of the exact file the page reads, for the "download" link in the provenance panel. */
export const bundledDatasetUrl: string = datasetUrl;

/** Schema validation (Ajv) followed by the cross-array checks the schema cannot express. */
export function validateDataset(raw: unknown): NavigatorDatasetV1 {
  const dataset = parseNavigatorDataset(raw);
  const issues = findAllIssues(dataset);
  if (issues.length > 0) throw new DatasetIntegrityError(issues);
  return dataset;
}
