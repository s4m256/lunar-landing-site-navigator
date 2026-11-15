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

describe('CA-8: integridade do JSON publicado', () => {
  it('o SHA-256 mostrado pela página é o do arquivo de checksum gravado ao lado do JSON servido', async () => {
    const { bundledDatasetSha256 } = await import('./datasetLoader');
    const checksum = (await import('./data/south_pole_precomputed.v1.json.sha256?raw')).default;
    expect(bundledDatasetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(checksum).toBe(`${bundledDatasetSha256}  south_pole_precomputed.v1.json\n`);
  });

  it('o painel de origem mostra o link para baixar o JSON e o SHA-256 publicado; o arquivo tem kernels, hashes e o rótulo Horizons honesto', async () => {
    const { bundledDatasetSha256 } = await import('./datasetLoader');
    render(<AppLoader loadDataset={() => Promise.resolve(clone())} />);
    const link = await screen.findByRole('link', { name: 'Baixar o arquivo de dados usado nesta página (JSON)' });
    expect(link).toHaveAttribute('download');
    const panel = screen.getByRole('region', { name: 'Origem e limitações dos dados' });
    expect(panel).toHaveTextContent(`publicado para esse arquivo: ${bundledDatasetSha256}`);
    const data = clone() as { provenance: { ephemeris: { kernels: Array<{ sha256: string }> }; horizons_validation: { status: string } } };
    expect(data.provenance.ephemeris.kernels.length).toBeGreaterThan(0);
    expect(data.provenance.ephemeris.kernels.every((k) => /^[0-9a-f]{64}$/.test(k.sha256))).toBe(true);
    expect(data.provenance.horizons_validation.status).toBe('unverified_no_raw_response');
  });
});
