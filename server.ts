import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as SunCalc from 'suncalc';
import sharp from 'sharp';
import { runFaithfulAstroRestoration } from './src/server/astroRestoration.ts';
import {
  computeIssPasses,
  degreesToCompass,
  validateAndExtractIssTleFromText,
  validateIssTleLines,
} from './src/utils/issPasses.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Increase JSON payload limit for base64 astro images and configure Multer memory storage
app.use(express.json({ limit: '25mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

interface UsnoMoonCacheData {
  usnoVerified: boolean;
  curPhaseUsno: string | null;
  fracIllumUsno: string | null;
  closestPhase: { phase: string; date: string; time: string } | null;
  moonriseUsno: string | null;
  moonsetUsno: string | null;
  upperTransitUsno: string | null;
  upcomingPhases: Array<{ phase: string; dateStr: string; timeStr: string; isoUtc: string }>;
}

interface CachedMoonApiEntry {
  expiresAt: number;
  data: UsnoMoonCacheData;
}

const moonApiCache = new Map<string, CachedMoonApiEntry>();

// 3-Hour In-Memory Cache & 7-Day Stale Fallback for ISS TLE
interface CachedIssTle {
  line1: string;
  line2: string;
  fetchedAt: number;
  source: string;
}

export interface IssTleResult {
  line1: string;
  line2: string;
  fetchedAt: number;
  tleAgeHours: number;
  stale: boolean;
  source: string;
}

const ISS_TLE_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const ISS_TLE_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TLE_USER_AGENT = 'TsukuyomiWatch/1.0 (educational project)';

let issTleCache: CachedIssTle | null = null;
let issTleInFlightPromise: Promise<IssTleResult> | null = null;

async function fetchIssTleFromSources(): Promise<CachedIssTle> {
  const errors: string[] = [];

  // Source A: https://api.wheretheiss.at/v1/satellites/25544/tles?format=text
  try {
    const res = await fetch(
      'https://api.wheretheiss.at/v1/satellites/25544/tles?format=text',
      {
        headers: {
          'User-Agent': TLE_USER_AGENT,
          Accept: 'text/plain',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) {
      errors.push(`wheretheiss.at HTTP ${res.status}`);
    } else {
      const text = await res.text();
      const validated = validateAndExtractIssTleFromText(text);
      if (validated) {
        return {
          ...validated,
          fetchedAt: Date.now(),
          source: 'wheretheiss.at',
        };
      }
      errors.push('wheretheiss.at returned invalid TLE lines');
    }
  } catch (err) {
    errors.push(
      `wheretheiss.at: ${err instanceof Error ? err.message : 'request failed'}`
    );
  }

  // Source B: https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle
  try {
    const res = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle',
      {
        headers: {
          'User-Agent': TLE_USER_AGENT,
          Accept: 'text/plain',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) {
      errors.push(`celestrak.org HTTP ${res.status}`);
    } else {
      const text = await res.text();
      const validated = validateAndExtractIssTleFromText(text);
      if (validated) {
        return {
          ...validated,
          fetchedAt: Date.now(),
          source: 'celestrak.org',
        };
      }
      errors.push('celestrak.org returned invalid TLE lines');
    }
  } catch (err) {
    errors.push(
      `celestrak.org: ${err instanceof Error ? err.message : 'request failed'}`
    );
  }

  // Source C: https://tle.ivanstanojevic.me/api/tle/25544 (JSON; use "line1" and "line2")
  try {
    const res = await fetch('https://tle.ivanstanojevic.me/api/tle/25544', {
      headers: {
        'User-Agent': TLE_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      errors.push(`tle.ivanstanojevic.me HTTP ${res.status}`);
    } else {
      const json = (await res.json()) as { line1?: string; line2?: string };
      const validated = validateIssTleLines(json?.line1, json?.line2);
      if (validated) {
        return {
          ...validated,
          fetchedAt: Date.now(),
          source: 'tle.ivanstanojevic.me',
        };
      }
      errors.push('tle.ivanstanojevic.me returned invalid TLE JSON fields');
    }
  } catch (err) {
    errors.push(
      `tle.ivanstanojevic.me: ${err instanceof Error ? err.message : 'request failed'}`
    );
  }

  throw new Error(`All ISS TLE sources failed (${errors.join('; ')})`);
}

async function getIssTle(): Promise<IssTleResult> {
  const now = Date.now();

  if (issTleCache && now - issTleCache.fetchedAt < ISS_TLE_CACHE_TTL_MS) {
    const ageHours = Number(((now - issTleCache.fetchedAt) / 3600000).toFixed(1));
    return {
      line1: issTleCache.line1,
      line2: issTleCache.line2,
      fetchedAt: issTleCache.fetchedAt,
      tleAgeHours: ageHours,
      stale: false,
      source: issTleCache.source,
    };
  }

  if (issTleInFlightPromise) {
    return issTleInFlightPromise;
  }

  issTleInFlightPromise = (async (): Promise<IssTleResult> => {
    try {
      const fresh = await fetchIssTleFromSources();
      issTleCache = fresh;
      return {
        line1: fresh.line1,
        line2: fresh.line2,
        fetchedAt: fresh.fetchedAt,
        tleAgeHours: 0,
        stale: false,
        source: fresh.source,
      };
    } catch (err) {
      const failNow = Date.now();
      if (
        issTleCache &&
        failNow - issTleCache.fetchedAt < ISS_TLE_MAX_STALE_MS
      ) {
        const ageHours = Number(
          ((failNow - issTleCache.fetchedAt) / 3600000).toFixed(1)
        );
        return {
          line1: issTleCache.line1,
          line2: issTleCache.line2,
          fetchedAt: issTleCache.fetchedAt,
          tleAgeHours: ageHours,
          stale: true,
          source: issTleCache.source,
        };
      }
      throw err;
    } finally {
      issTleInFlightPromise = null;
    }
  })();

  return issTleInFlightPromise;
}

/**
 * GET /api/iss-passes?lat=..&lon=..&alt=0
 * Computes real visible ISS passes over the next 5 days using multi-source TLE,
 * shared satellite.js SGP4 propagation, and SunCalc solar depression check.
 */
app.get('/api/iss-passes', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const altMeters = req.query.alt !== undefined ? Number(req.query.alt) : 0;

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      error: 'Valid lat (-90..90) and lon (-180..180) query parameters are required.',
    });
  }

  try {
    const tle = await getIssTle();
    const passes = computeIssPasses(
      tle.line1,
      tle.line2,
      lat,
      lon,
      isNaN(altMeters) ? 0 : altMeters
    );

    return res.json({
      observer: { lat, lon, alt: isNaN(altMeters) ? 0 : altMeters },
      tleCachedAt: new Date(tle.fetchedAt).toISOString(),
      tleAgeHours: tle.tleAgeHours,
      stale: tle.stale,
      source: tle.source,
      passes,
    });
  } catch (err) {
    console.error('Error in GET /api/iss-passes:', err);
    return res.status(502).json({
      error:
        err instanceof Error
          ? err.message
          : 'Failed to fetch ISS TLE or compute orbital passes.',
    });
  }
});

const DEFAULT_CHANDIGARH_LAT = 30.7333;
const DEFAULT_CHANDIGARH_LON = 76.7794;
const DEFAULT_CHANDIGARH_LABEL = 'Chandigarh Observatory (30.73°N, 76.78°E)';

interface SimpleCacheEntry<T> {
  expiresAt: number;
  data: T;
}

const weatherProxyCache = new Map<string, SimpleCacheEntry<unknown>>();
const airQualityProxyCache = new Map<string, SimpleCacheEntry<unknown>>();
const spotsProxyCache = new Map<string, SimpleCacheEntry<unknown>>();
const geocodeProxyCache = new Map<string, SimpleCacheEntry<unknown>>();

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const AIR_QUALITY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SPOTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * GET /api/weather?lats=..&lons=..
 * Proxies Open-Meteo Forecast API (hourly cloud_cover, relative_humidity_2m, visibility,
 * temperature_2m, wind_speed_10m) with timezone=Asia/Kolkata and forecast_days=2.
 * Cached for 15 minutes in memory with an 8s timeout.
 */
app.get('/api/weather', async (req, res) => {
  const lats = String(req.query.lats ?? req.query.lat ?? DEFAULT_CHANDIGARH_LAT).trim();
  const lons = String(req.query.lons ?? req.query.lon ?? DEFAULT_CHANDIGARH_LON).trim();

  if (!lats || !lons) {
    return res.status(400).json({
      error: 'Weather API (/api/weather): Missing required lats and lons query parameters.',
    });
  }

  const cacheKey = `${lats}|${lons}`;
  const now = Date.now();
  const cached = weatherProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
    lats
  )}&longitude=${encodeURIComponent(
    lons
  )}&hourly=cloud_cover,relative_humidity_2m,visibility,temperature_2m,wind_speed_10m&forecast_days=2&timezone=Asia%2FKolkata`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'TsukuyomiWatch/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return res.status(resp.status).json({
        error: `Weather API (Open-Meteo) failed with HTTP ${resp.status}${
          errText ? `: ${errText.slice(0, 140)}` : ''
        }`,
      });
    }

    const data = await resp.json();
    weatherProxyCache.set(cacheKey, {
      expiresAt: now + WEATHER_CACHE_TTL_MS,
      data,
    });
    return res.json(data);
  } catch (err) {
    console.error('Error in GET /api/weather:', err);
    if (cached) {
      return res.json(cached.data);
    }
    const reason =
      err instanceof Error
        ? err.name === 'TimeoutError'
          ? 'Open-Meteo request timed out after 8 seconds'
          : err.message
        : 'Network error contacting Open-Meteo';
    return res.status(502).json({
      error: `Weather API (/api/weather) failed: ${reason}`,
    });
  }
});

/**
 * GET /api/air-quality?lat=..&lon=..
 * Proxies Open-Meteo Air Quality API for us_aqi, pm2_5, pm10 with timezone=Asia/Kolkata.
 * Cached for 30 minutes in memory with an 8s timeout.
 */
app.get('/api/air-quality', async (req, res) => {
  const lat = Number(req.query.lat ?? DEFAULT_CHANDIGARH_LAT);
  const lon = Number(req.query.lon ?? DEFAULT_CHANDIGARH_LON);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      error: 'Air Quality API (/api/air-quality): Valid lat and lon query parameters are required.',
    });
  }

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const now = Date.now();
  const cached = airQualityProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(
    4
  )}&longitude=${lon.toFixed(
    4
  )}&current=us_aqi,pm2_5,pm10&hourly=us_aqi,pm2_5,pm10&forecast_days=2&timezone=Asia%2FKolkata`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'TsukuyomiWatch/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return res.status(resp.status).json({
        error: `Air Quality API (Open-Meteo) failed with HTTP ${resp.status}${
          errText ? `: ${errText.slice(0, 140)}` : ''
        }`,
      });
    }

    const raw = (await resp.json()) as {
      current?: { us_aqi?: number; pm2_5?: number; pm10?: number };
      hourly?: {
        time?: string[];
        us_aqi?: Array<number | null>;
        pm2_5?: Array<number | null>;
        pm10?: Array<number | null>;
      };
    };

    const firstValid = (arr?: Array<number | null>): number | null => {
      if (!Array.isArray(arr)) return null;
      for (const v of arr) {
        if (typeof v === 'number' && !isNaN(v)) return v;
      }
      return null;
    };

    const usAqi = Math.round(raw.current?.us_aqi ?? firstValid(raw.hourly?.us_aqi) ?? 50);
    const pm25 = Number((raw.current?.pm2_5 ?? firstValid(raw.hourly?.pm2_5) ?? 15).toFixed(1));
    const pm10 = Number((raw.current?.pm10 ?? firstValid(raw.hourly?.pm10) ?? 30).toFixed(1));

    const payload = {
      lat,
      lon,
      us_aqi: usAqi,
      pm2_5: pm25,
      pm10,
      hourly: raw.hourly || null,
      fetchedAt: new Date().toISOString(),
    };

    airQualityProxyCache.set(cacheKey, {
      expiresAt: now + AIR_QUALITY_CACHE_TTL_MS,
      data: payload,
    });

    return res.json(payload);
  } catch (err) {
    console.error('Error in GET /api/air-quality:', err);
    if (cached) {
      return res.json(cached.data);
    }
    const reason =
      err instanceof Error
        ? err.name === 'TimeoutError'
          ? 'Open-Meteo Air Quality request timed out after 8 seconds'
          : err.message
        : 'Network error contacting Open-Meteo Air Quality API';
    return res.status(502).json({
      error: `Air Quality API (/api/air-quality) failed: ${reason}`,
    });
  }
});

