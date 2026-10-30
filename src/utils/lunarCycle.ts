/**
 * Lunar Cycle, Real-Time Moon Phase API Client, and Precision Ephemeris Calculator
 * Integrates `/api/moon-phase` (US Naval Observatory Astronomical Applications API + SunCalc)
 * with Japanese celestial lore, real-time Full Moon countdown, and dynamic SVG path generation.
 */

import * as SunCalc from 'suncalc';

export interface UpcomingPrimaryPhase {
  phase: string;
  dateStr: string;
  timeStr: string;
  isoUtc: string;
}

export interface MoonPhaseApiResponse {
  timestamp: string;
  source: string;
  usnoVerified: boolean;
  phaseFraction: number;
  illuminationFraction: number;
  illuminationPercent: number;
  illuminationExact: number;
  brightLimbAngleDeg: number;
  isWaxing: boolean;
  distanceKm: number;
  altitudeDeg: number;
  azimuthDeg: number;
  compassDirection: string;
  parallacticAngleDeg: number;
  moonriseIso: string | null;
  moonsetIso: string | null;
  transitIso: string | null;
  usnoCurPhase: string | null;
  usnoFracIllum: string | null;
  usnoMoonrise: string | null;
  usnoMoonset: string | null;
  usnoUpperTransit: string | null;
  closestPhase: { phase: string; date: string; time: string } | null;
  upcomingPhases: UpcomingPrimaryPhase[];
  location: {
    lat: number;
    lon: number;
    label: string;
  };
}

export interface LunarPhaseInfo {
  phaseFraction: number; // 0.0 to 1.0 (0 = new moon, 0.5 = full moon)
  lunarAgeDays: number; // 0.0 to 29.53
  illuminationPercent: number; // 0 to 100
  illuminationExact: number; // 0.0 to 100.0
  phaseKey:
    | 'new-moon'
    | 'waxing-crescent'
    | 'first-quarter'
    | 'waxing-gibbous'
    | 'full-moon'
    | 'waning-gibbous'
    | 'last-quarter'
    | 'waning-crescent';
  englishName: string;
  japaneseName: string;
  kanji: string;
  romaji: string;
  poeticMeaning: string;
  samuraiLore: string;
  daysUntilNextFull: number;
  daysUntilNextNew: number;
  nextFullMoonDate: Date;
  fullMoonCountdown: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  isWaxing: boolean;
  // Real-time Astronomical Telemetry
  distanceKm: number;
  altitudeDeg: number;
  azimuthDeg: number;
  compassDirection: string;
  parallacticAngleDeg: number;
  brightLimbAngleDeg: number;
  moonriseFormatted: string;
  moonsetFormatted: string;
  transitFormatted: string;
  isAboveHorizon: boolean;
  apiSource: string;
  usnoVerified: boolean;
  upcomingPhases: UpcomingPrimaryPhase[];
  locationLabel: string;
  svgTerminatorPath: (cx: number, cy: number, r: number) => string;
}

// Synodic month length in days
const SYNODIC_DAYS = 29.530588853;

// Default Observatory Coordinates: Chandigarh, India (Asia/Kolkata)
export const DEFAULT_OBSERVATORY_COORDS = {
  lat: 30.7333,
  lon: 76.7794,
  label: 'Chandigarh Observatory (30.73°N, 76.78°E)',
};

function degreesToCompass(azDeg: number): string {
  const normalized = ((azDeg % 360) + 360) % 360;
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return dirs[Math.round(normalized / 22.5) % 16];
}

function formatClockTime(isoOrDate?: string | Date | null, fallbackStr?: string | null): string {
  if (isoOrDate) {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
  if (fallbackStr) return fallbackStr;
  return '--:--';
}

/**
 * Fetches live astronomical moon phase & telemetry data from the backend `/api/moon-phase` endpoint
 * (which integrates US Naval Observatory API + SunCalc orbital calculations).
 */
export async function fetchMoonPhaseApiData(
  lat: number = DEFAULT_OBSERVATORY_COORDS.lat,
  lon: number = DEFAULT_OBSERVATORY_COORDS.lon,
  date?: Date,
  label?: string
): Promise<MoonPhaseApiResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  if (date) {
    params.set('date', date.toISOString());
  }
  if (label) {
    params.set('label', label);
  }

  const response = await fetch(`/api/moon-phase?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Moon Phase API returned ${response.status}`);
  }
  return (await response.json()) as MoonPhaseApiResponse;
}

/**
 * Calculates current lunar phase and astronomical metrics for any given Date,
 * using SunCalc precision orbital mechanics and optional live USNO API telemetry override.
 */
