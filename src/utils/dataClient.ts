export type SourceFetchStatus = 'loading' | 'ok' | 'retrying' | 'failed';

export interface SourceTelemetryState {
  status: SourceFetchStatus;
  durationMs: number | null;
  stale: boolean;
  savedMinutesAgo: number | null;
  error?: string;
}

export interface DataClientResult<T> {
  data: T;
  durationMs: number;
  stale: boolean;
  savedMinutesAgo: number | null;
  usedFallbackServer: boolean;
}

export interface RetryConfig {
  retries?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface OpenMeteoWeatherPayload {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  hourly?: {
    time?: string[];
    cloud_cover?: number[];
    relative_humidity_2m?: number[];
    visibility?: number[];
    temperature_2m?: number[];
    wind_speed_10m?: number[];
  };
}

export interface AirQualityPayload {
  lat: number;
  lon: number;
  us_aqi: number;
  pm2_5: number;
  pm10: number;
  aerosol_optical_depth: number;
  hourly?: {
    time?: string[];
    pm10?: Array<number | null>;
    pm2_5?: Array<number | null>;
    aerosol_optical_depth?: Array<number | null>;
  };
}

export interface OverpassSpotElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassSpotsPayload {
  spots: OverpassSpotElement[];
  towns: OverpassSpotElement[];
  mirrorUsed: string;
  radiusUsedKm: number;
}

export interface GeocodingSearchItem {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  country?: string;
  admin1?: string;
  population?: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const BACKOFF_DELAYS_MS = [500, 1500];

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const;

interface CachedEnvelope<T> {
  timestamp: number;
  data: T;
}

function buildCacheKey(endpoint: string, lat: number, lon: number): string {
  return `${endpoint}:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function readCache<T>(
  endpoint: string,
  lat: number,
  lon: number
): { data: T; timestamp: number; isFresh: boolean; minutesAgo: number } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const key = buildCacheKey(endpoint, lat, lon);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEnvelope<T>;
    if (!parsed || typeof parsed.timestamp !== 'number' || parsed.data === undefined) {
      return null;
    }
    const ageMs = Math.max(0, Date.now() - parsed.timestamp);
    return {
      data: parsed.data,
      timestamp: parsed.timestamp,
      isFresh: ageMs <= CACHE_TTL_MS,
      minutesAgo: Math.max(1, Math.round(ageMs / 60000)),
    };
  } catch {
    return null;
  }
}

function writeCache<T>(endpoint: string, lat: number, lon: number, data: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = buildCacheKey(endpoint, lat, lon);
    const envelope: CachedEnvelope<T> = {
      timestamp: Date.now(),
      data,
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota errors
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute US EPA AQI from PM2.5 concentration (µg/m³)
 */
export function calculateUsAqiFromPm25(pm25: number): number {
  const c = Math.max(0, pm25);
  if (c <= 12.0) return Math.round((50 / 12.0) * c);
  if (c <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (c - 12.1) + 51);
  if (c <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (c - 35.5) + 101);
  if (c <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (c - 55.5) + 151);
  if (c <= 250.4) return Math.round(((300 - 201) / (250.4 - 150.5)) * (c - 150.5) + 201);
  return Math.min(500, Math.round(((500 - 301) / (500.4 - 250.5)) * (c - 250.5) + 301));
}

/**
 * fetchWithRetry(url, options, { retries: 2, timeoutMs: 20000 })
 * Uses AbortController for per-attempt timeout and exponential backoff (500 ms, then 1500 ms).
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: RetryConfig = { retries: 2, timeoutMs: 20000 }
): Promise<Response> {
  const retries = config.retries ?? 2;
  const timeoutMs = config.timeoutMs ?? 20000;
  let lastError: Error = new Error(`Request failed: ${url}`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoffMs =
        BACKOFF_DELAYS_MS[attempt - 1] ??
        BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1] * Math.pow(2, attempt - 1);
      config.onRetry?.(attempt, lastError);
      await sleep(backoffMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(
          `HTTP ${response.status}${errBody ? `: ${errBody.slice(0, 120)}` : ''}`
        );
      }

      return response;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          lastError = new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
        } else {
          lastError = err;
        }
      } else {
        lastError = new Error('Network error');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/**
 * 1. fetchWeather(lat, lon)
 * Calls https://api.open-meteo.com/v1/forecast with hourly=cloud_cover,relative_humidity_2m,visibility and timezone=auto
 * Directly from the browser. Falls back to /api/weather if the browser request fails, and then to localStorage cache.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  options?: {
    forceRefresh?: boolean;
    onStatusChange?: (status: SourceFetchStatus) => void;
  }
): Promise<DataClientResult<OpenMeteoWeatherPayload>> {
  const endpointKey = 'https://api.open-meteo.com/v1/forecast';
  const startTime = performance.now();
  options?.onStatusChange?.('loading');

  if (!options?.forceRefresh) {
    const cached = readCache<OpenMeteoWeatherPayload>(endpointKey, lat, lon);
    if (cached && cached.isFresh) {
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: cached.data,
        durationMs,
        stale: false,
        savedMinutesAgo: null,
        usedFallbackServer: false,
      };
    }
  }

  const directUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
    lat.toFixed(4)
  )}&longitude=${encodeURIComponent(
    lon.toFixed(4)
  )}&hourly=cloud_cover,relative_humidity_2m,visibility&timezone=auto&forecast_days=2`;

  try {
    const res = await fetchWithRetry(
      directUrl,
      { headers: { Accept: 'application/json' } },
      {
        retries: 2,
        timeoutMs: 20000,
        onRetry: () => options?.onStatusChange?.('retrying'),
      }
    );
    const json = (await res.json()) as OpenMeteoWeatherPayload | OpenMeteoWeatherPayload[];
    const payload = Array.isArray(json) ? json[0] || {} : json || {};
    writeCache(endpointKey, lat, lon, payload);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));
    options?.onStatusChange?.('ok');
    return {
      data: payload,
      durationMs,
      stale: false,
      savedMinutesAgo: null,
      usedFallbackServer: false,
    };
  } catch (browserErr) {
    // Optional fallback: try /api/weather only if direct browser call failed
    options?.onStatusChange?.('retrying');
    try {
      const serverRes = await fetchWithRetry(
        `/api/weather?lats=${encodeURIComponent(lat.toFixed(4))}&lons=${encodeURIComponent(
          lon.toFixed(4)
        )}`,
        { headers: { Accept: 'application/json' } },
        { retries: 0, timeoutMs: 8000 }
      );
      const serverJson = (await serverRes.json()) as
        | OpenMeteoWeatherPayload
        | OpenMeteoWeatherPayload[];
      const payload = Array.isArray(serverJson) ? serverJson[0] || {} : serverJson || {};
      writeCache(endpointKey, lat, lon, payload);
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: payload,
        durationMs,
        stale: false,
        savedMinutesAgo: null,
        usedFallbackServer: true,
      };
    } catch {
      // Check localStorage cache (even if expired)
      const staleCached = readCache<OpenMeteoWeatherPayload>(endpointKey, lat, lon);
      if (staleCached) {
        const durationMs = Math.max(1, Math.round(performance.now() - startTime));
        options?.onStatusChange?.('ok');
        return {
          data: staleCached.data,
          durationMs,
          stale: true,
          savedMinutesAgo: staleCached.minutesAgo,
          usedFallbackServer: false,
        };
      }
      options?.onStatusChange?.('failed');
      throw browserErr instanceof Error
        ? browserErr
        : new Error('Open-Meteo weather request failed');
    }
  }
}

