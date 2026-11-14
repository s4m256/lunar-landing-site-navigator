import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import resultUrl from "../../../docs/audits/pr4/result-2026.json?url";
import type { DemoResult } from "../scientific-data";

interface Props {
  result?: DemoResult;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}

export function ExplorerInfo({ result, onClose, returnFocus }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = returnFocus.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [returnFocus]);

  function handleKeys(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const elements = dialog.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], [tabindex='0']",
    );
    if (!elements?.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialog}
      className="explorer-dialog"
      aria-labelledby="explorer-info-title"
      aria-describedby="explorer-info-intro"
      aria-modal="true"
      onKeyDown={handleKeys}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="explorer-dialog-content">
        <div className="explorer-dialog-heading">
          <div>
            <p className="explorer-kicker">Sobre esta exploração</p>
            <h2 id="explorer-info-title">Entenda o seu horizonte</h2>
          </div>
          <button
            ref={closeButton}
            className="explorer-dialog-close"
            type="button"
            onClick={onClose}
            aria-label="Fechar informações"
          >
            ×
          </button>
        </div>
        <p id="explorer-info-intro">
          O astronauta marca um local hipotético próximo ao polo sul. As linhas
          mostram as direções aparentes dos centros do Sol e da Terra.
        </p>
        <section aria-labelledby="explorer-meaning-title">
          <h3 id="explorer-meaning-title">Por que olhar para os dois?</h3>
          <p>
            <strong>Sol:</strong> sua posição ajuda a explorar o acesso à luz
            solar. Energia produzida também depende de painéis, orientação e
            sombras.
          </p>
          <p>
            <strong>Terra:</strong> sua posição ajuda a explorar a linha de
            visada para comunicação direta. Ver o centro da Terra não garante
            enlace ou visibilidade de uma estação específica.
          </p>
        </section>
        <section aria-labelledby="explorer-model-title">
          <h3 id="explorer-model-title">O que está sendo calculado</h3>
          <p>
            Local A (south-a): latitude planetocêntrica −89,5°, longitude leste
            0°, altura radial 0 m sobre uma esfera de raio 1.737.400 m. O
            astronauta é um símbolo; seu tamanho não define a altura do
            observador.
          </p>
          <p>
            Elevação é o ângulo acima ou abaixo do horizonte tangente de 0°.
            Azimute indica a direção: norte 0°, leste 90°. As linhas partem da
            mesma origem do modelo.
          </p>
          <p>
            A cena, o astronauta e as distâncias são ilustrativos. As linhas
            representam as direções calculadas; a iluminação da cena não simula
            sombras solares.
          </p>
          <p>
            <strong>Relevo contextual, sem cálculo de bloqueio.</strong> A cena
            utiliza um recorte de baixa resolução do modelo LOLA LDEM4. As
            linhas continuam representando direções em relação ao horizonte
            tangente idealizado; não calculamos bloqueio por montanhas, sombras,
            eclipses ou visibilidade parcial dos discos.
          </p>
          <p>
            O relevo usa o referencial lunar ME/DE421; as direções científicas
            usam IAU_MOON. Esses referenciais não foram transformados entre si
            nesta versão. O recorte fornece contexto visual, sem estabelecer a
            posição física do observador sobre o terreno. As linhas são
            sobrepostas à superfície para não sugerir um teste de obstrução.
          </p>
          <p>
            O modelo LRO/LOLA LDEM4 tem 4 pixels por grau, cerca de 7,6 km entre
            linhas de latitude. O recorte de 120 km foi interpolado para
            desenhar a superfície; essa interpolação não acrescenta detalhes
            medidos. Dois espelhos públicos forneceram arquivos idênticos, sem
            conferência direta no arquivo primário.
          </p>
          <a
            className="explorer-download"
            href={`${import.meta.env.BASE_URL}terrain/provenance.json`}
            download="terrain-provenance.json"
          >
            Fontes e hashes do relevo <span aria-hidden="true">↗</span>
          </a>
        </section>
        <section aria-labelledby="explorer-data-title">
          <h3 id="explorer-data-title">Dados e limites</h3>
          <p>
            SPICE calculado offline, referencial IAU_MOON, correção CN+S e
            orientação no instante do observador. São 365 amostras de 2026,
            sempre às 00:00 UTC. Entre amostras não há interpolação.
          </p>
          <p>
            Amostras diárias não fornecem horários de nascer/pôr nem duração
            contínua de iluminação ou comunicação. Os números são arredondados
            para leitura; isso não certifica precisão física.
          </p>
          <p>
            <strong>Sem validação independente contra JPL Horizons.</strong> A
            auditoria registra HTTP 403 e zero comparações. DE421 veio de um
            espelho de terceiros, com hashes registrados, sem conferência direta
            no servidor NAIF; a completude atual do LSK não foi certificada.
          </p>
          {result && (
            <>
              <a
                className="explorer-download"
                href={resultUrl}
                download="result-2026.json"
              >
                Baixar JSON completo com proveniência{" "}
                <span aria-hidden="true">↗</span>
              </a>
              <dl className="explorer-versions">
                <div>
                  <dt>Motor</dt>
                  <dd>{result.provenance.engine_version}</dd>
                </div>
                <div>
                  <dt>SpiceyPy</dt>
                  <dd>{result.provenance.spiceypy_version}</dd>
                </div>
                <div>
                  <dt>CSPICE</dt>
                  <dd>{result.provenance.cspice_version}</dd>
                </div>
              </dl>
              <div className="explorer-kernels">
                {result.provenance.kernels.map((kernel) => (
                  <div key={kernel.filename}>
                    <strong>{kernel.filename}</strong>
                    <span>SHA-256</span>
                    <code>{kernel.sha256}</code>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <section aria-labelledby="explorer-navigation-title">
          <h3 id="explorer-navigation-title">Explore do seu jeito</h3>
          <p>
            Arraste a vista para girar e use a roda do mouse ou dois dedos para
            aproximar. Com foco na cena, use as setas para girar, + e − para
            zoom e Home para recentrar. Os resultados também estão disponíveis
            em texto.
          </p>
        </section>
        <p className="explorer-info-footer">
          Demonstração para exploração e aprendizagem. Sem recomendação de pouso
          ou vínculo oficial com a NASA.
        </p>
      </div>
    </dialog>
  );
}
