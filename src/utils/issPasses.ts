import {
  twoline2satrec,
  degreesToRadians,
  radiansToDegrees,
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  jday,
  sunPos,
  shadowFraction,
  type GeodeticLocation,
} from 'satellite.js';
import * as SunCalc from 'suncalc';

export interface IssPassPrediction {
  riseTime: string;
  maxElevationTime: string;
  setTime: string;
  durationSeconds: number;
  maxElevation: number;
  riseCompass: string;
  setCompass: string;
  maxCompass: string;
  riseAzimuth: number;
  setAzimuth: number;
  maxAzimuth: number;
}

export interface ValidatedIssTle {
  line1: string;
  line2: string;
}

export function degreesToCompass(azDeg: number): string {
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

/**
 * Validate raw text or line pair for ISS (NORAD 25544):
 * Must have two lines where line 1 starts with "1 25544" and line 2 starts with "2 25544".
 */
export function validateAndExtractIssTleFromText(rawText: string): ValidatedIssTle | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const line1 = lines.find((l) => l.startsWith('1 25544'));
  const line2 = lines.find((l) => l.startsWith('2 25544'));

  if (!line1 || !line2) {
    return null;
  }

  return { line1, line2 };
}

export function validateIssTleLines(
  line1?: string | null,
  line2?: string | null
): ValidatedIssTle | null {
  if (typeof line1 !== 'string' || typeof line2 !== 'string') return null;
  const l1 = line1.trim();
  const l2 = line2.trim();
  if (!l1.startsWith('1 25544') || !l2.startsWith('2 25544')) {
    return null;
  }
  return { line1: l1, line2: l2 };
}

/**
 * Shared ISS 5-day visible pass computation using satellite.js and SunCalc.
 * Only keeps passes where:
 * - max elevation > 20 degrees
 * - station is sunlit while observer is in darkness (Sun elevation < -6 degrees)
 */
export function computeIssPasses(
  line1: string,
  line2: string,
  lat: number,
  lon: number,
  altMeters = 0,
  startMs = Date.now()
): IssPassPrediction[] {
  const satrec = twoline2satrec(line1, line2);

  const observerGd: GeodeticLocation = {
    latitude: degreesToRadians(lat),
    longitude: degreesToRadians(lon),
    height: (isNaN(altMeters) ? 0 : altMeters) / 1000, // km
  };

  const endMs = startMs + 5 * 24 * 60 * 60 * 1000; // Next 5 days
  const coarseStepMs = 15 * 1000; // 15-second scan step
  const fineStepMs = 2 * 1000; // 2-second refinement step inside a pass

  const passes: IssPassPrediction[] = [];

  let t = startMs;
  while (t <= endMs) {
    const date = new Date(t);
    const pv = propagate(satrec, date);
    if (!pv || !pv.position) {
      t += coarseStepMs;
      continue;
    }

    const gmst = gstime(date);
    const posEcf = eciToEcf(pv.position, gmst);
    const look = ecfToLookAngles(observerGd, posEcf);
    const elDeg = radiansToDegrees(look.elevation);

    if (elDeg > 0) {
      // Backtrack up to coarseStepMs to find accurate rise time at fineStepMs resolution
      const passStartSearch = Math.max(startMs, t - coarseStepMs);
      let riseTimeMs = t;
      let riseAzDeg = radiansToDegrees(look.azimuth);

      for (let rt = passStartSearch; rt <= t; rt += fineStepMs) {
        const rDate = new Date(rt);
        const rPv = propagate(satrec, rDate);
        if (!rPv || !rPv.position) continue;
        const rGmst = gstime(rDate);
        const rLook = ecfToLookAngles(
          observerGd,
          eciToEcf(rPv.position, rGmst)
        );
        const rEl = radiansToDegrees(rLook.elevation);
        if (rEl > 0) {
          riseTimeMs = rt;
          riseAzDeg = radiansToDegrees(rLook.azimuth);
          break;
        }
      }

      // Step forward at fineStepMs until the satellite sets below the horizon (el <= 0)
      let curMs = riseTimeMs;
      let setTimeMs = riseTimeMs;
      let setAzDeg = riseAzDeg;
      let maxElDeg = -90;
      let maxElTimeMs = riseTimeMs;
      let maxAzDeg = riseAzDeg;
      let hasSunlitDarkSample = false;

      while (curMs <= endMs + 20 * 60 * 1000) {
        const cDate = new Date(curMs);
        const cPv = propagate(satrec, cDate);
        if (!cPv || !cPv.position) {
          curMs += fineStepMs;
          continue;
        }
        const cGmst = gstime(cDate);
        const cLook = ecfToLookAngles(
          observerGd,
          eciToEcf(cPv.position, cGmst)
        );
        const cEl = radiansToDegrees(cLook.elevation);
        const cAz = radiansToDegrees(cLook.azimuth);

        if (cEl <= 0 && curMs > riseTimeMs) {
          setTimeMs = curMs;
          setAzDeg = cAz;
          break;
        }

        if (cEl > maxElDeg) {
          maxElDeg = cEl;
          maxElTimeMs = curMs;
          maxAzDeg = cAz;
        }

        setTimeMs = curMs;
        setAzDeg = cAz;
        curMs += fineStepMs;
      }

      // Filter 1: Max elevation must be above 20 degrees
      if (maxElDeg > 20) {
        // Filter 2: Station must be sunlit while observer is in darkness (sun elevation < -6 deg)
        const peakDate = new Date(maxElTimeMs);
        const peakPv = propagate(satrec, peakDate);
        if (peakPv && peakPv.position) {
          const jd = jday(peakDate);
          const sunEci = sunPos(jd);
          const shadowFrac = shadowFraction(sunEci.rsun, peakPv.position);
          const isStationSunlit = shadowFrac < 0.5;

          const observerSunPos = SunCalc.getPosition(peakDate, lat, lon);
          // SunCalc v2 returns altitude in degrees
          const isObserverDark = observerSunPos.altitude < -6;

          if (isStationSunlit && isObserverDark) {
            hasSunlitDarkSample = true;
          }
        }

        if (hasSunlitDarkSample) {
          const durationSeconds = Math.max(
            1,
            Math.round((setTimeMs - riseTimeMs) / 1000)
          );
          passes.push({
            riseTime: new Date(riseTimeMs).toISOString(),
            maxElevationTime: new Date(maxElTimeMs).toISOString(),
            setTime: new Date(setTimeMs).toISOString(),
            durationSeconds,
            maxElevation: Number(maxElDeg.toFixed(1)),
            riseCompass: degreesToCompass(riseAzDeg),
            setCompass: degreesToCompass(setAzDeg),
            maxCompass: degreesToCompass(maxAzDeg),
            riseAzimuth: Number(riseAzDeg.toFixed(1)),
            setAzimuth: Number(setAzDeg.toFixed(1)),
            maxAzimuth: Number(maxAzDeg.toFixed(1)),
          });
        }
      }

      // Advance time past this pass
      t = setTimeMs + coarseStepMs;
    } else {
      t += coarseStepMs;
    }
  }

  return passes;
}