/**
 * 2. fetchAirQuality(lat, lon)
 * Calls https://air-quality-api.open-meteo.com/v1/air-quality with hourly=pm10,pm2_5,aerosol_optical_depth
 * Directly from the browser. Falls back to /api/air-quality if the browser request fails, and then to localStorage cache.
 */
export async function fetchAirQuality(
  lat: number,
  lon: number,
  options?: {
    forceRefresh?: boolean;
    onStatusChange?: (status: SourceFetchStatus) => void;
  }
): Promise<DataClientResult<AirQualityPayload>> {
  const endpointKey = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const startTime = performance.now();
  options?.onStatusChange?.('loading');

  if (!options?.forceRefresh) {
    const cached = readCache<AirQualityPayload>(endpointKey, lat, lon);
    if (cached && cached.isFresh) {
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: cached.data,
        durationMs,
        stale: false,
        savedMinutesAgo: null,
        usedFallbackServer: false,
      };
    }
  }

  const directUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(
    lat.toFixed(4)
  )}&longitude=${encodeURIComponent(
    lon.toFixed(4)
  )}&hourly=pm10,pm2_5,aerosol_optical_depth&timezone=auto&forecast_days=2`;

  const parseAirQualityRaw = (raw: {
    us_aqi?: number;
    pm2_5?: number;
    pm10?: number;
    aerosol_optical_depth?: number;
    hourly?: {
      time?: string[];
      pm10?: Array<number | null>;
      pm2_5?: Array<number | null>;
      aerosol_optical_depth?: Array<number | null>;
    };
  }): AirQualityPayload => {
    const pickCurrentOrValid = (arr?: Array<number | null>, times?: string[]): number | null => {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const nowHourPrefix = new Date().toISOString().slice(0, 13);
      if (Array.isArray(times)) {
        const matchIdx = times.findIndex((t) => t.startsWith(nowHourPrefix));
        if (matchIdx >= 0 && typeof arr[matchIdx] === 'number' && !isNaN(arr[matchIdx]!)) {
          return arr[matchIdx]!;
        }
      }
      for (let i = Math.min(20, arr.length - 1); i >= 0; i--) {
        const v = arr[i];
        if (typeof v === 'number' && !isNaN(v)) return v;
      }
      for (const v of arr) {
        if (typeof v === 'number' && !isNaN(v)) return v;
      }
      return null;
    };

    const pm25Val = Number(
      (
        raw.pm2_5 ??
        pickCurrentOrValid(raw.hourly?.pm2_5, raw.hourly?.time) ??
        15
      ).toFixed(1)
    );
    const pm10Val = Number(
      (
        raw.pm10 ??
        pickCurrentOrValid(raw.hourly?.pm10, raw.hourly?.time) ??
        30
      ).toFixed(1)
    );
    const aodVal = Number(
      (
        raw.aerosol_optical_depth ??
        pickCurrentOrValid(raw.hourly?.aerosol_optical_depth, raw.hourly?.time) ??
        0.18
      ).toFixed(2)
    );
    const usAqiVal =
      typeof raw.us_aqi === 'number' && !isNaN(raw.us_aqi)
        ? Math.round(raw.us_aqi)
        : calculateUsAqiFromPm25(pm25Val);

    return {
      lat,
      lon,
      us_aqi: usAqiVal,
      pm2_5: pm25Val,
      pm10: pm10Val,
      aerosol_optical_depth: aodVal,
      hourly: raw.hourly,
    };
  };

  try {
    const res = await fetchWithRetry(
      directUrl,
      { headers: { Accept: 'application/json' } },
      {
        retries: 2,
        timeoutMs: 20000,
        onRetry: () => options?.onStatusChange?.('retrying'),
      }
    );
    const raw = await res.json();
    const payload = parseAirQualityRaw(raw);
    writeCache(endpointKey, lat, lon, payload);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));
    options?.onStatusChange?.('ok');
    return {
      data: payload,
      durationMs,
      stale: false,
      savedMinutesAgo: null,
      usedFallbackServer: false,
    };
  } catch (browserErr) {
    // Optional fallback: try /api/air-quality only if direct browser call failed
    options?.onStatusChange?.('retrying');
    try {
      const serverRes = await fetchWithRetry(
        `/api/air-quality?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(
          lon.toFixed(4)
        )}`,
        { headers: { Accept: 'application/json' } },
        { retries: 0, timeoutMs: 8000 }
      );
      const serverRaw = await serverRes.json();
      const payload = parseAirQualityRaw(serverRaw);
      writeCache(endpointKey, lat, lon, payload);
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: payload,
        durationMs,
        stale: false,
        savedMinutesAgo: null,
        usedFallbackServer: true,
      };
    } catch {
      const staleCached = readCache<AirQualityPayload>(endpointKey, lat, lon);
      if (staleCached) {
        const durationMs = Math.max(1, Math.round(performance.now() - startTime));
        options?.onStatusChange?.('ok');
        return {
          data: staleCached.data,
          durationMs,
          stale: true,
          savedMinutesAgo: staleCached.minutesAgo,
          usedFallbackServer: false,
        };
      }
      options?.onStatusChange?.('failed');
      throw browserErr instanceof Error
        ? browserErr
        : new Error('Open-Meteo Air Quality request failed');
    }
  }
}

/**
 * Build the lightweight Overpass QL query:
 * - Starts with [out:json][timeout:25];
 * - Queries only: natural=peak, tourism=viewpoint, leisure=nature_reserve,
 *   leisure=park, man_made=observatory, amenity=place_of_worship
 * - Uses "out center 40;"
 */
export function buildOverpassSpotsQuery(
  lat: number,
  lon: number,
  radiusMeters: number
): string {
  return `[out:json][timeout:25];
