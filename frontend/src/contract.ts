import Ajv from 'ajv';
import schema from '../../contracts/science-status.schema.json';
import navigatorSchema from '../../contracts/navigator-dataset.v1.schema.json';
import type { NavigatorDatasetV1 } from './navigator/types';

export interface ScienceStatus {
  schema_version: '1.0.0';
  status: 'not_implemented';
  message: string;
}

const ajv = new Ajv({ allErrors: false });
const validateStatus = ajv.compile<ScienceStatus>(schema);
// allErrors: the error screen lists more than the first schema violation.
const navigatorAjv = new Ajv({ allErrors: true });
const validateNavigatorDataset = navigatorAjv.compile<NavigatorDatasetV1>(navigatorSchema);

/** Maximum number of schema issues kept for display; the full list can be very long. */
export const MAX_REPORTED_ISSUES = 8;

/** Raised when a payload does not satisfy contracts/navigator-dataset.v1.schema.json. */
export class DatasetValidationError extends Error {
  readonly issues: string[];
  readonly totalIssues: number;

  constructor(issues: string[], totalIssues = issues.length) {
    super(
      `Dataset incompatível com navigator-dataset.v1.schema.json: ${issues[0] ?? 'erro desconhecido'}`,
    );
    this.name = 'DatasetValidationError';
    this.issues = issues;
    this.totalIssues = totalIssues;
  }
}

export function parseScienceStatus(value: unknown): ScienceStatus {
  if (!validateStatus(value)) throw new Error('Resposta incompatível com o contrato científico v1');
  return value;
}

export function parseNavigatorDataset(value: unknown): NavigatorDatasetV1 {
  if (!validateNavigatorDataset(value)) {
    const errors = validateNavigatorDataset.errors ?? [];
    const issues = errors
      .slice(0, MAX_REPORTED_ISSUES)
      .map((e) => `${e.instancePath || '(raiz)'} ${e.message ?? ''}`.trim());
    throw new DatasetValidationError(issues, errors.length);
  }
  return value;
}
