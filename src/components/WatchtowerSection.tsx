import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  Search,
  Compass,
  Navigation,
  Sparkles,
  Map as MapIcon,
  Telescope,
  Layers,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Info,
  CheckCircle2,
  ExternalLink,
  Sliders,
  Wind,
} from 'lucide-react';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import { getLunarPhase, DEFAULT_OBSERVATORY_COORDS } from '../utils/lunarCycle';
import {
  awardVisitTopSpotPoints,
  getHonorState,
  subscribeToHonorChanges,
} from '../utils/honorSystem';
import {
  fetchWeather,
  fetchAirQuality,
  fetchSpots,
  fetchGeocodingSearch,
  fetchReverseGeocodeLabel,
  type SourceTelemetryState,
  type OpenMeteoWeatherPayload,
  type AirQualityPayload,
  type OverpassSpotElement,
  type GeocodingSearchItem,
} from '../utils/dataClient';
import { CelestialMapWidget } from './CelestialMapWidget';
import { ScrollPanel, ScrollPageControls } from './common/ScrollPanel';
import {
  getSavedObserverLocation,
  saveObserverLocation,
} from '../utils/observerLocation';

export interface ScoreBreakdown {
  cloudCoverValue: number;
  cloudPenalty: number;
  humidityValue: number;
  humidityPenalty: number;
  visibilityKmValue: number;
  visibilityPenalty: number;
  moonIlluminationPercent: number;
  moonPenalty: number;
  bortleClass: number;
  lightPollutionPenalty: number;
  usAqiValue: number;
  pm25Value: number;
  pm10Value: number;
  airQualityPenalty: number;
  finalScore: number;
}

export type SpotMarkerType = 'mountain' | 'shrine' | 'temple' | 'telescope';

export interface StargazingSpot {
  id: string;
  name: string;
  japanese: string;
  type: SpotMarkerType;
  categoryLabel: string;
  elevation: string;
  distance: string;
  distanceKm: number;
  nearestCityName: string;
  nearestCityDistanceKm: number;
  bortleClass: number; // 1 to 9
  bortleLabel: string;
  honorScore: number;
  blendedRankScore: number;
  scoreBreakdown: ScoreBreakdown;
  cloudCover: number; // %
  humidity: number; // %
  visibilityKm: number;
  temperatureC: number;
  windSpeedKmh: number;
  usAqi: number;
  pm25: number;
  pm10: number;
  isHaze: boolean;
  coordinates: {
    x: number;
    y: number;
    lat: string;
    lng: string;
    latNum: number;
    lngNum: number;
  };
  description: string;
  lore: string;
  hourlyForecast: { time: string; cloud: number; seeing: string; condition: string }[];
}

const DEFAULT_CHANDIGARH = {
  lat: DEFAULT_OBSERVATORY_COORDS.lat, // 30.7333
  lon: DEFAULT_OBSERVATORY_COORDS.lon, // 76.7794
  label: 'Chandigarh, India',
};

const RADIUS_STEPS = [10, 25, 50, 100] as const;
type RadiusKmOption = (typeof RADIUS_STEPS)[number];

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Haversine distance in kilometers between two lat/lon points
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
}

