import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { parseScienceStatus } from './contract';
import example from '../../contracts/examples/science-status.json';

describe('development shell', () => {
  it('renders the application and clearly labels the scientific placeholder', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lunar Landing Site Navigator');
    expect(screen.getByRole('status')).toHaveTextContent('Ainda não implementado');
    expect(screen.getByText(/Nenhum cálculo ou dado científico/)).toBeVisible();
  });
  it('accepts the shared fixture', () => {
    expect(parseScienceStatus(example)).toEqual(example);
  });
  it.each([
    { ...example, schema_version: '2.0.0' },
    { ...example, status: 'completed' },
    { ...example, message: '' },
    { ...example, score: 1 },
    {},
  ])('rejects incompatible payloads: %j', (payload) => {
    expect(() => parseScienceStatus(payload)).toThrow(/contrato/);
  });
});
