import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as SunCalc from 'suncalc';
import {
  Calendar,
  Bell,
  BellRing,
  Moon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  Satellite,
  Rocket,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Sparkles,
} from 'lucide-react';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import {
  awardAlertSetPoints,
  awardEventObservedPoints,
  getHonorState,
  subscribeToHonorChanges,
} from '../utils/honorSystem';
import {
  computeIssPasses,
  validateAndExtractIssTleFromText,
  type IssPassPrediction,
} from '../utils/issPasses';
import staticEventsData from '../data/celestialEvents2026_2027.json';
import { ScrollPanel, ScrollPageControls } from './common/ScrollPanel';
import {
  getSavedObserverLocation,
  saveObserverLocation,
  subscribeToObserverLocation,
} from '../utils/observerLocation';

export type CelestialEventCategory =
  | 'Meteor Showers'
  | 'Eclipses'
  | 'Moon Phases'
  | 'ISS Passes'
  | 'Rocket Launches';

export interface CelestialEvent {
  id: string;
  title: string;
  japanese: string;
  category: CelestialEventCategory;
  isoDate: string; // YYYY-MM-DDTHH:mm:ssZ
  dateKey: string; // YYYY-MM-DD in local time
  dateTime: string;
  visibilityNote: string;
  peakHour: string;
  constellation: string;
  significance: 'High' | 'Medium' | 'Apex';
  description: string;
}

interface ISSPositionData {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  timestamp: number;
}

interface IssPassesPayload {
  passes: IssPassPrediction[];
  tleAgeHours: number;
  stale: boolean;
  cachedAtMs: number;
}

interface LL2LaunchResult {
  id: string;
  name: string;
  net: string;
  status?: { name?: string; abbrev?: string };
  launch_service_provider?: { name?: string };
  pad?: {
    name?: string;
    location?: { name?: string };
  };
  mission?: {
    name?: string;
    description?: string;
    orbit?: { name?: string; abbrev?: string };
  };
}

const LL2_CACHE_KEY = 'tsukuyomi_ll2_upcoming_cache_v2';
const LL2_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const ISS_CACHE_KEY = 'tsukuyomi_iss_live_cache_v2';
const ISS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

const ISS_PASSES_SESSION_PREFIX = 'tsukuyomi_iss_passes_session_v1:';
const ISS_PASSES_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Shared in-flight promise map to prevent duplicate /api/iss-passes requests per rounded location
const issPassesInFlightByLoc = new Map<string, Promise<IssPassesPayload>>();