export function getLunarPhase(
  date: Date = new Date(),
  lat: number = DEFAULT_OBSERVATORY_COORDS.lat,
  lon: number = DEFAULT_OBSERVATORY_COORDS.lon,
  apiOverride?: MoonPhaseApiResponse | null
): LunarPhaseInfo {
  const timeMs = date.getTime();

  // Compute exact orbital state via SunCalc
  const illum = SunCalc.getMoonIllumination(date);
  const pos = SunCalc.getMoonPosition(date, lat, lon);
  const times = SunCalc.getMoonTimes(date, lat, lon);

  const phaseFraction = illum.phase; // 0.0 (New) -> 0.5 (Full) -> 1.0 (New)
  const lunarAgeDays = Number((phaseFraction * SYNODIC_DAYS).toFixed(1));
  const illuminationExact = Number((illum.fraction * 100).toFixed(1));
  const illuminationPercent = Math.round(illum.fraction * 100);
  const isWaxing = phaseFraction < 0.5;

  // Calculate days to next full moon (at fraction 0.5) and next new moon (at fraction 1.0)
  let daysToFull = (0.5 - phaseFraction) * SYNODIC_DAYS;
  if (daysToFull < 0) daysToFull += SYNODIC_DAYS;

  let daysToNew = (1.0 - phaseFraction) * SYNODIC_DAYS;
  if (daysToNew <= 0) daysToNew += SYNODIC_DAYS;

  let msToNextFull = daysToFull * 24 * 60 * 60 * 1000;
  let nextFullMoonDate = new Date(timeMs + msToNextFull);

  // If USNO API returned upcoming primary phases, refine nextFullMoonDate to the exact USNO timestamp
  if (apiOverride?.upcomingPhases && apiOverride.upcomingPhases.length > 0) {
    const usnoFull = apiOverride.upcomingPhases.find(
      (p) => p.phase.toLowerCase().includes('full') && Date.parse(p.isoUtc) > timeMs
    );
    if (usnoFull) {
      const exactFullMs = Date.parse(usnoFull.isoUtc);
      if (!isNaN(exactFullMs) && exactFullMs > timeMs) {
        nextFullMoonDate = new Date(exactFullMs);
        msToNextFull = exactFullMs - timeMs;
        daysToFull = msToNextFull / (24 * 60 * 60 * 1000);
      }
    }
  }

  const totalSec = Math.max(0, Math.floor(msToNextFull / 1000));
  const cdDays = Math.floor(totalSec / 86400);
  const cdHours = Math.floor((totalSec % 86400) / 3600);
  const cdMinutes = Math.floor((totalSec % 3600) / 60);
  const cdSeconds = totalSec % 60;

  // Classify phase based on cycle fraction
  let phaseKey: LunarPhaseInfo['phaseKey'] = 'new-moon';
  let englishName = 'New Moon';
  let japaneseName = '新月';
  let kanji = '朔';
  let romaji = 'Shingetsu';
  let poeticMeaning = 'The Void Threshold & Silent Renewal';
  let samuraiLore =
    'When the night has no moon, stealth is supreme. Warriors train inner sight beneath the blackened sky.';

  if (phaseFraction >= 0.03 && phaseFraction < 0.22) {
    phaseKey = 'waxing-crescent';
    englishName = 'Waxing Crescent';
    japaneseName = '三日月';
    kanji = '繊月';
    romaji = 'Mikazuki';
    poeticMeaning = 'Blade of Silver Awakening';
    samuraiLore =
      'Curved like the edge of a curved katana blade. A sacred omen of sharpening instincts and emerging clarity.';
  } else if (phaseFraction >= 0.22 && phaseFraction < 0.28) {
    phaseKey = 'first-quarter';
    englishName = 'First Quarter';
    japaneseName = '上弦の月';
    kanji = '上弦';
    romaji = 'Jōgen no Tsuki';
    poeticMeaning = 'The Drawn Bow of the Archer';
    samuraiLore =
      'Half-shadow, half-light. The celestial bow is drawn tight, aligning discipline with quiet resolve.';
  } else if (phaseFraction >= 0.28 && phaseFraction < 0.47) {
    phaseKey = 'waxing-gibbous';
    englishName = 'Waxing Gibbous';
    japaneseName = '十三夜';
    kanji = '待宵';
    romaji = "Jūsan'ya";
    poeticMeaning = 'The Moon of Anticipation';
    samuraiLore =
      'Celebrated across Japanese heritage as the night of purest autumn brilliance, unmatched in celestial elegance.';
  } else if (phaseFraction >= 0.47 && phaseFraction < 0.53) {
    phaseKey = 'full-moon';
    englishName = 'Full Moon';
    japaneseName = '満月';
    kanji = '望月';
    romaji = 'Mangetsu';
    poeticMeaning = 'Radiant Zenith of Tsukuyomi';
    samuraiLore =
      'The heavens cast no secrets. Torii gates reflect the silver zenith, sanctifying night vigils and tea ceremonies.';
  } else if (phaseFraction >= 0.53 && phaseFraction < 0.72) {
    phaseKey = 'waning-gibbous';
    englishName = 'Waning Gibbous';
    japaneseName = '十六夜';
    kanji = '寝待';
    romaji = 'Izayoi';
    poeticMeaning = 'The Moon of Lingering Light';
    samuraiLore =
      'Rising moments later each night, teaching patience and vigilance as the world gently turns toward autumn shadow.';
  } else if (phaseFraction >= 0.72 && phaseFraction < 0.78) {
    phaseKey = 'last-quarter';
    englishName = 'Third Quarter';
    japaneseName = '下弦の月';
    kanji = '下弦';
    romaji = 'Kagen no Tsuki';
    poeticMeaning = 'The Midnight Blade of Reflection';
    samuraiLore =
      'Visible in the deep hours before dawn. A silent mentor for early-morning kata and meditative focus.';
  } else if (phaseFraction >= 0.78 && phaseFraction < 0.97) {
    phaseKey = 'waning-crescent';
    englishName = 'Waning Crescent';
    japaneseName = '有明の月';
    kanji = '有明';
    romaji = 'Ariake no Tsuki';
    poeticMeaning = 'Dawn Companion & Morning Mist';
    samuraiLore =
      "Lingerer of dawn. As the temple bells toll for morning light, the faint crescent reminds us of life's fleeting beauty.";
  }

  // Generates SVG path for the illuminated region
  const svgTerminatorPath = (cx: number, cy: number, r: number): string => {
    if (illuminationPercent <= 1) {
      return '';
    }
    if (illuminationPercent >= 99) {
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    }

    const x = Math.cos(2 * Math.PI * phaseFraction);
    const rx = Math.max(0.1, Math.abs(x) * r);
    const top = `${cx} ${cy - r}`;
    const bottom = `${cx} ${cy + r}`;

    if (isWaxing) {
      const outerLimb = `M ${top} A ${r} ${r} 0 0 1 ${bottom}`;
      if (x > 0) {
        return `${outerLimb} A ${rx} ${r} 0 0 0 ${top} Z`;
      } else {
        return `${outerLimb} A ${rx} ${r} 0 0 1 ${top} Z`;
      }
    } else {
      const outerLimb = `M ${top} A ${r} ${r} 0 0 0 ${bottom}`;
      if (x < 0) {
        return `${outerLimb} A ${rx} ${r} 0 0 0 ${top} Z`;
      } else {
        return `${outerLimb} A ${rx} ${r} 0 0 1 ${top} Z`;
      }
    }
  };

  const azimuthNorm = ((pos.azimuth % 360) + 360) % 360;
  const altitudeDeg = Number(pos.altitude.toFixed(1));
  const azimuthDeg = Number(azimuthNorm.toFixed(1));
  const distanceKm = Math.round(pos.distance);

  return {
    phaseFraction,
    lunarAgeDays,
    illuminationPercent,
    illuminationExact,
    phaseKey,
    englishName,
    japaneseName,
    kanji,
    romaji,
    poeticMeaning,
    samuraiLore,
    daysUntilNextFull: Number(daysToFull.toFixed(1)),
    daysUntilNextNew: Number(daysToNew.toFixed(1)),
    nextFullMoonDate,
    fullMoonCountdown: {
      days: cdDays,
      hours: cdHours,
      minutes: cdMinutes,
      seconds: cdSeconds,
    },
    isWaxing,
    distanceKm,
    altitudeDeg,
    azimuthDeg,
    compassDirection: degreesToCompass(azimuthNorm),
    parallacticAngleDeg: Number(pos.parallacticAngle.toFixed(1)),
    brightLimbAngleDeg: Number(illum.angle.toFixed(1)),
    moonriseFormatted: formatClockTime(times.rise, apiOverride?.usnoMoonrise),
    moonsetFormatted: formatClockTime(times.set, apiOverride?.usnoMoonset),
    transitFormatted: formatClockTime(times.transit, apiOverride?.usnoUpperTransit),
    isAboveHorizon: altitudeDeg >= 0,
    apiSource:
      apiOverride?.source || 'SunCalc Precision Orbital Ephemeris',
    usnoVerified: Boolean(apiOverride?.usnoVerified),
    upcomingPhases: apiOverride?.upcomingPhases || [],
    locationLabel:
      apiOverride?.location?.label || DEFAULT_OBSERVATORY_COORDS.label,
    svgTerminatorPath,
  };
}