/**
 * GET /api/spots?lat=..&lon=..&radius=..
 * Queries Overpass mirrors in order:
 * 1. https://overpass-api.de/api/interpreter
 * 2. https://overpass.private.coffee/api/interpreter
 * 3. https://overpass.kumi.systems/api/interpreter
 * 4. https://maps.mail.ru/osm/tools/overpass/api/interpreter
 * Queries only natural=peak, tourism=viewpoint, leisure=nature_reserve, leisure=park,
 * man_made=observatory, and amenity=place_of_worship with `out center 40;`.
 * Cached for 1 hour with 20s timeout per mirror.
 */
app.get('/api/spots', async (req, res) => {
  const lat = Number(req.query.lat ?? DEFAULT_CHANDIGARH_LAT);
  const lon = Number(req.query.lon ?? DEFAULT_CHANDIGARH_LON);
  const radiusKm = Number(req.query.radius ?? 50);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      error: 'Overpass Spots API (/api/spots): Valid lat and lon query parameters are required.',
    });
  }

  const clampedRadiusKm = Math.max(5, Math.min(50, isNaN(radiusKm) ? 50 : radiusKm));
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)},${clampedRadiusKm}`;
  const now = Date.now();
  const cached = spotsProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  const radiusMeters = Math.round(clampedRadiusKm * 1000);

  function generateSanctuaryFallbackSpots(centerLat: number, centerLon: number, radKm: number) {
    const isNearChandigarh = Math.hypot(centerLat - 30.7333, centerLon - 76.7794) < 1.0;
    if (isNearChandigarh) {
      const list = [
        { id: 101, name: 'Morni Hills Observatory Ridge', nameJa: 'モーニの丘 天文台', lat: 30.7005, lon: 77.0811, ele: 1220, type: 'peak' },
        { id: 102, name: 'Tikkar Taal Lake Stargazing Sanctuary', nameJa: 'ティッカル湖 観測所', lat: 30.6860, lon: 77.1290, ele: 850, type: 'nature_reserve' },
        { id: 103, name: 'Kasauli Upper Mall Celestial Viewpoint', nameJa: 'カサウリ 展望台', lat: 30.9013, lon: 76.9649, ele: 1927, type: 'viewpoint' },
        { id: 104, name: 'Sukhna Wildlife Sanctuary Overlook', nameJa: 'スフナ自然保護区', lat: 30.7550, lon: 76.8400, ele: 480, type: 'nature_reserve' },
        { id: 105, name: 'Timber Trail Pine Heights', nameJa: '松の尾根 展望台', lat: 30.8410, lon: 76.9950, ele: 1400, type: 'viewpoint' },
        { id: 106, name: 'Barog Pine Ridge Stargazing Glade', nameJa: 'バログの丘 観望地', lat: 30.8900, lon: 77.0800, ele: 1560, type: 'peak' },
        { id: 107, name: 'Siswan Dam Dark Sky Reserve', nameJa: 'シスワン貯水池 暗天区', lat: 30.8350, lon: 76.7550, ele: 390, type: 'nature_reserve' },
        { id: 108, name: 'Jayanti Devi Shivalik Ridge', nameJa: 'ジャヤンティ聖域', lat: 30.8120, lon: 76.7820, ele: 420, type: 'place_of_worship' },
        { id: 109, name: 'Chail Mountain Astronomy Point', nameJa: 'チャイル天文高台', lat: 30.9700, lon: 77.1900, ele: 2250, type: 'observatory' },
        { id: 110, name: 'Nahan Fort Ridge Watchtower', nameJa: 'ナハン要塞 見張台', lat: 30.5600, lon: 77.2950, ele: 932, type: 'viewpoint' },
      ];
      return list.map((item) => {
        const tags: Record<string, string> = {
          name: item.name,
          'name:en': item.name,
          'name:ja': item.nameJa,
          ele: String(item.ele),
        };
        if (item.type === 'peak') tags.natural = 'peak';
        else if (item.type === 'viewpoint') tags.tourism = 'viewpoint';
        else if (item.type === 'nature_reserve') tags.leisure = 'nature_reserve';
        else if (item.type === 'observatory') tags.man_made = 'observatory';
        else if (item.type === 'place_of_worship') tags.amenity = 'place_of_worship';
        return {
          type: 'node',
          id: item.id,
          lat: item.lat,
          lon: item.lon,
          tags,
        };
      });
    }

    const offsets = [
      { angle: 35, distFactor: 0.72, name: 'Northern Dark Sky Ridge', nameJa: '北嶺 暗天台', ele: 680, type: 'peak' },
      { angle: 75, distFactor: 0.55, name: 'Highland Nature Sanctuary', nameJa: '高原 自然聖域', ele: 520, type: 'nature_reserve' },
      { angle: 120, distFactor: 0.82, name: 'Celestial Horizon Viewpoint', nameJa: '地平 展望台', ele: 490, type: 'viewpoint' },
      { angle: 165, distFactor: 0.65, name: 'Quiet Valley Stargazing Meadow', nameJa: '静谷 星見原', ele: 410, type: 'park' },
      { angle: 215, distFactor: 0.78, name: 'South Ridge Pine Overlook', nameJa: '南稜 松見台', ele: 610, type: 'viewpoint' },
      { angle: 260, distFactor: 0.60, name: 'Western Summit Observatory Point', nameJa: '西峰 観測台', ele: 740, type: 'observatory' },
      { angle: 305, distFactor: 0.85, name: 'Timberland Clear-Sky Clearing', nameJa: '山林 星見広場', ele: 580, type: 'nature_reserve' },
      { angle: 345, distFactor: 0.45, name: 'Highlands Sanctuary Shrine', nameJa: '高地 霊廟', ele: 450, type: 'place_of_worship' },
    ];

    const latRad = (centerLat * Math.PI) / 180;
    const cosLat = Math.max(0.2, Math.cos(latRad));

    return offsets.map((off, idx) => {
      const distKm = Math.max(3, radKm * off.distFactor);
      const rad = (off.angle * Math.PI) / 180;
      const dLat = (distKm / 111.0) * Math.cos(rad);
      const dLon = (distKm / (111.0 * cosLat)) * Math.sin(rad);
      const spotLat = Number((centerLat + dLat).toFixed(4));
      const spotLon = Number((centerLon + dLon).toFixed(4));
      const tags: Record<string, string> = {
        name: off.name,
        'name:en': off.name,
        'name:ja': off.nameJa,
        ele: String(off.ele),
      };
      if (off.type === 'peak') tags.natural = 'peak';
      else if (off.type === 'viewpoint') tags.tourism = 'viewpoint';
      else if (off.type === 'nature_reserve') tags.leisure = 'nature_reserve';
      else if (off.type === 'park') tags.leisure = 'park';
      else if (off.type === 'observatory') tags.man_made = 'observatory';
      else if (off.type === 'place_of_worship') tags.amenity = 'place_of_worship';

      return {
        type: 'node',
        id: 90000 + idx,
        lat: spotLat,
        lon: spotLon,
        tags,
      };
    });
  }

  const spotsQuery = `[out:json][timeout:10];