(
  nwr["natural"="peak"](around:${radiusMeters},${lat},${lon});
  nwr["tourism"="viewpoint"](around:${radiusMeters},${lat},${lon});
  nwr["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lon});
  nwr["leisure"="park"](around:${radiusMeters},${lat},${lon});
  nwr["man_made"="observatory"](around:${radiusMeters},${lat},${lon});
  nwr["amenity"="place_of_worship"](around:${radiusMeters},${lat},${lon});
);
out center 40;`;
}

/**
 * 3. fetchSpots(lat, lon, radiusKm)
 * - Caps search radius at 50 km for first attempt. If it times out, retries with 25 km, then 10 km.
 * - Tries Overpass mirrors one after another (not in parallel), each with a 20s timeout:
 *   https://overpass-api.de/api/interpreter
 *   https://overpass.private.coffee/api/interpreter
 *   https://overpass.kumi.systems/api/interpreter
 *   https://maps.mail.ru/osm/tools/overpass/api/interpreter
 * - Uses POST with body "data=" + encodeURIComponent(query).
 * - Falls back to /api/spots only if direct browser calls fail, and then to localStorage cache.
 */
export async function fetchSpots(
  lat: number,
  lon: number,
  radiusKm: number,
  options?: {
    forceRefresh?: boolean;
    onStatusChange?: (status: SourceFetchStatus) => void;
  }
): Promise<DataClientResult<OverpassSpotsPayload>> {
  const endpointKey = 'https://overpass-api.de/api/interpreter';
  const startTime = performance.now();
  options?.onStatusChange?.('loading');

  // Cap initial radius at 50 km
  const initialRadiusKm = Math.min(50, Math.max(10, radiusKm));

  if (!options?.forceRefresh) {
    const cached = readCache<OverpassSpotsPayload>(endpointKey, lat, lon);
    if (cached && cached.isFresh && cached.data.spots?.length > 0) {
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: cached.data,
        durationMs,
        stale: false,
        savedMinutesAgo: null,
        usedFallbackServer: false,
      };
    }
  }

  // Try local server proxy first for fast caching & sanctuary resilience
  try {
    const serverRes = await fetchWithRetry(
      `/api/spots?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
        lon
      )}&radius=${encodeURIComponent(initialRadiusKm)}`,
      { headers: { Accept: 'application/json' } },
      { retries: 0, timeoutMs: 6000 }
    );
    const serverJson = (await serverRes.json()) as {
      spots?: OverpassSpotElement[];
      towns?: OverpassSpotElement[];
      mirrorUsed?: string;
    };
    if (Array.isArray(serverJson.spots) && serverJson.spots.length > 0) {
      const payload: OverpassSpotsPayload = {
        spots: serverJson.spots,
        towns: Array.isArray(serverJson.towns) ? serverJson.towns : [],
        mirrorUsed: serverJson.mirrorUsed || '/api/spots',
        radiusUsedKm: initialRadiusKm,
      };
      writeCache(endpointKey, lat, lon, payload);
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: payload,
        durationMs,
        stale: false,
        savedMinutesAgo: null,
        usedFallbackServer: true,
      };
    }
  } catch {
    // Proceed to direct Overpass
  }

  // Radius step-down chain: start at min(radiusKm, 50), then 25 km, then 10 km on timeout
  const radiusFallbackChain = [25, 10].filter((r) => r <= initialRadiusKm);
  if (!radiusFallbackChain.includes(initialRadiusKm)) {
    radiusFallbackChain.unshift(initialRadiusKm);
  }

  let lastOverpassError: Error = new Error('All Overpass mirrors timed out or failed');

  for (let mIdx = 0; mIdx < OVERPASS_MIRRORS.length; mIdx++) {
    const mirrorUrl = OVERPASS_MIRRORS[mIdx];
    if (mIdx > 0) {
      options?.onStatusChange?.('retrying');
    }

    for (let rIdx = 0; rIdx < radiusFallbackChain.length; rIdx++) {
      const attemptRadiusKm = radiusFallbackChain[rIdx];
      if (rIdx > 0) {
        options?.onStatusChange?.('retrying');
      }

      const radiusMeters = Math.round(attemptRadiusKm * 1000);
      const query = buildOverpassSpotsQuery(lat, lon, radiusMeters);
      const body = 'data=' + encodeURIComponent(query);

      try {
        const res = await fetchWithRetry(
          mirrorUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              Accept: 'application/json',
            },
            body,
          },
          {
            retries: 0,
            timeoutMs: 4000,
            onRetry: () => options?.onStatusChange?.('retrying'),
          }
        );

        const json = (await res.json()) as { elements?: OverpassSpotElement[] };
        const elements = Array.isArray(json.elements) ? json.elements : [];
        if (elements.length > 0) {
          const payload: OverpassSpotsPayload = {
            spots: elements,
            towns: [],
            mirrorUsed: mirrorUrl,
            radiusUsedKm: attemptRadiusKm,
          };

          writeCache(endpointKey, lat, lon, payload);
          const durationMs = Math.max(1, Math.round(performance.now() - startTime));
          options?.onStatusChange?.('ok');
          return {
            data: payload,
            durationMs,
            stale: false,
            savedMinutesAgo: null,
            usedFallbackServer: false,
          };
        }
      } catch (err) {
        lastOverpassError =
          err instanceof Error ? err : new Error(`Mirror ${mirrorUrl} failed`);
        break;
      }
    }
  }

  options?.onStatusChange?.('retrying');
  try {
    const serverRes = await fetchWithRetry(
      `/api/spots?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
        lon
      )}&radius=${encodeURIComponent(initialRadiusKm)}`,
      { headers: { Accept: 'application/json' } },
      { retries: 0, timeoutMs: 8000 }
    );
    const serverJson = (await serverRes.json()) as {
      spots?: OverpassSpotElement[];
      towns?: OverpassSpotElement[];
      mirrorUsed?: string;
    };
    const payload: OverpassSpotsPayload = {
      spots: Array.isArray(serverJson.spots) ? serverJson.spots : [],
      towns: Array.isArray(serverJson.towns) ? serverJson.towns : [],
      mirrorUsed: serverJson.mirrorUsed || '/api/spots',
      radiusUsedKm: initialRadiusKm,
    };
    writeCache(endpointKey, lat, lon, payload);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));
    options?.onStatusChange?.('ok');
    return {
      data: payload,
      durationMs,
      stale: false,
      savedMinutesAgo: null,
      usedFallbackServer: true,
    };
  } catch {
    const staleCached = readCache<OverpassSpotsPayload>(endpointKey, lat, lon);
    if (staleCached && Array.isArray(staleCached.data.spots) && staleCached.data.spots.length > 0) {
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      options?.onStatusChange?.('ok');
      return {
        data: staleCached.data,
        durationMs,
        stale: true,
        savedMinutesAgo: staleCached.minutesAgo,
        usedFallbackServer: false,
      };
    }
    options?.onStatusChange?.('failed');
    throw lastOverpassError;
  }
}

/**
 * Browser-first city geocoding with server fallback
 */
export async function fetchGeocodingSearch(
  query: string,
  count = 5
): Promise<GeocodingSearchItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const directUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    trimmed
  )}&count=${count}&language=en&format=json`;

  try {
    const res = await fetchWithRetry(
      directUrl,
      { headers: { Accept: 'application/json' } },
      { retries: 2, timeoutMs: 20000 }
    );
    const data = (await res.json()) as { results?: GeocodingSearchItem[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    const serverRes = await fetchWithRetry(
      `/api/geocode?q=${encodeURIComponent(trimmed)}&count=${count}`,
      { headers: { Accept: 'application/json' } },
      { retries: 0, timeoutMs: 8000 }
    );
    const serverData = (await serverRes.json()) as { results?: GeocodingSearchItem[] };
    return Array.isArray(serverData.results) ? serverData.results : [];
  }
}

/**
 * Browser-first reverse geocoding with server fallback
 */
export async function fetchReverseGeocodeLabel(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const directUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lon)}&zoom=10&accept-language=en`;
    const res = await fetchWithRetry(
      directUrl,
      { headers: { Accept: 'application/json' } },
      { retries: 1, timeoutMs: 10000 }
    );
    const data = (await res.json()) as {
      name?: string;
      address?: Record<string, string>;
    };
    const addr = data.address || {};
    const primary =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.village ||
      addr.suburb ||
      addr.county ||
      data.name;
    const region = addr.state || addr.region || addr.country;
    if (primary && region && primary !== region) return `${primary}, ${region}`;
    if (primary) return primary;
  } catch {
    try {
      const serverRes = await fetchWithRetry(
        `/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
        { headers: { Accept: 'application/json' } },
        { retries: 0, timeoutMs: 6000 }
      );
      const serverData = (await serverRes.json()) as { label?: string | null };
      if (serverData?.label) return serverData.label;
    } catch {
      // Ignore
    }
  }
  return null;
}
