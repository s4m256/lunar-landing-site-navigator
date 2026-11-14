import React from 'react';
import { formatUtcReadable, WindowSlice } from './state';

interface TimePopoverProps {
  startDate: string;
  startHour: number;
  durationDays: number;
  dateError: string | null;
  windowSlice: WindowSlice;
  epochIdx: number;
  currentUtc: string;
  isPlaying: boolean;
  speedMultiplier: number;
  onChangeStartDate: (val: string) => void;
  onChangeStartHour: (val: number) => void;
  onChangeDurationDays: (days: number) => void;
  onUseExamplePeriod: () => void;
  onChangeEpoch: (idx: number) => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onChangeSpeed: (mult: number) => void;
  onClose: () => void;
}

export const TimePopover: React.FC<TimePopoverProps> = ({
  startDate,
  startHour,
  durationDays,
  dateError,
  windowSlice,
  epochIdx,
  currentUtc,
  isPlaying,
  speedMultiplier,
  onChangeStartDate,
  onChangeStartHour,
  onChangeDurationDays,
  onUseExamplePeriod,
  onChangeEpoch,
  onTogglePlay,
  onRestart,
  onChangeSpeed,
  onClose,
}) => {
  const { startIdx, endIdx } = windowSlice;
  const clamped = Math.max(startIdx, Math.min(endIdx, epochIdx));
  const currentFmt = formatUtcReadable(currentUtc);

  return (
    <section
      className="floating-panel panel-time-popover"
      role="region"
      aria-label="Controle de Tempo e Animação em UTC"
    >
      <div className="panel-header">
        <div>
          <h2>Tempo (UTC)</h2>
          <p className="panel-sub">Agora: {currentFmt.full}</p>
        </div>
        <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Fechar Tempo">
          Fechar
        </button>
      </div>

      {/* Entrada direta por campos (sem depender apenas da barra) */}
      <div className="time-inputs-grid">
        <div className="form-group">
          <label htmlFor="time-start-date">Data inicial (UTC)</label>
          <input
            id="time-start-date"
            type="date"
            className="ui-input"
            value={startDate}
            min="2026-11-15"
            max="2026-12-14"
            onChange={(e) => onChangeStartDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="time-start-hour">Hora (0–23 UTC)</label>
          <input
            id="time-start-hour"
            type="number"
            className="ui-input"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => onChangeStartHour(Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="time-duration-days">Duração</label>
          <select
            id="time-duration-days"
            className="ui-select"
            value={durationDays}
            onChange={(e) => onChangeDurationDays(Number(e.target.value))}
          >
            <option value={1}>1 dia (24 h)</option>
            <option value={3}>3 dias (72 h)</option>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias (ciclo completo)</option>
          </select>
        </div>
      </div>

      {dateError && (
        <div className="error-alert" role="alert">
          {dateError}
        </div>
      )}

      <div className="action-row-wrap">
        <button type="button" className="btn-secondary-sm" onClick={onUseExamplePeriod}>
          Usar período de exemplo
        </button>
      </div>

      {/* Linha do tempo e passo */}
      <div className="form-group">
        <label htmlFor="time-epoch-scrubber">
          Instante dentro do período (passo +{clamped - startIdx}h de {endIdx - startIdx}h)
        </label>
        <input
          id="time-epoch-scrubber"
          type="range"
          min={startIdx}
          max={endIdx}
          step={1}
          value={clamped}
          aria-valuetext={currentFmt.full}
          onChange={(e) => onChangeEpoch(Number(e.target.value))}
        />
      </div>

      {/* Controles Play/Pause, Passo, Recomeçar e Velocidade */}
      <div className="playback-row">
        <button type="button" className="btn-primary-sm" onClick={onTogglePlay}>
          {isPlaying ? 'Pausar animação' : 'Iniciar animação'}
        </button>
        <button
          type="button"
          className="btn-secondary-sm"
          onClick={() => onChangeEpoch(Math.max(startIdx, clamped - 1))}
          aria-label="Voltar 1 hora"
        >
          -1h
        </button>
        <button
          type="button"
          className="btn-secondary-sm"
          onClick={() => onChangeEpoch(Math.min(endIdx, clamped + 1))}
          aria-label="Avançar 1 hora"
        >
          +1h
        </button>
        <button
          type="button"
          className="btn-secondary-sm"
          onClick={() => onChangeEpoch(Math.min(endIdx, clamped + 6))}
          aria-label="Avançar 6 horas"
        >
          +6h
        </button>
        <button type="button" className="btn-secondary-sm" onClick={onRestart}>
          Recomeçar
        </button>
      </div>

      <fieldset className="segmented-fieldset">
        <legend>Velocidade da animação</legend>
        <div className="segmented-row">
          {[1, 3, 6].map((mult) => (
            <button
              key={mult}
              type="button"
              className={`seg-btn ${speedMultiplier === mult ? 'is-active' : ''}`}
              aria-pressed={speedMultiplier === mult}
              onClick={() => onChangeSpeed(mult)}
            >
              {mult}×
            </button>
          ))}
        </div>
      </fieldset>

      <p className="helper-note">
        Os horários estão em UTC (horário universal). Em 3D, o sombreamento do globo ilustra a posição solar enquanto o cálculo pontual usa o horizonte topográfico real.
      </p>
    </section>
  );
};
