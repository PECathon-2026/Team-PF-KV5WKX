export interface StoredObserverLocation {
  lat: number;
  lon: number;
  label: string;
  elevationMeters?: number | null;
  source: 'watchtower' | 'gps' | 'search' | 'spot';
  updatedAt: number;
}

const LOCATION_STORAGE_KEY = 'tsukuyomi_observer_location_v1';
const LOCATION_EVENT_NAME = 'tsukuyomi-observer-location-change';

export function getSavedObserverLocation(): StoredObserverLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredObserverLocation>;
    if (
      typeof parsed.lat === 'number' &&
      !Number.isNaN(parsed.lat) &&
      typeof parsed.lon === 'number' &&
      !Number.isNaN(parsed.lon)
    ) {
      return {
        lat: parsed.lat,
        lon: parsed.lon,
        label:
          typeof parsed.label === 'string' && parsed.label.trim().length > 0
            ? parsed.label.trim()
            : `${parsed.lat.toFixed(4)}°, ${parsed.lon.toFixed(4)}°`,
        elevationMeters:
          typeof parsed.elevationMeters === 'number' ? parsed.elevationMeters : null,
        source: parsed.source || 'watchtower',
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveObserverLocation(loc: Omit<StoredObserverLocation, 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredObserverLocation = {
      ...loc,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(LOCATION_EVENT_NAME, { detail: payload }));
  } catch {
    // Ignore localStorage quota or private mode errors
  }
}

export function subscribeToObserverLocation(
  callback: (loc: StoredObserverLocation) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<StoredObserverLocation>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      const current = getSavedObserverLocation();
      if (current) callback(current);
    }
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === LOCATION_STORAGE_KEY) {
      const current = getSavedObserverLocation();
      if (current) callback(current);
    }
  };
  window.addEventListener(LOCATION_EVENT_NAME, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(LOCATION_EVENT_NAME, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