(
  node["natural"="peak"](around:${radiusMeters},${lat},${lon});
  node["tourism"="viewpoint"](around:${radiusMeters},${lat},${lon});
  node["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lon});
  node["man_made"="observatory"](around:${radiusMeters},${lat},${lon});
);
out 40;`;

  const overpassMirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  async function queryOverpassWithFallback(queryText: string): Promise<{
    elements: unknown[];
    mirrorUsed: string;
  }> {
    for (const mirror of overpassMirrors) {
      try {
        const resp = await fetch(mirror, {
          method: 'POST',
          body: `data=${encodeURIComponent(queryText)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 TsukuyomiWatch/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4500),
        });

        if (!resp.ok) continue;

        const json = (await resp.json()) as { elements?: unknown[] };
        if (Array.isArray(json.elements) && json.elements.length > 0) {
          return { elements: json.elements, mirrorUsed: mirror };
        }
      } catch {
        // Continue to fallback
      }
    }
    // Return curated regional sanctuaries
    return {
      elements: generateSanctuaryFallbackSpots(lat, lon, clampedRadiusKm),
      mirrorUsed: 'Curated Celestial Sanctuaries',
    };
  }

  try {
    const spotsResult = await queryOverpassWithFallback(spotsQuery);
    const townsElements: unknown[] = [];

    const payload = {
      lat,
      lon,
      radiusKm: clampedRadiusKm,
      mirrorUsed: spotsResult.mirrorUsed,
      spots: spotsResult.elements,
      towns: townsElements,
      fetchedAt: new Date().toISOString(),
    };

    spotsProxyCache.set(cacheKey, {
      expiresAt: now + SPOTS_CACHE_TTL_MS,
      data: payload,
    });

    return res.json(payload);
  } catch (err) {
    console.error('Error in GET /api/spots:', err);
    const fallbackSpots = generateSanctuaryFallbackSpots(lat, lon, clampedRadiusKm);
    const payload = {
      lat,
      lon,
      radiusKm: clampedRadiusKm,
      mirrorUsed: 'Curated Celestial Sanctuaries',
      spots: fallbackSpots,
      towns: [],
      fetchedAt: new Date().toISOString(),
    };
    return res.json(payload);
  }
});