function getIssSessionCacheKey(lat: number, lon: number): string {
  return `${ISS_PASSES_SESSION_PREFIX}${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function fetchIssPassesWithBrowserFallback(
  lat: number,
  lon: number,
  forceRefresh = false
): Promise<IssPassesPayload> {
  const locKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const sessionKey = getIssSessionCacheKey(lat, lon);

  if (!forceRefresh && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(sessionKey);
      if (raw) {
        const parsed = JSON.parse(raw) as IssPassesPayload;
        if (
          parsed &&
          Array.isArray(parsed.passes) &&
          typeof parsed.cachedAtMs === 'number' &&
          Date.now() - parsed.cachedAtMs < ISS_PASSES_SESSION_TTL_MS
        ) {
          return parsed;
        }
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }

  if (!forceRefresh && issPassesInFlightByLoc.has(locKey)) {
    return issPassesInFlightByLoc.get(locKey)!;
  }

  const task = (async (): Promise<IssPassesPayload> => {
    try {
      const passRes = await fetch(
        `/api/iss-passes?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&alt=0`
      );
      const passJson = await passRes.json().catch(() => ({}));
      if (!passRes.ok) {
        throw new Error(passJson?.error || `ISS Pass API returned HTTP ${passRes.status}`);
      }

      const payload: IssPassesPayload = {
        passes: Array.isArray(passJson?.passes) ? passJson.passes : [],
        tleAgeHours:
          typeof passJson?.tleAgeHours === 'number' && !isNaN(passJson.tleAgeHours)
            ? Number(passJson.tleAgeHours.toFixed(1))
            : 0,
        stale: Boolean(passJson?.stale),
        cachedAtMs: Date.now(),
      };

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          window.sessionStorage.setItem(sessionKey, JSON.stringify(payload));
        } catch {}
      }

      return payload;
    } catch {
      // Browser Fallback: fetch TLE directly from wheretheiss.at and compute passes in browser with satellite.js
      const tleRes = await fetch(
        'https://api.wheretheiss.at/v1/satellites/25544/tles?format=text',
        {
          headers: {
            Accept: 'text/plain',
          },
        }
      );
      if (!tleRes.ok) {
        throw new Error(`Browser TLE fallback failed with HTTP ${tleRes.status}`);
      }
      const tleText = await tleRes.text();
      const validated = validateAndExtractIssTleFromText(tleText);
      if (!validated) {
        throw new Error('Browser TLE fallback returned invalid TLE lines');
      }

      const computedPasses = computeIssPasses(
        validated.line1,
        validated.line2,
        lat,
        lon,
        0
      );

      const payload: IssPassesPayload = {
        passes: computedPasses,
        tleAgeHours: 0,
        stale: false,
        cachedAtMs: Date.now(),
      };

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          window.sessionStorage.setItem(sessionKey, JSON.stringify(payload));
        } catch {}
      }

      return payload;
    } finally {
      issPassesInFlightByLoc.delete(locKey);
    }
  })();

  issPassesInFlightByLoc.set(locKey, task);
  return task;
}

function toLocalDateKey(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function formatTime12h(d: Date | undefined): string {
  if (!d || isNaN(d.getTime())) return 'Horizon Transit';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatEventDateTime(iso: string, peakHourFallback?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return peakHourFallback || iso;
  const datePart = d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
  const timePart = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

/**
 * Maps SunCalc phase (0.0 .. 1.0) to moon emoji and Japanese title
 */
function getSunCalcPhaseDetails(phase: number): {
  emoji: string;
  name: string;
  japanese: string;
  isMajor: boolean;
} {
  if (phase < 0.03 || phase >= 0.97) {
    return { emoji: '🌑', name: 'New Moon', japanese: '新月 · 朔', isMajor: true };
  }
  if (phase < 0.22) {
    return { emoji: '🌒', name: 'Waxing Crescent', japanese: '三日月', isMajor: false };
  }
  if (phase < 0.28) {
    return { emoji: '🌓', name: 'First Quarter Moon', japanese: '上弦の月', isMajor: true };
  }
  if (phase < 0.47) {
    return { emoji: '🌔', name: 'Waxing Gibbous', japanese: '十三夜', isMajor: false };
  }
  if (phase < 0.53) {
    return { emoji: '🌕', name: 'Full Moon', japanese: '満月 · 望月', isMajor: true };
  }
  if (phase < 0.72) {
    return { emoji: '🌖', name: 'Waning Gibbous', japanese: '十六夜', isMajor: false };
  }
  if (phase < 0.78) {
    return { emoji: '🌗', name: 'Third Quarter Moon', japanese: '下弦の月', isMajor: true };
  }
  return { emoji: '🌘', name: 'Waning Crescent', japanese: '有明の月', isMajor: false };
}

/**
 * Generate major Moon Phase events (New Moon, First Quarter, Full Moon, Third Quarter)
 * across a window of days using SunCalc.getMoonIllumination & SunCalc.getMoonTimes
 */
function generateSunCalcMoonEvents(
  centerDate: Date,
  lat: number,
  lon: number,
  daysAhead = 90
): CelestialEvent[] {
  const events: CelestialEvent[] = [];
  const targets = [
    { targetPhase: 0.0, title: 'New Moon Dark-Sky Vigil', japanese: '新月 · 暗夜観測', sig: 'Apex' as const },
    { targetPhase: 0.25, title: 'First Quarter Lunar Terminator', japanese: '上弦の月 · 半月', sig: 'Medium' as const },
    { targetPhase: 0.5, title: 'Full Moon Zenith Illumination', japanese: '満月 · 望月の儀', sig: 'High' as const },
    { targetPhase: 0.75, title: 'Third Quarter Pre-Dawn Moon', japanese: '下弦の月 · 暁月', sig: 'Medium' as const },
  ];

  const startMs = centerDate.getTime() - 7 * 86400000;
  let prevPhase = SunCalc.getMoonIllumination(new Date(startMs)).phase;

  for (let d = 0; d <= daysAhead; d++) {
    const curDate = new Date(startMs + d * 86400000);
    const illum = SunCalc.getMoonIllumination(curDate);
    const curPhase = illum.phase;

    for (const t of targets) {
      let crossed = false;
      if (t.targetPhase === 0.0) {
        crossed = prevPhase > 0.85 && curPhase < 0.15;
      } else {
        crossed = prevPhase < t.targetPhase && curPhase >= t.targetPhase;
      }

      if (crossed) {
        const mTimes = SunCalc.getMoonTimes(curDate, lat, lon);
        const riseStr = mTimes.rise ? formatTime12h(mTimes.rise) : 'N/A';
        const setStr = mTimes.set ? formatTime12h(mTimes.set) : 'N/A';
        const dateKey = toLocalDateKey(curDate);
        const pct = Math.round(illum.fraction * 100);

        events.push({
          id: `moon-${t.targetPhase}-${dateKey}`,
          title: t.title,
          japanese: t.japanese,
          category: 'Moon Phases',
          isoDate: curDate.toISOString(),
          dateKey,
          dateTime: `${curDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).toUpperCase()} · RISE ${riseStr}`,
          visibilityNote: `Illumination ${pct}%. Moonrise: ${riseStr} · Moonset: ${setStr} (computed via SunCalc).`,
          peakHour: `Moonrise ${riseStr} / Moonset ${setStr}`,
          constellation: 'Ecliptic Lunar Transit',
          significance: t.sig,
          description:
            t.targetPhase === 0.0
              ? `Moon illumination drops to ${pct}%, creating an optimal zero-moonlight window for deep-sky astrophotography and faint nebula observation.`
              : t.targetPhase === 0.5
              ? `The lunar disk reaches ${pct}% illumination. Moonrise at ${riseStr} and moonset at ${setStr} for your coordinates.`
              : `High-contrast solar angle along the lunar terminator highlights crater walls and mountain peaks through binoculars or telescopes.`,
        });
      }
    }
    prevPhase = curPhase;
  }

  return events;
}

type DateRangePreset = 'all' | '7d' | '30d' | '90d' | '2026' | '2027' | 'custom';

export const CelestialScrollSection: React.FC = () => {
  // Observer coordinates (from Geolocation or fallback to Chandigarh 30.7333, 76.7794)
  const [observerCoords, setObserverCoords] = useState<{
    lat: number;
    lon: number;
    label: string;
  }>({
    lat: 30.7333,
    lon: 76.7794,
    label: 'Chandigarh Observatory (30.73°N, 76.78°E)',
  });
  const [usingFallbackCoordsNote, setUsingFallbackCoordsNote] = useState<string | null>(null);

  // Category & Date Range Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);

  // Calendar Month State (defaults to current date's year/month)
  const [calendarMonthDate, setCalendarMonthDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Live API Data States
  const [launchEvents, setLaunchEvents] = useState<CelestialEvent[]>([]);
  const [issEvents, setIssEvents] = useState<CelestialEvent[]>([]);
  const [issOrbitMeta, setIssOrbitMeta] = useState<{
    tleAgeHours: number;
    stale: boolean;
  } | null>(null);
  const [issPassesUnavailable, setIssPassesUnavailable] = useState<boolean>(false);
  const [issLivePosition, setIssLivePosition] = useState<ISSPositionData | null>(null);
  const [isLoadingApis, setIsLoadingApis] = useState<boolean>(true);
  const [apiErrorNotice, setApiErrorNotice] = useState<string | null>(null);
  const lastFetchedLocKeyRef = useRef<string | null>(null);

  // Alert state (localStorage + Notification API)
  const [alertedEvents, setAlertedEvents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tsukuyomi_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [notifiedAlertIds, setNotifiedAlertIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tsukuyomi_notified_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [alertNotificationToast, setAlertNotificationToast] = useState<string | null>(null);
  const [observedEvents, setObservedEvents] = useState<string[]>(
    () => getHonorState().observedEventIds
  );

  useEffect(() => {
    return subscribeToHonorChanges((state) => {
      setObservedEvents(state.observedEventIds);
    });
  }, []);

  // Acquire saved Watchtower coordinates or browser Geolocation on mount
  useEffect(() => {
    const saved = getSavedObserverLocation();
    if (saved) {
      setObserverCoords({
        lat: saved.lat,
        lon: saved.lon,
        label: saved.label,
      });
      setUsingFallbackCoordsNote(null);
    } else if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const label = `${pos.coords.latitude.toFixed(2)}° N, ${pos.coords.longitude.toFixed(2)}° E`;
          setObserverCoords({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label,
          });
          saveObserverLocation({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label,
            source: 'gps',
          });
          setUsingFallbackCoordsNote(null);
        },
        () => {
          setObserverCoords({
            lat: 30.7333,
            lon: 76.7794,
            label: 'Chandigarh Observatory (30.73°N, 76.78°E)',
          });
          setUsingFallbackCoordsNote('Using Chandigarh. Allow location or search a city.');
        },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }
      );
    } else {
      setUsingFallbackCoordsNote('Using Chandigarh. Allow location or search a city.');
    }

    return subscribeToObserverLocation((loc) => {
      setObserverCoords({
        lat: loc.lat,
        lon: loc.lon,
        label: loc.label,
      });
      setUsingFallbackCoordsNote(null);
    });
  }, []);

  /**
   * Tonight's real Moonrise, Moonset, Illumination & Optimal Dark Window via SunCalc
   */
  const tonightMoonTelemetry = useMemo(() => {
    const now = new Date();
    const mTimes = SunCalc.getMoonTimes(now, observerCoords.lat, observerCoords.lon);
    const mIllum = SunCalc.getMoonIllumination(now);
    const mPos = SunCalc.getMoonPosition(now, observerCoords.lat, observerCoords.lon);
    const phaseDetails = getSunCalcPhaseDetails(mIllum.phase);

    // SunCalc v2 returns altitude in degrees
    const altitudeNum = Number(mPos.altitude.toFixed(1));
    const isMoonUp = altitudeNum > 0;

    // Determine next upcoming moonrise and moonset in the user's local timezone
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowTimes = SunCalc.getMoonTimes(tomorrow, observerCoords.lat, observerCoords.lon);

    let nextRise = mTimes.rise;
    if (!nextRise || (isMoonUp && nextRise.getTime() < now.getTime())) {
      nextRise = tomorrowTimes.rise || mTimes.rise;
    }

    let nextSet = mTimes.set;
    if (!nextSet || nextSet.getTime() < now.getTime()) {
      nextSet = tomorrowTimes.set || mTimes.set;
    }

    const riseFormatted = nextRise ? formatTime12h(nextRise) : 'Horizon Transit';
    const setFormatted = nextSet ? formatTime12h(nextSet) : 'After Dawn';
    const illumPct = Math.round(mIllum.fraction * 100);
    const altitudeDeg = altitudeNum.toFixed(1);

    const bannerHeadline = isMoonUp
      ? `The Moon Sets Tonight at ${setFormatted}`
      : `The Moon Rises Tonight at ${riseFormatted}`;

    // Determine optimal dark sky window based on moonrise/moonset
    let optimalWindow = '00:00 – 04:30 AM';
    if (illumPct < 20) {
      optimalWindow = '20:30 PM – 04:45 AM (All Night Dark)';
    } else if (!isMoonUp && nextRise && nextRise.getHours() >= 21) {
      optimalWindow = `19:30 PM – ${riseFormatted} (Pre-Moonrise)`;
    } else if (nextSet && nextSet.getHours() < 4) {
      optimalWindow = `${setFormatted} – 04:45 AM (Post-Moonset)`;
    }

    return {
      isMoonUp,
      bannerHeadline,
      riseFormatted,
      setFormatted,
      illumPct,
      altitudeDeg,
      phaseDetails,
      optimalWindow,
    };
  }, [observerCoords]);

  /**
   * Fetch Upcoming Rocket Launches from Launch Library 2 API with localStorage Caching
   * and Live ISS Position / Local Pass Predictions from wheretheiss.at
   */
  const fetchSpaceApis = useCallback(
    async (forceRefresh = false) => {
      setIsLoadingApis(true);
      setApiErrorNotice(null);

      // 1. Launch Library 2 API (https://ll.thespacedevs.com/2.2.0/launch/upcoming/)
      try {
        let ll2Results: LL2LaunchResult[] | null = null;
        if (!forceRefresh) {
          const cachedRaw = localStorage.getItem(LL2_CACHE_KEY);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (Date.now() - parsed.timestamp < LL2_CACHE_TTL_MS && Array.isArray(parsed.results)) {
              ll2Results = parsed.results;
            }
          }
        }

        if (!ll2Results) {
          const res = await fetch(
            'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=8'
          );
          if (!res.ok) {
            throw new Error(`Launch Library 2 API returned HTTP ${res.status}`);
          }
          const data = await res.json();
          ll2Results = data.results || [];
          localStorage.setItem(
            LL2_CACHE_KEY,
            JSON.stringify({ timestamp: Date.now(), results: ll2Results })
          );
        }

        const mappedLaunches: CelestialEvent[] = (ll2Results || []).map((launch) => {
          const netDate = new Date(launch.net);
          const dateKey = !isNaN(netDate.getTime())
            ? toLocalDateKey(netDate)
            : toLocalDateKey(new Date());
          const provider = launch.launch_service_provider?.name || 'Orbital Launch Provider';
          const padName = launch.pad?.name || 'Launch Complex';
          const locName = launch.pad?.location?.name || 'Spaceport';
          const orbitName =
            launch.mission?.orbit?.name || launch.mission?.orbit?.abbrev || 'Low Earth Orbit';

          return {
            id: `ll2-${launch.id}`,
            title: launch.name,
            japanese: `${provider.slice(0, 14)} · ロケット打上`,
            category: 'Rocket Launches',
            isoDate: launch.net,
            dateKey,
            dateTime: formatEventDateTime(launch.net),
            visibilityNote: `Pad: ${padName} (${locName}) · Target Orbit: ${orbitName}. Status: ${
              launch.status?.name || 'Go for Launch'
            }.`,
            peakHour: !isNaN(netDate.getTime()) ? formatTime12h(netDate) : 'TBD Window',
            constellation: `${locName} Trajectory`,
            significance: 'Apex',
            description:
              launch.mission?.description ||
              `Upcoming orbital launch mission operated by ${provider} departing from ${padName}, ${locName}.`,
          };
        });

        setLaunchEvents(mappedLaunches);
      } catch (err) {
        // Attempt to fall back to stale cache if rate-limited
        const staleRaw = localStorage.getItem(LL2_CACHE_KEY);
        if (staleRaw) {
          try {
            const parsed = JSON.parse(staleRaw);
            if (Array.isArray(parsed.results)) {
              setLaunchEvents(
                parsed.results.map((launch: LL2LaunchResult) => ({
                  id: `ll2-${launch.id}`,
                  title: launch.name,
                  japanese: '軌道ロケット打上',
                  category: 'Rocket Launches',
                  isoDate: launch.net,
                  dateKey: toLocalDateKey(new Date(launch.net)),
                  dateTime: formatEventDateTime(launch.net),
                  visibilityNote: `Pad: ${launch.pad?.name || 'Launch Complex'} (${
                    launch.pad?.location?.name || 'Spaceport'
                  })`,
                  peakHour: formatTime12h(new Date(launch.net)),
                  constellation: launch.pad?.location?.name || 'Orbital Pad',
                  significance: 'High',
                  description:
                    launch.mission?.description ||
                    'Upcoming orbital launch fetched from Launch Library 2 cache.',
                }))
              );
            }
          } catch {}
        } else {
          setApiErrorNotice(
            err instanceof Error ? err.message : 'Unable to reach Launch Library 2 API.'
          );
        }
      }

      // 2. Live ISS Telemetry Widget (https://api.wheretheiss.at/v1/satellites/25544)
      try {
        let issData: ISSPositionData | null = null;
        if (!forceRefresh) {
          const cachedIss = localStorage.getItem(ISS_CACHE_KEY);
          if (cachedIss) {
            const parsed = JSON.parse(cachedIss);
            if (Date.now() - parsed.cachedAt < ISS_CACHE_TTL_MS && parsed.data) {
              issData = parsed.data;
            }
          }
        }

        if (!issData) {
          const issRes = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
          if (!issRes.ok) {
            throw new Error(`ISS Telemetry API returned HTTP ${issRes.status}`);
          }
          issData = await issRes.json();
          localStorage.setItem(
            ISS_CACHE_KEY,
            JSON.stringify({ cachedAt: Date.now(), data: issData })
          );
        }

        if (issData) {
          setIssLivePosition(issData);
        }
      } catch (err) {
        setApiErrorNotice((prev) =>
          prev
            ? `${prev} | ISS Live Position: ${err instanceof Error ? err.message : 'Error'}`
            : `ISS Live Position Notice: ${err instanceof Error ? err.message : 'Unable to fetch'}`
        );
      }

      // 3. Real 5-Day Visible ISS Pass Predictions via /api/iss-passes with Browser Fallback & sessionStorage Cache
      try {
        setIssPassesUnavailable(false);
        const passData = await fetchIssPassesWithBrowserFallback(
          observerCoords.lat,
          observerCoords.lon,
          forceRefresh
        );

        const realPasses: IssPassPrediction[] = Array.isArray(passData.passes)
          ? passData.passes
          : [];

        const mappedIssEvents: CelestialEvent[] = realPasses.map((pass, idx) => {
          const riseDate = new Date(pass.riseTime);
          const maxDate = new Date(pass.maxElevationTime);
          const setDate = new Date(pass.setTime);

          const riseLocalStr = riseDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
          const maxLocalStr = maxDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
          const setLocalStr = setDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
          const dateLabel = riseDate
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            .toUpperCase();

          const mins = Math.floor(pass.durationSeconds / 60);
          const secs = pass.durationSeconds % 60;
          const durationFormatted =
            mins > 0 ? `${pass.durationSeconds}s (${mins}m ${secs}s)` : `${pass.durationSeconds}s`;

          const significance: 'Apex' | 'High' | 'Medium' =
            pass.maxElevation >= 50 ? 'Apex' : pass.maxElevation >= 35 ? 'High' : 'Medium';

          return {
            id: `iss-pass-${pass.riseTime}-${idx}`,
            title: `ISS Visible Pass · ${pass.maxElevation}° Max Elevation`,
            japanese: '国際宇宙ステーション · 可視通過',
            category: 'ISS Passes',
            isoDate: pass.riseTime,
            dateKey: toLocalDateKey(riseDate),
            dateTime: `${dateLabel} · RISE ${riseLocalStr} · MAX ${maxLocalStr} · SET ${setLocalStr}`,
            visibilityNote: `Max Elevation: ${pass.maxElevation}° · Duration: ${durationFormatted} · Rise: ${pass.riseCompass} ➔ Set: ${pass.setCompass}`,
            peakHour: `Max ${maxLocalStr} (${pass.maxElevation}°)`,
            constellation: `${pass.riseCompass} (${pass.riseAzimuth}°) ➔ ${pass.maxCompass} (${pass.maxElevation}°) ➔ ${pass.setCompass} (${pass.setAzimuth}°)`,
            significance,
            description: `Sunlit International Space Station pass during local darkness over ${observerCoords.label}. Rises at ${riseLocalStr} in the ${pass.riseCompass}, peaks at ${pass.maxElevation}° elevation at ${maxLocalStr} (${pass.maxCompass}), and sets at ${setLocalStr} in the ${pass.setCompass} (total duration ${pass.durationSeconds} seconds).`,
          };
        });

        setIssEvents(mappedIssEvents);
        setIssOrbitMeta({
          tleAgeHours: passData.tleAgeHours,
          stale: passData.stale,
        });
      } catch {
        setIssEvents([]);
        setIssOrbitMeta(null);
        setIssPassesUnavailable(true);
      } finally {
        setIsLoadingApis(false);
      }
    },
    [observerCoords]
  );

  useEffect(() => {
    const locKey = `${observerCoords.lat.toFixed(2)},${observerCoords.lon.toFixed(2)}`;
    if (lastFetchedLocKeyRef.current === locKey) {
      return;
    }
    lastFetchedLocKeyRef.current = locKey;
    fetchSpaceApis(false);
  }, [observerCoords.lat, observerCoords.lon, fetchSpaceApis]);

  /**
   * Combine Static 2026-2027 Meteor Showers & Eclipses + SunCalc Moon Phases + Live LL2 Launches + Live ISS Passes
   */
  const allEvents = useMemo<CelestialEvent[]>(() => {
    const staticMeteors: CelestialEvent[] = staticEventsData.meteorShowers.map((m) => ({
      id: m.id,
      title: m.title,
      japanese: m.japanese,
      category: 'Meteor Showers',
      isoDate: m.isoDate,
      dateKey: toLocalDateKey(new Date(m.isoDate)),
      dateTime: `${formatEventDateTime(m.isoDate)} (${m.activeWindow})`,
      visibilityNote: m.visibilityNote,
      peakHour: m.peakHour,
      constellation: m.constellation,
      significance: m.significance as 'High' | 'Medium' | 'Apex',
      description: m.description,
    }));

    const staticEclipses: CelestialEvent[] = staticEventsData.eclipses.map((ec) => ({
      id: ec.id,
      title: ec.title,
      japanese: ec.japanese,
      category: 'Eclipses',
      isoDate: ec.isoDate,
      dateKey: toLocalDateKey(new Date(ec.isoDate)),
      dateTime: `${formatEventDateTime(ec.isoDate)} · ${ec.activeWindow}`,
      visibilityNote: ec.visibilityNote,
      peakHour: ec.peakHour,
      constellation: ec.constellation,
      significance: ec.significance as 'High' | 'Medium' | 'Apex',
      description: ec.description,
    }));

    const moonPhaseEvents = generateSunCalcMoonEvents(
      new Date(),
      observerCoords.lat,
      observerCoords.lon,
      120
    );

    const combined = [
      ...staticMeteors,
      ...staticEclipses,
      ...moonPhaseEvents,
      ...issEvents,
      ...launchEvents,
    ];

    combined.sort((a, b) => new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime());
    return combined;
  }, [observerCoords, issEvents, launchEvents]);

  /**
   * Filter events by Category, Date Range Preset / Custom Dates, and Selected Calendar Day
   */
  const filteredEvents = useMemo(() => {
    const nowMs = Date.now();

    return allEvents.filter((evt) => {
      // 1. Category Filter
      if (selectedCategory !== 'All' && evt.category !== selectedCategory) {
        return false;
      }

      // 2. Specific Calendar Day Filter (if user clicked a day in the Lunar Calendar)
      if (selectedCalendarDateKey && evt.dateKey !== selectedCalendarDateKey) {
        return false;
      }

      // 3. Date Range Filter
      const evtMs = new Date(evt.isoDate).getTime();
      if (isNaN(evtMs)) return true;

      if (dateRangePreset === '7d') {
        return evtMs >= nowMs - 86400000 && evtMs <= nowMs + 7 * 86400000;
      }
      if (dateRangePreset === '30d') {
        return evtMs >= nowMs - 86400000 && evtMs <= nowMs + 30 * 86400000;
      }
      if (dateRangePreset === '90d') {
        return evtMs >= nowMs - 86400000 && evtMs <= nowMs + 90 * 86400000;
      }
      if (dateRangePreset === '2026') {
        const yr = new Date(evt.isoDate).getFullYear();
        return yr === 2026;
      }
      if (dateRangePreset === '2027') {
        const yr = new Date(evt.isoDate).getFullYear();
        return yr === 2027;
      }
      if (dateRangePreset === 'custom') {
        if (customStartDate) {
          const startMs = new Date(`${customStartDate}T00:00:00`).getTime();
          if (evtMs < startMs) return false;
        }
        if (customEndDate) {
          const endMs = new Date(`${customEndDate}T23:59:59`).getTime();
          if (evtMs > endMs) return false;
        }
      }

      return true;
    });
  }, [
    allEvents,
    selectedCategory,
    selectedCalendarDateKey,
    dateRangePreset,
    customStartDate,
    customEndDate,
  ]);

  /**
   * Build Traditional Lunar Calendar Days for `calendarMonthDate` using SunCalc
   */
  const calendarDays = useMemo(() => {
    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = toLocalDateKey(new Date());

    // Map dateKey -> events on that day
    const eventsByDate = new Map<string, CelestialEvent[]>();
    allEvents.forEach((evt) => {
      const list = eventsByDate.get(evt.dateKey) || [];
      list.push(evt);
      eventsByDate.set(evt.dateKey, list);
    });

    return Array.from({ length: daysInMonth }).map((_, idx) => {
      const dayNum = idx + 1;
      const dayDate = new Date(year, month, dayNum, 12, 0, 0);
      const dateKey = toLocalDateKey(dayDate);

      const mIllum = SunCalc.getMoonIllumination(dayDate);
      const mTimes = SunCalc.getMoonTimes(dayDate, observerCoords.lat, observerCoords.lon);
      const phaseDetails = getSunCalcPhaseDetails(mIllum.phase);
      const lunarDayAge = Math.max(1, Math.round(mIllum.phase * 29.53));
      const dayEvents = eventsByDate.get(dateKey) || [];

      return {
        dayNum,
        dateKey,
        dayDate,
        phaseEmoji: phaseDetails.emoji,
        phaseName: phaseDetails.name,
        illuminationPct: Math.round(mIllum.fraction * 100),
        lunarDayAge,
        moonriseStr: mTimes.rise ? formatTime12h(mTimes.rise) : '—',
        moonsetStr: mTimes.set ? formatTime12h(mTimes.set) : '—',
        isToday: dateKey === todayKey,
        dayEvents,
      };
    });
  }, [calendarMonthDate, allEvents, observerCoords]);

  /**
   * Toggle Alert with Notification API + localStorage persistence
  /**
   * Scheduled 60-second check for alerted events within 30 minutes of start time
   */
  useEffect(() => {
    const checkImminentAlertedEvents = () => {
      if (alertedEvents.length === 0 || allEvents.length === 0) return;

      const nowMs = Date.now();
      const window30MinMs = 30 * 60 * 1000;
      const newlyNotified: string[] = [];

      for (const evt of allEvents) {
        if (!alertedEvents.includes(evt.id)) continue;
        if (notifiedAlertIds.includes(evt.id)) continue;

        const evtStartMs = new Date(evt.isoDate).getTime();
        if (isNaN(evtStartMs)) continue;

        const diffMs = evtStartMs - nowMs;
        if (diffMs > 0 && diffMs <= window30MinMs) {
          const minsRemaining = Math.max(1, Math.round(diffMs / 60000));
          const alertMessage = `${evt.title} begins in ${minsRemaining} minute${
            minsRemaining === 1 ? '' : 's'
          }`;

          playSuzuChime();
          setAlertNotificationToast(alertMessage);

          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(`Upcoming Celestial Event: ${evt.title}`, {
                body: `${alertMessage} · ${evt.visibilityNote}`,
              });
            } catch {}
          }

          newlyNotified.push(evt.id);
        }
      }

      if (newlyNotified.length > 0) {
        setNotifiedAlertIds((prev) => {
          const updated = Array.from(new Set([...prev, ...newlyNotified]));
          try {
            localStorage.setItem('tsukuyomi_notified_alerts', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
    };

    checkImminentAlertedEvents();
    const intervalId = setInterval(checkImminentAlertedEvents, 60000);
    return () => clearInterval(intervalId);
  }, [alertedEvents, allEvents, notifiedAlertIds]);

  /**
   * Toggle Alert with Notification API + localStorage persistence
   */
  const handleToggleAlert = async (evt: CelestialEvent) => {
    playSuzuChime();
    const isRemoving = alertedEvents.includes(evt.id);
    const nextAlerts = isRemoving
      ? alertedEvents.filter((item) => item !== evt.id)
      : [...alertedEvents, evt.id];

    setAlertedEvents(nextAlerts);
    try {
      localStorage.setItem('tsukuyomi_alerts', JSON.stringify(nextAlerts));
    } catch {}

    if (isRemoving) {
      setNotifiedAlertIds((prev) => {
        const cleaned = prev.filter((id) => id !== evt.id);
        try {
          localStorage.setItem('tsukuyomi_notified_alerts', JSON.stringify(cleaned));
        } catch {}
        return cleaned;
      });
      setAlertNotificationToast(`Removed alert for "${evt.title}"`);
      setTimeout(() => setAlertNotificationToast(null), 3500);
      return;
    }

    const honorRes = awardAlertSetPoints(evt.id, evt.title);
    const honorBonusNote = honorRes.awarded ? ` (+${honorRes.pointsAdded} Honor Points!)` : '';

    // Trigger Browser Notification API confirmation if supported
    const notifTitle = `Tsukuyomi Watch Alert Set: ${evt.title}`;
    const notifBody = `${evt.dateTime} · ${evt.visibilityNote}`;

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        setNotificationPermission(Notification.permission);
        if (Notification.permission === 'granted') {
          new Notification(notifTitle, { body: notifBody });
          setAlertNotificationToast(
            `Browser Notification & 30-min reminder armed for "${evt.title}"${honorBonusNote}`
          );
        } else if (Notification.permission !== 'denied') {
          const permission = await Notification.requestPermission();
          setNotificationPermission(permission);
          if (permission === 'granted') {
            new Notification(notifTitle, { body: notifBody });
            setAlertNotificationToast(
              `Notification permission granted! Alert & 30-min reminder armed for "${evt.title}"${honorBonusNote}`
            );
          } else {
            setAlertNotificationToast(
              `Alert saved to localStorage for "${evt.title}" (${evt.dateTime})${honorBonusNote}`
            );
          }
        } else {
          setAlertNotificationToast(
            `Alert saved to localStorage for "${evt.title}" (${evt.dateTime})${honorBonusNote}`
          );
        }
      } catch {
        setAlertNotificationToast(
          `Alert saved to localStorage for "${evt.title}" (${evt.dateTime})${honorBonusNote}`
        );
      }
    } else {
      setAlertNotificationToast(
        `Alert saved to localStorage for "${evt.title}" (${evt.dateTime})${honorBonusNote}`
      );
    }

    setTimeout(() => setAlertNotificationToast(null), 4500);
  };

  /**
   * Mark Event as Observed (+150 Honor Points)
   */
  const handleMarkObserved = (evt: CelestialEvent) => {
    playKotoNote(587.33, 1.1);
    const res = awardEventObservedPoints(evt.id, evt.title);
    if (res.awarded) {
      setAlertNotificationToast(
        `Observed "${evt.title}" recorded in Chronicle! +${res.pointsAdded} Honor Points awarded.`
      );
      setTimeout(() => setAlertNotificationToast(null), 4500);
    }
  };

  const categories = [
    'All',
    'Meteor Showers',
    'Eclipses',
    'Moon Phases',
    'ISS Passes',
    'Rocket Launches',
  ];

  const nextImminentEvent = useMemo(() => {
    const now = Date.now();
    return (
      allEvents.find((e) => new Date(e.isoDate).getTime() >= now - 3600000) || allEvents[0]
    );
  }, [allEvents]);

  const selectedDayInfo = useMemo(() => {
    if (!selectedCalendarDateKey) return null;
    return calendarDays.find((d) => d.dateKey === selectedCalendarDateKey) || null;
  }, [selectedCalendarDateKey, calendarDays]);

  return (
    <section
      id="scroll"
      className="relative min-h-screen py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-[#D4A84B]/20"
    >
      {/* Chapter 02 Header */}
      <div className="border-b border-[#D4A84B]/25 pb-6 mb-8">
        <div className="flex items-center space-x-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
          <span>02. THE CELESTIAL SCROLL · 天文絵巻</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2">
          <div>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#F4EFE3] text-glow-moon">
              Space Event Tracker
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl leading-relaxed">
              SunCalc lunar ephemeris, Launch Library 2 orbital missions, live ISS pass predictions, and the 2026–2027 meteor shower & eclipse chronicle.
            </p>
          </div>

          {/* Live ISS Telemetry Pill & API Refresh */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
            {issLivePosition && (
              <div className="px-3 py-1.5 rounded-xl bg-[#0E1326] border border-[#151B38] flex items-center space-x-2 text-[11px]">
                <Satellite className="w-3.5 h-3.5 text-[#D4A84B]" />
                <span className="text-[#8E9BB5]">ISS LIVE:</span>
                <span className="text-[#F4EFE3] font-bold">
                  {issLivePosition.latitude.toFixed(1)}°, {issLivePosition.longitude.toFixed(1)}°
                </span>
                <span className="text-[#D4A84B]">({Math.round(issLivePosition.velocity)} km/h)</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => fetchSpaceApis(true)}
              disabled={isLoadingApis}
              className="px-3 py-1.5 rounded-xl bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] font-mono text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Refresh Launch Library 2 & ISS Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingApis ? 'animate-spin' : ''}`} />
              <span>Sync Ephemeris</span>
            </button>
          </div>
        </div>
      </div>

      {/* Prominent Live SunCalc Moonrise/Moonset & Celestial Alert Banner */}
      <div className="mb-6 bg-gradient-to-r from-[#B3202A]/25 via-[#0E1326] to-[#D4A84B]/20 border border-[#D4A84B] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-[0_0_30px_rgba(212,168,75,0.2)]">
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="w-10 h-10 rounded-full bg-[#B3202A] text-[#F4EFE3] flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(179,32,42,0.5)]">
            <Moon className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#D4A84B] uppercase font-bold tracking-widest">
              <span>LIVE SUNCALC EPHEMERIS · {observerCoords.label}</span>
              {usingFallbackCoordsNote && (
                <>
                  <span>·</span>
                  <span className="text-[#F4EFE3]/90 normal-case font-normal">
                    {usingFallbackCoordsNote}
                  </span>
                </>
              )}
              <span>·</span>
              <span className="text-[#F4EFE3] tabular-nums">
                {tonightMoonTelemetry.phaseDetails.emoji} {tonightMoonTelemetry.phaseDetails.name.toUpperCase()} ({tonightMoonTelemetry.illumPct}% ILLUMINATION)
              </span>
            </div>
            <h3 className="font-serif text-base sm:text-xl font-bold text-[#F4EFE3] mt-0.5">
              {tonightMoonTelemetry.bannerHeadline}
            </h3>
            <p className="font-mono text-[11px] text-[#8E9BB5] mt-0.5">
              Phase: <span className="text-[#F4EFE3]">{tonightMoonTelemetry.phaseDetails.name}</span> · Illumination: <span className="text-[#D4A84B] font-bold">{tonightMoonTelemetry.illumPct}%</span>
              {tonightMoonTelemetry.isMoonUp
                ? ` · Currently above horizon (${tonightMoonTelemetry.altitudeDeg}° alt) · Next Moonrise: ${tonightMoonTelemetry.riseFormatted}`
                : ` · Moonset: ${tonightMoonTelemetry.setFormatted}`}
              {nextImminentEvent ? ` · Next Event: ${nextImminentEvent.title}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs tabular-nums">
          <span className="px-3 py-1 rounded-full bg-[#151B38] text-[#D4A84B] border border-[#D4A84B]/40">
            OPTIMAL DARK WINDOW: {tonightMoonTelemetry.optimalWindow}
          </span>
        </div>
      </div>

      {/* Note when browser notification permission is denied */}
      {notificationPermission === 'denied' && (
        <div className="mb-6 px-4 py-2.5 rounded-xl bg-[#0E1326] border border-[#D4A84B]/30 flex items-center space-x-2 text-xs font-mono text-[#8E9BB5]">
          <Bell className="w-3.5 h-3.5 text-[#D4A84B] shrink-0" />
          <span>
            Browser notification permission is denied — in-app toasts will still work automatically when your alerted events are within 30 minutes of starting.
          </span>
        </div>
      )}

      {/* Notification API Feedback Toast */}
      {alertNotificationToast && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#0E1326] border border-[#D4A84B] flex items-center justify-between text-xs font-mono text-[#F4EFE3] shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#D4A84B] shrink-0" />
            <span>{alertNotificationToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlertNotificationToast(null)}
            className="text-[#8E9BB5] hover:text-[#F4EFE3] ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* API Notice if offline or rate-limited */}
      {apiErrorNotice && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#B3202A]/15 border border-[#B3202A] flex items-center justify-between text-xs font-mono text-[#F4EFE3]">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0" />
            <span>{apiErrorNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchSpaceApis(true)}
            className="px-2.5 py-1 rounded bg-[#B3202A] text-[#F4EFE3] font-bold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <ScrollPageControls
        panelIds={['lunar-calendar', 'event-filters', 'event-timeline', 'iss-passes']}
        className="mb-8"
      />

      <div className="space-y-6">
        {/* 1. Lunar Calendar ScrollPanel */}
        <ScrollPanel
          id="lunar-calendar"
          title="Lunar Calendar"
          kanji="太陰暦"
          subtitle={calendarMonthDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
          icon={Calendar}
          defaultOpen={false}
        >
          {/* Traditional Lunar Calendar Grid Box with SunCalc Moon Phases & Event Dots */}
          <div className="bg-[#0E1326] border border-[#D4A84B]/40 rounded-2xl p-6 shadow-[0_0_25px_rgba(212,168,75,0.15)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#151B38] pb-3 gap-3 text-xs font-mono text-[#8E9BB5]">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-[#D4A84B]" />
                <span className="text-[#D4A84B] font-bold tracking-widest uppercase">
                  LUNAR CHRONICLE ·{' '}
              {calendarMonthDate
                .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                .toUpperCase()}
            </span>
          </div>

          {/* Month Navigation Controls */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() =>
                setCalendarMonthDate(
                  new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() - 1, 1)
                )
              }
              className="p-1.5 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B] text-[#F4EFE3] cursor-pointer"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setCalendarMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelectedCalendarDateKey(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B] text-[#D4A84B] text-[11px] cursor-pointer"
            >
              Current Month
            </button>
            <button
              type="button"
              onClick={() =>
                setCalendarMonthDate(
                  new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 1)
                )
              }
              className="p-1.5 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B] text-[#F4EFE3] cursor-pointer"
              aria-label="Next Month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Calendar Days Grid */}
        <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 lg:grid-cols-16 gap-1 sm:gap-2 text-center font-mono tabular-nums">
          {calendarDays.map((d) => {
            const isSelected = selectedCalendarDateKey === d.dateKey;
            const hasEvent = d.dayEvents.length > 0;

            return (
              <button
                key={d.dateKey}
                type="button"
                onClick={() => {
                  playSuzuChime();
                  setSelectedCalendarDateKey((prev) =>
                    prev === d.dateKey ? null : d.dateKey
                  );
                }}
                title={`${d.dateKey}: ${d.phaseName} (${d.illuminationPct}% lit) · Moonrise: ${d.moonriseStr} · ${d.dayEvents.length} event(s)`}
                className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-between min-h-[58px] sm:min-h-[68px] ${
                  isSelected
                    ? 'bg-[#D4A84B]/25 border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.45)] scale-105'
                    : d.isToday
                    ? 'bg-[#B3202A]/25 border-[#D4A84B] shadow-[0_0_12px_rgba(212,168,75,0.3)]'
                    : hasEvent
                    ? 'bg-[#151B38]/85 border-[#D4A84B]/50 hover:border-[#D4A84B]'
                    : 'bg-[#0A0A0F]/70 border-[#151B38] hover:border-[#D4A84B]/30'
                }`}
              >
                <div className="flex items-center justify-between w-full text-[9.5px]">
                  <span className={d.isToday ? 'text-[#D4A84B] font-bold' : 'text-[#F4EFE3]'}>
                    {d.dayNum}
                  </span>
                  <span className="text-[8px] text-[#8E9BB5]">{d.illuminationPct}%</span>
                </div>

                <div className="text-base my-1">{d.phaseEmoji}</div>

                {/* Event Dots per Day */}
                <div className="flex items-center justify-center space-x-1 h-2">
                  {d.dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className={`w-1.5 h-1.5 rounded-full ${
                        ev.category === 'Eclipses'
                          ? 'bg-[#B3202A]'
                          : ev.category === 'Meteor Showers'
                          ? 'bg-[#D4A84B]'
                          : ev.category === 'Rocket Launches'
                          ? 'bg-[#38BDF8]'
                          : ev.category === 'ISS Passes'
                          ? 'bg-[#34D399]'
                          : 'bg-[#F4EFE3]'
                      }`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Calendar Day Ephemeris Bar */}
        {selectedDayInfo && (
          <div className="pt-3 border-t border-[#151B38] flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <div className="flex flex-wrap items-center gap-3 text-[#F4EFE3]">
              <span className="text-[#D4A84B] font-bold">
                SELECTED DATE: {selectedDayInfo.dateKey}
              </span>
              <span>
                {selectedDayInfo.phaseEmoji} {selectedDayInfo.phaseName} (
                {selectedDayInfo.illuminationPct}% lit · Lunar Day {selectedDayInfo.lunarDayAge})
              </span>
              <span className="text-[#8E9BB5]">
                Moonrise: <strong className="text-[#F4EFE3]">{selectedDayInfo.moonriseStr}</strong>{' '}
                · Moonset: <strong className="text-[#F4EFE3]">{selectedDayInfo.moonsetStr}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCalendarDateKey(null)}
              className="text-[#D4A84B] hover:underline cursor-pointer"
            >
              Show All Dates ({allEvents.length} Events)
            </button>
          </div>
        )}
          </div>
        </ScrollPanel>

        {/* 2. Filters ScrollPanel */}
        <ScrollPanel
          id="event-filters"
          title="Filters"
          kanji="選別"
          subtitle={`Category: ${selectedCategory} · Date range: ${dateRangePreset.toUpperCase()}`}
          icon={Filter}
          defaultOpen={false}
        >
          {/* Filter Bar: Event Type Filter Chips + Date Range Filter */}
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Category Filter Chips */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-sans font-semibold tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#D4A84B] text-[#0A0A0F] shadow-[0_0_18px_rgba(212,168,75,0.4)] font-bold'
                    : 'bg-[#0E1326] border border-[#151B38] text-[#8E9BB5] hover:text-[#F4EFE3] hover:border-[#D4A84B]/40'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Date Range Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="text-[#8E9BB5] flex items-center space-x-1 mr-1">
              <Filter className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>DATE RANGE:</span>
            </span>
            {(
              [
                { id: 'all', label: 'All (2026–2027)' },
                { id: '7d', label: 'Next 7D' },
                { id: '30d', label: 'Next 30D' },
                { id: '90d', label: 'Next 90D' },
                { id: '2026', label: '2026' },
                { id: '2027', label: '2027' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setDateRangePreset(preset.id);
                  setSelectedCalendarDateKey(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  dateRangePreset === preset.id
                    ? 'bg-[#151B38] border-[#D4A84B] text-[#D4A84B] font-bold'
                    : 'bg-[#0E1326] border-[#151B38] text-[#8E9BB5] hover:text-[#F4EFE3]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Inputs */}
        {dateRangePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl bg-[#0E1326] border border-[#D4A84B]/40 font-mono text-xs">
            <div className="flex items-center space-x-2">
              <label htmlFor="scroll-start-date" className="text-[#8E9BB5]">
                FROM:
              </label>
              <input
                id="scroll-start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-[#0A0A0F] border border-[#151B38] rounded-lg px-2.5 py-1 text-[#F4EFE3] focus:border-[#D4A84B] focus:outline-none"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label htmlFor="scroll-end-date" className="text-[#8E9BB5]">
                TO:
              </label>
              <input
                id="scroll-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-[#0A0A0F] border border-[#151B38] rounded-lg px-2.5 py-1 text-[#F4EFE3] focus:border-[#D4A84B] focus:outline-none"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-[#D4A84B] hover:underline cursor-pointer"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
          </div>
        </ScrollPanel>

        {/* 3. Event Timeline ScrollPanel */}
        <ScrollPanel
          id="event-timeline"
          title="Event Timeline"
          kanji="絵巻"
          subtitle={`${filteredEvents.length} celestial events matching filters`}
          icon={Bell}
          defaultOpen={true}
        >
          {/* Loading Indicator for Live Launch Library 2 & ISS Feeds */}
          {isLoadingApis && allEvents.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#0E1326] border border-[#D4A84B]/30 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#D4A84B] animate-spin" />
          <p className="font-mono text-xs text-[#D4A84B]">
            Synchronizing Launch Library 2 orbital schedule & SunCalc ephemeris...
          </p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-10 rounded-2xl bg-[#0E1326] border border-[#151B38] text-center space-y-3">
          {selectedCategory === 'ISS Passes' ? (
            issPassesUnavailable ? (
              <>
                <Satellite className="w-8 h-8 text-[#F87171] mx-auto opacity-80" />
                <p className="font-serif text-lg text-[#F4EFE3]">
                  ISS pass data is unavailable right now
                </p>
                <button
                  type="button"
                  onClick={() => fetchSpaceApis(true)}
                  className="px-4 py-2 rounded-full bg-[#B3202A] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold inline-flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </>
            ) : (
              <>
                <Satellite className="w-8 h-8 text-[#D4A84B] mx-auto opacity-80" />
                <p className="font-serif text-lg text-[#F4EFE3]">
                  No visible ISS passes over the next 5 days for {observerCoords.label}.
                </p>
                <p className="font-sans text-xs text-[#8E9BB5] max-w-lg mx-auto leading-relaxed">
                  Passes are only listed when the International Space Station reaches a maximum elevation above 20° while sunlit by the Sun and the observer is in astronomical/nautical darkness (Sun elevation below -6°).
                </p>
                {issOrbitMeta && (
                  <div className="pt-2 font-mono text-xs text-[#8E9BB5] space-y-1">
                    <p>Orbit data updated {issOrbitMeta.tleAgeHours} hours ago</p>
                    {issOrbitMeta.stale && (
                      <p className="text-[#D4A84B]">
                        Using older orbit data, times may be off by a few minutes
                      </p>
                    )}
                  </div>
                )}
              </>
            )
          ) : (
            <p className="font-serif text-lg text-[#F4EFE3]">
              No celestial events match the selected filter criteria.
            </p>
          )}
          {(!issPassesUnavailable || selectedCategory !== 'ISS Passes') && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setDateRangePreset('all');
                setSelectedCalendarDateKey(null);
              }}
              className="px-4 py-2 rounded-full bg-[#D4A84B] text-[#0A0A0F] font-mono text-xs font-bold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Vertical Timeline of Event Cards */}
          <div className="relative border-l border-[#D4A84B]/30 ml-4 sm:ml-8 pl-6 sm:pl-10 space-y-8">
            {filteredEvents.map((evt) => {
              const isAlerted = alertedEvents.includes(evt.id);

              return (
                <div key={evt.id} className="relative group">
                  {/* Timeline Node Ring */}
                  <div
                    className={`absolute -left-[31px] sm:-left-[47px] top-6 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${
                      isAlerted
                        ? 'border-[#D4A84B] bg-[#B3202A] shadow-[0_0_12px_rgba(212,168,75,0.6)]'
                        : 'border-[#8E9BB5] bg-[#0A0A0F]'
                    }`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F4EFE3]" />
                  </div>

                  {/* Event Card Container */}
                  <div className="bg-[#0E1326] border border-[#151B38] hover:border-[#D4A84B] rounded-2xl p-5 sm:p-6 transition-all duration-300 group-hover:glow-gold-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#151B38] gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 text-[10px] font-mono text-[#D4A84B]">
                          <span className="uppercase font-bold tracking-widest">
                            {evt.category}
                          </span>
                          <span>·</span>
                          <span className="font-kanji">{evt.japanese}</span>
                        </div>

                        <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#F4EFE3] group-hover:text-[#D4A84B] transition-colors">
                          {evt.title}
                        </h3>
                      </div>

                      {/* Action Buttons: View in Sky, Mark Observed (+150 PTS) & Set Alert (+75 PTS) */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                          to={`/stargazer?lat=${observerCoords.lat}&lng=${observerCoords.lon}&date=${encodeURIComponent(evt.isoDate)}&event=${encodeURIComponent(evt.title)}&label=${encodeURIComponent(observerCoords.label)}`}
                          onClick={() => playSuzuChime()}
                          className="px-3.5 py-2 rounded-full bg-[#D4A84B]/15 hover:bg-[#D4A84B] border border-[#D4A84B]/60 text-[#D4A84B] hover:text-[#0A0A0F] font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>View in sky</span>
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleMarkObserved(evt)}
                          className={`px-3.5 py-2 rounded-full font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer ${
                            observedEvents.includes(evt.id)
                              ? 'bg-[#D4A84B]/20 border border-[#D4A84B] text-[#D4A84B]'
                              : 'bg-[#0A0A0F] border border-[#151B38] text-[#8E9BB5] hover:border-[#D4A84B] hover:text-[#D4A84B]'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            {observedEvents.includes(evt.id)
                              ? 'OBSERVED ✓'
                              : 'MARK OBSERVED (+150)'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleAlert(evt)}
                          className={`px-4 py-2 rounded-full font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer ${
                            isAlerted
                              ? 'bg-[#B3202A] text-[#F4EFE3] glow-crimson'
                              : 'bg-[#151B38] border border-[#D4A84B]/40 text-[#D4A84B] hover:bg-[#D4A84B] hover:text-[#0A0A0F]'
                          }`}
                        >
                          {isAlerted ? (
                            <>
                              <BellRing className="w-3.5 h-3.5" />
                              <span>ALERT SET 🔔</span>
                            </>
                          ) : (
                            <>
                              <Bell className="w-3.5 h-3.5" />
                              <span>SET ALERT (+75) 🔔</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="font-sans text-xs sm:text-sm text-[#F4EFE3]/80 leading-relaxed">
                      {evt.description}
                    </p>

                    {/* Event Metadata Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38] font-mono text-xs tabular-nums">
                      <div>
                        <span className="text-[10px] text-[#8E9BB5] block">
                          Date & Peak Window
                        </span>
                        <span className="text-[#D4A84B] font-bold">{evt.dateTime}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#8E9BB5] block">
                          Quadrant / Trajectory
                        </span>
                        <span className="text-[#F4EFE3] font-semibold">{evt.constellation}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#8E9BB5] block">
                          Visibility & Telemetry
                        </span>
                        <span className="text-[#8E9BB5] text-[11px] block">
                          {evt.visibilityNote}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </ScrollPanel>

        {/* 4. ISS Passes ScrollPanel */}
        <ScrollPanel
          id="iss-passes"
          title="ISS Passes"
          kanji="宇宙駅"
          subtitle={
            issPassesUnavailable
              ? 'Pass telemetry unavailable'
              : `${issEvents.length} visible passes over next 5 days for ${observerCoords.label}`
          }
          icon={Satellite}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {issPassesUnavailable ? (
              <div className="p-6 rounded-2xl bg-[#0E1326] border border-[#B3202A]/60 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
                <div className="flex items-center space-x-3">
                  <Satellite className="w-6 h-6 text-[#F87171] shrink-0" />
                  <span className="text-[#F4EFE3]">
                    ISS pass data is unavailable right now
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchSpaceApis(true)}
                  className="px-4 py-2 rounded-xl bg-[#B3202A] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-bold inline-flex items-center space-x-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            ) : issEvents.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#0E1326] border border-[#151B38] text-center space-y-2.5">
                <Satellite className="w-7 h-7 text-[#D4A84B] mx-auto opacity-85" />
                <p className="font-serif text-base sm:text-lg text-[#F4EFE3]">
                  No visible ISS passes over the next 5 days for {observerCoords.label}.
                </p>
                <p className="font-sans text-xs text-[#8E9BB5] max-w-lg mx-auto leading-relaxed">
                  Passes are only listed when the International Space Station reaches a maximum elevation above 20° while sunlit by the Sun and the observer is in astronomical/nautical darkness (Sun elevation below -6°).
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {issEvents.map((evt) => {
                  const isAlerted = alertedEvents.includes(evt.id);
                  return (
                    <div
                      key={evt.id}
                      className="bg-[#0E1326] border border-[#151B38] hover:border-[#D4A84B] rounded-2xl p-5 transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-[#151B38] gap-2">
                        <div>
                          <div className="flex items-center space-x-2 text-[10px] font-mono text-[#D4A84B]">
                            <span className="uppercase font-bold tracking-widest">
                              {evt.category}
                            </span>
                            <span>·</span>
                            <span className="font-kanji">{evt.japanese}</span>
                          </div>
                          <h4 className="font-serif text-lg sm:text-xl font-bold text-[#F4EFE3]">
                            {evt.title}
                          </h4>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Link
                            to={`/stargazer?lat=${observerCoords.lat}&lng=${observerCoords.lon}&date=${encodeURIComponent(evt.isoDate)}&event=${encodeURIComponent(evt.title)}&label=${encodeURIComponent(observerCoords.label)}`}
                            onClick={() => playSuzuChime()}
                            className="px-3 py-1.5 rounded-full bg-[#D4A84B]/15 hover:bg-[#D4A84B] border border-[#D4A84B]/60 text-[#D4A84B] hover:text-[#0A0A0F] font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>View in sky</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleMarkObserved(evt)}
                            className={`px-3 py-1.5 rounded-full font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer ${
                              observedEvents.includes(evt.id)
                                ? 'bg-[#D4A84B]/20 border border-[#D4A84B] text-[#D4A84B]'
                                : 'bg-[#0A0A0F] border border-[#151B38] text-[#8E9BB5] hover:border-[#D4A84B] hover:text-[#D4A84B]'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>
                              {observedEvents.includes(evt.id)
                                ? 'OBSERVED ✓'
                                : 'MARK OBSERVED (+150)'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleAlert(evt)}
                            className={`px-3.5 py-1.5 rounded-full font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center space-x-1.5 cursor-pointer ${
                              isAlerted
                                ? 'bg-[#B3202A] text-[#F4EFE3] glow-crimson'
                                : 'bg-[#151B38] border border-[#D4A84B]/40 text-[#D4A84B] hover:bg-[#D4A84B] hover:text-[#0A0A0F]'
                            }`}
                          >
                            {isAlerted ? (
                              <>
                                <BellRing className="w-3.5 h-3.5" />
                                <span>ALERT SET 🔔</span>
                              </>
                            ) : (
                              <>
                                <Bell className="w-3.5 h-3.5" />
                                <span>SET ALERT (+75) 🔔</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="font-sans text-xs sm:text-sm text-[#F4EFE3]/80 leading-relaxed">
                        {evt.description}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38] font-mono text-xs tabular-nums">
                        <div>
                          <span className="text-[10px] text-[#8E9BB5] block">
                            Date & Peak Window
                          </span>
                          <span className="text-[#D4A84B] font-bold">{evt.dateTime}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#8E9BB5] block">
                            Quadrant / Trajectory
                          </span>
                          <span className="text-[#F4EFE3] font-semibold">
                            {evt.constellation}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#8E9BB5] block">
                            Visibility & Telemetry
                          </span>
                          <span className="text-[#8E9BB5] text-[11px] block">
                            {evt.visibilityNote}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TLE Orbit Data Age & Stale Status Bar */}
            {issOrbitMeta && !issPassesUnavailable && (
              <div className="p-3.5 rounded-xl bg-[#0E1326] border border-[#151B38] font-mono text-xs text-[#8E9BB5] flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span>Orbit data updated {issOrbitMeta.tleAgeHours} hours ago</span>
                {issOrbitMeta.stale && (
                  <span className="text-[#D4A84B] font-bold">
                    Using older orbit data, times may be off by a few minutes
                  </span>
                )}
              </div>
            )}
          </div>
        </ScrollPanel>
      </div>
    </section>
  );
};