function formatLng(lng: number): string {
  return `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
}

/**
 * Estimate Bortle Scale (1-9) and Light Pollution Penalty from distance to nearest town/city
 */
function estimateBortleFromTownDistance(
  distToTownKm: number,
  townPopulation: number,
  elevationMeters: number
): { bortleClass: number; bortleLabel: string } {
  const popFactor = townPopulation > 500000 ? 0.72 : townPopulation > 100000 ? 0.85 : 1.0;
  const altitudeBonusKm = Math.max(0, (elevationMeters - 350) / 250);
  const effectiveDist = distToTownKm * popFactor + altitudeBonusKm;

  let bortleClass = 5;
  if (effectiveDist >= 42) bortleClass = 1;
  else if (effectiveDist >= 26) bortleClass = 2;
  else if (effectiveDist >= 16) bortleClass = 3;
  else if (effectiveDist >= 10) bortleClass = 4;
  else if (effectiveDist >= 6) bortleClass = 5;
  else if (effectiveDist >= 3.5) bortleClass = 6;
  else if (effectiveDist >= 1.8) bortleClass = 7;
  else if (effectiveDist >= 0.8) bortleClass = 8;
  else bortleClass = 9;

  const labels: Record<number, string> = {
    1: 'Class 1 · Excellent Dark-Sky Site',
    2: 'Class 2 · Truly Dark Sky',
    3: 'Class 3 · Rural Dark Sky',
    4: 'Class 4 · Rural/Suburban Transition',
    5: 'Class 5 · Suburban Sky',
    6: 'Class 6 · Bright Suburban Sky',
    7: 'Class 7 · Suburban/Urban Transition',
    8: 'Class 8 · City Sky',
    9: 'Class 9 · Inner-City Sky',
  };

  return {
    bortleClass,
    bortleLabel: labels[bortleClass] || 'Class 4 · Rural Transition',
  };
}

/**
 * Compute Night Honor Score (0-100):
 * 100 - (cloud_cover * 0.6) - humidity penalty - visibility penalty - light pollution penalty - air quality penalty
 * Air-quality penalty: 0 pts if AQI <= 50, then 0.1 * (AQI - 50), max 20 pts.
 */
export function calculateNightHonorScore(
  cloudCover: number,
  humidity: number,
  visibilityKm: number,
  moonIlluminationPercent: number,
  bortleClass: number,
  usAqi = 50,
  pm25 = 15,
  pm10 = 30
): ScoreBreakdown {
  const cloudPenalty = Number((cloudCover * 0.6).toFixed(1));
  const humidityPenalty = Number(Math.max(0, (humidity - 45) * 0.25).toFixed(1));
  const visibilityPenalty = Number(
    Math.max(0, (24 - Math.min(24, visibilityKm)) * 0.5).toFixed(1)
  );
  const lightPollutionPenalty = Number(((bortleClass - 1) * 2.5).toFixed(1));
  const airQualityPenalty =
    usAqi <= 50 ? 0 : Number(Math.min(20, (usAqi - 50) * 0.1).toFixed(1));
  const moonPenalty = Number((moonIlluminationPercent * 0.1).toFixed(1));

  const rawScore =
    100 -
    cloudPenalty -
    humidityPenalty -
    visibilityPenalty -
    lightPollutionPenalty -
    airQualityPenalty;

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    cloudCoverValue: Math.round(cloudCover),
    cloudPenalty,
    humidityValue: Math.round(humidity),
    humidityPenalty,
    visibilityKmValue: Number(visibilityKm.toFixed(1)),
    visibilityPenalty,
    moonIlluminationPercent: Math.round(moonIlluminationPercent),
    moonPenalty,
    bortleClass,
    lightPollutionPenalty,
    usAqiValue: Math.round(usAqi),
    pm25Value: Number(pm25.toFixed(1)),
    pm10Value: Number(pm10.toFixed(1)),
    airQualityPenalty,
    finalScore,
  };
}

/**
 * Select the hourly indices for tonight in Asia/Kolkata:
 * - From 20:00 today to 04:00 tomorrow in Asia/Kolkata
 * - Or from now until 04:00 if it is already night in Asia/Kolkata.
 */
function selectTonightWindowIndicesAsiaKolkata(times: string[]): {
  windowIndices: number[];
  stripIndices: number[];
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 20);
  const currentIstHour = isNaN(rawHour) ? 20 : rawHour % 24;
  const todayStr = `${year}-${month}-${day}`;

  const tomorrowParts = formatter.formatToParts(new Date(now.getTime() + 24 * 3600 * 1000));
  const tYear = tomorrowParts.find((p) => p.type === 'year')?.value || '';
  const tMonth = tomorrowParts.find((p) => p.type === 'month')?.value || '';
  const tDay = tomorrowParts.find((p) => p.type === 'day')?.value || '';
  const tomorrowStr = `${tYear}-${tMonth}-${tDay}`;

  const matchedIndices: number[] = [];

  if (times.length > 0) {
    times.forEach((tStr, i) => {
      const datePart = tStr.slice(0, 10);
      const hr = parseInt(tStr.slice(11, 13), 10);
      if (isNaN(hr)) return;

      if (currentIstHour <= 4) {
        if (datePart === todayStr && hr >= currentIstHour && hr <= 4) {
          matchedIndices.push(i);
        }
      } else if (currentIstHour >= 20) {
        if (
          (datePart === todayStr && hr >= currentIstHour) ||
          (datePart === tomorrowStr && hr <= 4)
        ) {
          matchedIndices.push(i);
        }
      } else {
        if (
          (datePart === todayStr && hr >= 20) ||
          (datePart === tomorrowStr && hr <= 4)
        ) {
          matchedIndices.push(i);
        }
      }
    });
  }

  const windowIndices =
    matchedIndices.length > 0 ? matchedIndices : [20, 21, 22, 23, 24, 25, 26, 27, 28];

  const stripIndices =
    currentIstHour <= 4 ? [20, 22, 0, 2, 4] : [20, 22, 24, 26, 28];

  return { windowIndices, stripIndices };
}

/**
 * Map Overpass element tags to themed marker icon type & priority weight.
 * Supports: natural=peak, tourism=viewpoint, leisure=nature_reserve,
 * leisure=park, man_made=observatory, amenity=place_of_worship
 */
function classifyOverpassSpot(tags: Record<string, string> = {}): {
  type: SpotMarkerType;
  categoryLabel: string;
  defaultName: string;
  jpSuffix: string;
  priorityWeight: number;
} {
  if (
    tags.man_made === 'observatory' ||
    tags.man_made === 'telescope' ||
    tags.building === 'observatory' ||
    tags.astronomical === 'yes' ||
    tags.tourism === 'observatory'
  ) {
    return {
      type: 'telescope',
      categoryLabel: 'Observatory · 天文台',
      defaultName: 'Astronomical Observatory',
      jpSuffix: '天文台',
      priorityWeight: 6,
    };
  }
  if (tags.natural === 'peak') {
    return {
      type: 'mountain',
      categoryLabel: 'Mountain Peak · 霊峰',
      defaultName: 'Mountain Summit',
      jpSuffix: '霊峰',
      priorityWeight: 5,
    };
  }
  if (tags.tourism === 'viewpoint') {
    return {
      type: 'temple',
      categoryLabel: 'Scenic Viewpoint · 展望台',
      defaultName: 'Horizon Viewpoint',
      jpSuffix: '展望台',
      priorityWeight: 4,
    };
  }
  if (tags.leisure === 'nature_reserve') {
    return {
      type: 'temple',
      categoryLabel: 'Nature Reserve · 自然保護区',
      defaultName: 'Dark-Sky Nature Reserve',
      jpSuffix: '自然保護区',
      priorityWeight: 3,
    };
  }
  if (tags.amenity === 'place_of_worship') {
    return {
      type: 'shrine',
      categoryLabel: 'Sacred Sanctuary · 神社仏閣',
      defaultName: 'Sacred Sanctuary',
      jpSuffix: '神社',
      priorityWeight: 2,
    };
  }
  return {
    type: 'temple',
    categoryLabel: 'Sanctuary Park · 聖苑',
    defaultName: 'Dark-Sky Park',
    jpSuffix: '聖苑',
    priorityWeight: 1,
  };
}

/**
 * Build a StargazingSpot from an Open-Meteo forecast entry, air quality payload, and coordinates
 */
function buildSpotFromWeather(params: {
  id: string;
  name: string;
  japanese: string;
  lat: number;
  lon: number;
  type: SpotMarkerType;
  categoryLabel: string;
  eleMeters: number | null;
  distFromUserKm: number;
  activeRadiusKm: number;
  nearestCityName: string;
  nearestCityDistKm: number;
  nearestCityPop: number;
  weatherEntry: OpenMeteoWeatherPayload;
  airQuality: Pick<AirQualityPayload, 'us_aqi' | 'pm2_5' | 'pm10'>;
  normX: number;
  normY: number;
}): StargazingSpot {
  const {
    id,
    name,
    japanese,
    lat,
    lon,
    type,
    categoryLabel,
    eleMeters,
    distFromUserKm,
    activeRadiusKm,
    nearestCityName,
    nearestCityDistKm,
    nearestCityPop,
    weatherEntry,
    airQuality,
    normX,
    normY,
  } = params;

  const times: string[] = weatherEntry.hourly?.time || [];
  const clouds: number[] = weatherEntry.hourly?.cloud_cover || [];
  const humidities: number[] = weatherEntry.hourly?.relative_humidity_2m || [];
  const visibilities: number[] = weatherEntry.hourly?.visibility || [];
  const temps: number[] = weatherEntry.hourly?.temperature_2m || [];
  const winds: number[] = weatherEntry.hourly?.wind_speed_10m || [];

  const { windowIndices, stripIndices } = selectTonightWindowIndicesAsiaKolkata(times);

  const avgCloud =
    windowIndices.reduce((acc, i) => acc + (clouds[i] ?? 20), 0) / windowIndices.length;
  const avgHumidity =
    windowIndices.reduce((acc, i) => acc + (humidities[i] ?? 50), 0) / windowIndices.length;
  const avgVisMeters =
    windowIndices.reduce((acc, i) => acc + (visibilities[i] ?? 20000), 0) /
    windowIndices.length;
  const avgVisKm = avgVisMeters / 1000;
  const avgTempC = Number(
    (windowIndices.reduce((acc, i) => acc + (temps[i] ?? 22), 0) / windowIndices.length).toFixed(1)
  );
  const avgWindKmh = Number(
    (windowIndices.reduce((acc, i) => acc + (winds[i] ?? 8), 0) / windowIndices.length).toFixed(1)
  );

  const elevationMeters = Math.round(eleMeters ?? weatherEntry.elevation ?? 320);

  const { bortleClass, bortleLabel } = estimateBortleFromTownDistance(
    nearestCityDistKm,
    nearestCityPop,
    elevationMeters
  );

  const lunarInfo = getLunarPhase(new Date(), lat, lon);
  const moonIllum = lunarInfo.illuminationPercent;

  const usAqi = airQuality.us_aqi ?? 50;
  const pm25 = airQuality.pm2_5 ?? 15;
  const pm10 = airQuality.pm10 ?? 30;
  const isHaze = usAqi > 150;

  const scoreBreakdown = calculateNightHonorScore(
    avgCloud,
    avgHumidity,
    avgVisKm,
    moonIllum,
    bortleClass,
    usAqi,
    pm25,
    pm10
  );

  const distancePenalty =
    activeRadiusKm > 0 ? (distFromUserKm / activeRadiusKm) * 12 : 0;
  const blendedRankScore = Number(
    (scoreBreakdown.finalScore - distancePenalty).toFixed(2)
  );

  const targetHours = ['20:00', '22:00', '00:00', '02:00', '04:00'];
  const hourlyForecast = targetHours.map((label, slotIdx) => {
    const idxInArr = stripIndices[slotIdx] ?? 20 + slotIdx * 2;
    const hrCloud = Math.round(clouds[idxInArr] ?? avgCloud);
    const hrVisKm = (visibilities[idxInArr] ?? avgVisMeters) / 1000;
    const seeingArcsec = Math.max(
      0.4,
      Math.min(
        2.2,
        Number((0.45 + hrCloud * 0.01 + (100 - avgHumidity) * -0.002).toFixed(1))
      )
    );
    const condition =
      hrCloud <= 10 && hrVisKm >= 20
        ? 'Apex Clarity'
        : hrCloud <= 25
        ? 'Pristine'
        : hrCloud <= 45
        ? 'Clear'
        : hrCloud <= 70
        ? 'Partly Cloudy'
        : 'Overcast';

    return {
      time: label,
      cloud: hrCloud,
      seeing: `${seeingArcsec}"`,
      condition,
    };
  });

  return {
    id,
    name,
    japanese,
    type,
    categoryLabel,
    elevation: `${elevationMeters.toLocaleString()}m`,
    distance: `${distFromUserKm} km`,
    distanceKm: distFromUserKm,
    nearestCityName,
    nearestCityDistanceKm: nearestCityDistKm,
    bortleClass,
    bortleLabel,
    honorScore: scoreBreakdown.finalScore,
    blendedRankScore,
    scoreBreakdown,
    cloudCover: scoreBreakdown.cloudCoverValue,
    humidity: scoreBreakdown.humidityValue,
    visibilityKm: scoreBreakdown.visibilityKmValue,
    temperatureC: avgTempC,
    windSpeedKmh: avgWindKmh,
    usAqi: scoreBreakdown.usAqiValue,
    pm25: scoreBreakdown.pm25Value,
    pm10: scoreBreakdown.pm10Value,
    isHaze,
    coordinates: {
      x: Math.round(normX),
      y: Math.round(normY),
      lat: formatLat(lat),
      lng: formatLng(lon),
      latNum: lat,
      lngNum: lon,
    },
    description: `${categoryLabel.split('·')[0].trim()} located ${distFromUserKm} km from your coordinates and ${nearestCityDistKm} km from ${nearestCityName}. Tonight's Open-Meteo telemetry (20:00–04:00 IST) reports ${scoreBreakdown.cloudCoverValue}% cloud cover, ${scoreBreakdown.humidityValue}% humidity, ${scoreBreakdown.visibilityKmValue} km optical visibility, ${avgTempC}°C, wind ${avgWindKmh} km/h, and AQI ${scoreBreakdown.usAqiValue} (PM2.5: ${scoreBreakdown.pm25Value} µg/m³).`,
    lore: `Situated at ${elevationMeters}m elevation (Estimated Bortle class ${bortleClass}: ${bortleLabel}), ${name} holds a Night Honor Score of ${scoreBreakdown.finalScore}/100 under the ${lunarInfo.englishName}.`,
    hourlyForecast,
  };
}

/**
 * Create an observer-coordinates telemetry object for the weather panel & Celestial Dome
 * when no Overpass spot is selected yet.
 */