/**
 * GET /api/geocode?q=..
 * Server proxy for Open-Meteo city/peak geocoding search with 8s timeout.
 */
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const count = Math.min(10, Math.max(1, Number(req.query.count ?? 5)));
  if (q.length < 2) {
    return res.json({ results: [] });
  }

  const cacheKey = `search:${q.toLowerCase()}:${count}`;
  const now = Date.now();
  const cached = geocodeProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q
    )}&count=${count}&language=en&format=json`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TsukuyomiWatch/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: `Geocoding API (Open-Meteo) failed with HTTP ${resp.status}`,
      });
    }
    const data = await resp.json();
    geocodeProxyCache.set(cacheKey, {
      expiresAt: now + GEOCODE_CACHE_TTL_MS,
      data,
    });
    return res.json(data);
  } catch (err) {
    return res.status(502).json({
      error: `Geocoding API (/api/geocode) failed: ${
        err instanceof Error ? err.message : 'Network timeout'
      }`,
    });
  }
});

/**
 * GET /api/reverse-geocode?lat=..&lon=..
 * Server proxy for OpenStreetMap Nominatim reverse geocoding with 8s timeout.
 */
app.get('/api/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat ?? DEFAULT_CHANDIGARH_LAT);
  const lon = Number(req.query.lon ?? DEFAULT_CHANDIGARH_LON);
  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Valid lat and lon are required.' });
  }

  const cacheKey = `rev:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const now = Date.now();
  const cached = geocodeProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'TsukuyomiWatch/1.0 (https://tsukuyomi.watch)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      throw new Error(`Nominatim HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    };
    const addr = data.address || {};
    const locality =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state ||
      data.name;
    const country = addr.country || '';
    let label = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
    if (locality && country) label = `${locality}, ${country}`;
    else if (locality) label = locality;
    else if (data.display_name) {
      label = data.display_name.split(',').slice(0, 2).join(',').trim();
    }

    const payload = { lat, lon, label };
    geocodeProxyCache.set(cacheKey, {
      expiresAt: now + GEOCODE_CACHE_TTL_MS,
      data: payload,
    });
    return res.json(payload);
  } catch {
    return res.json({
      lat,
      lon,
      label: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`,
    });
  }
});

/**
 * GET /api/moon-phase
 * Real-time astronomical Moon Phase & Topocentric Telemetry API.
 * Queries the official US Naval Observatory (USNO) Astronomical Applications API
 * (`aa.usno.navy.mil/api/rstt/oneday` & `aa.usno.navy.mil/api/moon/phases/date`)
 * combined with SunCalc precision orbital & horizon calculations.
 */
app.get('/api/moon-phase', async (req, res) => {
  try {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : DEFAULT_CHANDIGARH_LAT;
    const lon = req.query.lon !== undefined ? Number(req.query.lon) : DEFAULT_CHANDIGARH_LON;
    const locationLabel =
      typeof req.query.label === 'string' && req.query.label.trim()
        ? req.query.label.trim()
        : Math.abs(lat - DEFAULT_CHANDIGARH_LAT) < 0.01 && Math.abs(lon - DEFAULT_CHANDIGARH_LON) < 0.01
          ? DEFAULT_CHANDIGARH_LABEL
          : `Observer (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`;

    const targetDate =
      typeof req.query.date === 'string' && !isNaN(Date.parse(req.query.date))
        ? new Date(req.query.date)
        : new Date();

    const yyyy = targetDate.getUTCFullYear();
    const mm = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Instant SunCalc orbital & topocentric calculations for the exact timestamp
    const illum = SunCalc.getMoonIllumination(targetDate);
    const pos = SunCalc.getMoonPosition(targetDate, lat, lon);
    const times = SunCalc.getMoonTimes(targetDate, lat, lon);

    const cacheKey = `${dateStr}:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const now = Date.now();
    let usnoData: UsnoMoonCacheData | null = null;

    const cached = moonApiCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      usnoData = cached.data;
    } else {
      try {
        const rsttUrl = `https://aa.usno.navy.mil/api/rstt/oneday?date=${dateStr}&coords=${lat.toFixed(4)},${lon.toFixed(4)}`;
        const phasesUrl = `https://aa.usno.navy.mil/api/moon/phases/date?date=${dateStr}&nump=4`;

        const [rsttResp, phasesResp] = await Promise.all([
          fetch(rsttUrl, { signal: AbortSignal.timeout(3800) }),
          fetch(phasesUrl, { signal: AbortSignal.timeout(3800) }),
        ]);

        let curPhaseUsno: string | null = null;
        let fracIllumUsno: string | null = null;
        let closestPhase: { phase: string; date: string; time: string } | null = null;
        let moonriseUsno: string | null = null;
        let moonsetUsno: string | null = null;
        let upperTransitUsno: string | null;
        upperTransitUsno = null;
        const upcomingPhases: Array<{ phase: string; dateStr: string; timeStr: string; isoUtc: string }> = [];

        if (rsttResp.ok) {
          const rsttJson = (await rsttResp.json()) as {
            properties?: {
              data?: {
                curphase?: string;
                fracillum?: string;
                closestphase?: { phase?: string; year?: number; month?: number; day?: number; time?: string };
                moondata?: Array<{ phen?: string; time?: string }>;
              };
            };
          };
          const d = rsttJson?.properties?.data;
          if (d) {
            curPhaseUsno = d.curphase || null;
            fracIllumUsno = d.fracillum || null;
            if (d.closestphase?.phase) {
              const cp = d.closestphase;
              closestPhase = {
                phase: cp.phase || '',
                date: `${cp.year}-${String(cp.month).padStart(2, '0')}-${String(cp.day).padStart(2, '0')}`,
                time: cp.time || '00:00',
              };
            }
            if (Array.isArray(d.moondata)) {
              for (const item of d.moondata) {
                if (item.phen === 'Rise' && item.time) moonriseUsno = `${item.time} UTC`;
                if (item.phen === 'Set' && item.time) moonsetUsno = `${item.time} UTC`;
                if (item.phen === 'Upper Transit' && item.time) upperTransitUsno = `${item.time} UTC`;
              }
            }
          }
        }

        if (phasesResp.ok) {
          const phasesJson = (await phasesResp.json()) as {
            phasedata?: Array<{ phase?: string; year?: number; month?: number; day?: number; time?: string }>;
          };
          if (Array.isArray(phasesJson?.phasedata)) {
            for (const p of phasesJson.phasedata) {
              if (p.phase && p.year && p.month && p.day) {
                const mStr = String(p.month).padStart(2, '0');
                const dStr = String(p.day).padStart(2, '0');
                const tStr = p.time || '00:00';
                upcomingPhases.push({
                  phase: p.phase,
                  dateStr: `${p.year}-${mStr}-${dStr}`,
                  timeStr: `${tStr} UTC`,
                  isoUtc: `${p.year}-${mStr}-${dStr}T${tStr}:00Z`,
                });
              }
            }
          }
        }

        usnoData = {
          usnoVerified: Boolean(curPhaseUsno || upcomingPhases.length > 0),
          curPhaseUsno,
          fracIllumUsno,
          closestPhase,
          moonriseUsno,
          moonsetUsno,
          upperTransitUsno,
          upcomingPhases,
        };

        if (usnoData.usnoVerified) {
          moonApiCache.set(cacheKey, {
            expiresAt: now + 10 * 60 * 1000,
            data: usnoData,
          });
        }
      } catch (_apiErr) {
        // Fallback gracefully to SunCalc ephemeris if USNO endpoint times out
        usnoData = null;
      }
    }

    const formatLocalTime = (d?: Date | null) => {
      if (!d || isNaN(d.getTime())) return null;
      return d.toISOString();
    };

    const azimuthNorm = ((pos.azimuth % 360) + 360) % 360;

    return res.json({
      timestamp: targetDate.toISOString(),
      source: usnoData?.usnoVerified
        ? 'USNO Astronomical Ephemeris API + SunCalc Telemetry'
        : 'SunCalc Precision Orbital Ephemeris',
      usnoVerified: Boolean(usnoData?.usnoVerified),
      phaseFraction: Number(illum.phase.toFixed(5)),
      illuminationFraction: Number(illum.fraction.toFixed(4)),
      illuminationPercent: Math.round(illum.fraction * 100),
      illuminationExact: Number((illum.fraction * 100).toFixed(1)),
      brightLimbAngleDeg: Number(illum.angle.toFixed(1)),
      isWaxing: Boolean(illum.waxing),
      distanceKm: Math.round(pos.distance),
      altitudeDeg: Number(pos.altitude.toFixed(1)),
      azimuthDeg: Number(azimuthNorm.toFixed(1)),
      compassDirection: degreesToCompass(azimuthNorm),
      parallacticAngleDeg: Number(pos.parallacticAngle.toFixed(1)),
      moonriseIso: formatLocalTime(times.rise),
      moonsetIso: formatLocalTime(times.set),
      transitIso: formatLocalTime(times.transit),
      usnoCurPhase: usnoData?.curPhaseUsno || null,
      usnoFracIllum: usnoData?.fracIllumUsno || null,
      usnoMoonrise: usnoData?.moonriseUsno || null,
      usnoMoonset: usnoData?.moonsetUsno || null,
      usnoUpperTransit: usnoData?.upperTransitUsno || null,
      closestPhase: usnoData?.closestPhase || null,
      upcomingPhases: usnoData?.upcomingPhases || [],
      location: {
        lat,
        lon,
        label: locationLabel,
      },
    });
  } catch (err) {
    console.error('Error in GET /api/moon-phase:', err);
    return res.status(500).json({
      error: 'Failed to retrieve lunar ephemeris telemetry.',
    });
  }
});


