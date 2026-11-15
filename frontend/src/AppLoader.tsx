import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DatasetValidationError } from './contract';
import {
  bundledDatasetSha256,
  bundledDatasetUrl,
  DatasetIntegrityError,
  DatasetLoader,
  fetchBundledDataset,
  validateDataset,
} from './datasetLoader';
import type { NavigatorDatasetV1 } from './navigator/types';

// Separate chunk: the interface is only downloaded after the data passed validation.
const App = React.lazy(() => import('./App').then((m) => ({ default: m.App })));

type FailureKind = 'load' | 'schema' | 'integrity' | 'render';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; dataset: NavigatorDatasetV1 }
  | { phase: 'error'; kind: FailureKind; detail: string; issues: string[]; totalIssues: number };

type FailureState = Extract<LoadState, { phase: 'error' }>;

const FAILURE_COPY: Record<FailureKind, { title: string; body: string; action: 'retry' | 'reload' | null }> = {
  load: {
    title: 'Não foi possível carregar os dados',
    body: 'O arquivo de dados pré-calculados não chegou ao navegador. Verifique a conexão e tente novamente.',
    action: 'retry',
  },
  schema: {
    title: 'O arquivo de dados não segue o formato esperado',
    body: 'O arquivo foi recebido, mas não está de acordo com o contrato navigator-dataset.v1. Nenhum resultado é exibido para evitar mostrar valores incorretos. Tentar de novo não resolve: o arquivo precisa ser gerado novamente pela equipe de ciência.',
    action: null,
  },
  integrity: {
    title: 'O arquivo de dados está inconsistente',
    body: 'O arquivo segue o formato, mas suas séries não estão alinhadas (quantidade de instantes, grade de direções ou locais repetidos). Nenhum resultado é exibido para evitar mostrar valores desalinhados.',
    action: null,
  },
  render: {
    title: 'A interface não pôde ser exibida',
    body: 'Ocorreu um erro ao preparar a página. Nenhum resultado é exibido. Recarregue a página para tentar de novo.',
    action: 'reload',
  },
};

export function describeFailure(error: unknown): FailureState {
  if (error instanceof DatasetValidationError) {
    return { phase: 'error', kind: 'schema', detail: error.message, issues: error.issues, totalIssues: error.totalIssues };
  }
  if (error instanceof DatasetIntegrityError) {
    return { phase: 'error', kind: 'integrity', detail: error.message, issues: error.issues.slice(0, 8), totalIssues: error.issues.length };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { phase: 'error', kind: 'load', detail, issues: [], totalIssues: 0 };
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="state-screen" aria-busy="true">
      <h1>Lunar Landing Site Navigator</h1>
      <div className="state-card" role="status">
        <span className="spinner" aria-hidden="true" />
        <p>{message}</p>
      </div>
    </main>
  );
}

function ErrorScreen({ failure, onRetry }: { failure: FailureState; onRetry?: () => void }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const copy = FAILURE_COPY[failure.kind];
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <main className="state-screen">
      <h1>Lunar Landing Site Navigator</h1>
      <div className="state-card state-error" role="alert">
        <h2 ref={headingRef} tabIndex={-1}>
          {copy.title}
        </h2>
        <p>{copy.body}</p>
        {copy.action === 'retry' && onRetry && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Tentar novamente
          </button>
        )}
        {copy.action === 'reload' && (
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Recarregar a página
          </button>
        )}
        <details>
          <summary>Detalhes técnicos</summary>
          <p className="mono-cell wrap">{failure.detail}</p>
          {failure.issues.length > 0 && (
            <>
              <p>
                Mostrando {failure.issues.length} de {failure.totalIssues} problema(s) encontrados:
              </p>
              <ul>
                {failure.issues.map((issue, i) => (
                  <li key={i} className="mono-cell wrap">
                    {issue}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      </div>
    </main>
  );
}

/** Catches a failed lazy chunk or a rendering bug so the user never gets a blank page. */
class RenderErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          failure={{ phase: 'error', kind: 'render', detail: this.state.error.message, issues: [], totalIssues: 0 }}
        />
      );
    }
    return this.props.children;
  }
}

export interface AppLoaderProps {
  /** Injectable for tests; defaults to fetching the bundled static asset. */
  loadDataset?: DatasetLoader;
}

export function AppLoader({ loadDataset = fetchBundledDataset }: AppLoaderProps) {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: 'loading' });
    loadDataset(controller.signal)
      .then((raw) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'ready', dataset: validateDataset(raw) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(describeFailure(error));
      });
    return () => controller.abort();
  }, [loadDataset, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (state.phase === 'loading') {
    return <LoadingScreen message="Carregando os dados pré-calculados do polo sul lunar…" />;
  }
  if (state.phase === 'error') {
    return <ErrorScreen key={attempt} failure={state} onRetry={retry} />;
  }
  return (
    <RenderErrorBoundary>
      <React.Suspense fallback={<LoadingScreen message="Preparando a interface…" />}>
        <App dataset={state.dataset} datasetUrl={bundledDatasetUrl} datasetSha256={bundledDatasetSha256} />
      </React.Suspense>
    </RenderErrorBoundary>
  );
}
