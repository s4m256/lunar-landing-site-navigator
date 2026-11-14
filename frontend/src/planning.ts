// UI-only planning inputs. These are not part of the scientific contract.
export interface PlanningSite {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export function validateSite(
  name: string,
  latitude: string,
  longitude: string,
): string | null {
  if (!name.trim()) return "Informe um nome para o local.";
  if (!latitude.trim() || !longitude.trim())
    return "Informe latitude e longitude.";
  if (!Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90)
    return "A latitude deve estar entre −90 e 90.";
  if (!Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180)
    return "A longitude deve estar entre −180 e 180.";
  return null;
}