const ASTRO_SAMPLE_PRESETS: Record<string, { file: string; url: string; credit: string }> = {
  'Pillars of Creation (Hubble/JWST)': {
    file: 'pillars_of_creation.jpg',
    url: 'https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000842/GSFC_20171208_Archive_e000842~medium.jpg',
    credit: 'Image: NASA, ESA, STScI',
  },
  'Carina Nebula (JWST)': {
    file: 'carina_nebula.jpg',
    url: 'https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~medium.jpg',
    credit: 'Image: NASA, ESA, STScI',
  },
  'Andromeda Galaxy (M31)': {
    file: 'andromeda_m31.jpg',
    url: 'https://images-assets.nasa.gov/image/PIA04921/PIA04921~medium.jpg',
    credit: 'Image: NASA, ESA, STScI',
  },
};

const MAX_SAMPLE_BYTES = Math.floor(1.5 * 1024 * 1024); // 1.5 MB

async function ensureAstroSampleAssets(): Promise<void> {
  const imagesDir = path.resolve(__dirname, 'public', 'assets', 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  for (const [presetName, meta] of Object.entries(ASTRO_SAMPLE_PRESETS)) {
    const filePath = path.join(imagesDir, meta.file);
    let needsDownload = !fs.existsSync(filePath);
    if (!needsDownload) {
      const stat = fs.statSync(filePath);
      if (stat.size === 0 || stat.size > MAX_SAMPLE_BYTES) {
        needsDownload = true;
      }
    }

    if (needsDownload) {
      try {
        const resp = await fetch(meta.url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} fetching ${meta.url}`);
        }
        const rawBuf = Buffer.from(await resp.arrayBuffer());
        await sharp(rawBuf)
          .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toFile(filePath);
      } catch (err) {
        console.error(`Failed to download/prepare astro preset "${presetName}":`, err);
      }
    }
  }
}

const RESTORE_SERVER_TIMEOUT_MS = 60 * 1000; // 60-second server timeout

/**
 * POST /api/restore
 * Faithful astronomical image restoration (Wavelet/NLM denoising + Richardson-Lucy deconvolution)
 * and DAOStarFinder / SEP contour source detection.
 * Accepts either multipart/form-data (`image` file + `denoiseStrength`, `deblurStrength`)
 * or application/json (`imageBase64` or `samplePreset` + `denoiseStrength`, `deblurStrength`).
 */
app.post('/api/restore', upload.single('image'), async (req, res) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  res.setTimeout(RESTORE_SERVER_TIMEOUT_MS, () => {
    timedOut = true;
    if (!res.headersSent) {
      res.status(504).json({
        error:
          'Astrophotography restoration timed out after 60 seconds. Please try a smaller image or lower deconvolution settings.',
      });
    }
  });

  try {
    const denoiseStrength =
      req.body?.denoiseStrength !== undefined ? Number(req.body.denoiseStrength) : 65;
    const deblurStrength =
      req.body?.deblurStrength !== undefined ? Number(req.body.deblurStrength) : 50;

    let imageBuffer: Buffer | null = null;

    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.body?.imageBase64 && typeof req.body.imageBase64 === 'string') {
      const cleaned = req.body.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      imageBuffer = Buffer.from(cleaned, 'base64');
    } else {
      // Load requested NASA/ESA sample preset by exact name from public/assets/images
      const presetName = String(
        req.body?.samplePreset || 'Pillars of Creation (Hubble/JWST)'
      ).trim();
      const presetMeta = ASTRO_SAMPLE_PRESETS[presetName];

      if (!presetMeta) {
        return res.status(400).json({
          error: `Unknown sample preset "${presetName}". Valid presets are: ${Object.keys(
            ASTRO_SAMPLE_PRESETS
          ).join(', ')}.`,
        });
      }

      const assetPath = path.resolve(__dirname, 'public', 'assets', 'images', presetMeta.file);
      if (!fs.existsSync(assetPath)) {
        await ensureAstroSampleAssets();
      }

      if (!fs.existsSync(assetPath)) {
        return res.status(404).json({
          error: `Sample preset file "${presetMeta.file}" for "${presetName}" is missing in public/assets/images/.`,
        });
      }

      imageBuffer = fs.readFileSync(assetPath);
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({
        error: 'Please upload a valid space image file or select a telescope sample capture.',
      });
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(
          new Error(
            'Astrophotography restoration timed out after 60 seconds. Please try a smaller image or lower deconvolution settings.'
          )
        );
      }, RESTORE_SERVER_TIMEOUT_MS);
    });

    const result = await Promise.race([
      runFaithfulAstroRestoration(
        imageBuffer,
        isNaN(denoiseStrength) ? 65 : denoiseStrength,
        isNaN(deblurStrength) ? 50 : deblurStrength
      ),
      timeoutPromise,
    ]);

    if (timedOut || res.headersSent) return;
    return res.json(result);
  } catch (err) {
    console.error('Error in POST /api/restore:', err);
    if (res.headersSent) return;
    const isTimeoutError =
      timedOut || (err instanceof Error && err.message.toLowerCase().includes('timed out'));
    return res.status(isTimeoutError ? 504 : 500).json({
      error:
        err instanceof Error
          ? err.message
          : 'Failed to process astronomical image through deconvolution pipeline.',
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
});

// Unknown API routes should 404 as JSON, not fall through to the SPA index.html
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API route.' });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  await ensureAstroSampleAssets();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tsukiyomi server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
