import React, { useEffect, useState } from 'react';
import {
  DURATION_OPTIONS,
  DurationDays,
  formatUtcShort,
  getDateHourFromIso,
  parseUtcDateHourToEpochIndex,
  PlaybackSpeed,
  SPEED_OPTIONS,
  WindowSlice,
} from './state';

interface TimePopoverProps {
  timestampsUtc: string[];
  epochIdx: number;
  startIdx: number;
  durationDays: DurationDays;
  slice: WindowSlice;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  onChangeStartIdx: (idx: number) => void;
  onChangeEpochIdx: (idx: number) => void;
  onChangeDuration: (days: DurationDays) => void;
  onTogglePlay: () => void;
  onResetTime: () => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  onClose: () => void;
}

export const TimePopover: React.FC<TimePopoverProps> = ({
  timestampsUtc,
  epochIdx,
  startIdx,
  durationDays,
  slice,
  isPlaying,
  speed,
  onChangeStartIdx,
  onChangeEpochIdx,
  onChangeDuration,
  onTogglePlay,
  onResetTime,
  onChangeSpeed,
  onClose,
}) => {
  const startIso = timestampsUtc[startIdx] ?? timestampsUtc[0];
  const initialParsed = getDateHourFromIso(startIso);
  const [dateInput, setDateInput] = useState<string>(initialParsed.date);
  const [hourInput, setHourInput] = useState<string>(String(initialParsed.hour));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const synced = getDateHourFromIso(timestampsUtc[startIdx] ?? timestampsUtc[0]);
    setDateInput(synced.date);
    setHourInput(String(synced.hour));
  }, [startIdx, timestampsUtc]);

  const applyUtcInputs = (nextDate: string, nextHourRaw: string) => {
    const parsedHour = Number(nextHourRaw);
    const result = parseUtcDateHourToEpochIndex(nextDate, parsedHour, timestampsUtc);
    if (!result.valid || result.startIdx === undefined) {
      setValidationError(result.errorMessage ?? 'Invalid UTC date or hour.');
      return;
    }
    setValidationError(null);
    onChangeStartIdx(result.startIdx);
    onChangeEpochIdx(result.startIdx);
  };

  const handleUseExample = () => {
    setValidationError(null);
    onResetTime();
  };

  const stepEpoch = (deltaHours: number) => {
    const next = Math.max(slice.startIdx, Math.min(slice.endIdx, epochIdx + deltaHours));
    onChangeEpochIdx(next);
  };

  const currentIso = timestampsUtc[epochIdx] ?? timestampsUtc[0];

  return (
    <section
      className="popover-card time-popover"
      role="dialog"
      aria-label="UTC date, duration, and animation controls"
    >
      <div className="popover-head">
        <div>
          <span className="drawer-eyebrow">Ephemeris Window</span>
          <h2>Time (UTC)</h2>
        </div>
        <button
          type="button"
          className="btn-close-panel"
          onClick={onClose}
          aria-label="Close time controls"
        >
          Close
        </button>
      </div>

      <div className="time-current-banner">
        <span>Current epoch</span>
        <strong>{formatUtcShort(currentIso)}</strong>
      </div>

      <div className="time-fields-row">
        <label className="field-block">
          <span>Start date (UTC)</span>
          <input
            type="date"
            aria-label="Start date (UTC)"
            value={dateInput}
            min={timestampsUtc[0].slice(0, 10)}
            max={timestampsUtc[timestampsUtc.length - 1].slice(0, 10)}
            onChange={(e) => {
              const v = e.target.value;
              setDateInput(v);
              applyUtcInputs(v, hourInput);
            }}
          />
        </label>

        <label className="field-block field-hour">
          <span>Hour UTC (0–23)</span>
          <input
            type="number"
            aria-label="Start hour (0–23 UTC)"
            min={0}
            max={23}
            step={1}
            value={hourInput}
            onChange={(e) => {
              const v = e.target.value;
              setHourInput(v);
              applyUtcInputs(dateInput, v);
            }}
          />
        </label>
      </div>

      {validationError && (
        <div className="alert-box" role="alert">
          <p>{validationError}</p>
          <button type="button" className="btn-secondary-sm" onClick={handleUseExample}>
            Reset window
          </button>
        </div>
      )}

      {!validationError && (
        <div className="example-row">
          <span className="muted-caption">
            2026-11-15 to 2026-12-15 UTC
          </span>
          <button type="button" className="btn-link-sm" onClick={handleUseExample}>
            Reset window
          </button>
        </div>
      )}

      <div className="field-block">
        <span>Window span ({slice.totalHours}h evaluated)</span>
        <div className="chip-row" role="group" aria-label="Analysis window duration">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`choice-btn ${durationDays === d ? 'active' : ''}`}
              aria-pressed={durationDays === d}
              onClick={() => onChangeDuration(d)}
            >
              {d} {d === 1 ? 'day' : 'days'}
            </button>
          ))}
        </div>
        {slice.clampedByEnd && (
          <p className="muted-caption">
            Clamped at end of precomputed ephemeris (2026-12-15 00:00 UTC).
          </p>
        )}
      </div>

      <label className="field-block">
        <span>
          Timeline (hour {epochIdx - slice.startIdx} of {slice.totalHours})
        </span>
        <input
          type="range"
          aria-label="UTC epoch timeline"
          min={slice.startIdx}
          max={slice.endIdx}
          value={epochIdx}
          onChange={(e) => onChangeEpochIdx(Number(e.target.value))}
        />
      </label>

      <div className="time-transport-row">
        <button type="button" className="btn-step" onClick={() => stepEpoch(-1)}>
          −1h
        </button>
        <button type="button" className="btn-step" onClick={() => stepEpoch(1)}>
          +1h
        </button>
        <button type="button" className="btn-step" onClick={() => stepEpoch(6)}>
          +6h
        </button>
        <button type="button" className="btn-primary-sm" onClick={onTogglePlay}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn-secondary-sm" onClick={onResetTime}>
          Reset
        </button>
      </div>

      <div className="speed-row">
        <span>Speed</span>
        <div className="chip-row" role="group" aria-label="Playback speed">
          {SPEED_OPTIONS.map((sp) => (
            <button
              key={sp}
              type="button"
              className={`choice-btn ${speed === sp ? 'active' : ''}`}
              aria-pressed={speed === sp}
              onClick={() => onChangeSpeed(sp)}
            >
              {sp}×
            </button>
          ))}
        </div>
      </div>

      <p className="honest-note">
        Times in UTC. All metrics use local 80 m/px LOLA horizons and SPICE MOON_ME ephemeris.
      </p>
    </section>
  );
};
