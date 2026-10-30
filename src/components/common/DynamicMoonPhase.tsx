import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLunarPhase,
  fetchMoonPhaseApiData,
  LunarPhaseInfo,
  MoonPhaseApiResponse,
  DEFAULT_OBSERVATORY_COORDS,
} from '../../utils/lunarCycle';
import {
  Sparkles,
  Clock,
  RotateCcw,
  RefreshCw,
  Compass,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Radio,
} from 'lucide-react';
import { playSuzuChime } from '../../utils/soundEngine';

interface DynamicMoonPhaseProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showDetailsPopover?: boolean;
  compactMobile?: boolean;
}

export const DynamicMoonPhase: React.FC<DynamicMoonPhaseProps> = ({
  className = '',
  size = 'sm',
  showDetailsPopover = true,
  compactMobile = false,
}) => {
  const [isSimulatingOffset, setIsSimulatingOffset] = useState<boolean>(false);
  const [offsetDays, setOffsetDays] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Live Moon Phase API State
  const [apiData, setApiData] = useState<MoonPhaseApiResponse | null>(null);
  const [isSyncingApi, setIsSyncingApi] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [observerCoords, setObserverCoords] = useState<{
    lat: number;
    lon: number;
    label: string;
    isCustomGps: boolean;
  }>({
    lat: DEFAULT_OBSERVATORY_COORDS.lat,
    lon: DEFAULT_OBSERVATORY_COORDS.lon,
    label: DEFAULT_OBSERVATORY_COORDS.label,
    isCustomGps: false,
  });
  const [locatingGps, setLocatingGps] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const syncLunarApi = useCallback(
    async (lat: number, lon: number, label: string, targetDate?: Date) => {
      setIsSyncingApi(true);
      try {
        const result = await fetchMoonPhaseApiData(lat, lon, targetDate, label);
        setApiData(result);
        setLastSyncTime(new Date());
      } catch (_err) {
        // Keep fallback SunCalc ephemeris active if network request fails
      } finally {
        setIsSyncingApi(false);
      }
    },
    []
  );

  // Initial API fetch & 60-second live refresh
  useEffect(() => {
    const targetDate = isSimulatingOffset
      ? new Date(Date.now() + offsetDays * 86400000)
      : undefined;
    syncLunarApi(observerCoords.lat, observerCoords.lon, observerCoords.label, targetDate);

    if (!isSimulatingOffset) {
      const apiTimer = setInterval(() => {
        syncLunarApi(observerCoords.lat, observerCoords.lon, observerCoords.label);
      }, 60000);
      return () => clearInterval(apiTimer);
    }
  }, [
    observerCoords.lat,
    observerCoords.lon,
    observerCoords.label,
    isSimulatingOffset,
    offsetDays,
    syncLunarApi,
  ]);

  // Real-time 1-second ticker so Moon Phase & Full Moon countdown update live
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveDate = new Date(nowMs + offsetDays * 86400000);
  const phaseInfo: LunarPhaseInfo = getLunarPhase(
    effectiveDate,
    observerCoords.lat,
    observerCoords.lon,
    apiData
  );

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSetDayOffset = (daysDelta: number) => {
    playSuzuChime();
    setIsSimulatingOffset(true);
    setOffsetDays(Number(daysDelta.toFixed(1)));
  };

  const resetToLiveRealTime = () => {
    playSuzuChime();
    setIsSimulatingOffset(false);
    setOffsetDays(0);
    setNowMs(Date.now());
    syncLunarApi(observerCoords.lat, observerCoords.lon, observerCoords.label);
  };

  const handleManualApiRefresh = () => {
    playSuzuChime();
    const targetDate = isSimulatingOffset
      ? new Date(Date.now() + offsetDays * 86400000)
      : undefined;
    syncLunarApi(observerCoords.lat, observerCoords.lon, observerCoords.label, targetDate);
  };

  const [gpsFallbackNotice, setGpsFallbackNotice] = useState<string | null>(null);

  const handleToggleObserverGps = () => {
    playSuzuChime();
    if (observerCoords.isCustomGps) {
      setObserverCoords({
        lat: DEFAULT_OBSERVATORY_COORDS.lat,
        lon: DEFAULT_OBSERVATORY_COORDS.lon,
        label: DEFAULT_OBSERVATORY_COORDS.label,
        isCustomGps: false,
      });
      setGpsFallbackNotice(null);
      return;
    }

    if (!navigator.geolocation) {
      setObserverCoords({
        lat: DEFAULT_OBSERVATORY_COORDS.lat,
        lon: DEFAULT_OBSERVATORY_COORDS.lon,
        label: DEFAULT_OBSERVATORY_COORDS.label,
        isCustomGps: false,
      });
      setGpsFallbackNotice('Using Chandigarh. Allow location or search a city.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const ns = lat >= 0 ? 'N' : 'S';
        const ew = lon >= 0 ? 'E' : 'W';
        setObserverCoords({
          lat,
          lon,
          label: `Observer GPS (${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew})`,
          isCustomGps: true,
        });
        setGpsFallbackNotice(null);
        setLocatingGps(false);
      },
      () => {
        setObserverCoords({
          lat: DEFAULT_OBSERVATORY_COORDS.lat,
          lon: DEFAULT_OBSERVATORY_COORDS.lon,
          label: DEFAULT_OBSERVATORY_COORDS.label,
          isCustomGps: false,
        });
        setGpsFallbackNotice('Using Chandigarh. Allow location or search a city.');
        setLocatingGps(false);
      },
      { timeout: 6000 }
    );
  };

  const dim = size === 'sm' ? 22 : size === 'md' ? 28 : 40;
  const radius = dim / 2 - 2;
  const cx = dim / 2;
  const cy = dim / 2;

  const litPath = phaseInfo.svgTerminatorPath(cx, cy, radius);

  const fullMoonBadgeLabel =
    phaseInfo.phaseKey === 'full-moon' || phaseInfo.daysUntilNextFull < 0.2
      ? 'Full Moon Tonight'
      : `${phaseInfo.daysUntilNextFull}d to Full Moon`;

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Navbar Real-Time Moon Phase Tracker Badge */}
      <button
        type="button"
        onClick={() => {
          if (showDetailsPopover) setPopoverOpen(!popoverOpen);
        }}
        className={`group flex items-center space-x-2 ${
          compactMobile ? 'px-2 py-1' : 'px-3 py-1.5'
        } rounded-full bg-[#0E1326] border transition-all duration-200 cursor-pointer ${
          popoverOpen
            ? 'border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.4)]'
            : 'border-[#D4A84B]/40 hover:border-[#D4A84B] hover:shadow-[0_0_10px_rgba(212,168,75,0.2)]'
        }`}
        aria-label={`Current Moon Phase: ${phaseInfo.englishName}, ${phaseInfo.illuminationExact}% illuminated, ${fullMoonBadgeLabel}`}
        title={`${phaseInfo.englishName} (${phaseInfo.japaneseName}) · ${phaseInfo.illuminationExact}% Illumination · ${phaseInfo.distanceKm.toLocaleString()} km · ${fullMoonBadgeLabel}`}
      >
        {/* Dynamic Real-Time SVG Moon Phase Icon */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg
            width={dim}
            height={dim}
            viewBox={`0 0 ${dim} ${dim}`}
            className="filter drop-shadow-[0_0_6px_rgba(244,239,227,0.5)] transition-transform duration-300 group-hover:scale-110"
          >
            <defs>
              <linearGradient id={`moonGlow-${dim}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFDF5" />
                <stop offset="70%" stopColor="#F4EFE3" />
                <stop offset="100%" stopColor="#D4A84B" />
              </linearGradient>

              <radialGradient id={`darkSide-${dim}`} cx="50%" cy="50%" r="50%">
                <stop offset="60%" stopColor="#0B0E1B" />
                <stop offset="100%" stopColor="#05070E" />
              </radialGradient>

              <clipPath id={`moonClip-${dim}`}>
                <circle cx={cx} cy={cy} r={radius} />
              </clipPath>
            </defs>

            {/* Dark unlit lunar disc (base) */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={`url(#darkSide-${dim})`}
              stroke="#D4A84B"
              strokeWidth="0.85"
              strokeOpacity="0.55"
            />

            {/* Faint craters on dark side */}
            <g clipPath={`url(#moonClip-${dim})`} opacity="0.25">
              <circle cx={cx - radius * 0.3} cy={cy - radius * 0.2} r={radius * 0.25} fill="#182038" />
              <circle cx={cx + radius * 0.25} cy={cy + radius * 0.35} r={radius * 0.3} fill="#182038" />
              <circle cx={cx - radius * 0.15} cy={cy + radius * 0.4} r={radius * 0.18} fill="#182038" />
            </g>

            {/* Dynamic Illuminated Phase Path */}
            {litPath ? (
              <path
                d={litPath}
                fill={`url(#moonGlow-${dim})`}
                className="transition-all duration-300 ease-out"
              />
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={radius - 0.5}
                fill="none"
                stroke="#D4A84B"
                strokeWidth="0.75"
                strokeDasharray="2 2"
                opacity="0.6"
              />
            )}

            {/* Craters over lit side */}
            {litPath && (
              <g clipPath={`url(#moonClip-${dim})`} opacity="0.16">
                <circle cx={cx - radius * 0.25} cy={cy - radius * 0.2} r={radius * 0.22} fill="#7A6840" />
                <circle cx={cx + radius * 0.3} cy={cy + radius * 0.3} r={radius * 0.25} fill="#7A6840" />
                <circle cx={cx} cy={cy + radius * 0.15} r={radius * 0.18} fill="#7A6840" />
              </g>
            )}

            {/* Rim highlight */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="#F4EFE3"
              strokeWidth="0.5"
              strokeOpacity="0.35"
            />
          </svg>

          {/* Live API Telemetry Status Dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0A0A0F] ${
              isSimulatingOffset
                ? 'bg-amber-400'
                : apiData
                  ? 'bg-emerald-400'
                  : 'bg-[#D4A84B]'
            }`}
          />
        </div>

        {/* Phase Name, Illumination %, & Days Until Next Full Moon Readout */}
        {compactMobile ? (
          <div className="flex items-center space-x-1 text-[10px] font-mono tabular-nums whitespace-nowrap">
            <span className="text-[#F4EFE3] font-semibold">
              {phaseInfo.illuminationPercent}%
            </span>
            <span className="font-kanji text-[#D4A84B]">{phaseInfo.japaneseName}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-[11px] font-mono tabular-nums whitespace-nowrap">
            <span className="text-[#F4EFE3] font-semibold">
              {phaseInfo.englishName}
            </span>
            <span className="text-[#D4A84B] bg-[#151B38] px-1.5 py-0.2 rounded text-[10px] font-bold">
              {phaseInfo.illuminationExact}%
            </span>
            <span className="text-[#8E9BB5] hidden md:inline">·</span>
            <span className="text-[#D4A84B] font-bold hidden md:inline">
              {fullMoonBadgeLabel}
            </span>
            <span className="font-kanji text-[10px] text-[#D4A84B]/75 hidden xl:inline">
              ({phaseInfo.japaneseName})
            </span>
          </div>
        )}
      </button>

      {/* Interactive Lunar Ephemeris API & Real-Time Full Moon Countdown Popover */}
      {showDetailsPopover && popoverOpen && (
        <div className="absolute right-0 top-full mt-2.5 w-84 sm:w-96 bg-[#0B0F1F]/98 border border-[#D4A84B] rounded-2xl p-5 shadow-[0_0_40px_rgba(212,168,75,0.35)] backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 text-left space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[#18213D] pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="font-kanji text-xl text-[#D4A84B] font-bold">
                  {phaseInfo.japaneseName}
                </span>
                <span className="text-[10px] font-mono tracking-widest text-[#D4A84B] uppercase">
                  · {phaseInfo.romaji}
                </span>
              </div>
              <h4 className="font-serif text-lg font-bold text-[#F4EFE3]">
                {phaseInfo.englishName}
              </h4>
              <div className="flex items-center space-x-1.5 pt-0.5">
                <span
                  className={`text-[10px] font-mono flex items-center space-x-1 ${
                    isSimulatingOffset ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  <Radio className="w-3 h-3 animate-pulse" />
                  <span>
                    {isSimulatingOffset
                      ? `SIMULATED OFFSET (${offsetDays >= 0 ? '+' : ''}${offsetDays}d)`
                      : phaseInfo.usnoVerified
                        ? 'USNO + SUNCALC LIVE API'
                        : 'SUNCALC LIVE EPHEMERIS'}
                  </span>
                </span>
              </div>
            </div>

            {/* High-Res SVG Moon Disc + API Controls */}
            <div className="flex items-center space-x-2">
              <div className="flex flex-col space-y-1">
                <button
                  type="button"
                  onClick={handleManualApiRefresh}
                  className="p-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] transition-colors cursor-pointer"
                  title="Sync real-time Moon Phase API telemetry"
                  aria-label="Sync real-time Moon Phase API telemetry"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingApi ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleToggleObserverGps}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    observerCoords.isCustomGps
                      ? 'bg-[#D4A84B] text-[#0A0A0F]'
                      : 'bg-[#151B38] hover:bg-[#D4A84B] text-[#8E9BB5] hover:text-[#0A0A0F]'
                  }`}
                  title={
                    observerCoords.isCustomGps
                      ? 'Reset to Chandigarh Observatory coordinates'
                      : 'Use my GPS coordinates for local Moon altitude & rise/set times'
                  }
                  aria-label="Toggle Observer GPS Coordinates"
                >
                  <MapPin className={`w-3.5 h-3.5 ${locatingGps ? 'animate-bounce' : ''}`} />
                </button>
              </div>

              <div className="w-14 h-14 rounded-full border border-[#D4A84B]/40 bg-[#070913] flex items-center justify-center shadow-[0_0_20px_rgba(212,168,75,0.25)] p-1 shrink-0">
                <svg width="48" height="48" viewBox="0 0 48 48">
                  <defs>
                    <linearGradient id="popoverMoonGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFFDF5" />
                      <stop offset="60%" stopColor="#F4EFE3" />
                      <stop offset="100%" stopColor="#D4A84B" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="24"
                    cy="24"
                    r="21"
                    fill="#080B16"
                    stroke="#D4A84B"
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                  {phaseInfo.svgTerminatorPath(24, 24, 21) ? (
                    <path d={phaseInfo.svgTerminatorPath(24, 24, 21)} fill="url(#popoverMoonGlow)" />
                  ) : (
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="#D4A84B"
                      strokeDasharray="3 3"
                      opacity="0.6"
                    />
                  )}
                  <circle cx="20" cy="19" r="4" fill="#7A6840" opacity="0.14" />
                  <circle cx="29" cy="28" r="5" fill="#7A6840" opacity="0.14" />
                </svg>
              </div>
            </div>
          </div>

          {/* Observer Coordinates Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono bg-[#070A14] px-2.5 py-1.5 rounded-lg border border-[#18213D] text-[#8E9BB5]">
              <span className="flex items-center space-x-1 truncate">
                <Compass className="w-3 h-3 text-[#D4A84B] shrink-0" />
                <span className="truncate">{phaseInfo.locationLabel}</span>
              </span>
              {lastSyncTime && (
                <span className="text-[9px] text-[#D4A84B]/80 shrink-0 ml-2">
                  {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            {gpsFallbackNotice && (
              <div className="text-[10px] font-mono text-[#D4A84B] px-1">
                {gpsFallbackNotice}
              </div>
            )}
          </div>

          {/* Real-Time Topocentric & Orbital Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 font-mono">
            {/* Illumination & Lunar Age */}
            <div className="p-2.5 rounded-xl bg-[#070A14] border border-[#18213D] space-y-1">
              <div className="flex items-center justify-between text-[9px] text-[#8E9BB5] uppercase">
                <span>Illumination</span>
                <span className="text-[#D4A84B]">{phaseInfo.isWaxing ? 'WAXING' : 'WANING'}</span>
              </div>
              <div className="text-sm font-bold text-[#F4EFE3] tabular-nums">
                {phaseInfo.illuminationExact}%
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#141B33] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#D4A84B] to-[#FFFDF5]"
                  style={{ width: `${Math.max(3, phaseInfo.illuminationPercent)}%` }}
                />
              </div>
              <div className="text-[9px] text-[#8E9BB5] tabular-nums">
                Age: {phaseInfo.lunarAgeDays} / 29.5d
              </div>
            </div>

            {/* Orbital Distance & Limb Angle */}
            <div className="p-2.5 rounded-xl bg-[#070A14] border border-[#18213D] space-y-1">
              <div className="flex items-center justify-between text-[9px] text-[#8E9BB5] uppercase">
                <span>Lunar Distance</span>
                <span className="text-[#D4A84B]">ORBIT</span>
              </div>
              <div className="text-sm font-bold text-[#F4EFE3] tabular-nums">
                {phaseInfo.distanceKm.toLocaleString()} km
              </div>
              <div className="text-[9px] text-[#8E9BB5] tabular-nums">
                Limb Angle: {phaseInfo.brightLimbAngleDeg}°
              </div>
              <div className="text-[9px] text-[#8E9BB5] tabular-nums">
                Parallactic: {phaseInfo.parallacticAngleDeg}°
              </div>
            </div>

            {/* Topocentric Altitude & Azimuth */}
            <div className="p-2.5 rounded-xl bg-[#070A14] border border-[#18213D] space-y-1">
              <div className="flex items-center justify-between text-[9px] text-[#8E9BB5] uppercase">
                <span>Sky Position</span>
                <span
                  className={
                    phaseInfo.isAboveHorizon ? 'text-emerald-400 font-bold' : 'text-[#8E9BB5]'
                  }
                >
                  {phaseInfo.isAboveHorizon ? 'VISIBLE' : 'BELOW HORIZON'}
                </span>
              </div>
              <div className="text-xs font-bold text-[#F4EFE3] tabular-nums">
                {phaseInfo.altitudeDeg}° ALT · {phaseInfo.azimuthDeg}° {phaseInfo.compassDirection}
              </div>
              <div className="text-[9px] text-[#8E9BB5] tabular-nums">
                Meridian Transit: {phaseInfo.transitFormatted}
              </div>
            </div>

            {/* Moonrise & Moonset */}
            <div className="p-2.5 rounded-xl bg-[#070A14] border border-[#18213D] space-y-1">
              <div className="flex items-center justify-between text-[9px] text-[#8E9BB5] uppercase">
                <span>Horizon Ephemeris</span>
                <span className="text-[#D4A84B]">LOCAL</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-bold text-[#F4EFE3] tabular-nums">
                <span className="flex items-center space-x-0.5">
                  <ArrowUpRight className="w-3 h-3 text-[#D4A84B]" />
                  <span>{phaseInfo.moonriseFormatted}</span>
                </span>
                <span className="flex items-center space-x-0.5">
                  <ArrowDownRight className="w-3 h-3 text-[#8E9BB5]" />
                  <span>{phaseInfo.moonsetFormatted}</span>
                </span>
              </div>
              <div className="text-[9px] text-[#8E9BB5]">
                Rise & Set Times
              </div>
            </div>
          </div>

          {/* Live Countdown to Next Full Moon */}
          <div className="p-3 rounded-xl bg-[#070A14] border border-[#D4A84B]/40 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#D4A84B] font-bold">
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>COUNTDOWN TO NEXT FULL MOON · 望月</span>
              </span>
              <span className="tabular-nums">{phaseInfo.daysUntilNextFull} DAYS</span>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-center tabular-nums">
              <div className="bg-[#0E1326] border border-[#18213D] rounded-lg py-1.5">
                <span className="text-base font-bold text-[#F4EFE3] block">
                  {phaseInfo.fullMoonCountdown.days}
                </span>
                <span className="text-[9px] text-[#8E9BB5] uppercase">Days</span>
              </div>
              <div className="bg-[#0E1326] border border-[#18213D] rounded-lg py-1.5">
                <span className="text-base font-bold text-[#F4EFE3] block">
                  {String(phaseInfo.fullMoonCountdown.hours).padStart(2, '0')}
                </span>
                <span className="text-[9px] text-[#8E9BB5] uppercase">Hours</span>
              </div>
              <div className="bg-[#0E1326] border border-[#18213D] rounded-lg py-1.5">
                <span className="text-base font-bold text-[#F4EFE3] block">
                  {String(phaseInfo.fullMoonCountdown.minutes).padStart(2, '0')}
                </span>
                <span className="text-[9px] text-[#8E9BB5] uppercase">Mins</span>
              </div>
              <div className="bg-[#0E1326] border border-[#18213D] rounded-lg py-1.5">
                <span className="text-base font-bold text-[#D4A84B] block">
                  {String(phaseInfo.fullMoonCountdown.seconds).padStart(2, '0')}
                </span>
                <span className="text-[9px] text-[#8E9BB5] uppercase">Secs</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-[#8E9BB5] pt-0.5 tabular-nums">
              <span>
                Next Full Moon:{' '}
                <strong className="text-[#F4EFE3]">
                  {phaseInfo.nextFullMoonDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </strong>
              </span>
              <span>Next New Moon: {phaseInfo.daysUntilNextNew}d</span>
            </div>
          </div>

          {/* Upcoming USNO Primary Phases (when returned by API) */}
          {phaseInfo.upcomingPhases.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#8E9BB5] uppercase">
                <span>Upcoming Primary Phases (USNO Ephemeris)</span>
                <span className="text-[#D4A84B]">UTC</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                {phaseInfo.upcomingPhases.slice(0, 4).map((up, idx) => (
                  <div
                    key={`${up.phase}-${idx}`}
                    className="px-2 py-1 rounded bg-[#070A14] border border-[#18213D] flex items-center justify-between"
                  >
                    <span className="text-[#F4EFE3] font-semibold truncate">{up.phase}</span>
                    <span className="text-[#D4A84B] text-[9px] shrink-0 ml-1">{up.dateStr.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Samurai Celestial Lore */}
          <div className="p-3 rounded-xl bg-[#12182E]/80 border border-[#D4A84B]/30 space-y-1">
            <div className="flex items-center space-x-1 text-[11px] font-mono text-[#D4A84B] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>CELESTIAL WISDOM · 天文の教え</span>
            </div>
            <p className="text-xs text-[#F4EFE3]/90 italic font-serif leading-relaxed">
              "{phaseInfo.samuraiLore}"
            </p>
          </div>

          {/* Interactive Lunar Cycle Scrubber & Presets */}
          <div className="pt-2 border-t border-[#18213D] space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#8E9BB5]">
              <span>SYNODIC CYCLE EXPLORER</span>
              {isSimulatingOffset && (
                <button
                  type="button"
                  onClick={resetToLiveRealTime}
                  className="text-[#D4A84B] hover:text-[#F4EFE3] flex items-center space-x-1 cursor-pointer font-bold"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Return to Live API</span>
                </button>
              )}
            </div>

            <input
              type="range"
              min="-15"
              max="15"
              step="0.5"
              value={offsetDays}
              onChange={(e) => handleSetDayOffset(Number(e.target.value))}
              className="w-full accent-[#D4A84B] cursor-pointer h-1.5 bg-[#151B38] rounded-lg"
              aria-label="Simulate lunar cycle days offset"
            />

            <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => handleSetDayOffset(-phaseInfo.lunarAgeDays)}
                className="p-1.5 rounded bg-[#070A14] border border-[#18213D] hover:border-[#D4A84B] text-[#8E9BB5] hover:text-[#F4EFE3] transition-colors cursor-pointer"
              >
                🌑 New
              </button>
              <button
                type="button"
                onClick={() => handleSetDayOffset(7.4 - phaseInfo.lunarAgeDays)}
                className="p-1.5 rounded bg-[#070A14] border border-[#18213D] hover:border-[#D4A84B] text-[#8E9BB5] hover:text-[#F4EFE3] transition-colors cursor-pointer"
              >
                🌓 1st Qtr
              </button>
              <button
                type="button"
                onClick={() => handleSetDayOffset(14.77 - phaseInfo.lunarAgeDays)}
                className="p-1.5 rounded bg-[#070A14] border border-[#18213D] hover:border-[#D4A84B] text-[#8E9BB5] hover:text-[#F4EFE3] transition-colors cursor-pointer"
              >
                🌕 Full
              </button>
              <button
                type="button"
                onClick={() => handleSetDayOffset(22.15 - phaseInfo.lunarAgeDays)}
                className="p-1.5 rounded bg-[#070A14] border border-[#18213D] hover:border-[#D4A84B] text-[#8E9BB5] hover:text-[#F4EFE3] transition-colors cursor-pointer"
              >
                🌗 3rd Qtr
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
