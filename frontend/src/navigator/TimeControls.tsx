import React, { useEffect, useId, useState } from 'react';
import { describeMissingInstant, findInstantIndex, formatStep, formatUtc, toInputValue } from './timeWindow';

interface UtcFieldProps {
  label: string;
  index: number;
  timestamps: string[];
  stepSeconds: number;
  /** Extra rule checked after the value is found in the dataset; returns a message or null. */
  validate?: (index: number) => string | null;
  onCommit: (index: number) => void;
  /** Called with the message when the typed value is not an instant of the file. */
  onMissing?: (message: string) => void;
  /** Changes when another control picks the value, so the field drops a stale typed value. */
  syncKey?: number;
}

/** Date/time field in UTC. Only instants that exist in the file are accepted; nothing is rounded. */
function UtcField({ label, index, timestamps, stepSeconds, validate, onCommit, onMissing, syncKey = 0 }: UtcFieldProps) {
  const id = useId();
  const errorId = `${id}-erro`;
  const [draft, setDraft] = useState(() => toInputValue(timestamps[index]));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toInputValue(timestamps[index]));
    setError(null);
  }, [index, timestamps, syncKey]);

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];

  const handleChange = (value: string) => {
    setDraft(value);
    const found = findInstantIndex(value, timestamps);
    if (!found.ok) {
      const message = describeMissingInstant(found, timestamps, stepSeconds);
      setError(message);
      onMissing?.(message);
      return;
    }
    const ruleError = validate?.(found.index) ?? null;
    if (ruleError) {
      setError(ruleError);
      onMissing?.(ruleError);
      return;
    }
    setError(null);
    onCommit(found.index);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="datetime-local"
        value={draft}
        min={toInputValue(first)}
        max={toInputValue(last)}
        step={stepSeconds}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TimeControlsProps {
  timestamps: string[];
  stepSeconds: number;
  startIdx: number;
  endIdx: number;
  epochIdx: number;
  /** Message when the requested instant has no sample; null when a sample is shown. */
  missingInstant: string | null;
  /** Incremented by the parent when the instant is chosen outside the date field. */
  epochSync: number;
  isPlaying: boolean;
  onChangeInterval: (startIdx: number, endIdx: number) => void;
  /** fromField is true when the value comes from the date field itself. */
  onChangeEpoch: (idx: number, fromField?: boolean) => void;
  onMissingInstant: (message: string) => void;
  onTogglePlay: () => void;
}

export const TimeControls: React.FC<TimeControlsProps> = ({
  timestamps,
  stepSeconds,
  startIdx,
  endIdx,
  epochIdx,
  missingInstant,
  epochSync,
  isPlaying,
  onChangeInterval,
  onChangeEpoch,
  onMissingInstant,
  onTogglePlay,
}) => {
  const helpId = useId();
  const lastIdx = timestamps.length - 1;
  const isFullWindow = startIdx === 0 && endIdx === lastIdx;

  return (
    <div className="time-controls">
      <fieldset aria-describedby={helpId}>
        <legend>Período analisado (UTC)</legend>
        <div className="field-row">
          <UtcField
            label="Início do período"
            index={startIdx}
            timestamps={timestamps}
            stepSeconds={stepSeconds}
            validate={(i) => (i > endIdx ? 'O início deve ser igual ou anterior ao fim do período.' : null)}
            onCommit={(i) => onChangeInterval(i, endIdx)}
          />
          <UtcField
            label="Fim do período"
            index={endIdx}
            timestamps={timestamps}
            stepSeconds={stepSeconds}
            validate={(i) => (i < startIdx ? 'O fim deve ser igual ou posterior ao início do período.' : null)}
            onCommit={(i) => onChangeInterval(startIdx, i)}
          />
        </div>
        <button type="button" className="btn" disabled={isFullWindow} onClick={() => onChangeInterval(0, lastIdx)}>
          Usar período completo dos dados
        </button>
        <p id={helpId} className="field-help">
          Os horários estão em UTC (horário universal). O arquivo de dados cobre de {formatUtc(timestamps[0])} a{' '}
          {formatUtc(timestamps[lastIdx])}, com um instante a cada {formatStep(stepSeconds)}. Só é possível escolher
          instantes que existem no arquivo; não há interpolação entre eles.
        </p>
      </fieldset>

      <fieldset>
        <legend>Instante exibido</legend>
        <p className="instant-now">
          <span>Mostrando:</span>{' '}
          <strong>{missingInstant === null ? formatUtc(timestamps[epochIdx]) : 'nenhum instante (sem amostra)'}</strong>
        </p>
        <div className="field-row">
          <UtcField
            label="Data e hora do instante"
            index={epochIdx}
            timestamps={timestamps}
            stepSeconds={stepSeconds}
            validate={(i) =>
              i < startIdx || i > endIdx
                ? 'Esse instante está fora do período analisado. Ajuste o período ou escolha outro instante.'
                : null
            }
            onCommit={(i) => onChangeEpoch(i, true)}
            onMissing={onMissingInstant}
            syncKey={epochSync}
          />
          <div className="field field-grow">
            <label htmlFor={`${helpId}-slider`}>Linha do tempo do período</label>
            <input
              id={`${helpId}-slider`}
              type="range"
              min={startIdx}
              max={endIdx}
              step={1}
              value={epochIdx}
              aria-valuetext={formatUtc(timestamps[epochIdx])}
              onChange={(e) => onChangeEpoch(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            disabled={epochIdx <= startIdx}
            onClick={() => onChangeEpoch(epochIdx - 1)}
          >
            Passo anterior
          </button>
          <button
            type="button"
            className="btn"
            disabled={epochIdx >= endIdx}
            onClick={() => onChangeEpoch(epochIdx + 1)}
          >
            Próximo passo
          </button>
          <button
            type="button"
            className="btn"
            disabled={epochIdx === startIdx && missingInstant === null}
            onClick={() => onChangeEpoch(startIdx)}
          >
            Voltar ao início do período
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={startIdx === endIdx}
            onClick={onTogglePlay}
          >
            {isPlaying ? 'Pausar animação' : 'Iniciar animação'}
          </button>
        </div>
      </fieldset>
    </div>
  );
};
