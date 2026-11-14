import example from '../../contracts/examples/science-status.json';
import { parseScienceStatus } from './contract';

const status = parseScienceStatus(example);

export function App() {
  return (
    <main>
      <p className="eyebrow">NASA Space Apps 2026 · Base de desenvolvimento</p>
      <h1>Lunar Landing Site Navigator</h1>
      <p>Uma base compartilhada para a equipe explorar locais de pouso lunar.</p>
      <section aria-labelledby="science-heading">
        <h2 id="science-heading">Módulo científico</h2>
        <p role="status">Ainda não implementado</p>
        <p>{status.message}</p>
        <small>Exemplo local do contrato {status.schema_version}. Nenhum cálculo ou dado científico.</small>
      </section>
    </main>
  );
}
