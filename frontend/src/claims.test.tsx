import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import syntheticJson from '../../contracts/examples/navigator-dataset.synthetic.json';
import { findUnqualifiedClaims } from '../../scripts/claims.mjs';
import { App } from './App';
import datasetJson from './data/south_pole_precomputed.v1.json';
import { bundledDatasetSha256, validateDataset } from './datasetLoader';

// Text is grouped by its nearest block element, so a quoted declaration (<q>) is read together with
// the sentence that qualifies it; inline elements never split a sentence.
const BLOCKS = 'p, li, dt, dd, td, th, caption, h1, h2, h3, h4, h5, h6, summary, label, legend, button, option, figcaption, title, desc';

function renderedTexts(container: HTMLElement): string[] {
  const groups = new Map<Element, string[]>();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim()) continue;
    const key = parent.closest(BLOCKS) ?? parent;
    groups.set(key, [...(groups.get(key) ?? []), node.textContent]);
  }
  return [...groups.values()].map((parts) => parts.join('').replace(/\s+/g, ' ').trim());
}

describe('CA-9: nenhuma alegação não comprovada no texto renderizado da interface', () => {
  it('arquivo commitado, com e sem o cenário hipotético de retransmissores', () => {
    const { container } = render(
      <App dataset={validateDataset(datasetJson)} datasetUrl="/assets/dataset.json" datasetSha256={bundledDatasetSha256} />,
    );
    const before = renderedTexts(container);
    fireEvent.click(screen.getByLabelText('Incluir o cenário hipotético de satélites retransmissores'));
    const after = renderedTexts(container);
    expect(before.length).toBeGreaterThan(100);
    expect([...before, ...after].flatMap(findUnqualifiedClaims)).toEqual([]);
    expect(container.textContent).not.toMatch(/Landing Score/i);
  });

  it('arquivo nativo 1.1.0 com comparação Horizons dentro da tolerância (exemplo sintético)', () => {
    const { container } = render(<App dataset={validateDataset(syntheticJson)} />);
    expect(renderedTexts(container).flatMap(findUnqualifiedClaims)).toEqual([]);
  });
});
