import React, { useEffect } from 'react';

interface HomeOverlayProps {
  onStart: () => void;
  onOpenHowItWorks: () => void;
}

export const HomeOverlay: React.FC<HomeOverlayProps> = ({ onStart, onOpenHowItWorks }) => {
  return (
    <main className="home-overlay" aria-label="Tela inicial do Landing Guide">
      <div className="home-card">
        <p className="home-eyebrow">NASA Space Apps Challenge · Polo Sul Lunar</p>
        <h1 className="home-title">Landing Guide</h1>
        <p className="home-subtitle">
          Descubra de forma simples como o Sol e a Terra aparecem no céu de diferentes lugares da Lua.
        </p>

        <div className="home-actions">
          <button type="button" className="btn-home-primary" onClick={onStart}>
            Start
          </button>
          <button type="button" className="btn-home-secondary" onClick={onOpenHowItWorks}>
            How it works
          </button>
        </div>

        <p className="home-footnote">
          Sem cadastro necessário · Topografia LOLA 80 m/px e efemérides NASA SPICE (80°S–90°S).
        </p>
      </div>
    </main>
  );
};

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
  onStartExploring: () => void;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({
  open,
  onClose,
  onStartExploring,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-title"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 id="how-it-works-title">How it works</h2>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onClose}
            aria-label="Fechar guia rápido"
          >
            Fechar
          </button>
        </div>

        <p className="modal-lead">
          A Lua fica sempre no centro. Quatro botões nos cantos permitem explorar no seu ritmo:
        </p>

        <div className="how-grid">
          <div className="how-step">
            <span className="how-badge" aria-hidden="true">1</span>
            <h3>Seleção (Superior Direito)</h3>
            <p>
              Escolha <strong>Centro</strong> (mova a Lua sob a mira) ou <strong>Cursor</strong> (clique direto na Lua), ou selecione <strong>Local A</strong> e <strong>Local B</strong> pela lista acessível.
            </p>
          </div>

          <div className="how-step">
            <span className="how-badge" aria-hidden="true">2</span>
            <h3>Tempo (Topo Central)</h3>
            <p>
              Defina data e hora em <strong>UTC</strong>, duração (1 a 30 dias), dê <em>Play</em> e acompanhe o Sol mudar de posição no céu lunar.
            </p>
          </div>

          <div className="how-step">
            <span className="how-badge" aria-hidden="true">3</span>
            <h3>Dados (Inferior Direito)</h3>
            <p>
              Começa fechado para manter a vista limpa. Abra quando quiser para ler um resumo simples, métricas ou <em>Opções avançadas</em>.
            </p>
          </div>

          <div className="how-step">
            <span className="how-badge" aria-hidden="true">4</span>
            <h3>Gráficos e 2D/3D (Esquerda)</h3>
            <p>
              Compare luz solar, visibilidade da Terra e blackouts entre <strong>A e B</strong> (em gráfico ou tabela), alternando livremente entre globo <strong>3D</strong> e mapa polar <strong>2D</strong>.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-home-secondary" onClick={onClose}>
            Voltar
          </button>
          <button
            type="button"
            className="btn-home-primary"
            onClick={() => {
              onClose();
              onStartExploring();
            }}
          >
            Começar a explorar
          </button>
        </div>
      </div>
    </div>
  );
};
