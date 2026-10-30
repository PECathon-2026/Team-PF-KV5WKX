import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Compass,
  Clock,
  Calendar,
  Navigation,
  Search,
  ExternalLink,
  Sparkles,
  Loader2,
  Eye,
  RotateCcw,
  Telescope,
  MapPin,
  CheckCircle2,
  Info,
  Maximize2,
  AlertTriangle,
} from 'lucide-react';
import { DynamicMoonPhase } from './common/DynamicMoonPhase';
import { ScrollPanel, ScrollPageControls } from './common/ScrollPanel';
import { useCalmMode } from '../utils/calmMode';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import { DEFAULT_OBSERVATORY_COORDS, getLunarPhase } from '../utils/lunarCycle';
import {
  fetchGeocodingSearch,
  fetchReverseGeocodeLabel,
  type GeocodingSearchItem,
} from '../utils/dataClient';
import {
  getSavedObserverLocation,
  saveObserverLocation,
  subscribeToObserverLocation,
} from '../utils/observerLocation';
import { awardStarGazerDailyPoints } from '../utils/honorSystem';

type TimePresetMode = 'now' | 'tonight22' | 'custom';

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function getTonightAt10PmLocal(reference = new Date()): Date {
  const d = new Date(reference);
  d.setHours(22, 0, 0, 0);
  return d;
}

function getLocalTimeZoneInfo(): { timeZone: string; offsetLabel: string } {
  try {
    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    const offsetMinutes = -new Date().getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMins = Math.abs(offsetMinutes);
    const hh = String(Math.floor(absMins / 60)).padStart(2, '0');
    const mm = String(absMins % 60).padStart(2, '0');
    return { timeZone, offsetLabel: `UTC${sign}${hh}:${mm}` };
  } catch {
    return { timeZone: 'Local Time', offsetLabel: 'UTC' };
  }
}

/**
 * Builds the verified Stellarium Web URL using only parameters confirmed to work
 * in Stellarium Web's `setStateFromQueryArgs()`:
 * - `lat` & `lng` (both required together; `lon` is ignored by Stellarium Web)
 * - `date` (ISO 8601 UTC string `YYYY-MM-DDTHH:mm:ssZ`; required so Stellarium doesn't reset to sunset)
 * - `fov` (field of view in degrees)
 * - `elev` (observer elevation in meters, passed when > 0)
 * - `az` & `alt` (viewing azimuth & altitude in degrees, passed when non-zero)
 */
export function buildStellariumWebUrl(params: {
  lat: number;
  lng: number;
  date: Date;
  fov: number;
  elev?: number | null;
  az?: number;
  alt?: number;
}): string {
  const query = new URLSearchParams();
  query.set('lat', params.lat.toFixed(4));
  query.set('lng', params.lng.toFixed(4));
  query.set('date', params.date.toISOString());
  query.set('fov', String(Math.max(10, Math.min(120, Math.round(params.fov)))));

  if (typeof params.elev === 'number' && !Number.isNaN(params.elev) && params.elev > 0) {
    query.set('elev', String(Math.round(params.elev)));
  }
  if (typeof params.az === 'number' && !Number.isNaN(params.az) && params.az !== 0) {
    query.set('az', String(Math.round(params.az)));
  }
  if (typeof params.alt === 'number' && !Number.isNaN(params.alt) && params.alt !== 0) {
    query.set('alt', String(Math.round(params.alt)));
  }

  return `https://stellarium-web.org/?${query.toString()}`;
}

