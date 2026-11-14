import Ajv from 'ajv';
import schema from '../../contracts/science-status.schema.json';

export interface ScienceStatus {
  schema_version: '1.0.0';
  status: 'not_implemented';
  message: string;
}

const validate = new Ajv().compile<ScienceStatus>(schema);

export function parseScienceStatus(value: unknown): ScienceStatus {
  if (!validate(value)) throw new Error('Resposta incompatível com o contrato científico v1');
  return value;
}
