/**
 * Position of a body's centre relative to a horizon, as plain text.
 *
 * Rule (SPA-7 draft, CA-3/CA-4): "above" only when the elevation is strictly greater than
 * the horizon elevation, compared on the raw values with no rounding first. Equal means
 * "not above". The text describes geometry only: it never concludes light, shadow, energy
 * or communication.
 */

export type HorizonState = 'above' | 'not_above' | 'no_data';

export type Body = 'sun' | 'earth';

const OF_BODY: Record<Body, string> = { sun: 'do Sol', earth: 'da Terra' };

export function horizonState(elevationDeg: number, horizonDeg = 0): HorizonState {
  if (!Number.isFinite(elevationDeg) || !Number.isFinite(horizonDeg)) return 'no_data';
  return elevationDeg > horizonDeg ? 'above' : 'not_above';
}

/** Against the idealized horizon: the local horizontal plane at 0°, without relief. */
export function idealHorizonText(body: Body, elevationDeg: number): string {
  const state = horizonState(elevationDeg, 0);
  if (state === 'no_data') return 'Sem dado para este local e instante';
  return state === 'above'
    ? `Centro ${OF_BODY[body]} acima do horizonte idealizado`
    : `Centro ${OF_BODY[body]} não está acima do horizonte idealizado`;
}

/** Against the relief profile stored in the file, in the body's direction. */
export function reliefHorizonText(body: Body, elevationDeg: number, reliefDeg: number): string {
  const state = horizonState(elevationDeg, reliefDeg);
  if (state === 'no_data') return 'Sem dado para este local e instante';
  return state === 'above'
    ? `Centro ${OF_BODY[body]} acima do relevo nessa direção`
    : `Centro ${OF_BODY[body]} não está acima do relevo nessa direção`;
}