function createObserverTelemetrySpot(
  lat: number,
  lon: number,
  originLabel: string,
  activeRadiusKm: number,
  weatherEntry: OpenMeteoWeatherPayload,
  airQuality: Pick<AirQualityPayload, 'us_aqi' | 'pm2_5' | 'pm10'>
): StargazingSpot {
  const shortCity = originLabel.split(',')[0].trim() || 'Chandigarh';
  return buildSpotFromWeather({
    id: `observer-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: `${shortCity} (Observer Coordinates)`,
    japanese: `${shortCity} · 観測地点`,
    lat,
    lon,
    type: 'telescope',
    categoryLabel: 'Observer Coordinates · 観測地点',
    eleMeters: null,
    distFromUserKm: 0,
    activeRadiusKm,
    nearestCityName: shortCity,
    nearestCityDistKm: 3.5,
    nearestCityPop: 250000,
    weatherEntry,
    airQuality,
    normX: 50,
    normY: 50,
  });
}

type WatchtowerViewMode = 'both' | 'celestial' | 'terrestrial';
type GpsStatusState = 'idle' | 'locating' | 'success' | 'error';

export const WatchtowerSection: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingSearchItem[]>([]);
  const [isSearchingGeo, setIsSearchingGeo] = useState(false);

  const [radiusKm, setRadiusKm] = useState<RadiusKmOption>(50);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number }>(() => {
    const saved = getSavedObserverLocation();
    return saved
      ? { lat: saved.lat, lon: saved.lon }
      : { lat: DEFAULT_CHANDIGARH.lat, lon: DEFAULT_CHANDIGARH.lon };
  });
  const [gpsStatus, setGpsStatus] = useState<GpsStatusState>('idle');
  const [gpsStatusText, setGpsStatusText] = useState<string>(() => {
    const saved = getSavedObserverLocation();
    return saved
      ? `Your location: ${saved.lat.toFixed(4)}, ${saved.lon.toFixed(4)} (${saved.label})`
      : `Your location: ${DEFAULT_CHANDIGARH.lat.toFixed(4)}, ${DEFAULT_CHANDIGARH.lon.toFixed(4)} (${DEFAULT_CHANDIGARH.label})`;
  });
  const [fallbackLocationNote, setFallbackLocationNote] = useState<string | null>(null);

  const [spots, setSpots] = useState<StargazingSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<StargazingSpot | null>(null);
  const [observerTelemetrySpot, setObserverTelemetrySpot] = useState<StargazingSpot>(() =>
    createObserverTelemetrySpot(
      DEFAULT_CHANDIGARH.lat,
      DEFAULT_CHANDIGARH.lon,
      DEFAULT_CHANDIGARH.label,
      50,
      {},
      { us_aqi: 65, pm2_5: 18.5, pm10: 36.0 }
    )
  );
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null);
  const [activeScoreTooltipId, setActiveScoreTooltipId] = useState<string | null>(null);

  // Per-source telemetry status & response durations (Open-Meteo, Air Quality, Overpass)
  const [weatherSource, setWeatherSource] = useState<SourceTelemetryState>({
    status: 'loading',
    durationMs: null,
    stale: false,
    savedMinutesAgo: null,
  });
  const [airQualitySource, setAirQualitySource] = useState<SourceTelemetryState>({
    status: 'loading',
    durationMs: null,
    stale: false,
    savedMinutesAgo: null,
  });
  const [overpassSource, setOverpassSource] = useState<SourceTelemetryState>({
    status: 'loading',
    durationMs: null,
    stale: false,
    savedMinutesAgo: null,
  });

  const [loadingStepText, setLoadingStepText] = useState<string>('Syncing telemetry...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleCacheNotice, setStaleCacheNotice] = useState<string | null>(null);
  const [currentOriginLabel, setCurrentOriginLabel] = useState<string>(() => {
    const saved = getSavedObserverLocation();
    return saved ? saved.label : DEFAULT_CHANDIGARH.label;
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [viewMode, setViewMode] = useState<WatchtowerViewMode>('both');
  const [visitedSpotIds, setVisitedSpotIds] = useState<string[]>(
    () => getHonorState().visitedSpotIds
  );
  const [honorToast, setHonorToast] = useState<string | null>(null);

  // Refs for auto-scroll prompt, Leaflet map, and card scrolling
  const sectionRef = useRef<HTMLElement | null>(null);
  const hasAutoPromptedRef = useRef<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const spotCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    return subscribeToHonorChanges((state) => {
      setVisitedSpotIds(state.visitedSpotIds);
    });
  }, []);

  /**
   * Browser-First Parallel Fetch Pipeline via Promise.allSettled:
   * Runs fetchWeather, fetchAirQuality, and fetchSpots concurrently from src/utils/dataClient.ts
   * so one failure never blocks the others, tracks per-source status + durationMs,
   * surfaces stale cache age, and never invents fake locations if Overpass fails.
   */
  const loadWatchtowerDataForCoords = useCallback(
    async (
      lat: number,
      lon: number,
      originLabel: string,
      activeRadiusKm: RadiusKmOption,
      forceRefresh = false
    ) => {
      setUserCoords({ lat, lon });
      setCurrentOriginLabel(originLabel);
      saveObserverLocation({
        lat,
        lon,
        label: originLabel,
        source: 'watchtower',
      });
      setErrorMessage(null);
      setStaleCacheNotice(null);
      setLoadingStepText('Syncing Open-Meteo, Air Quality & Overpass directly from browser...');

      setWeatherSource((prev) => ({ ...prev, status: 'loading', error: undefined }));
      setAirQualitySource((prev) => ({ ...prev, status: 'loading', error: undefined }));
      setOverpassSource((prev) => ({ ...prev, status: 'loading', error: undefined }));

      const weatherStart = performance.now();
      const aqStart = performance.now();
      const spotsStart = performance.now();

      const [weatherSettled, aqSettled, spotsSettled] = await Promise.allSettled([
        fetchWeather(lat, lon, {
          forceRefresh,
          onStatusChange: (status) =>
            setWeatherSource((prev) => ({ ...prev, status })),
        }),
        fetchAirQuality(lat, lon, {
          forceRefresh,
          onStatusChange: (status) =>
            setAirQualitySource((prev) => ({ ...prev, status })),
        }),
        fetchSpots(lat, lon, activeRadiusKm, {
          forceRefresh,
          onStatusChange: (status) =>
            setOverpassSource((prev) => ({ ...prev, status })),
        }),
      ]);

      const apiErrors: string[] = [];
      const staleMinutesList: number[] = [];

      let originWeatherEntry: OpenMeteoWeatherPayload = {};
      let airQualityData: Pick<AirQualityPayload, 'us_aqi' | 'pm2_5' | 'pm10'> = {
        us_aqi: 55,
        pm2_5: 16.0,
        pm10: 32.0,
      };

      // 1. Handle Open-Meteo Weather Result
      if (weatherSettled.status === 'fulfilled') {
        const res = weatherSettled.value;
        originWeatherEntry = res.data;
        setWeatherSource({
          status: 'ok',
          durationMs: res.durationMs,
          stale: res.stale,
          savedMinutesAgo: res.savedMinutesAgo,
        });
        if (res.stale && res.savedMinutesAgo !== null) {
          staleMinutesList.push(res.savedMinutesAgo);
        }
        setLastSyncedAt(new Date());
      } else {
        const durationMs = Math.max(1, Math.round(performance.now() - weatherStart));
        const msg =
          weatherSettled.reason instanceof Error
            ? weatherSettled.reason.message
            : 'Weather request failed';
        setWeatherSource({
          status: 'failed',
          durationMs,
          stale: false,
          savedMinutesAgo: null,
          error: msg,
        });
        apiErrors.push(`Open-Meteo Weather: ${msg}`);
      }

      // 2. Handle Air Quality Result
      if (aqSettled.status === 'fulfilled') {
        const res = aqSettled.value;
        airQualityData = {
          us_aqi: res.data.us_aqi,
          pm2_5: res.data.pm2_5,
          pm10: res.data.pm10,
        };
        setAirQualitySource({
          status: 'ok',
          durationMs: res.durationMs,
          stale: res.stale,
          savedMinutesAgo: res.savedMinutesAgo,
        });
        if (res.stale && res.savedMinutesAgo !== null) {
          staleMinutesList.push(res.savedMinutesAgo);
        }
        setLastSyncedAt(new Date());
      } else {
        const durationMs = Math.max(1, Math.round(performance.now() - aqStart));
        const msg =
          aqSettled.reason instanceof Error
            ? aqSettled.reason.message
            : 'Air quality request failed';
        setAirQualitySource({
          status: 'failed',
          durationMs,
          stale: false,
          savedMinutesAgo: null,
          error: msg,
        });
        apiErrors.push(`Air Quality API: ${msg}`);
      }

      // Update observer telemetry for the Weather Panel & Celestial Dome
      const updatedObserverTelemetry = createObserverTelemetrySpot(
        lat,
        lon,
        originLabel,
        activeRadiusKm,
        originWeatherEntry,
        airQualityData
      );
      setObserverTelemetrySpot(updatedObserverTelemetry);

      // 3. Handle Overpass Spots Result
      if (spotsSettled.status === 'fulfilled') {
        const res = spotsSettled.value;
        setOverpassSource({
          status: 'ok',
          durationMs: res.durationMs,
          stale: res.stale,
          savedMinutesAgo: res.savedMinutesAgo,
        });
        if (res.stale && res.savedMinutesAgo !== null) {
          staleMinutesList.push(res.savedMinutesAgo);
        }

        const rawElements: OverpassSpotElement[] = Array.isArray(res.data.spots)
          ? res.data.spots
          : [];
        const towns: OverpassSpotElement[] = Array.isArray(res.data.towns)
          ? res.data.towns
          : [];

        const seenNames = new Set<string>();
        const candidatePool: {
          id: string;
          name: string;
          japanese: string;
          lat: number;
          lon: number;
          type: SpotMarkerType;
          categoryLabel: string;
          eleMeters: number | null;
          distFromUserKm: number;
          priorityWeight: number;
        }[] = [];

        for (const el of rawElements) {
          const elLat = el.lat ?? el.center?.lat;
          const elLon = el.lon ?? el.center?.lon;
          if (typeof elLat !== 'number' || typeof elLon !== 'number') continue;

          const distKm = haversineKm(lat, lon, elLat, elLon);
          if (distKm > activeRadiusKm * 1.15) continue;

          const meta = classifyOverpassSpot(el.tags);
          const rawName =
            el.tags?.['name:en'] ||
            el.tags?.name ||
            el.tags?.['official_name'] ||
            `${meta.defaultName} (${distKm.toFixed(1)} km)`;

          const normName = rawName.toLowerCase().trim();
          if (seenNames.has(normName)) continue;
          seenNames.add(normName);

          const jpTag = el.tags?.['name:ja'];
          const japanese =
            jpTag && jpTag !== rawName ? jpTag : `${rawName} · ${meta.jpSuffix}`;

          const parsedEle = el.tags?.ele ? parseFloat(el.tags.ele) : null;

          candidatePool.push({
            id: `overpass-${el.type}-${el.id}`,
            name: rawName,
            japanese,
            lat: elLat,
            lon: elLon,
            type: meta.type,
            categoryLabel: meta.categoryLabel,
            eleMeters:
              parsedEle !== null && !isNaN(parsedEle) ? Math.round(parsedEle) : null,
            distFromUserKm: Number(distKm.toFixed(1)),
            priorityWeight: meta.priorityWeight + (el.tags?.ele ? 1 : 0),
          });
        }

        candidatePool.sort((a, b) => {
          if (b.priorityWeight !== a.priorityWeight) {
            return b.priorityWeight - a.priorityWeight;
          }
          return a.distFromUserKm - b.distFromUserKm;
        });

        const topCandidates: typeof candidatePool = [];
        for (const cand of candidatePool) {
          if (topCandidates.length >= 10) break;
          const tooClose = topCandidates.some(
            (existing) => haversineKm(existing.lat, existing.lon, cand.lat, cand.lon) < 1.2
          );
          if (!tooClose) {
            topCandidates.push(cand);
          }
        }

        if (topCandidates.length === 0) {
          setSpots([]);
          setSelectedSpot(null);
        } else {
          const shortCity = originLabel.split(',')[0].trim() || 'Chandigarh';
          const minLat = Math.min(...topCandidates.map((c) => c.lat));
          const maxLat = Math.max(...topCandidates.map((c) => c.lat));
          const minLon = Math.min(...topCandidates.map((c) => c.lon));
          const maxLon = Math.max(...topCandidates.map((c) => c.lon));

          const scoredSpots: StargazingSpot[] = topCandidates.map((cand) => {
            let nearestCityName = shortCity;
            let nearestCityDistKm = Math.max(2.0, cand.distFromUserKm);
            let nearestCityPop = 120000;

            if (towns.length > 0) {
              let minTownDist = Infinity;
              for (const town of towns) {
                const tLat = town.lat ?? town.center?.lat;
                const tLon = town.lon ?? town.center?.lon;
                if (tLat === undefined || tLon === undefined) continue;
                const d = haversineKm(cand.lat, cand.lon, tLat, tLon);
                if (d < minTownDist) {
                  minTownDist = d;
                  nearestCityName =
                    town.tags?.['name:en'] || town.tags?.name || nearestCityName;
                  const parsedPop = town.tags?.population
                    ? parseInt(town.tags.population, 10)
                    : 0;
                  nearestCityPop =
                    !isNaN(parsedPop) && parsedPop > 0
                      ? parsedPop
                      : town.tags?.place === 'city'
                      ? 250000
                      : 45000;
                }
              }
              if (minTownDist < Infinity) {
                nearestCityDistKm = Number(minTownDist.toFixed(1));
              }
            }

            const normX =
              maxLon > minLon
                ? 18 + ((cand.lon - minLon) / (maxLon - minLon)) * 64
                : 50;
            const normY =
              maxLat > minLat
                ? 82 - ((cand.lat - minLat) / (maxLat - minLat)) * 64
                : 50;

            return buildSpotFromWeather({
              id: cand.id,
              name: cand.name,
              japanese: cand.japanese,
              lat: cand.lat,
              lon: cand.lon,
              type: cand.type,
              categoryLabel: cand.categoryLabel,
              eleMeters: cand.eleMeters,
              distFromUserKm: cand.distFromUserKm,
              activeRadiusKm,
              nearestCityName,
              nearestCityDistKm,
              nearestCityPop,
              weatherEntry: originWeatherEntry,
              airQuality: airQualityData,
              normX,
              normY,
            });
          });

          scoredSpots.sort((a, b) => b.blendedRankScore - a.blendedRankScore);
          setSpots(scoredSpots);
          setSelectedSpot(scoredSpots[0] || null);
        }
      } else {
        const durationMs = Math.max(1, Math.round(performance.now() - spotsStart));
        const msg =
          spotsSettled.reason instanceof Error
            ? spotsSettled.reason.message
            : 'Overpass request failed';
        setOverpassSource({
          status: 'failed',
          durationMs,
          stale: false,
          savedMinutesAgo: null,
          error: msg,
        });
        // Do not invent fake locations when Overpass fails completely
        setSpots([]);
        setSelectedSpot(null);
      }

      if (staleMinutesList.length > 0) {
        const maxMins = Math.max(...staleMinutesList);
        setStaleCacheNotice(`Showing saved data from ${maxMins} minutes ago`);
      }

      if (apiErrors.length > 0) {
        setErrorMessage(apiErrors.join(' | '));
      }
    },
    []
  );

  /**
   * Browser Geolocation API handler (`enableHighAccuracy: true, timeout: 8000`)
   * Falls back to Chandigarh (30.7333, 76.7794) if GPS is denied or times out,
   * and shows: "Using Chandigarh. Allow location or search a city."
   */
  const handleUseLocation = useCallback(
    (isAutoScrollTrigger = false) => {
      if (!isAutoScrollTrigger) {
        playKotoNote(440, 1.2);
      }
      setGpsStatus('locating');
      setGpsStatusText('Locating you...');
      setErrorMessage(null);

      const fallbackToChandigarh = async () => {
        setGpsStatus('error');
        setFallbackLocationNote('Using Chandigarh. Allow location or search a city.');
        setGpsStatusText(
          `Your location: ${DEFAULT_CHANDIGARH.lat.toFixed(4)}, ${DEFAULT_CHANDIGARH.lon.toFixed(
            4
          )} (${DEFAULT_CHANDIGARH.label})`
        );
        await loadWatchtowerDataForCoords(
          DEFAULT_CHANDIGARH.lat,
          DEFAULT_CHANDIGARH.lon,
          DEFAULT_CHANDIGARH.label,
          radiusKm
        );
      };

      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            setFallbackLocationNote(null);
            const placeName =
              (await fetchReverseGeocodeLabel(latitude, longitude)) ||
              `${formatLat(latitude)}, ${formatLng(longitude)}`;
            setGpsStatus('success');
            setGpsStatusText(
              `Your location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (${placeName})`
            );
            await loadWatchtowerDataForCoords(
              latitude,
              longitude,
              placeName,
              radiusKm
            );
          },
          () => {
            fallbackToChandigarh();
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 60000,
          }
        );
      } else {
        fallbackToChandigarh();
      }
    },
    [loadWatchtowerDataForCoords, radiusKm]
  );

  // Immediately load saved Watchtower coords or Chandigarh weather + spots on mount
  useEffect(() => {
    const saved = getSavedObserverLocation();
    loadWatchtowerDataForCoords(
      saved ? saved.lat : DEFAULT_CHANDIGARH.lat,
      saved ? saved.lon : DEFAULT_CHANDIGARH.lon,
      saved ? saved.label : DEFAULT_CHANDIGARH.label,
      radiusKm
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-prompt for GPS when the user first scrolls to the Watchtower section
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !hasAutoPromptedRef.current) {
          hasAutoPromptedRef.current = true;
          handleUseLocation(true);
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [handleUseLocation]);

  // Auto-refresh weather, air quality, and spots every 15 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadWatchtowerDataForCoords(
        userCoords.lat,
        userCoords.lon,
        currentOriginLabel,
        radiusKm,
        true
      );
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [userCoords.lat, userCoords.lon, currentOriginLabel, radiusKm, loadWatchtowerDataForCoords]);

  /**
   * Re-query when the user changes the radius slider (10 / 25 / 50 / 100 km)
   */
  const handleRadiusChange = (nextRadius: RadiusKmOption) => {
    playSuzuChime();
    setRadiusKm(nextRadius);
    loadWatchtowerDataForCoords(
      userCoords.lat,
      userCoords.lon,
      currentOriginLabel,
      nextRadius,
      true
    );
  };

  /**
   * City search via browser-first fetchGeocodingSearch
   */
  const searchOpenMeteoGeocoding = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearchingGeo(true);
    try {
      const results = await fetchGeocodingSearch(trimmed, 5);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearchingGeo(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchOpenMeteoGeocoding(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpenMeteoGeocoding]);

  const handleSelectGeocodedPlace = (place: GeocodingSearchItem) => {
    playSuzuChime();
    const label = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    setSearchQuery('');
    setSearchResults([]);
    setFallbackLocationNote(null);
    setGpsStatus('success');
    setGpsStatusText(
      `Your location: ${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)} (${label})`
    );
    loadWatchtowerDataForCoords(place.latitude, place.longitude, label, radiusKm);
  };

  const handleSearchFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchResults.length > 0) {
      handleSelectGeocodedPlace(searchResults[0]);
      return;
    }
    try {
      setIsSearchingGeo(true);
      const results = await fetchGeocodingSearch(searchQuery.trim(), 1);
      if (results.length > 0) {
        handleSelectGeocodedPlace(results[0]);
      } else {
        setErrorMessage(
          `Geocoding Search: No location found matching "${searchQuery}". Try another city or peak name.`
        );
      }
    } catch (err) {
      setErrorMessage(
        `Geocoding Search failed: ${
          err instanceof Error ? err.message : 'Unable to reach geocoding service.'
        }`
      );
    } finally {
      setIsSearchingGeo(false);
    }
  };

  const handleRetrySync = useCallback(() => {
    playSuzuChime();
    loadWatchtowerDataForCoords(
      userCoords.lat,
      userCoords.lon,
      currentOriginLabel,
      radiusKm,
      true
    );
  }, [loadWatchtowerDataForCoords, userCoords.lat, userCoords.lon, currentOriginLabel, radiusKm]);

  const handleSelectSpot = (spot: StargazingSpot) => {
    playSuzuChime();
    setSelectedSpot(spot);
    if (leafletMapRef.current) {
      leafletMapRef.current.panTo([spot.coordinates.latNum, spot.coordinates.lngNum], {
        animate: true,
        duration: 0.6,
      });
    }
  };

  const handleVisitSpot = (spot: StargazingSpot) => {
    playKotoNote(523.25, 1.2);
    const result = awardVisitTopSpotPoints(spot.id, spot.name, spot.honorScore);
    if (result.awarded) {
      setHonorToast(
        `+${result.pointsAdded} Honor Points awarded for visiting ${spot.name} (Score ${spot.honorScore}/100)!`
      );
      setTimeout(() => setHonorToast(null), 4500);
    }
  };

  const [mapPanelTick, setMapPanelTick] = useState(0);

  // Initialize Interactive Parchment-Themed Leaflet Map
  useEffect(() => {
    if (viewMode === 'celestial') {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markersLayerRef.current = null;
      }
      return;
    }
    const container = mapContainerRef.current;
    if (!container) return;

    if (!leafletMapRef.current) {
      const initialCenter: [number, number] = userCoords
        ? [userCoords.lat, userCoords.lon]
        : selectedSpot
        ? [selectedSpot.coordinates.latNum, selectedSpot.coordinates.lngNum]
        : [DEFAULT_CHANDIGARH.lat, DEFAULT_CHANDIGARH.lon];

      const map = L.map(container, {
        center: initialCenter,
        zoom: 10,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap · Nominatim · Overpass · Open-Meteo',
        maxZoom: 18,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;
    }

    const t1 = window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 60);
    const t2 = window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 350);
    const t3 = window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 720);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [viewMode, mapPanelTick]);

  useEffect(() => {
    const onResize = () => {
      leafletMapRef.current?.invalidateSize();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scrollpanel:opened', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scrollpanel:opened', onResize);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []);


  // Render Glowing "You Are Here" Marker, Radius Circle, and Custom Spot Markers on Leaflet Map
  useEffect(() => {
    const map = leafletMapRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (userCoords) {
      L.circle([userCoords.lat, userCoords.lon], {
        radius: radiusKm * 1000,
        color: '#D4A84B',
        weight: 1.5,
        opacity: 0.55,
        fillColor: '#D4A84B',
        fillOpacity: 0.05,
        dashArray: '6 6',
      }).addTo(layerGroup);

      const userIconHtml = `
        <div class="relative flex flex-col items-center" style="transform: translate(-50%, -50%);">
          <div class="relative flex items-center justify-center w-9 h-9">
            <span class="absolute inset-0 rounded-full bg-[#38BDF8] opacity-60 animate-ping"></span>
            <div class="relative w-7 h-7 rounded-full bg-[#0E1326] border-2 border-[#38BDF8] shadow-[0_0_18px_rgba(56,189,248,0.95)] flex items-center justify-center">
              <div class="w-2.5 h-2.5 rounded-full bg-[#38BDF8]"></div>
            </div>
          </div>
          <div class="mt-1 px-2 py-0.5 rounded bg-[#0E1326]/95 border border-[#38BDF8] text-[#F4EFE3] font-mono text-[9px] font-bold tracking-wider whitespace-nowrap shadow-md">
            YOU ARE HERE
          </div>
        </div>
      `;

      const userMarker = L.marker([userCoords.lat, userCoords.lon], {
        icon: L.divIcon({
          className: 'tsukuyomi-user-marker',
          html: userIconHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        zIndexOffset: 1000,
      });

      userMarker.addTo(layerGroup);
    }

    spots.forEach((spot) => {
      const isSelected = selectedSpot?.id === spot.id;
      const emojiGlyph =
        spot.type === 'telescope'
          ? '🔭'
          : spot.type === 'shrine'
          ? '⛩️'
          : spot.type === 'mountain'
          ? '⛰️'
          : '🏯';

      const iconHtml = `
        <div class="relative flex flex-col items-center group" style="transform: translate(-50%, -50%);">
          <div class="w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
            isSelected
              ? 'bg-[#B3202A] text-[#F4EFE3] border-[#F4EFE3] scale-115 shadow-[0_0_18px_rgba(179,32,42,0.85)]'
              : 'bg-[#0A0A0F]/95 text-[#D4A84B] border-[#D4A84B] hover:scale-110 shadow-[0_0_12px_rgba(212,168,75,0.45)]'
          }">
            <span style="font-size: 16px; line-height: 1;">${emojiGlyph}</span>
          </div>
          <div class="mt-1 px-2 py-0.5 rounded whitespace-nowrap font-mono text-[10px] font-bold tracking-wider ${
            isSelected
              ? 'bg-[#0E1326] text-[#D4A84B] border border-[#D4A84B]'
              : 'bg-[#0A0A0F]/90 text-[#F4EFE3] border border-[#151B38]'
          }">
            ${spot.name.slice(0, 16)} (${spot.honorScore})
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'tsukuyomi-custom-marker',
        html: iconHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([spot.coordinates.latNum, spot.coordinates.lngNum], {
        icon: customIcon,
      });

      marker.on('click', () => {
        playSuzuChime();
        setSelectedSpot(spot);
        const cardEl = spotCardRefs.current[spot.id];
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      marker.on('mouseover', () => {
        setHoveredSpotId(spot.id);
      });

      marker.on('mouseout', () => {
        setHoveredSpotId((prev) => (prev === spot.id ? null : prev));
      });

      marker.addTo(layerGroup);
    });

    if (selectedSpot) {
      map.panTo([selectedSpot.coordinates.latNum, selectedSpot.coordinates.lngNum], {
        animate: true,
        duration: 0.6,
      });
    } else if (userCoords) {
      const zoomForRadius =
        radiusKm === 10 ? 12 : radiusKm === 25 ? 10 : radiusKm === 50 ? 9 : 8;
      map.setView([userCoords.lat, userCoords.lon], zoomForRadius, { animate: true });
    }
  }, [spots, selectedSpot, userCoords, radiusKm, viewMode, mapPanelTick]);


  const hoveredSpot = spots.find((s) => s.id === hoveredSpotId) || null;
  const activeDisplaySpot = selectedSpot || observerTelemetrySpot;

  const isAnySyncing =
    weatherSource.status === 'loading' ||
    weatherSource.status === 'retrying' ||
    airQualitySource.status === 'loading' ||
    airQualitySource.status === 'retrying' ||
    overpassSource.status === 'loading' ||
    overpassSource.status === 'retrying';

  const lastSyncedHHMM = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '--:--';

  const formatSourceBadge = (label: string, src: SourceTelemetryState) => {
    const colorClass =
      src.status === 'ok'
        ? 'text-[#4ADE80] border-[#4ADE80]/40 bg-[#4ADE80]/10'
        : src.status === 'retrying'
        ? 'text-[#FBBF24] border-[#FBBF24]/40 bg-[#FBBF24]/10'
        : src.status === 'loading'
        ? 'text-[#38BDF8] border-[#38BDF8]/40 bg-[#38BDF8]/10'
        : 'text-[#F87171] border-[#F87171]/40 bg-[#F87171]/10';

    return (
      <div
        key={label}
        className={`px-2 py-1 rounded-lg border font-mono text-[10px] flex items-center justify-between gap-1.5 tabular-nums ${colorClass}`}
      >
        <span className="font-bold truncate">{label}:</span>
        <span className="uppercase font-bold">
          {src.status}
          {src.durationMs !== null ? ` (${src.durationMs} ms)` : ''}
        </span>
      </div>
    );
  };

  const renderScoreBreakdownTooltip = (spot: StargazingSpot) => {
    const b = spot.scoreBreakdown;
    return (
      <div className="p-3 rounded-xl bg-[#070913]/98 border border-[#D4A84B] shadow-[0_0_25px_rgba(212,168,75,0.4)] text-left font-mono text-[10.5px] space-y-1.5 w-72 z-50">
        <div className="flex items-center justify-between border-b border-[#D4A84B]/30 pb-1 text-[#D4A84B] font-bold">
          <span>NIGHT HONOR SCORE FORMULA</span>
          <span className="tabular-nums">{b.finalScore} / 100</span>
        </div>

        <div className="space-y-1 tabular-nums text-[#F4EFE3]/90">
          <div className="flex justify-between">
            <span className="text-[#8E9BB5]">Base Sanctuary Score</span>
            <span className="font-bold text-[#F4EFE3]">100.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E9BB5]">Cloud Cover ({b.cloudCoverValue}% × 0.6)</span>
            <span className="text-[#F87171]">-{b.cloudPenalty.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E9BB5]">Humidity Penalty ({b.humidityValue}% RH)</span>
            <span className="text-[#F87171]">-{b.humidityPenalty.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E9BB5]">Visibility Penalty ({b.visibilityKmValue} km)</span>
            <span className="text-[#F87171]">-{b.visibilityPenalty.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E9BB5]">
              Light Pollution (Estimated Bortle class {b.bortleClass})
            </span>
            <span className="text-[#F87171]">-{b.lightPollutionPenalty.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E9BB5]">
              Air Quality (AQI {b.usAqiValue} · PM2.5 {b.pm25Value})
            </span>
            <span className="text-[#F87171]">-{b.airQualityPenalty.toFixed(1)}</span>
          </div>
        </div>

        <div className="border-t border-[#151B38] pt-1 flex justify-between font-bold text-xs">
          <span className="text-[#D4A84B]">Calculated Score</span>
          <span className="text-[#F4EFE3] tabular-nums">{b.finalScore} PTS</span>
        </div>
      </div>
    );
  };

  return (
    <section
      id="watchtower"
      ref={sectionRef}
      className="relative min-h-screen py-24 px-4 sm:px-8 max-w-7xl mx-auto"
    >
      {/* Chapter 01 Header */}
      <div className="border-b border-[#D4A84B]/25 pb-6 mb-10">
        <div className="flex items-center space-x-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
          <span>01. THE WATCHTOWER · 見張台</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2">
          <div>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#F4EFE3] text-glow-moon">
              Stargazing Location Finder
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl leading-relaxed">
              Real-time sanctuary discovery via Overpass API within {radiusKm} km paired with tonight's Asia/Kolkata (20:00–04:00) Open-Meteo weather, air quality (AQI & PM2.5), and Estimated Bortle class grading.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 text-xs font-mono text-[#D4A84B]">
              <Compass className="w-4 h-4 text-[#D4A84B]" />
              <span>REGION: {currentOriginLabel.toUpperCase()}</span>
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono text-[#8E9BB5] bg-[#0E1326] border border-[#1E293B] px-2.5 py-1.5 rounded-xl">
              <span>Last synced {lastSyncedHHMM}</span>
              <button
                type="button"
                onClick={handleRetrySync}
                disabled={isAnySyncing}
                className="px-2 py-0.5 rounded bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] font-bold transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isAnySyncing ? 'animate-spin' : ''}`}
                />
                <span>Retry sync</span>
              </button>
            </div>

            {/* Viewport Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-[#0E1326] border border-[#1E293B] rounded-xl">
              <button
                onClick={() => setViewMode('both')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  viewMode === 'both'
                    ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold'
                    : 'text-[#8E9BB5] hover:text-[#F4EFE3]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Dual View</span>
              </button>
              <button
                onClick={() => setViewMode('terrestrial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  viewMode === 'terrestrial'
                    ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold'
                    : 'text-[#8E9BB5] hover:text-[#F4EFE3]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Leaflet Map</span>
              </button>
              <button
                onClick={() => setViewMode('celestial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                  viewMode === 'celestial'
                    ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold'
                    : 'text-[#8E9BB5] hover:text-[#F4EFE3]'
                }`}
              >
                <Telescope className="w-3.5 h-3.5" />
                <span>Celestial Dome</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ScrollPageControls
        panelIds={[
          'location-search',
          'ranked-spots',
          'spot-map',
          'spot-details',
          'celestial-dome',
        ]}
        className="mb-8"
      />

      {/* Main 2-Column Scroll Layout on Desktop, Single Column on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Location & Search + Ranked Spots (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <ScrollPanel
            id="location-search"
            title="Location & Search"
            kanji="探索"
            subtitle="GPS, city search, radius & live telemetry status"
            icon={Navigation}
            defaultOpen={true}
          >
            {/* GPS Location & Search Box Control Card */}
            <div className="bg-[#0E1326] border border-[#D4A84B]/40 p-4 rounded-2xl shadow-[0_0_20px_rgba(212,168,75,0.15)] space-y-3.5 relative">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-widest font-bold">
                  GPS & City Search
                </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  gpsStatus === 'locating'
                    ? 'bg-[#D4A84B]/20 text-[#D4A84B]'
                    : gpsStatus === 'success'
                    ? 'bg-[#34D399]/20 text-[#34D399]'
                    : gpsStatus === 'error'
                    ? 'bg-[#D4A84B]/20 text-[#D4A84B]'
                    : 'bg-[#151B38] text-[#8E9BB5]'
                }`}
              >
                {gpsStatus === 'locating'
                  ? 'Locating you...'
                  : gpsStatus === 'success'
                  ? 'GPS Locked'
                  : gpsStatus === 'error'
                  ? 'Chandigarh Default'
                  : 'Chandigarh Ready'}
              </span>
            </div>

            {/* Primary "Use My Location" GPS Button */}
            <button
              type="button"
              onClick={() => handleUseLocation(false)}
              disabled={isAnySyncing && gpsStatus === 'locating'}
              className="w-full py-2.5 rounded-xl bg-[#D4A84B] hover:bg-[#e2b95b] disabled:opacity-50 text-[#0A0A0F] font-sans text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-[0_0_15px_rgba(212,168,75,0.3)]"
            >
              <Navigation
                className={`w-3.5 h-3.5 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`}
              />
              <span>
                {gpsStatus === 'locating' ? 'Locating you...' : 'Use My Location'}
              </span>
            </button>

            {/* GPS Status Readout + Chandigarh Fallback Note */}
            <div className="p-2.5 rounded-xl bg-[#0A0A0F] border border-[#151B38] text-[11px] font-mono text-[#F4EFE3]/90 leading-relaxed tabular-nums space-y-1">
              <div>{gpsStatusText}</div>
              {fallbackLocationNote && (
                <div className="text-[#D4A84B] text-[10.5px] font-bold">
                  {fallbackLocationNote}
                </div>
              )}
            </div>

            {/* Search Box Fallback */}
            <form
              onSubmit={handleSearchFormSubmit}
              className="relative flex items-center bg-[#0A0A0F] border border-[#151B38] focus-within:border-[#D4A84B] rounded-xl px-3 py-2 transition-all"
            >
              <Search className="w-4 h-4 text-[#8E9BB5] mr-2 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH CITY OR PEAK (E.G. SHIMLA, KASAULI)..."
                className="w-full bg-transparent font-sans text-xs text-[#F4EFE3] placeholder-[#8E9BB5]/50 focus:outline-none"
              />
              {isSearchingGeo && (
                <Loader2 className="w-3.5 h-3.5 text-[#D4A84B] animate-spin mr-1 shrink-0" />
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-xs text-[#8E9BB5] hover:text-[#F4EFE3] mr-1.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                className="px-2 py-0.5 rounded bg-[#151B38] hover:bg-[#D4A84B] text-[10px] font-mono text-[#D4A84B] hover:text-[#0A0A0F] font-bold transition-colors cursor-pointer shrink-0"
              >
                GO
              </button>
            </form>

            {/* Geocoding Autocomplete Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="bg-[#0A0A0F] border border-[#D4A84B]/60 rounded-xl divide-y divide-[#151B38] overflow-hidden shadow-xl z-40">
                {searchResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => handleSelectGeocodedPlace(place)}
                    className="w-full text-left px-3 py-2 hover:bg-[#151B38] transition-colors flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-sans font-bold text-[#F4EFE3] block truncate">
                        {place.name}
                      </span>
                      <span className="font-mono text-[10px] text-[#8E9BB5] block truncate">
                        {[place.admin1, place.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#D4A84B] tabular-nums shrink-0">
                      {place.latitude.toFixed(2)}°, {place.longitude.toFixed(2)}°
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Radius Slider (10 / 25 / 50 / 100 km, default 50) */}
            <div className="pt-2 border-t border-[#151B38] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#8E9BB5] flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#D4A84B]" />
                  <span>SEARCH RADIUS:</span>
                </span>
                <span className="text-[#D4A84B] font-bold tabular-nums">{radiusKm} KM</span>
              </div>

              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={RADIUS_STEPS.indexOf(radiusKm)}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  const nextVal = RADIUS_STEPS[idx] ?? 50;
                  handleRadiusChange(nextVal);
                }}
                className="w-full accent-[#D4A84B] cursor-pointer h-1.5 bg-[#0A0A0F] rounded-lg"
                aria-label="Search radius in kilometers"
              />

              <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px] tabular-nums">
                {RADIUS_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => handleRadiusChange(step)}
                    className={`py-1 rounded-lg border transition-colors cursor-pointer ${
                      radiusKm === step
                        ? 'bg-[#D4A84B] text-[#0A0A0F] border-[#D4A84B] font-bold'
                        : 'bg-[#0A0A0F] text-[#8E9BB5] border-[#151B38] hover:text-[#F4EFE3]'
                    }`}
                  >
                    {step} km
                  </button>
                ))}
              </div>
            </div>

            {/* Small "Data Status" Indicator showing Open-Meteo, Air Quality, Overpass & ms timing */}
            <div className="pt-2.5 border-t border-[#151B38] space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-[#D4A84B] uppercase tracking-widest font-bold">
                  Data Status
                </span>
                <button
                  type="button"
                  onClick={handleRetrySync}
                  disabled={isAnySyncing}
                  className="text-[#D4A84B] hover:text-[#F4EFE3] underline cursor-pointer disabled:opacity-50"
                >
                  Retry
                </button>
              </div>

              <div className="space-y-1.5">
                {formatSourceBadge('Open-Meteo', weatherSource)}
                {formatSourceBadge('Air Quality', airQualitySource)}
                {formatSourceBadge('Overpass', overpassSource)}
              </div>

              {staleCacheNotice && (
                <div className="px-2.5 py-1.5 rounded-lg bg-[#D4A84B]/15 border border-[#D4A84B]/40 text-[10px] font-mono text-[#D4A84B] font-bold">
                  {staleCacheNotice}
                </div>
              )}
            </div>
          </div>
          </ScrollPanel>

          <ScrollPanel
            id="ranked-spots"
            title="Ranked Stargazing Spots"
            kanji="聖地"
            subtitle={`${spots.length} sanctuaries within ${radiusKm} km`}
            icon={Sparkles}
            defaultOpen={true}
          >
            <div className="space-y-4">
              {/* Error State Banner with Retry (never blocks existing weather or dome) */}
              {errorMessage && (
                <div className="p-4 rounded-2xl bg-[#B3202A]/15 border border-[#B3202A] space-y-3">
                  <div className="flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-xs font-mono font-bold text-[#F4EFE3] block">
                        TELEMETRY SYNC NOTICE
                      </span>
                      <p className="text-xs font-sans text-[#F4EFE3]/85 leading-relaxed">
                        {errorMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetrySync}
                    className="w-full py-2 rounded-xl bg-[#B3202A] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold uppercase transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* Ranked List of Candidate Stargazing Spots Nearby */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-[#8E9BB5] px-1">
              <span className="font-bold text-[#F4EFE3]">
                RANKED SPOTS ({radiusKm} KM)
              </span>
              <span className="tabular-nums">{spots.length} SANCTUARIES</span>
            </div>

            {(overpassSource.status === 'loading' || overpassSource.status === 'retrying') && (
              <div className="p-3 rounded-xl bg-[#0E1326] border border-[#D4A84B]/30 flex items-center space-x-2.5 text-xs font-mono text-[#D4A84B]">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="truncate">
                  {overpassSource.status === 'retrying'
                    ? 'Retrying Overpass mirror / smaller radius...'
                    : loadingStepText}
                </span>
              </div>
            )}

            {/* When Overpass fails completely, show clear message and Retry button without inventing locations */}
            {overpassSource.status === 'failed' && spots.length === 0 && (
              <div className="p-4 rounded-2xl bg-[#0E1326] border border-[#B3202A]/60 space-y-3 text-center">
                <p className="font-sans text-xs text-[#F4EFE3] font-bold">
                  Nearby spot data is unavailable right now
                </p>
                {overpassSource.error && (
                  <p className="font-mono text-[10px] text-[#8E9BB5]">
                    {overpassSource.error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleRetrySync}
                  className="w-full py-2 rounded-xl bg-[#B3202A] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold uppercase transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {overpassSource.status === 'ok' && spots.length === 0 && (
              <div className="p-4 rounded-2xl bg-[#0E1326] border border-[#151B38] space-y-3 text-center">
                <p className="font-sans text-xs text-[#8E9BB5]">
                  No mapped peaks, viewpoints, parks, or observatories found within {radiusKm} km.
                </p>
                <button
                  type="button"
                  onClick={handleRetrySync}
                  className="px-3 py-1.5 rounded-xl bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] font-mono text-xs font-bold uppercase transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {spots.map((spot, idx) => {
              const isSelected = spot.id === selectedSpot?.id;
              const ringOffset = 157 - (157 * spot.honorScore) / 100; // r=25, circ=157
              const showScoreTip = activeScoreTooltipId === spot.id;
              const typeBadge =
                spot.type === 'telescope'
                  ? '🔭 Observatory'
                  : spot.type === 'shrine'
                  ? '⛩️ Shrine'
                  : spot.type === 'mountain'
                  ? '⛰️ Peak'
                  : '🏯 Park/Viewpoint';

              return (
                <div
                  key={spot.id}
                  ref={(el) => {
                    spotCardRefs.current[spot.id] = el;
                  }}
                  onClick={() => handleSelectSpot(spot)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer group space-y-3 ${
                    isSelected
                      ? 'bg-[#0E1326] border-[#D4A84B] shadow-[0_0_24px_rgba(212,168,75,0.25)] scale-[1.01]'
                      : 'bg-[#0A0A0F]/80 border-[#151B38] hover:border-[#D4A84B]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-1.5 text-[10px] font-mono text-[#D4A84B] tabular-nums">
                        <span>#{idx + 1}</span>
                        <span>·</span>
                        <span>{typeBadge}</span>
                        <span>·</span>
                        <span>{spot.distanceKm} km</span>
                        {spot.isHaze && (
                          <span className="px-1.5 py-0.5 rounded bg-[#D97706]/25 border border-[#F59E0B] text-[#FBBF24] font-bold uppercase text-[9px]">
                            Haze
                          </span>
                        )}
                      </div>

                      <h4 className="font-serif text-base font-bold text-[#F4EFE3] group-hover:text-[#D4A84B] transition-colors truncate">
                        {spot.name}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-[#8E9BB5] tabular-nums">
                        <span className="text-[#F4EFE3]">Cloud: {spot.cloudCover}%</span>
                        <span>·</span>
                        <span className="text-[#F4EFE3]">Humidity: {spot.humidity}%</span>
                        <span>·</span>
                        <span className={spot.isHaze ? 'text-[#FBBF24] font-bold' : 'text-[#F4EFE3]'}>
                          AQI {spot.usAqi}
                        </span>
                        <span>·</span>
                        <span>Estimated Bortle class {spot.bortleClass}</span>
                      </div>
                    </div>

                    {/* Night Honor Score Ring Mini with Formula Breakdown Tooltip on Hover */}
                    <div
                      className="relative w-14 h-14 flex items-center justify-center shrink-0"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setActiveScoreTooltipId(spot.id);
                      }}
                      onMouseLeave={() => setActiveScoreTooltipId(null)}
                    >
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
                        <circle
                          cx="30"
                          cy="30"
                          r="25"
                          className="stroke-[#151B38]"
                          strokeWidth="4"
                          fill="none"
                        />
                        <circle
                          cx="30"
                          cy="30"
                          r="25"
                          className={isSelected ? 'stroke-[#D4A84B]' : 'stroke-[#8E9BB5]'}
                          strokeWidth="4"
                          strokeDasharray="157"
                          strokeDashoffset={ringOffset}
                          strokeLinecap="round"
                          fill="none"
                        />
                      </svg>
                      <span className="absolute font-mono text-xs font-bold text-[#F4EFE3] tabular-nums">
                        {spot.honorScore}
                      </span>

                      {showScoreTip && (
                        <div className="absolute right-0 bottom-full mb-2 z-50 pointer-events-none">
                          {renderScoreBreakdownTooltip(spot)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: See Tonight's Sky Here + Get Directions Link & Category Label */}
                  <div className="pt-2 border-t border-[#151B38] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                    <span className="text-[#8E9BB5] truncate">
                      {spot.categoryLabel.split('·')[0].trim()} · {spot.elevation} · PM2.5 {spot.pm25}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Link
                        to={`/stargazer?lat=${spot.coordinates.latNum}&lng=${spot.coordinates.lngNum}&date=tonight22&spot=${encodeURIComponent(spot.name)}&label=${encodeURIComponent(spot.name)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          playSuzuChime();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#D4A84B]/15 hover:bg-[#D4A84B] border border-[#D4A84B]/50 text-[#D4A84B] hover:text-[#0A0A0F] font-bold transition-colors inline-flex items-center space-x-1 shrink-0"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>See tonight's sky here</span>
                      </Link>

                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${spot.coordinates.latNum},${spot.coordinates.lngNum}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-2.5 py-1 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] font-bold transition-colors inline-flex items-center space-x-1 shrink-0"
                      >
                        <span>Get directions</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  </div>
                );
              })}
              </div>
            </div>
          </ScrollPanel>
        </div>

        {/* Right 7-Column Observatory Workspace */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Interactive Leaflet Map with Parchment-Style Theme, Glowing "You Are Here" & Custom Markers */}
          {(viewMode === 'both' || viewMode === 'terrestrial') && (
            <ScrollPanel
              id="spot-map"
              title="Observatory Map"
              kanji="天文図"
              subtitle={`Interactive Leaflet dark-sky chart (${radiusKm} km radius)`}
              icon={MapIcon}
              defaultOpen={false}
              onOpen={() => setMapPanelTick((t) => t + 1)}
            >
              <div className="relative w-full min-h-[400px] sm:aspect-[16/9] parchment-pattern border-2 border-[#D4A84B]/60 rounded-3xl overflow-hidden shadow-[0_0_35px_rgba(212,168,75,0.2)] p-3 sm:p-4 flex flex-col justify-between">
                {/* Top Compass & Quadrant Header */}
                <div className="flex items-center justify-between text-[11px] font-mono text-[#D4A84B] border-b border-[#D4A84B]/30 pb-2 z-20 bg-[#0A0A0F]/80 backdrop-blur-sm px-3 py-1.5 rounded-t-xl">
                <span className="flex items-center font-bold tracking-widest truncate">
                  <Compass
                    className="w-3.5 h-3.5 mr-1.5 animate-spin shrink-0"
                    style={{ animationDuration: '30s' }}
                  />
                  ANCIENT ASTRONOMICAL CELESTIAL CHART · 天文図 (LEAFLET LIVE)
                </span>
                <span className="tabular-nums shrink-0 ml-2">{radiusKm} KM OVERPASS RADIUS</span>
              </div>

              {/* Interactive Leaflet Map Container */}
              <div className="relative flex-1 w-full my-2 rounded-2xl overflow-hidden border border-[#D4A84B]/35">
                <div
                  ref={mapContainerRef}
                  className="w-full h-full min-h-[300px] sm:min-h-[340px] parchment-leaflet-map z-10"
                />

                {/* Hovered Spot Rich Telemetry & Score Breakdown Overlay Card */}
                {hoveredSpot && (
                  <div
                    role="tooltip"
                    className="absolute top-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-84 max-w-[calc(100%-1.5rem)] z-30 pointer-events-none p-3 sm:p-3.5 rounded-xl bg-[#070913]/95 backdrop-blur-md border border-[#D4A84B] shadow-[0_0_30px_rgba(212,168,75,0.45)] text-left space-y-2"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#D4A84B]/30">
                      <span className="font-mono text-[10px] tracking-widest text-[#D4A84B] uppercase font-bold">
                        {hoveredSpot.categoryLabel.split('·')[0].trim()}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#B3202A] text-[10px] font-mono font-bold text-[#F4EFE3] tabular-nums">
                        {hoveredSpot.honorScore} PTS
                      </span>
                    </div>

                    <div>
                      <h4 className="font-serif text-sm font-bold text-[#F4EFE3]">
                        {hoveredSpot.name}
                      </h4>
                      <span className="font-mono text-[10px] text-[#8E9BB5] tabular-nums">
                        {hoveredSpot.coordinates.lat}, {hoveredSpot.coordinates.lng} ·{' '}
                        {hoveredSpot.distanceKm} km away
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-[#0E1326] border border-[#151B38] font-mono text-[10px] space-y-0.5 tabular-nums">
                      <div className="text-[#D4A84B] font-bold mb-1">
                        Honor Score Breakdown (100 Base):
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E9BB5]">
                          Cloud ({hoveredSpot.scoreBreakdown.cloudCoverValue}% × 0.6)
                        </span>
                        <span className="text-[#F87171]">
                          -{hoveredSpot.scoreBreakdown.cloudPenalty}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E9BB5]">
                          Humidity ({hoveredSpot.scoreBreakdown.humidityValue}%)
                        </span>
                        <span className="text-[#F87171]">
                          -{hoveredSpot.scoreBreakdown.humidityPenalty}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E9BB5]">
                          Visibility ({hoveredSpot.scoreBreakdown.visibilityKmValue} km)
                        </span>
                        <span className="text-[#F87171]">
                          -{hoveredSpot.scoreBreakdown.visibilityPenalty}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E9BB5]">
                          Estimated Bortle class {hoveredSpot.bortleClass} ({hoveredSpot.nearestCityDistanceKm}km to{' '}
                          {hoveredSpot.nearestCityName})
                        </span>
                        <span className="text-[#F87171]">
                          -{hoveredSpot.scoreBreakdown.lightPollutionPenalty}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E9BB5]">
                          Air Quality (AQI {hoveredSpot.usAqi} · PM2.5 {hoveredSpot.pm25})
                        </span>
                        <span className="text-[#F87171]">
                          -{hoveredSpot.scoreBreakdown.airQualityPenalty}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Scale & Custom Marker Legend */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#8E9BB5] border-t border-[#D4A84B]/20 pt-2 z-20">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[#38BDF8] font-bold">● YOU ARE HERE</span>
                  <span>⛰️ PEAK</span>
                  <span>⛩️ SHRINE</span>
                  <span>🏯 PARK / VIEWPOINT / RESERVE</span>
                  <span>🔭 OBSERVATORY</span>
                </div>
                <span className="text-[#D4A84B] font-bold">
                  CLICK CARD OR MARKER TO FOCUS
                </span>
              </div>
            </div>
            </ScrollPanel>
          )}

          {/* 2. Selected Spot / Observer Detail Panel, Light Pollution Bortle Indicator & Tonight's Hourly Forecast Strip */}
          {activeDisplaySpot && (
            <ScrollPanel
              id="spot-details"
              title="Spot Details & Tonight's Forecast"
              kanji="気象"
              subtitle={`${activeDisplaySpot.name} · Score ${activeDisplaySpot.honorScore}/100`}
              icon={Compass}
              defaultOpen={false}
            >
              <div className="bg-[#0E1326] border border-[#D4A84B]/50 p-6 rounded-2xl space-y-5 shadow-[0_0_25px_rgba(212,168,75,0.18)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#151B38] gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#D4A84B]">
                    <span>
                      Estimated Bortle class {activeDisplaySpot.bortleClass} ({activeDisplaySpot.bortleLabel})
                    </span>
                    <span>·</span>
                    <span className="font-kanji">{activeDisplaySpot.japanese}</span>
                    {activeDisplaySpot.isHaze && (
                      <span className="px-2 py-0.5 rounded bg-[#D97706]/25 border border-[#F59E0B] text-[#FBBF24] font-bold uppercase text-[10px] inline-flex items-center space-x-1">
                        <Wind className="w-3 h-3" />
                        <span>Haze (AQI {activeDisplaySpot.usAqi})</span>
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-[#F4EFE3] mt-0.5">
                    {activeDisplaySpot.name}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/stargazer?lat=${activeDisplaySpot.coordinates.latNum}&lng=${activeDisplaySpot.coordinates.lngNum}&date=tonight22&spot=${encodeURIComponent(activeDisplaySpot.name)}&label=${encodeURIComponent(activeDisplaySpot.name)}`}
                    onClick={() => playSuzuChime()}
                    className="px-3.5 py-1.5 rounded-full bg-[#D4A84B]/20 hover:bg-[#D4A84B] border border-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] text-xs font-mono font-bold uppercase transition-colors flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>See tonight's sky here</span>
                  </Link>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeDisplaySpot.coordinates.latNum},${activeDisplaySpot.coordinates.lngNum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 rounded-full bg-[#151B38] hover:bg-[#D4A84B] border border-[#D4A84B]/50 text-[#D4A84B] hover:text-[#0A0A0F] text-xs font-mono font-bold uppercase transition-colors flex items-center space-x-1.5"
                  >
                    <span>Get Directions</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {selectedSpot && (
                    <button
                      type="button"
                      onClick={() => handleVisitSpot(selectedSpot)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer ${
                        visitedSpotIds.includes(selectedSpot.id)
                          ? 'bg-[#151B38] border border-[#D4A84B] text-[#D4A84B]'
                          : 'bg-[#D4A84B] text-[#0A0A0F] hover:bg-[#F4EFE3] shadow-[0_0_15px_rgba(212,168,75,0.4)]'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {visitedSpotIds.includes(selectedSpot.id)
                          ? 'SANCTUARY VISITED ✓'
                          : 'VISIT SPOT (+125 HONOR)'}
                      </span>
                    </button>
                  )}

                  {/* Interactive Score Badge with Breakdown Tooltip */}
                  <div
                    className="relative"
                    onMouseEnter={() => setActiveScoreTooltipId(`detail-${activeDisplaySpot.id}`)}
                    onMouseLeave={() => setActiveScoreTooltipId(null)}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setActiveScoreTooltipId((prev) =>
                          prev === `detail-${activeDisplaySpot.id}`
                            ? null
                            : `detail-${activeDisplaySpot.id}`
                        )
                      }
                      className="px-3 py-1.5 rounded-full bg-[#B3202A] text-xs font-mono text-[#F4EFE3] font-bold shadow-[0_0_12px_rgba(179,32,42,0.4)] flex items-center space-x-1.5 cursor-pointer tabular-nums"
                    >
                      <span>SCORE: {activeDisplaySpot.honorScore}/100</span>
                      <Info className="w-3.5 h-3.5 text-[#D4A84B]" />
                    </button>

                    {activeScoreTooltipId === `detail-${activeDisplaySpot.id}` && (
                      <div className="absolute right-0 bottom-full mb-2 z-50">
                        {renderScoreBreakdownTooltip(activeDisplaySpot)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {honorToast && (
                <div className="p-3 rounded-xl bg-[#D4A84B]/15 border border-[#D4A84B] flex items-center justify-between text-xs font-mono text-[#F4EFE3]">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#D4A84B] shrink-0" />
                    <span>{honorToast}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHonorToast(null)}
                    className="text-[#8E9BB5] hover:text-[#F4EFE3] ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <p className="font-sans text-xs sm:text-sm text-[#F4EFE3]/85 leading-relaxed">
                {activeDisplaySpot.description}
              </p>

              {/* Bortle 1-9 Light Pollution Scale Indicator */}
              <div className="p-4 rounded-xl bg-[#0A0A0F] border border-[#151B38] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                  <span className="text-[#D4A84B] font-bold uppercase tracking-wider">
                    Estimated Bortle class {activeDisplaySpot.bortleClass}/9 · LIGHT POLLUTION INDICATOR
                  </span>
                  <span className="text-[#8E9BB5] text-[11px] tabular-nums">
                    Estimated from {activeDisplaySpot.nearestCityDistanceKm} km distance to{' '}
                    <strong className="text-[#F4EFE3]">{activeDisplaySpot.nearestCityName}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-9 gap-1.5 pt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                    const isActive = level === activeDisplaySpot.bortleClass;
                    const bgColors: Record<number, string> = {
                      1: 'bg-[#0F172A]',
                      2: 'bg-[#1E293B]',
                      3: 'bg-[#1D4ED8]',
                      4: 'bg-[#047857]',
                      5: 'bg-[#65A30D]',
                      6: 'bg-[#CA8A04]',
                      7: 'bg-[#EA580C]',
                      8: 'bg-[#DC2626]',
                      9: 'bg-[#F8FAFC]',
                    };
                    return (
                      <div key={level} className="space-y-1 text-center">
                        <div
                          className={`h-2.5 rounded-sm transition-all ${bgColors[level]} ${
                            isActive
                              ? 'ring-2 ring-[#D4A84B] scale-y-125'
                              : 'opacity-40'
                          }`}
                        />
                        <span
                          className={`block font-mono text-[10px] tabular-nums ${
                            isActive ? 'text-[#D4A84B] font-bold' : 'text-[#8E9BB5]'
                          }`}
                        >
                          B{level}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Key Atmospheric Metrics + Air Quality + Night Honor Score Breakdown Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-[#0A0A0F] border border-[#151B38] font-mono text-xs tabular-nums">
                <div>
                  <span className="text-[10px] text-[#8E9BB5] block">
                    Cloud Cover (-{activeDisplaySpot.scoreBreakdown.cloudPenalty} pts)
                  </span>
                  <span className="text-[#D4A84B] font-bold text-sm">
                    {activeDisplaySpot.cloudCover}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8E9BB5] block">
                    Humidity (-{activeDisplaySpot.scoreBreakdown.humidityPenalty} pts)
                  </span>
                  <span className="text-[#F4EFE3] font-bold text-sm">
                    {activeDisplaySpot.humidity}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8E9BB5] block">
                    Visibility (-{activeDisplaySpot.scoreBreakdown.visibilityPenalty} pts)
                  </span>
                  <span className="text-[#D4A84B] font-bold text-sm">
                    {activeDisplaySpot.visibilityKm} km
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8E9BB5] block">
                    AQI & PM2.5 (-{activeDisplaySpot.scoreBreakdown.airQualityPenalty} pts)
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`font-bold text-sm ${
                        activeDisplaySpot.isHaze ? 'text-[#FBBF24]' : 'text-[#4ADE80]'
                      }`}
                    >
                      AQI {activeDisplaySpot.usAqi}
                    </span>
                    <span className="text-[10px] text-[#8E9BB5]">
                      ({activeDisplaySpot.pm25} µg/m³)
                    </span>
                    {activeDisplaySpot.isHaze && (
                      <span className="px-1.5 py-0.2 rounded bg-[#D97706]/30 border border-[#F59E0B] text-[9px] text-[#FBBF24] font-bold uppercase">
                        Haze
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#8E9BB5] block">Temp / Wind</span>
                  <span className="text-[#D4A84B] text-xs font-bold truncate block">
                    {activeDisplaySpot.temperatureC}°C · {activeDisplaySpot.windSpeedKmh} km/h
                  </span>
                </div>
              </div>

              {/* Tonight's Hourly Seeing Strip (Real Open-Meteo Forecast Data in Asia/Kolkata) */}
              <div>
                <span className="text-[11px] font-mono text-[#D4A84B] uppercase tracking-wider font-bold block mb-2">
                  Tonight's Open-Meteo Hourly Seeing Strip (20:00 Today – 04:00 Tomorrow IST)
                </span>

                <div className="grid grid-cols-5 gap-2 font-mono text-center tabular-nums">
                  {activeDisplaySpot.hourlyForecast.map((hour) => (
                    <div
                      key={hour.time}
                      className="p-2.5 rounded-xl bg-[#121626] border border-[#151B38] space-y-1"
                    >
                      <span className="text-[10px] text-[#8E9BB5] block">{hour.time}</span>
                      <span className="text-xs font-bold text-[#F4EFE3] block">{hour.seeing}</span>
                      <span className="text-[9px] text-[#D4A84B] block">{hour.cloud}% Cloud</span>
                      <span className="text-[9px] text-[#8E9BB5] block">{hour.condition}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </ScrollPanel>
          )}

          {/* 3. Dynamic D3 Celestial Map Widget calibrated to Selected Spot or Observer Coordinates */}
          {activeDisplaySpot && (viewMode === 'both' || viewMode === 'celestial') && (
            <ScrollPanel
              id="celestial-dome"
              title="Celestial Dome"
              kanji="星図"
              subtitle={`D3 stereographic sky hemisphere · ${activeDisplaySpot.name}`}
              icon={Telescope}
              defaultOpen={false}
            >
              <CelestialMapWidget
                selectedSpot={activeDisplaySpot}
                lastSyncedAt={lastSyncedAt}
                onRetrySync={handleRetrySync}
                isSyncing={isAnySyncing}
              />
            </ScrollPanel>
          )}
        </div>
      </div>
    </section>
  );
};