export const StarGazerSection: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [calm] = useCalmMode();

  const tzInfo = useMemo(() => getLocalTimeZoneInfo(), []);

  // Parse initial state from URL query params (from Watchtower or Celestial Scroll) or saved Watchtower location
  const initialConfig = useMemo(() => {
    const qLat = searchParams.get('lat');
    const qLng = searchParams.get('lng') ?? searchParams.get('lon');
    const qLabel = searchParams.get('label');
    const qDate = searchParams.get('date');
    const qElev = searchParams.get('elev');
    const qEventTitle = searchParams.get('event');
    const qSpotName = searchParams.get('spot');

    const saved = getSavedObserverLocation();

    let lat = DEFAULT_OBSERVATORY_COORDS.lat;
    let lon = DEFAULT_OBSERVATORY_COORDS.lon;
    let label = DEFAULT_OBSERVATORY_COORDS.label;
    let elev: number | null = null;
    let hasInitialLocation = false;
    let sourceLabel: 'query' | 'watchtower' | 'default' = 'default';

    if (qLat !== null && qLng !== null) {
      const parsedLat = Number(qLat);
      const parsedLng = Number(qLng);
      if (
        !Number.isNaN(parsedLat) &&
        !Number.isNaN(parsedLng) &&
        parsedLat >= -90 &&
        parsedLat <= 90 &&
        parsedLng >= -180 &&
        parsedLng <= 180
      ) {
        lat = parsedLat;
        lon = parsedLng;
        label =
          qLabel?.trim() ||
          qSpotName?.trim() ||
          `${parsedLat.toFixed(4)}°, ${parsedLng.toFixed(4)}°`;
        if (qElev !== null && !Number.isNaN(Number(qElev))) {
          elev = Math.round(Number(qElev));
        }
        hasInitialLocation = true;
        sourceLabel = 'query';
      }
    } else if (saved) {
      lat = saved.lat;
      lon = saved.lon;
      label = saved.label;
      elev = saved.elevationMeters ?? null;
      hasInitialLocation = true;
      sourceLabel = 'watchtower';
    }

    let targetDate = new Date();
    let mode: TimePresetMode = 'now';

    if (qDate === 'tonight22') {
      targetDate = getTonightAt10PmLocal();
      mode = 'tonight22';
    } else if (qDate) {
      const parsedDate = new Date(qDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        targetDate = parsedDate;
        mode = 'custom';
      }
    }

    return {
      lat,
      lon,
      label,
      elev,
      hasInitialLocation,
      sourceLabel,
      targetDate,
      mode,
      contextEventTitle: qEventTitle,
      contextSpotName: qSpotName,
    };
  }, [searchParams]);

  const [coords, setCoords] = useState<{
    lat: number;
    lon: number;
    label: string;
    elev: number | null;
    source: string;
  }>({
    lat: initialConfig.lat,
    lon: initialConfig.lon,
    label: initialConfig.label,
    elev: initialConfig.elev,
    source: initialConfig.sourceLabel,
  });

  const [timePreset, setTimePreset] = useState<TimePresetMode>(initialConfig.mode);
  const [targetDate, setTargetDate] = useState<Date>(initialConfig.targetDate);
  const [dateTimeInput, setDateTimeInput] = useState<string>(() =>
    toLocalDateTimeInputValue(initialConfig.targetDate)
  );

  // Field of view & viewing orientation
  const [fovDeg, setFovDeg] = useState<number>(90);
  const [azDeg, setAzDeg] = useState<number>(180); // Default looking South (180°)
  const [altDeg, setAltDeg] = useState<number>(30); // Default 30° above horizon

  // Geolocation & /api/geocode search states
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'ok' | 'fallback'>(
    initialConfig.hasInitialLocation ? 'ok' : 'idle'
  );
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodingSearchItem[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState<boolean>(false);

  // Iframe loading & fallback states
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);
  const [showFallbackCardMode, setShowFallbackCardMode] = useState<boolean>(false);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  // Daily Honor Points toast
  const [honorToast, setHonorToast] = useState<string | null>(null);
  const [dailyHonorAwardedToday, setDailyHonorAwardedToday] = useState<boolean>(false);

  // Sync when URL searchParams change (e.g., navigating from Watchtower or Celestial Scroll)
  useEffect(() => {
    setCoords({
      lat: initialConfig.lat,
      lon: initialConfig.lon,
      label: initialConfig.label,
      elev: initialConfig.elev,
      source: initialConfig.sourceLabel,
    });
    setTimePreset(initialConfig.mode);
    setTargetDate(initialConfig.targetDate);
    setDateTimeInput(toLocalDateTimeInputValue(initialConfig.targetDate));
    setIframeLoading(true);
  }, [initialConfig]);

  // Award daily Honor Points once per day when opening The Star Gazer
  useEffect(() => {
    const result = awardStarGazerDailyPoints(coords.label);
    setDailyHonorAwardedToday(true);
    if (result.awarded) {
      setHonorToast(
        `+${result.pointsAdded} Honor Points awarded for opening The Star Gazer today (${result.dateKey})!`
      );
      const timer = window.setTimeout(() => setHonorToast(null), 5500);
      return () => window.clearTimeout(timer);
    }
  }, [coords.label]);

  // Subscribe to Watchtower location updates if not overridden by URL params
  useEffect(() => {
    return subscribeToObserverLocation((loc) => {
      if (!searchParams.get('lat')) {
        setCoords({
          lat: loc.lat,
          lon: loc.lon,
          label: loc.label,
          elev: loc.elevationMeters ?? null,
          source: loc.source,
        });
        setGpsStatus('ok');
      }
    });
  }, [searchParams]);

  const requestBrowserGeolocation = useCallback((isAutoInit = false) => {
    if (!isAutoInit) {
      playKotoNote(440, 1.0);
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('fallback');
      setLocationNotice(
        'Browser geolocation is unavailable. Search a city below via /api/geocode or use the default observatory.'
      );
      return;
    }

    setGpsStatus('locating');
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const alt =
          typeof pos.coords.altitude === 'number' && !Number.isNaN(pos.coords.altitude)
            ? Math.round(pos.coords.altitude)
            : null;
        const placeLabel =
          (await fetchReverseGeocodeLabel(lat, lon)) ||
          `GPS (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`;

        setCoords({
          lat,
          lon,
          label: placeLabel,
          elev: alt,
          source: 'gps',
        });
        setGpsStatus('ok');
        setLocationNotice(null);
        setIframeLoading(true);
        saveObserverLocation({
          lat,
          lon,
          label: placeLabel,
          elevationMeters: alt,
          source: 'gps',
        });
      },
      () => {
        setGpsStatus('fallback');
        setLocationNotice(
          'Location permission denied or timed out. Search any city below (/api/geocode) to aim The Star Gazer.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  }, []);

  // Requirement 3: If there are no saved Watchtower coordinates or URL coordinates, ask for browser geolocation
  useEffect(() => {
    if (!initialConfig.hasInitialLocation) {
      requestBrowserGeolocation(true);
    }
  }, [initialConfig.hasInitialLocation, requestBrowserGeolocation]);

  // City search via /api/geocode (and fetchGeocodingSearch)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setIsSearchingCity(true);
      try {
        // Query /api/geocode first as requested, with fallback to fetchGeocodingSearch
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(trimmed)}&count=5`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) {
          const data = (await res.json()) as { results?: GeocodingSearchItem[] };
          if (Array.isArray(data.results) && data.results.length > 0) {
            setSearchResults(data.results);
            setIsSearchingCity(false);
            return;
          }
        }
        const fallbackResults = await fetchGeocodingSearch(trimmed, 5);
        setSearchResults(fallbackResults);
      } catch {
        const fallbackResults = await fetchGeocodingSearch(trimmed, 5).catch(() => []);
        setSearchResults(fallbackResults);
      } finally {
        setIsSearchingCity(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectCity = (item: GeocodingSearchItem) => {
    playSuzuChime();
    const label = [item.name, item.admin1, item.country].filter(Boolean).join(', ');
    const elev = typeof item.elevation === 'number' ? Math.round(item.elevation) : null;
    setCoords({
      lat: item.latitude,
      lon: item.longitude,
      label,
      elev,
      source: 'search',
    });
    setSearchQuery('');
    setSearchResults([]);
    setGpsStatus('ok');
    setLocationNotice(null);
    setIframeLoading(true);
    saveObserverLocation({
      lat: item.latitude,
      lon: item.longitude,
      label,
      elevationMeters: elev,
      source: 'search',
    });
  };

  const handleCitySearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchResults.length > 0) {
      handleSelectCity(searchResults[0]);
      return;
    }
    setIsSearchingCity(true);
    try {
      const results = await fetchGeocodingSearch(searchQuery.trim(), 1);
      if (results.length > 0) {
        handleSelectCity(results[0]);
      } else {
        setLocationNotice(`No city found matching "${searchQuery}". Try another city name.`);
      }
    } finally {
      setIsSearchingCity(false);
    }
  };

  // Time preset handlers ("Now", "Tonight at 10 PM", and Date/Time picker)
  const handleSelectNow = () => {
    playSuzuChime();
    const now = new Date();
    setTimePreset('now');
    setTargetDate(now);
    setDateTimeInput(toLocalDateTimeInputValue(now));
    setIframeLoading(true);
  };

  const handleSelectTonight10Pm = () => {
    playSuzuChime();
    const tonight = getTonightAt10PmLocal();
    setTimePreset('tonight22');
    setTargetDate(tonight);
    setDateTimeInput(toLocalDateTimeInputValue(tonight));
    setIframeLoading(true);
  };

  const handleDateTimeInputChange = (val: string) => {
    setDateTimeInput(val);
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) {
      setTimePreset('custom');
      setTargetDate(parsed);
      setIframeLoading(true);
    }
  };

  // Build the Stellarium Web URL
  const stellariumUrl = useMemo(
    () =>
      buildStellariumWebUrl({
        lat: coords.lat,
        lng: coords.lon,
        date: targetDate,
        fov: fovDeg,
        elev: coords.elev,
        az: azDeg,
        alt: altDeg,
      }),
    [coords.lat, coords.lon, coords.elev, targetDate, fovDeg, azDeg, altDeg]
  );

  // Safety timeout so loading spinner never hangs indefinitely if third-party scripts are slow
  useEffect(() => {
    if (!iframeLoading) return;
    const timer = window.setTimeout(() => {
      setIframeLoading(false);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [iframeLoading, stellariumUrl, reloadNonce]);

  const lunarForSelectedTime = useMemo(
    () => getLunarPhase(targetDate, coords.lat, coords.lon),
    [targetDate, coords.lat, coords.lon]
  );

  return (
    <section
      id="stargazer"
      className="relative min-h-screen py-24 px-4 sm:px-8 max-w-7xl mx-auto"
    >
      {/* Chapter 06 Header */}
      <div className="border-b border-[#D4A84B]/25 pb-6 mb-8">
        <div className="flex items-center space-x-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
          <span>06. THE STAR GAZER · 星見処</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2">
          <div>
            <h1 className="font-serif text-3xl sm:text-5xl font-bold text-[#F4EFE3] text-glow-moon">
              Interactive Stellarium Sky View
            </h1>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl leading-relaxed">
              Live planetarium dome synchronized to your Watchtower coordinates ({coords.label}) and local time zone ({tzInfo.timeZone}, {tzInfo.offsetLabel}). Inspect constellations, planets, deep-sky nebulae, and tonight's lunar phase.
            </p>
          </div>

          {/* Right Header Badges: Live DynamicMoonPhase beside viewer & Daily Honor status */}
          <div className="flex flex-wrap items-center gap-3">
            <DynamicMoonPhase size="md" showDetailsPopover={true} />

            {dailyHonorAwardedToday && (
              <div className="px-3 py-1.5 rounded-full bg-[#0E1326] border border-[#D4A84B]/40 text-[11px] font-mono text-[#D4A84B] flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399]" />
                <span>Daily Vigil (+100 PTS)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Honor Points Daily Award Toast */}
      {honorToast && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#D4A84B]/15 border border-[#D4A84B] flex items-center justify-between text-xs font-mono text-[#F4EFE3] shadow-lg">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#D4A84B] shrink-0" />
            <span>{honorToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setHonorToast(null)}
            className="text-[#8E9BB5] hover:text-[#F4EFE3] ml-3 cursor-pointer"
            aria-label="Dismiss honor notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Context Banner when opened from Celestial Scroll ("View in sky") or Watchtower ("See tonight's sky here") */}
      {(initialConfig.contextEventTitle || initialConfig.contextSpotName) && (
        <div className="mb-6 p-4 rounded-2xl bg-[#0E1326] border border-[#D4A84B]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <Telescope className="w-5 h-5 text-[#D4A84B] shrink-0" />
            <div className="text-xs font-mono">
              <span className="text-[#D4A84B] font-bold uppercase tracking-wider block">
                {initialConfig.contextEventTitle
                  ? `Targeted Celestial Event: ${initialConfig.contextEventTitle}`
                  : `Targeted Watchtower Sanctuary: ${initialConfig.contextSpotName}`}
              </span>
              <span className="text-[#8E9BB5]">
                Coordinates locked to {coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}° ·{' '}
                {targetDate.toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}{' '}
                ({tzInfo.timeZone})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={initialConfig.contextEventTitle ? '/scroll' : '/watchtower'}
              className="px-3 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] font-mono text-xs font-bold transition-colors"
            >
              {initialConfig.contextEventTitle ? '← Back to Scroll' : '← Back to Watchtower'}
            </Link>
          </div>
        </div>
      )}

      <ScrollPageControls
        panelIds={['sky-controls', 'stellarium-viewport', 'url-telemetry']}
        className="mb-8"
      />

      <div className="space-y-6">
        {/* 1. Controls Above the Viewer (Time Presets, Date/Time Picker, Location & Moon Phase) */}
        <ScrollPanel
          id="sky-controls"
          title="Ephemeris Time, Location & Lunar Controls"
          kanji="観測制御"
          subtitle={`${coords.label} · ${targetDate.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })} (${tzInfo.offsetLabel})`}
          icon={Clock}
          defaultOpen={true}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 8 cols: Time Controls + Location / City Search */}
            <div className="lg:col-span-8 space-y-5">
              {/* Time Controls Bar: "Now", "Tonight at 10 PM", and Date/Time Picker */}
              <div className="bg-[#0E1326] border border-[#D4A84B]/40 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#151B38] pb-3">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-[#D4A84B]" />
                    <span className="font-mono text-xs text-[#D4A84B] uppercase tracking-widest font-bold">
                      OBSERVATION TIME ({tzInfo.timeZone} · {tzInfo.offsetLabel})
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#8E9BB5] tabular-nums">
                    UTC: {targetDate.toISOString().replace('.000Z', 'Z')}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Quick Time Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectNow}
                      className={`min-h-[42px] px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer border ${
                        timePreset === 'now'
                          ? 'bg-[#D4A84B] text-[#0A0A0F] border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.35)]'
                          : 'bg-[#0A0A0F] text-[#F4EFE3] border-[#151B38] hover:border-[#D4A84B]'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Now</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectTonight10Pm}
                      className={`min-h-[42px] px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 cursor-pointer border ${
                        timePreset === 'tonight22'
                          ? 'bg-[#D4A84B] text-[#0A0A0F] border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.35)]'
                          : 'bg-[#0A0A0F] text-[#F4EFE3] border-[#151B38] hover:border-[#D4A84B]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tonight at 10 PM</span>
                    </button>
                  </div>

                  {/* Local Date/Time Picker */}
                  <div className="flex-1 flex items-center space-x-2 bg-[#0A0A0F] border border-[#151B38] focus-within:border-[#D4A84B] rounded-xl px-3 py-1.5 min-h-[42px]">
                    <Calendar className="w-4 h-4 text-[#D4A84B] shrink-0" />
                    <label htmlFor="stargazer-datetime" className="sr-only">
                      Select observation date and time in your local time zone
                    </label>
                    <input
                      id="stargazer-datetime"
                      type="datetime-local"
                      value={dateTimeInput}
                      onChange={(e) => handleDateTimeInputChange(e.target.value)}
                      className="w-full bg-transparent font-mono text-xs text-[#F4EFE3] focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* FOV & Horizon Orientation Presets */}
                <div className="pt-2 border-t border-[#151B38] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[#8E9BB5] mr-1">FIELD OF VIEW:</span>
                    {[
                      { label: '120° Wide', val: 120 },
                      { label: '90° Dome', val: 90 },
                      { label: '60° Deep', val: 60 },
                      { label: '30° Tele', val: 30 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => {
                          playSuzuChime();
                          setFovDeg(preset.val);
                          setIframeLoading(true);
                        }}
                        className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          fovDeg === preset.val
                            ? 'bg-[#151B38] border-[#D4A84B] text-[#D4A84B] font-bold'
                            : 'bg-[#0A0A0F] border-[#151B38] text-[#8E9BB5] hover:text-[#F4EFE3]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[#8E9BB5] mr-1">GAZE:</span>
                    {[
                      { label: 'South (180°)', az: 180, alt: 30 },
                      { label: 'East (90°)', az: 90, alt: 25 },
                      { label: 'West (270°)', az: 270, alt: 25 },
                      { label: 'Zenith (80°)', az: 180, alt: 80 },
                    ].map((dir) => (
                      <button
                        key={dir.label}
                        type="button"
                        onClick={() => {
                          playSuzuChime();
                          setAzDeg(dir.az);
                          setAltDeg(dir.alt);
                          setIframeLoading(true);
                        }}
                        className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          azDeg === dir.az && altDeg === dir.alt
                            ? 'bg-[#151B38] border-[#D4A84B] text-[#D4A84B] font-bold'
                            : 'bg-[#0A0A0F] border-[#151B38] text-[#8E9BB5] hover:text-[#F4EFE3]'
                        }`}
                      >
                        {dir.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Location Bar: Shared Watchtower Coords + GPS + /api/geocode City Search */}
              <div className="bg-[#0E1326] border border-[#D4A84B]/40 rounded-2xl p-4 sm:p-5 space-y-3.5 relative">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-[#D4A84B]" />
                    <span className="font-mono text-xs text-[#D4A84B] uppercase tracking-widest font-bold">
                      OBSERVER COORDINATES · {coords.label}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#F4EFE3] tabular-nums bg-[#0A0A0F] px-2.5 py-1 rounded-lg border border-[#151B38]">
                    {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° E
                    {coords.elev !== null ? ` · ${coords.elev}m` : ''}
                  </span>
                </div>

                {locationNotice && (
                  <div className="p-2.5 rounded-xl bg-[#D4A84B]/15 border border-[#D4A84B]/40 text-xs font-mono text-[#D4A84B]">
                    {locationNotice}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => requestBrowserGeolocation(false)}
                    disabled={gpsStatus === 'locating'}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D4A84B] hover:bg-[#e5bc63] disabled:opacity-50 text-[#0A0A0F] font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer shrink-0"
                  >
                    <Navigation
                      className={`w-3.5 h-3.5 ${
                        gpsStatus === 'locating' && !calm ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {gpsStatus === 'locating' ? 'Locating GPS...' : 'Use My GPS'}
                    </span>
                  </button>

                  {/* City Search powered by /api/geocode */}
                  <form
                    onSubmit={handleCitySearchSubmit}
                    className="flex-1 flex items-center bg-[#0A0A0F] border border-[#151B38] focus-within:border-[#D4A84B] rounded-xl px-3 py-1.5 min-h-[42px]"
                  >
                    <Search className="w-4 h-4 text-[#8E9BB5] mr-2 shrink-0" />
                    <label htmlFor="stargazer-city-search" className="sr-only">
                      Search city or observatory location
                    </label>
                    <input
                      id="stargazer-city-search"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search city or peak via /api/geocode (e.g. Kyoto, Hanle, Shimla)..."
                      className="w-full bg-transparent font-sans text-xs text-[#F4EFE3] placeholder-[#8E9BB5]/60 focus:outline-none"
                    />
                    {isSearchingCity && (
                      <Loader2
                        className={`w-3.5 h-3.5 text-[#D4A84B] mr-1.5 shrink-0 ${
                          !calm ? 'animate-spin' : ''
                        }`}
                      />
                    )}
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[10px] font-mono text-[#D4A84B] hover:text-[#0A0A0F] font-bold transition-colors cursor-pointer shrink-0"
                    >
                      SEARCH
                    </button>
                  </form>
                </div>

                {/* Autocomplete results from /api/geocode */}
                {searchResults.length > 0 && (
                  <div className="bg-[#0A0A0F] border border-[#D4A84B]/60 rounded-xl divide-y divide-[#151B38] overflow-hidden shadow-xl z-30">
                    {searchResults.map((place) => (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => handleSelectCity(place)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[#151B38] transition-colors flex items-center justify-between text-xs cursor-pointer"
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
              </div>
            </div>

            {/* Right 4 cols: Current Moon Phase Beside the Viewer */}
            <div className="lg:col-span-4 bg-[#0E1326] border border-[#D4A84B]/40 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                <div>
                  <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-widest font-bold block">
                    LUNAR PHASE COMPANION · 月相
                  </span>
                  <h2 className="font-serif text-lg font-bold text-[#F4EFE3]">
                    {lunarForSelectedTime.englishName} ({lunarForSelectedTime.japaneseName})
                  </h2>
                </div>
                <DynamicMoonPhase size="sm" showDetailsPopover={true} />
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono text-xs tabular-nums">
                <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                  <span className="text-[10px] text-[#8E9BB5] block">Illumination</span>
                  <span className="text-sm font-bold text-[#D4A84B]">
                    {lunarForSelectedTime.illuminationExact}%
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                  <span className="text-[10px] text-[#8E9BB5] block">Moon Altitude</span>
                  <span className="text-sm font-bold text-[#F4EFE3]">
                    {lunarForSelectedTime.altitudeDeg}° ({lunarForSelectedTime.compassDirection})
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                  <span className="text-[10px] text-[#8E9BB5] block">Moonrise</span>
                  <span className="text-xs font-bold text-[#F4EFE3]">
                    {lunarForSelectedTime.moonriseFormatted}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                  <span className="text-[10px] text-[#8E9BB5] block">Moonset</span>
                  <span className="text-xs font-bold text-[#F4EFE3]">
                    {lunarForSelectedTime.moonsetFormatted}
                  </span>
                </div>
              </div>

              <p className="text-[11px] font-sans text-[#8E9BB5] leading-relaxed">
                {lunarForSelectedTime.illuminationPercent < 35
                  ? 'Dark-sky window favorable: low lunar glare preserves faint nebulae and Milky Way dust lanes.'
                  : 'Moonlight illuminates the dome: ideal for lunar crater observation, bright planets, and double stars.'}
              </p>
            </div>
          </div>
        </ScrollPanel>

        {/* 2. Interactive Stellarium Web Sky Viewer + Direct External Launch Fallback */}
        <ScrollPanel
          id="stellarium-viewport"
          title="Stellarium Web Planetarium Dome"
          kanji="天球儀"
          subtitle={`Live WebGL sky map · FOV ${fovDeg}° · Az ${azDeg}° / Alt ${altDeg}°`}
          icon={Compass}
          defaultOpen={true}
        >
          <div className="space-y-4">
            {/* Top Viewer Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0E1326] border border-[#151B38] px-4 py-3 rounded-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8E9BB5]">
                <span className="text-[#D4A84B] font-bold">TARGET SKY:</span>
                <span className="text-[#F4EFE3]">{coords.label}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {targetDate.toLocaleString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playSuzuChime();
                    setIframeLoading(true);
                    setReloadNonce((n) => n + 1);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reload Dome</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playSuzuChime();
                    setShowFallbackCardMode((prev) => !prev);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#0A0A0F] border border-[#D4A84B]/40 hover:border-[#D4A84B] text-[#D4A84B] font-mono text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>
                    {showFallbackCardMode ? 'Show Embedded Dome' : 'Fallback Card View'}
                  </span>
                </button>

                <a
                  href={stellariumUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => playSuzuChime()}
                  className="px-3.5 py-1.5 rounded-xl bg-[#B3202A] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center space-x-1.5 shadow-[0_0_15px_rgba(179,32,42,0.4)]"
                >
                  <span>Open in Stellarium Web</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Viewer or Styled Fallback Card */}
            {showFallbackCardMode ? (
              <div className="min-h-[60vh] rounded-3xl bg-gradient-to-br from-[#0E1326] via-[#151B38]/80 to-[#0A0A0F] border-2 border-[#D4A84B]/60 p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 shadow-[0_0_40px_rgba(212,168,75,0.2)]">
                <div className="w-20 h-20 rounded-full bg-[#B3202A]/20 border-2 border-[#D4A84B] flex items-center justify-center shadow-[0_0_25px_rgba(212,168,75,0.35)]">
                  <span className="font-kanji text-3xl text-[#D4A84B] font-bold">星見</span>
                </div>

                <div className="space-y-2 max-w-xl">
                  <span className="text-xs font-mono uppercase tracking-[0.25em] text-[#D4A84B] block">
                    DIRECT PLANETARIUM DISPATCH · 外部天球儀
                  </span>
                  <h3 className="font-serif text-2xl sm:text-4xl font-bold text-[#F4EFE3]">
                    Launch Stellarium Web for {coords.label}
                  </h3>
                  <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] leading-relaxed">
                    If your browser or network blocks embedded third-party WebGL frames, open the synchronized Stellarium Web planetarium directly in a new tab with your exact coordinates and timestamp pre-loaded.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#0A0A0F]/90 border border-[#151B38] font-mono text-xs text-[#F4EFE3] space-y-1 tabular-nums max-w-lg w-full">
                  <div>
                    <span className="text-[#8E9BB5]">Coordinates:</span>{' '}
                    <strong className="text-[#D4A84B]">
                      {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° E
                    </strong>
                    {coords.elev !== null ? ` (${coords.elev}m)` : ''}
                  </div>
                  <div>
                    <span className="text-[#8E9BB5]">Local Time ({tzInfo.timeZone}):</span>{' '}
                    <strong className="text-[#F4EFE3]">
                      {targetDate.toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </strong>
                  </div>
                  <div className="text-[10px] text-[#8E9BB5] truncate pt-1">
                    {stellariumUrl}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={stellariumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => playKotoNote(523.25, 1.1)}
                    className="px-6 py-3.5 rounded-full bg-[#D4A84B] hover:bg-[#e5be67] text-[#0A0A0F] font-mono text-xs sm:text-sm font-bold uppercase tracking-widest transition-all inline-flex items-center space-x-2 shadow-[0_0_25px_rgba(212,168,75,0.45)]"
                  >
                    <span>Open in Stellarium Web</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowFallbackCardMode(false)}
                    className="px-5 py-3.5 rounded-full bg-[#151B38] hover:bg-[#0E1326] border border-[#D4A84B]/40 text-[#F4EFE3] font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Return to Embedded Iframe
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full min-h-[65vh] sm:min-h-[72vh] rounded-3xl overflow-hidden border-2 border-[#D4A84B]/60 bg-[#070A14] shadow-[0_0_40px_rgba(212,168,75,0.2)]">
                {/* Loading State Overlay */}
                {iframeLoading && (
                  <div className="absolute inset-0 z-20 bg-[#0A0A0F]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <div
                      className={`w-16 h-16 rounded-full border-2 border-[#D4A84B] border-t-transparent flex items-center justify-center ${
                        !calm ? 'animate-spin' : ''
                      }`}
                    >
                      <span className="font-kanji text-xl text-[#D4A84B]">星</span>
                    </div>
                    <div className="space-y-1 max-w-md">
                      <p className="font-serif text-lg font-bold text-[#F4EFE3]">
                        Unfurling Stellarium Web Sky Dome...
                      </p>
                      <p className="font-mono text-xs text-[#D4A84B] tabular-nums">
                        {coords.label} ({coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°) ·{' '}
                        {targetDate.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <a
                      href={stellariumUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 px-4 py-2 rounded-full bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] border border-[#D4A84B]/40 font-mono text-xs font-bold inline-flex items-center space-x-1.5 transition-colors"
                    >
                      <span>Open in Stellarium Web (New Tab)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <iframe
                  key={`${stellariumUrl}#${reloadNonce}`}
                  src={stellariumUrl}
                  title="Stellarium Web Interactive Night Sky Viewer — The Star Gazer"
                  allowFullScreen
                  loading="eager"
                  referrerPolicy="no-referrer-when-downgrade"
                  onLoad={() => setIframeLoading(false)}
                  onError={() => {
                    setIframeLoading(false);
                    setShowFallbackCardMode(true);
                  }}
                  className="w-full h-[65vh] sm:h-[72vh] border-0 block bg-[#070A14]"
                />
              </div>
            )}

            {/* Permanent Fallback / External Companion Card Below Viewer so user is never stuck with a blocked frame */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1326] border border-[#D4A84B]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <Info className="w-4 h-4 text-[#D4A84B] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-serif text-sm font-bold text-[#F4EFE3] block">
                    Prefer a full-window view or blocked by a browser shield?
                  </span>
                  <p className="font-sans text-xs text-[#8E9BB5]">
                    Open the exact same location ({coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°) and time ({targetDate.toLocaleString()}) directly in Stellarium Web.
                  </p>
                </div>
              </div>

              <a
                href={stellariumUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => playSuzuChime()}
                className="px-4 py-2.5 rounded-xl bg-[#D4A84B] hover:bg-[#e5be67] text-[#0A0A0F] font-mono text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center justify-center space-x-1.5 shrink-0"
              >
                <span>Open in Stellarium Web</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </ScrollPanel>

        {/* 3. Verified Stellarium URL Parameter Telemetry Scroll */}
        <ScrollPanel
          id="url-telemetry"
          title="Stellarium URL Parameters & Ephemeris Link"
          kanji="星図設定"
          subtitle="Verified query parameters sent to stellarium-web.org"
          icon={Eye}
          defaultOpen={false}
        >
          <div className="bg-[#0E1326] border border-[#151B38] rounded-2xl p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#151B38] pb-2 text-[#D4A84B] font-bold">
              <span>ACTIVE STELLARIUM WEB URL</span>
              <span>PRIVACY: COORDINATES & TIME ONLY</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38] text-[#F4EFE3] break-all select-all">
              {stellariumUrl}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] text-[#8E9BB5] pt-1">
              <div className="p-2.5 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                <strong className="text-[#4ADE80] block">✓ Working Parameters</strong>
                <span>
                  <code>lat</code>, <code>lng</code>, <code>date</code> (ISO UTC), <code>fov</code>, plus non-zero <code>elev</code>, <code>az</code>, <code>alt</code>.
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                <strong className="text-[#F87171] block">✕ Unsupported / Ignored</strong>
                <span>
                  <code>lon</code> (must be <code>lng</code>), non-ISO local date strings, and <code>0</code> values for <code>az</code>/<code>alt</code>/<code>elev</code>.
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                <strong className="text-[#D4A84B] block">⚡ Sync Behavior</strong>
                <span>
                  Stellarium reads query args once on engine init; changing time or city cleanly remounts the frame.
                </span>
              </div>
            </div>
          </div>
        </ScrollPanel>
      </div>
    </section>
  );
};
