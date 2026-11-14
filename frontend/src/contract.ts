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
const validateNavigatorDataset = ajv.compile<NavigatorDatasetV1>(navigatorSchema);

export function parseScienceStatus(value: unknown): ScienceStatus {
  if (!validateStatus(value)) throw new Error('Resposta incompatível com o contrato científico v1');
  return value;
}

export function parseNavigatorDataset(value: unknown): NavigatorDatasetV1 {
  if (!validateNavigatorDataset(value)) {
    const first = validateNavigatorDataset.errors?.[0];
    throw new Error(
      `Dataset incompatível com navigator-dataset.v1.schema.json: ${first?.instancePath ?? ''} ${first?.message ?? ''}`,
    );
  }
  return value;
}
