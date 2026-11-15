import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import datasetJson from './data/south_pole_precomputed.v1.json';
import { AppLoader } from './AppLoader';
import { DatasetLoadError } from './datasetLoader';

const clone = () => structuredClone(datasetJson) as unknown as Record<string, unknown>;

describe('AppLoader: estados de carregamento e erro', () => {
  it('mostra um estado de carregamento anunciado enquanto o arquivo não chega', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    const loader = vi.fn(() => new Promise<unknown>((r) => (resolve = r)));
    render(<AppLoader loadDataset={loader} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Carregando os dados pré-calculados/);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolve(clone()));
    expect(await screen.findByRole('heading', { name: /1\. Escolha o local e o período/ })).toBeInTheDocument();
  });

  it('falha de rede: explica, move o foco para o erro e permite tentar de novo', async () => {
    const loader = vi
      .fn<(signal?: AbortSignal) => Promise<unknown>>()
      .mockRejectedValueOnce(new DatasetLoadError('Não foi possível baixar o arquivo de dados (falha de rede).'))
      .mockResolvedValue(clone());
    render(<AppLoader loadDataset={loader} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os dados');
    const heading = screen.getByRole('heading', { name: 'Não foi possível carregar os dados' });
    await waitFor(() => expect(heading).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: /2\. Resumo do instante/ })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('dataset inválido no schema (Ajv) interrompe a exibição, sem resultados e sem "tentar de novo"', async () => {
    const bad = clone();
    delete bad.sites;
    (bad.mission_window as Record<string, unknown>).step_seconds = 'uma hora';
    render(<AppLoader loadDataset={() => Promise.resolve(bad)} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O arquivo de dados não segue o formato esperado');
    expect(alert).toHaveTextContent(/Nenhum resultado é exibido/);
    expect(alert).toHaveTextContent(/must have required property 'sites'/);
    expect(alert).toHaveTextContent(/Mostrando 2 de 2 problema\(s\)/);
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Resumo do instante/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/°/)).not.toBeInTheDocument();
  });

  it('séries desalinhadas interrompem a exibição de todo o arquivo', async () => {
    const bad = clone();
    const sites = bad.sites as Array<{ sky_series: { sun_el_deg: number[] } }>;
    sites[3].sky_series.sun_el_deg = sites[3].sky_series.sun_el_deg.slice(0, 700);
    render(<AppLoader loadDataset={() => Promise.resolve(bad)} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O arquivo de dados está inconsistente');
    expect(alert).toHaveTextContent('Nobile Rim 1: Série sun_el_deg com 700 valores; esperado 721.');
    expect(screen.queryByRole('heading', { name: /Resumo do instante/ })).not.toBeInTheDocument();
  });
});
