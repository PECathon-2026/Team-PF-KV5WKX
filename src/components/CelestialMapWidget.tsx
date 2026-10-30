import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import {
  Compass,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Eye,
  Grid,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from 'lucide-react';
import { playKotoNote, playSuzuChime } from '../utils/soundEngine';
import type { StargazingSpot } from './WatchtowerSection';

export interface StarNode {
  id: string;
  name: string;
  japaneseName: string;
  ra: number; // Right Ascension in degrees (0 to 360)
  dec: number; // Declination in degrees (-90 to +90)
  mag: number; // Apparent visual magnitude (-1.5 to 6.0)
  spectralColor: string;
  constellationId: string;
}

export interface ConstellationData {
  id: string;
  name: string;
  japanese: string;
  romaji: string;
  season: string;
  lore: string;
  stars: StarNode[];
  lines: [string, string][]; // Pairs of star IDs
}

export const CONSTELLATIONS: ConstellationData[] = [
  {
    id: 'orion',
    name: 'Orion',
    japanese: '鼓星 · オリオン座',
    romaji: 'Tsuzumi-boshi',
    season: 'Winter Zenith',
    lore: 'Known to medieval samurai as Tsuzumi-boshi (The Hand Drum). The three belt stars (Mitsuboshi) served as the primary celestial crest for warrior clans.',
    stars: [
      { id: 'betelgeuse', name: 'Betelgeuse (α Ori)', japaneseName: '平家星 (Heike-boshi)', ra: 88.79, dec: 7.41, mag: 0.42, spectralColor: '#FF7B54', constellationId: 'orion' },
      { id: 'rigel', name: 'Rigel (β Ori)', japaneseName: '源氏星 (Genji-boshi)', ra: 78.63, dec: -8.2, mag: 0.13, spectralColor: '#BAE6FD', constellationId: 'orion' },
      { id: 'bellatrix', name: 'Bellatrix (γ Ori)', japaneseName: 'Amazon Star', ra: 81.28, dec: 6.35, mag: 1.64, spectralColor: '#E0F2FE', constellationId: 'orion' },
      { id: 'mintaka', name: 'Mintaka (δ Ori)', japaneseName: '三つ星 · 右', ra: 83.0, dec: -0.3, mag: 2.23, spectralColor: '#F0F9FF', constellationId: 'orion' },
      { id: 'alnilam', name: 'Alnilam (ε Ori)', japaneseName: '三つ星 · 中', ra: 84.05, dec: -1.2, mag: 1.69, spectralColor: '#E0F2FE', constellationId: 'orion' },
      { id: 'alnitak', name: 'Alnitak (ζ Ori)', japaneseName: '三つ星 · 左', ra: 85.19, dec: -1.94, mag: 1.77, spectralColor: '#E0F2FE', constellationId: 'orion' },
      { id: 'saiph', name: 'Saiph (κ Ori)', japaneseName: 'Saiph', ra: 86.94, dec: -9.67, mag: 2.09, spectralColor: '#E0F2FE', constellationId: 'orion' },
    ],
    lines: [
      ['betelgeuse', 'bellatrix'],
      ['betelgeuse', 'alnitak'],
      ['bellatrix', 'mintaka'],
      ['mintaka', 'alnilam'],
      ['alnilam', 'alnitak'],
      ['alnitak', 'saiph'],
      ['mintaka', 'rigel'],
      ['saiph', 'rigel'],
    ],
  },
  {
    id: 'ursa_major',
    name: 'Ursa Major',
    japanese: '北斗七星 · おおぐま座',
    romaji: 'Hokuto Shichisei',
    season: 'Circumpolar North',
    lore: 'The Northern Seven Stars (Hokuto Shichisei) were venerated as the chariot of Myōken Bosatsu, the deity of the Pole Star who guards the destiny of warriors.',
    stars: [
      { id: 'dubhe', name: 'Dubhe (α UMa)', japaneseName: '貪狼星 (Tonrō)', ra: 165.93, dec: 61.75, mag: 1.79, spectralColor: '#FDE68A', constellationId: 'ursa_major' },
      { id: 'merak', name: 'Merak (β UMa)', japaneseName: '巨門星 (Kyomon)', ra: 165.46, dec: 56.38, mag: 2.37, spectralColor: '#F8FAFC', constellationId: 'ursa_major' },
      { id: 'phecda', name: 'Phecda (γ UMa)', japaneseName: '禄存星 (Rokuzon)', ra: 178.46, dec: 53.69, mag: 2.44, spectralColor: '#F8FAFC', constellationId: 'ursa_major' },
      { id: 'megrez', name: 'Megrez (δ UMa)', japaneseName: '文曲星 (Mongoku)', ra: 183.86, dec: 57.03, mag: 3.31, spectralColor: '#F8FAFC', constellationId: 'ursa_major' },
      { id: 'alioth', name: 'Alioth (ε UMa)', japaneseName: '廉貞星 (Rentei)', ra: 193.51, dec: 55.96, mag: 1.77, spectralColor: '#F8FAFC', constellationId: 'ursa_major' },
      { id: 'mizar', name: 'Mizar (ζ UMa)', japaneseName: '武曲星 (Bugoku)', ra: 200.98, dec: 54.93, mag: 2.23, spectralColor: '#F8FAFC', constellationId: 'ursa_major' },
      { id: 'alkaid', name: 'Alkaid (η UMa)', japaneseName: '破軍星 (Hagun-sei)', ra: 206.89, dec: 49.31, mag: 1.86, spectralColor: '#BAE6FD', constellationId: 'ursa_major' },
    ],
    lines: [
      ['dubhe', 'merak'],
      ['merak', 'phecda'],
      ['phecda', 'megrez'],
      ['megrez', 'dubhe'],
      ['megrez', 'alioth'],
      ['alioth', 'mizar'],
      ['mizar', 'alkaid'],
    ],
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    japanese: '錨星 · カシオペア座',
    romaji: 'Ikari-boshi',
    season: 'Circumpolar North',
    lore: 'Called Ikari-boshi (The Ship Anchor) by Japanese navigators, its five stars point unerringly toward Polaris across storm-tossed northern seas.',
    stars: [
      { id: 'schedar', name: 'Schedar (α Cas)', japaneseName: 'Schedar', ra: 10.13, dec: 56.54, mag: 2.24, spectralColor: '#FCD34D', constellationId: 'cassiopeia' },
      { id: 'caph', name: 'Caph (β Cas)', japaneseName: 'Caph', ra: 2.29, dec: 59.15, mag: 2.28, spectralColor: '#FEF08A', constellationId: 'cassiopeia' },
      { id: 'gamma_cas', name: 'Tsih (γ Cas)', japaneseName: '策星 (Saku-sei)', ra: 14.18, dec: 60.72, mag: 2.15, spectralColor: '#BAE6FD', constellationId: 'cassiopeia' },
      { id: 'ruchbah', name: 'Ruchbah (δ Cas)', japaneseName: 'Ruchbah', ra: 21.45, dec: 60.24, mag: 2.68, spectralColor: '#F8FAFC', constellationId: 'cassiopeia' },
      { id: 'segin', name: 'Segin (ε Cas)', japaneseName: 'Segin', ra: 28.6, dec: 63.67, mag: 3.35, spectralColor: '#BAE6FD', constellationId: 'cassiopeia' },
    ],
    lines: [
      ['caph', 'schedar'],
      ['schedar', 'gamma_cas'],
      ['gamma_cas', 'ruchbah'],
      ['ruchbah', 'segin'],
    ],
  },
  {
    id: 'cygnus',
    name: 'Cygnus',
    japanese: '北十字 · はくちょう座',
    romaji: 'Kita-Jūji',
    season: 'Summer / Autumn',
    lore: 'Soaring down the luminous rift of Amanogawa (The Heavenly River), Deneb marks the sacred magpie bridge crossed during the Tanabata celestial rite.',
    stars: [
      { id: 'deneb', name: 'Deneb (α Cyg)', japaneseName: '天津四 (Tenshin)', ra: 310.36, dec: 45.28, mag: 1.25, spectralColor: '#F0F9FF', constellationId: 'cygnus' },
      { id: 'sadr', name: 'Sadr (γ Cyg)', japaneseName: 'Sadr', ra: 305.56, dec: 40.26, mag: 2.23, spectralColor: '#FEF9C3', constellationId: 'cygnus' },
      { id: 'albireo', name: 'Albireo (β Cyg)', japaneseName: '嘴星 (Kuchibashi)', ra: 292.68, dec: 27.96, mag: 3.05, spectralColor: '#FDE047', constellationId: 'cygnus' },
      { id: 'gienah', name: 'Gienah (ε Cyg)', japaneseName: 'Gienah', ra: 311.55, dec: 33.97, mag: 2.48, spectralColor: '#FCD34D', constellationId: 'cygnus' },
      { id: 'delta_cyg', name: 'Fawaris (δ Cyg)', japaneseName: 'Fawaris', ra: 296.24, dec: 45.13, mag: 2.87, spectralColor: '#E0F2FE', constellationId: 'cygnus' },
    ],
    lines: [
      ['deneb', 'sadr'],
      ['sadr', 'albireo'],
      ['gienah', 'sadr'],
      ['sadr', 'delta_cyg'],
    ],
  },
  {
    id: 'taurus',
    name: 'Taurus & Subaru',
    japanese: '昴 · おうし座',
    romaji: 'Subaru &毕宿',
    season: 'Autumn / Winter',
    lore: 'Home to Subaru (The Pleiades), celebrated in Makura no Sōshi (The Pillow Book) as the most exquisite jewel cluster of the Japanese night sky.',
    stars: [
      { id: 'aldebaran', name: 'Aldebaran (α Tau)', japaneseName: 'あかぼし (Aka-boshi)', ra: 68.98, dec: 16.51, mag: 0.86, spectralColor: '#FB923C', constellationId: 'taurus' },
      { id: 'elnath', name: 'Elnath (β Tau)', japaneseName: '五車五 (Gosha)', ra: 81.57, dec: 28.61, mag: 1.65, spectralColor: '#BAE6FD', constellationId: 'taurus' },
      { id: 'alcyone', name: 'Subaru / Pleiades (η Tau)', japaneseName: '昴 (Subaru)', ra: 56.87, dec: 24.11, mag: 1.6, spectralColor: '#7DD3FC', constellationId: 'taurus' },
      { id: 'tianguan', name: 'Tianguan (ζ Tau)', japaneseName: '天関 (Tenkan)', ra: 84.41, dec: 21.14, mag: 3.01, spectralColor: '#BAE6FD', constellationId: 'taurus' },
      { id: 'ain', name: 'Ain (ε Tau)', japaneseName: 'Ain', ra: 67.15, dec: 19.18, mag: 3.53, spectralColor: '#FCD34D', constellationId: 'taurus' },
    ],
    lines: [
      ['alcyone', 'ain'],
      ['ain', 'aldebaran'],
      ['ain', 'elnath'],
      ['aldebaran', 'tianguan'],
    ],
  },
  {
    id: 'lyra_aquila',
    name: 'Vega & Altair',
    japanese: '織姫・彦星 (七夕)',
    romaji: 'Orihime & Hikoboshi',
    season: 'Summer / Autumn',
    lore: 'The celestial lovers Orihime (Vega) and Hikoboshi (Altair), separated by the Milky Way and united once a year on the seventh night of the seventh moon.',
    stars: [
      { id: 'vega', name: 'Vega (α Lyr)', japaneseName: '織姫星 (Orihime)', ra: 279.23, dec: 38.78, mag: 0.03, spectralColor: '#E0F2FE', constellationId: 'lyra_aquila' },
      { id: 'sheliak', name: 'Sheliak (β Lyr)', japaneseName: 'Sheliak', ra: 282.52, dec: 33.36, mag: 3.52, spectralColor: '#F0F9FF', constellationId: 'lyra_aquila' },
      { id: 'sulafat', name: 'Sulafat (γ Lyr)', japaneseName: 'Sulafat', ra: 284.74, dec: 32.69, mag: 3.25, spectralColor: '#BAE6FD', constellationId: 'lyra_aquila' },
      { id: 'altair', name: 'Altair (α Aql)', japaneseName: '彦星 (Hikoboshi)', ra: 297.7, dec: 8.87, mag: 0.76, spectralColor: '#F8FAFC', constellationId: 'lyra_aquila' },
      { id: 'tarazed', name: 'Tarazed (γ Aql)', japaneseName: 'Tarazed', ra: 296.56, dec: 10.61, mag: 2.72, spectralColor: '#FBBF24', constellationId: 'lyra_aquila' },
      { id: 'alshain', name: 'Alshain (β Aql)', japaneseName: 'Alshain', ra: 298.83, dec: 6.41, mag: 3.71, spectralColor: '#FEF08A', constellationId: 'lyra_aquila' },
    ],
    lines: [
      ['vega', 'sheliak'],
      ['sheliak', 'sulafat'],
      ['sulafat', 'vega'],
      ['tarazed', 'altair'],
      ['altair', 'alshain'],
    ],
  },
  {
    id: 'scorpius',
    name: 'Scorpius',
    japanese: '魚釣星 · さそり座',
    romaji: 'Uotsuri-boshi',
    season: 'Summer Southern Sky',
    lore: 'Antares, the blazing crimson heart of the Scorpion, was known in old Japan as Aka-boshi (The Red Star) and Kataki-boshi, guardian of the southern horizon.',
    stars: [
      { id: 'antares', name: 'Antares (α Sco)', japaneseName: '大火 / 赤星 (Aka-boshi)', ra: 247.35, dec: -26.43, mag: 1.06, spectralColor: '#EF4444', constellationId: 'scorpius' },
      { id: 'dschubba', name: 'Dschubba (δ Sco)', japaneseName: '房宿 (Bōshuku)', ra: 240.08, dec: -22.62, mag: 2.31, spectralColor: '#BAE6FD', constellationId: 'scorpius' },
      { id: 'graffias', name: 'Acrab (β Sco)', japaneseName: 'Acrab', ra: 241.36, dec: -19.81, mag: 2.62, spectralColor: '#BAE6FD', constellationId: 'scorpius' },
      { id: 'sargas', name: 'Sargas (θ Sco)', japaneseName: 'Sargas', ra: 264.33, dec: -42.99, mag: 1.87, spectralColor: '#FEF08A', constellationId: 'scorpius' },
      { id: 'shaula', name: 'Shaula (λ Sco)', japaneseName: '尾宿 (Bishuku)', ra: 263.4, dec: -37.1, mag: 1.62, spectralColor: '#BAE6FD', constellationId: 'scorpius' },
    ],
    lines: [
      ['graffias', 'dschubba'],
      ['dschubba', 'antares'],
      ['antares', 'sargas'],
      ['sargas', 'shaula'],
    ],
  },
  {
    id: 'pegasus',
    name: 'Pegasus',
    japanese: '枡星 · ペガサス座',
    romaji: 'Masu-boshi',
    season: 'Autumn Zenith',
    lore: 'The Great Square of Pegasus was called Masu-boshi (The Sake Measuring Box) by Edo-period stargazers, presiding over the clear autumn harvest skies.',
    stars: [
      { id: 'markab', name: 'Markab (α Peg)', japaneseName: '室宿一 (Shisshuku)', ra: 346.19, dec: 15.21, mag: 2.48, spectralColor: '#F0F9FF', constellationId: 'pegasus' },
      { id: 'scheat', name: 'Scheat (β Peg)', japaneseName: '室宿二', ra: 345.94, dec: 28.08, mag: 2.42, spectralColor: '#FCA5A5', constellationId: 'pegasus' },
      { id: 'algenib', name: 'Algenib (γ Peg)', japaneseName: '壁宿一 (Hekishuku)', ra: 3.31, dec: 15.18, mag: 2.84, spectralColor: '#BAE6FD', constellationId: 'pegasus' },
      { id: 'alpheratz', name: 'Alpheratz (α And)', japaneseName: '壁宿二', ra: 2.1, dec: 29.09, mag: 2.06, spectralColor: '#E0F2FE', constellationId: 'pegasus' },
    ],
    lines: [
      ['markab', 'scheat'],
      ['scheat', 'alpheratz'],
      ['alpheratz', 'algenib'],
      ['algenib', 'markab'],
    ],
  },
];

// Deterministic background star field so the dome looks rich & authentic
interface BackgroundStar {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
}

function generateBackgroundStars(count = 160): BackgroundStar[] {
  const stars: BackgroundStar[] = [];
  const colors = ['#F4EFE3', '#E0F2FE', '#FEF3C7', '#BAE6FD', '#FDE68A'];
  let seed = 421337;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const ra = nextRand() * 360;
    // Uniform spherical distribution for declination
    const u = nextRand() * 2 - 1;
    const dec = (Math.asin(u) * 180) / Math.PI;
    const mag = 3.2 + nextRand() * 2.6;
    const color = colors[Math.floor(nextRand() * colors.length)];
    stars.push({ id: `bg-star-${i}`, ra, dec, mag, color });
  }
  return stars;
}

const BG_STARS = generateBackgroundStars(175);

function parseCoord(coordStr: string, fallback = 30.7333): number {
  const num = parseFloat(coordStr.replace(/[^\d.-]/g, ''));
  if (coordStr.includes('S') || coordStr.includes('W')) return -num;
  return isNaN(num) ? fallback : num;
}

/**
 * Compute Local Sidereal Time (in degrees 0..360) for a given Date and East Longitude
 */
function calculateLSTDegrees(date: Date, lonDeg: number): number {
  const JD = date.getTime() / 86400000 + 2440587.5;
  const D = JD - 2451545.0;
  // Greenwich Mean Sidereal Time in degrees
  let gmst = 280.46061837 + 360.98564736629 * D;
  let lst = (gmst + lonDeg) % 360;
  if (lst < 0) lst += 360;
  return lst;
}

/**
 * Format degrees (0..360) as Sidereal Hours:Minutes:Seconds (HHh MMm SSs)
 */
function formatRAHours(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  const totalHours = norm / 15;
  const h = Math.floor(totalHours);
  const m = Math.floor((totalHours - h) * 60);
  const s = Math.floor(((totalHours - h) * 60 - m) * 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

interface CelestialMapWidgetProps {
  selectedSpot: StargazingSpot;
  lastSyncedAt?: Date | null;
  onRetrySync?: () => void;
  isSyncing?: boolean;
}

export const CelestialMapWidget: React.FC<CelestialMapWidgetProps> = ({
  selectedSpot,
  lastSyncedAt,
  onRetrySync,
  isSyncing = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Real-time simulation state (defaults to 1x real clock in Asia/Kolkata)
  const [isLiveRunning, setIsLiveRunning] = useState<boolean>(true);
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState<number>(0);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(1);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // User camera orientation offsets (via D3 drag or cardinal presets)
  const [viewRotationOffset, setViewRotationOffset] = useState<{ dRa: number; dDec: number }>({
    dRa: 0,
    dDec: 0,
  });
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [activeCardinal, setActiveCardinal] = useState<'ZENITH' | 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'>('ZENITH');

  // Layer toggles
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [showConstellationLines, setShowConstellationLines] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showMilkyWay, setShowMilkyWay] = useState<boolean>(true);

  // Selected / hovered constellation & star
  const [selectedConstellationId, setSelectedConstellationId] = useState<string>('orion');
  const [hoveredStar, setHoveredStar] = useState<StarNode | null>(null);

  const observerLat = useMemo(
    () =>
      typeof selectedSpot.coordinates.latNum === 'number' && !isNaN(selectedSpot.coordinates.latNum)
        ? selectedSpot.coordinates.latNum
        : parseCoord(selectedSpot.coordinates.lat, 30.7333),
    [selectedSpot]
  );
  const observerLng = useMemo(
    () =>
      typeof selectedSpot.coordinates.lngNum === 'number' && !isNaN(selectedSpot.coordinates.lngNum)
        ? selectedSpot.coordinates.lngNum
        : parseCoord(selectedSpot.coordinates.lng, 76.7794),
    [selectedSpot]
  );

  const cloudCoverPct = Math.max(0, Math.min(100, selectedSpot.cloudCover ?? 0));
  const starCloudOpacityFactor = Number(Math.max(0.18, 1 - (cloudCoverPct / 100) * 0.78).toFixed(2));
  const spotAqi = selectedSpot.usAqi ?? selectedSpot.scoreBreakdown?.usAqiValue ?? 50;
  const isHazeActive = spotAqi > 150;
  const hazeOverlayOpacity = isHazeActive
    ? Number(Math.min(0.46, 0.22 + ((spotAqi - 150) / 300) * 0.24).toFixed(2))
    : 0;

  const lastSyncedFormatted = useMemo(() => {
    if (!lastSyncedAt || isNaN(lastSyncedAt.getTime())) return '--:--';
    return lastSyncedAt.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [lastSyncedAt]);

  // Real-time clock ticker
  useEffect(() => {
    if (!isLiveRunning) return;
    const interval = setInterval(() => {
      setNowTick(Date.now());
      if (simSpeedMultiplier > 1) {
        setTimeOffsetMinutes((prev) => (prev + (simSpeedMultiplier / 60) * 0.25) % 1440);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isLiveRunning, simSpeedMultiplier]);

  // Simulated Date combining real clock + time offset scrubber
  const simulatedDate = useMemo(() => {
    return new Date(nowTick + timeOffsetMinutes * 60 * 1000);
  }, [nowTick, timeOffsetMinutes]);

  // Local Sidereal Time in degrees
  const lstDegrees = useMemo(() => {
    return calculateLSTDegrees(simulatedDate, observerLng);
  }, [simulatedDate, observerLng]);

  // Effective center of projection (Right Ascension & Declination)
  const centerRA = useMemo(() => {
    return (lstDegrees + viewRotationOffset.dRa + 360) % 360;
  }, [lstDegrees, viewRotationOffset.dRa]);

  const centerDec = useMemo(() => {
    return Math.max(-85, Math.min(85, observerLat + viewRotationOffset.dDec));
  }, [observerLat, viewRotationOffset.dDec]);

  // Cardinal Orientation Presets
  const handleSelectCardinal = useCallback(
    (dir: 'ZENITH' | 'NORTH' | 'EAST' | 'SOUTH' | 'WEST') => {
      playSuzuChime();
      setActiveCardinal(dir);
      switch (dir) {
        case 'ZENITH':
          setViewRotationOffset({ dRa: 0, dDec: 0 });
          break;
        case 'NORTH':
          setViewRotationOffset({ dRa: 0, dDec: 90 - observerLat - 12 });
          break;
        case 'SOUTH':
          setViewRotationOffset({ dRa: 0, dDec: -38 });
          break;
        case 'EAST':
          setViewRotationOffset({ dRa: 45, dDec: -10 });
          break;
        case 'WEST':
          setViewRotationOffset({ dRa: -45, dDec: -10 });
          break;
      }
    },
    [observerLat]
  );

  const handleResetView = () => {
    playSuzuChime();
    setViewRotationOffset({ dRa: 0, dDec: 0 });
    setTimeOffsetMinutes(0);
    setZoomScale(1.0);
    setActiveCardinal('ZENITH');
  };

  // D3 Drag behavior on SVG for interactive sky panning
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const selection = d3.select<SVGSVGElement, unknown>(svgEl);

    const dragBehavior = d3
      .drag<SVGSVGElement, unknown>()
      .on('drag', (event) => {
        const sensitivity = 0.28 / zoomScale;
        setViewRotationOffset((prev) => ({
          dRa: prev.dRa - event.dx * sensitivity,
          dDec: Math.max(-85 - observerLat, Math.min(85 - observerLat, prev.dDec + event.dy * sensitivity)),
        }));
      });

    selection.call(dragBehavior);

    return () => {
      selection.on('.drag', null);
    };
  }, [observerLat, zoomScale]);

  // D3 Projection, Path Generator, and Scales
  const {
    pathGenerator,
    graticulePath,
    horizonPath,
    eclipticPath,
    milkyWayOuterPath,
    projectedConstellations,
    projectedBgStars,
    polarStarCoords,
  } = useMemo(() => {
    const width = 640;
    const height = 640;
    const baseRadius = 278 * zoomScale;

    // D3 Stereographic Celestial Dome Projection
    // In D3 spherical coordinates, longitude = -RA (since sky dome is viewed from inside looking up, East is left)
    const projection = d3
      .geoStereographic()
      .scale(baseRadius)
      .translate([width / 2, height / 2])
      .clipAngle(95)
      .rotate([centerRA, -centerDec, 0]);

    const pathGen = d3.geoPath().projection(projection);

    // 1. Graticule (RA every 2 hours = 30 deg, Dec every 15 deg)
    const graticule = d3.geoGraticule().step([30, 15]);
    const gratPath = pathGen(graticule()) || '';

    // 2. Local Horizon Circle (90 degrees from zenith center)
    const horizonCircle = d3
      .geoCircle()
      .center([-centerRA, centerDec])
      .radius(88);
    const horizPath = pathGen(horizonCircle()) || '';

    // 3. Ecliptic Circle (tilted by 23.44 deg obliquity)
    const eclipticCircle = d3.geoCircle().center([90, 66.56]).radius(90);
    const eclipPath = pathGen(eclipticCircle()) || '';

    // 4. Galactic Plane / Milky Way Band (Amanogawa 天の川)
    const galacticBand = d3.geoCircle().center([-192.85, 27.13]).radius(86);
    const mwPath = pathGen(galacticBand()) || '';

    // D3 Scale for Star Magnitude -> SVG Circle Radius
    const magToRadius = d3.scaleLinear().domain([-1.0, 4.0]).range([5.8, 1.8]).clamp(true);

    // Project Background Stars
    const bgStars = BG_STARS.map((s) => {
      const pt = projection([-s.ra, s.dec]);
      if (!pt) return null;
      const dx = pt[0] - width / 2;
      const dy = pt[1] - height / 2;
      if (Math.hypot(dx, dy) > 276) return null;
      return {
        ...s,
        x: pt[0],
        y: pt[1],
        r: Math.max(0.8, 2.3 - (s.mag - 3.0) * 0.5),
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null);

    // Project Constellations & their Stars + Lines
    const constels = CONSTELLATIONS.map((c) => {
      const starMap = new Map<string, StarNode & { x: number; y: number; r: number }>();

      const projectedStars = c.stars
        .map((star) => {
          const pt = projection([-star.ra, star.dec]);
          if (!pt) return null;
          const dx = pt[0] - width / 2;
          const dy = pt[1] - height / 2;
          // Clip stars outside visible dome circle
          if (Math.hypot(dx, dy) > 275) return null;

          const item = {
            ...star,
            x: pt[0],
            y: pt[1],
            r: magToRadius(star.mag),
          };
          starMap.set(star.id, item);
          return item;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      // Build GeoJSON LineStrings for visible constellation segments
      const lineSegments: { id: string; d: string; x1: number; y1: number; x2: number; y2: number }[] = [];
      c.lines.forEach(([idA, idB]) => {
        const sA = starMap.get(idA);
        const sB = starMap.get(idB);
        if (sA && sB) {
          const geoLine: GeoJSON.Feature<GeoJSON.LineString> = {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [-sA.ra, sA.dec],
                [-sB.ra, sB.dec],
              ],
            },
          };
          const dStr = pathGen(geoLine) || `M${sA.x},${sA.y}L${sB.x},${sB.y}`;
          lineSegments.push({
            id: `${idA}-${idB}`,
            d: dStr,
            x1: sA.x,
            y1: sA.y,
            x2: sB.x,
            y2: sB.y,
          });
        }
      });

      // Centroid for label
      let centroid: { x: number; y: number } | null = null;
      if (projectedStars.length > 0) {
        const avgX = d3.mean(projectedStars, (s) => s.x) || 0;
        const avgY = d3.mean(projectedStars, (s) => s.y) || 0;
        centroid = { x: avgX, y: avgY };
      }

      return {
        ...c,
        projectedStars,
        lineSegments,
        centroid,
        isVisible: projectedStars.length > 0,
      };
    });

    // Project Polaris (North Star: RA 37.95, Dec +89.26)
    const polarisPt = projection([-37.95, 89.26]);
    const polaris =
      polarisPt && Math.hypot(polarisPt[0] - width / 2, polarisPt[1] - height / 2) <= 275
        ? { x: polarisPt[0], y: polarisPt[1] }
        : null;

    return {
      pathGenerator: pathGen,
      graticulePath: gratPath,
      horizonPath: horizPath,
      eclipticPath: eclipPath,
      milkyWayOuterPath: mwPath,
      projectedConstellations: constels,
      projectedBgStars: bgStars,
      polarStarCoords: polaris,
    };
  }, [centerRA, centerDec, zoomScale]);

  const activeConstellation = useMemo(
    () => CONSTELLATIONS.find((c) => c.id === selectedConstellationId) || CONSTELLATIONS[0],
    [selectedConstellationId]
  );

  const handleSelectConstellation = (c: ConstellationData) => {
    setSelectedConstellationId(c.id);
    // Play a Koto harmonic note mapped to the constellation's brightest star
    const notes = [392.0, 440.0, 493.88, 523.25, 587.33, 659.25];
    const idx = CONSTELLATIONS.findIndex((item) => item.id === c.id);
    playKotoNote(notes[idx % notes.length], 1.4);
  };

  const handleCenterOnConstellation = (c: ConstellationData) => {
    handleSelectConstellation(c);
    if (c.stars.length > 0) {
      const meanRA = d3.mean(c.stars, (s) => s.ra) || 0;
      const meanDec = d3.mean(c.stars, (s) => s.dec) || 0;
      setViewRotationOffset({
        dRa: meanRA - lstDegrees,
        dDec: meanDec - observerLat,
      });
    }
  };

  return (
    <div className="bg-[#0B0E17] border border-[#D4A84B]/50 rounded-2xl overflow-hidden shadow-[0_0_35px_rgba(10,10,15,0.85)]">
      {/* Top Telemetry Bar */}
      <div className="bg-[#0E1326] border-b border-[#1E293B] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Compass className="w-4 h-4 text-[#D4A84B]" />
          <span className="font-mono text-xs font-bold tracking-wider uppercase text-[#F4EFE3]">
            D3 CELESTIAL HEMISPHERE · リアルタイム星図
          </span>
          <span className="text-[#8E9BB5] font-mono text-xs">·</span>
          <span className="font-mono text-xs text-[#D4A84B] tabular-nums">
            {selectedSpot.name} ({selectedSpot.coordinates.lat}, {selectedSpot.coordinates.lng})
          </span>
          <span className="px-2 py-0.5 rounded bg-[#151B38] text-[10px] font-mono text-[#F4EFE3] tabular-nums">
            Cloud {cloudCoverPct}%
          </span>
          {isHazeActive && (
            <span className="px-2 py-0.5 rounded bg-[#D97706]/25 border border-[#F59E0B] text-[10px] font-mono font-bold text-[#FBBF24] uppercase">
              Haze (AQI {spotAqi})
            </span>
          )}
        </div>

        {/* Live Sidereal Telemetry Readout + Last Synced + Retry Sync */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
          <div className="flex items-center space-x-1.5">
            <span className="text-[#8E9BB5]">LST:</span>
            <span className="text-[#F4EFE3] font-semibold">{formatRAHours(lstDegrees)}</span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5">
            <span className="text-[#8E9BB5]">FOV:</span>
            <span className="text-[#D4A84B] font-semibold">
              RA {centerRA.toFixed(1)}° / DEC {centerDec >= 0 ? `+${centerDec.toFixed(1)}°` : `${centerDec.toFixed(1)}°`}
            </span>
          </div>
          <span className="text-[#8E9BB5] text-[11px]">
            Last synced {lastSyncedFormatted}
          </span>
          {onRetrySync && (
            <button
              type="button"
              onClick={onRetrySync}
              disabled={isSyncing}
              className="px-2.5 py-1 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] disabled:opacity-50 font-mono text-[11px] font-bold transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Retry sync</span>
            </button>
          )}
          <span className="text-emerald-400 font-mono text-[11px] font-semibold">
            {isLiveRunning ? '● LIVE TRACKING' : '▲ PAUSED'}
          </span>
        </div>
      </div>

      {/* Interactive Toolbar: Cardinal View Presets + Layer Toggles */}
      <div className="bg-[#0A0A0F] border-b border-[#151B38] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Cardinal View Switcher */}
        <div className="flex items-center space-x-1 bg-[#0E1326] p-1 rounded-lg border border-[#151B38]">
          {(['ZENITH', 'NORTH', 'EAST', 'SOUTH', 'WEST'] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => handleSelectCardinal(dir)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                activeCardinal === dir
                  ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold'
                  : 'text-[#8E9BB5] hover:text-[#F4EFE3]'
              }`}
            >
              {dir}
            </button>
          ))}
        </div>

        {/* Layer & Zoom Controls */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            onClick={() => setShowConstellationLines(!showConstellationLines)}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer whitespace-nowrap ${
              showConstellationLines
                ? 'bg-[#151B38] border-[#D4A84B]/60 text-[#D4A84B]'
                : 'bg-[#0E1326] border-[#151B38] text-[#8E9BB5]'
            }`}
          >
            Asterisms
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer whitespace-nowrap ${
              showLabels
                ? 'bg-[#151B38] border-[#D4A84B]/60 text-[#D4A84B]'
                : 'bg-[#0E1326] border-[#151B38] text-[#8E9BB5]'
            }`}
          >
            Kanji Labels
          </button>
          <button
            onClick={() => setShowGraticule(!showGraticule)}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer whitespace-nowrap ${
              showGraticule
                ? 'bg-[#151B38] border-[#D4A84B]/60 text-[#D4A84B]'
                : 'bg-[#0E1326] border-[#151B38] text-[#8E9BB5]'
            }`}
          >
            RA/Dec Grid
          </button>
          <button
            onClick={() => setShowMilkyWay(!showMilkyWay)}
            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer whitespace-nowrap ${
              showMilkyWay
                ? 'bg-[#151B38] border-[#D4A84B]/60 text-[#D4A84B]'
                : 'bg-[#0E1326] border-[#151B38] text-[#8E9BB5]'
            }`}
          >
            Milky Way
          </button>

          <div className="flex items-center space-x-1 ml-1">
            <button
              onClick={() => setZoomScale((z) => Math.min(1.8, +(z + 0.2).toFixed(1)))}
              className="p-1.5 rounded bg-[#0E1326] border border-[#151B38] text-[#8E9BB5] hover:text-[#D4A84B] cursor-pointer"
              title="Zoom In Sky Dome"
              aria-label="Zoom In Sky Dome"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomScale((z) => Math.max(0.8, +(z - 0.2).toFixed(1)))}
              className="p-1.5 rounded bg-[#0E1326] border border-[#151B38] text-[#8E9BB5] hover:text-[#D4A84B] cursor-pointer"
              title="Zoom Out Sky Dome"
              aria-label="Zoom Out Sky Dome"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1.5 rounded bg-[#0E1326] border border-[#151B38] text-[#8E9BB5] hover:text-[#D4A84B] cursor-pointer"
              title="Reset Zenith Alignment"
              aria-label="Reset Zenith Alignment"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Stage: D3 Celestial Map Canvas + Constellation Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 items-stretch">
        {/* Left / Center: D3 SVG Sky Hemisphere (7 cols) */}
        <div className="xl:col-span-7 relative bg-[#070911] p-4 flex flex-col items-center justify-center border-b xl:border-b-0 xl:border-r border-[#151B38]">
          {/* Drag Hint Overlay */}
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-[#8E9BB5] mb-2 px-1">
            <span>DRAG DOME TO PAN SKY · CLICK CONSTELLATION TO INSPECT</span>
            <span className="text-[#D4A84B] tabular-nums">ZOOM: {(zoomScale * 100).toFixed(0)}%</span>
          </div>

          <div className="relative w-full max-w-[520px] aspect-square flex items-center justify-center">
            <svg
              ref={svgRef}
              viewBox="0 0 640 640"
              className="w-full h-full select-none cursor-grab active:cursor-grabbing"
              role="img"
              aria-label={`Interactive D3 Celestial Map for ${selectedSpot.name}`}
            >
              <defs>
                {/* Deep Space Radial Gradient */}
                <radialGradient id="celestialDomeGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#131B38" />
                  <stop offset="68%" stopColor="#0B0F22" />
                  <stop offset="100%" stopColor="#060811" />
                </radialGradient>

                {/* Warm Smog / Haze Radial Overlay Gradient (when AQI > 150) */}
                <radialGradient id="warmHazeDomeGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#D97706" stopOpacity="0.35" />
                  <stop offset="65%" stopColor="#B45309" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#78350F" stopOpacity="0.9" />
                </radialGradient>

                {/* Cloud Cover Veil Radial Gradient */}
                <radialGradient id="cloudVeilDomeGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#334155" stopOpacity="0.45" />
                  <stop offset="75%" stopColor="#1E293B" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#0F172A" stopOpacity="0.8" />
                </radialGradient>

                {/* Star Glow Filter */}
                <filter id="starGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Clip path for the hemisphere dome */}
                <clipPath id="domeClip">
                  <circle cx="320" cy="320" r="278" />
                </clipPath>
              </defs>

              {/* Outer Azimuth Degree Ring */}
              <circle
                cx="320"
                cy="320"
                r="298"
                fill="none"
                stroke="#D4A84B"
                strokeOpacity="0.25"
                strokeWidth="1"
              />
              <circle
                cx="320"
                cy="320"
                r="282"
                fill="none"
                stroke="#D4A84B"
                strokeOpacity="0.6"
                strokeWidth="1.5"
              />

              {/* Degree Tick Marks around Azimuth Ring */}
              {Array.from({ length: 72 }).map((_, i) => {
                const deg = i * 5;
                const rad = (deg * Math.PI) / 180;
                const rInner = deg % 30 === 0 ? 282 : 286;
                const rOuter = 292;
                const x1 = 320 + rInner * Math.sin(rad);
                const y1 = 320 - rInner * Math.cos(rad);
                const x2 = 320 + rOuter * Math.sin(rad);
                const y2 = 320 - rOuter * Math.cos(rad);
                return (
                  <line
                    key={deg}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#D4A84B"
                    strokeOpacity={deg % 30 === 0 ? 0.75 : 0.3}
                    strokeWidth={deg % 30 === 0 ? 1.5 : 0.75}
                  />
                );
              })}

              {/* Main Sky Hemisphere Base */}
              <circle cx="320" cy="320" r="278" fill="url(#celestialDomeGrad)" />

              {/* Clipped Celestial Contents */}
              <g clipPath="url(#domeClip)">
                {/* Milky Way / Galactic River Band */}
                {showMilkyWay && milkyWayOuterPath && (
                  <path
                    d={milkyWayOuterPath}
                    fill="none"
                    stroke="#60A5FA"
                    strokeOpacity="0.09"
                    strokeWidth="44"
                    strokeLinecap="round"
                  />
                )}

                {/* Ecliptic Path (Solar & Lunar Zodiacal Path) */}
                {showMilkyWay && eclipticPath && (
                  <path
                    d={eclipticPath}
                    fill="none"
                    stroke="#D4A84B"
                    strokeOpacity="0.35"
                    strokeWidth="1.2"
                    strokeDasharray="6 4"
                  />
                )}

                {/* D3 Celestial Graticule (RA / Dec Spherical Grid) */}
                {showGraticule && (
                  <path
                    d={graticulePath}
                    fill="none"
                    stroke="#94A3B8"
                    strokeOpacity="0.16"
                    strokeWidth="0.8"
                  />
                )}

                {/* Local Horizon Ring */}
                <path
                  d={horizonPath}
                  fill="none"
                  stroke="#B3202A"
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />

                {/* Background Star Field (faded by cloud cover) */}
                {projectedBgStars.map((bg) => (
                  <circle
                    key={bg.id}
                    cx={bg.x}
                    cy={bg.y}
                    r={bg.r}
                    fill={bg.color}
                    fillOpacity={Number((0.55 * starCloudOpacityFactor).toFixed(2))}
                  />
                ))}

                {/* Polaris (North Celestial Pole Indicator) */}
                {polarStarCoords && (
                  <g
                    transform={`translate(${polarStarCoords.x}, ${polarStarCoords.y})`}
                    opacity={starCloudOpacityFactor}
                  >
                    <circle r="7" fill="none" stroke="#D4A84B" strokeOpacity="0.6" strokeWidth="1" strokeDasharray="2 2" />
                    <circle r="3" fill="#FDE047" filter="url(#starGlow)" />
                    {showLabels && (
                      <text
                        x="10"
                        y="3"
                        fill="#D4A84B"
                        fontSize="9.5"
                        fontFamily="Space Mono, monospace"
                        fontWeight="bold"
                      >
                        POLARIS · 北極星
                      </text>
                    )}
                  </g>
                )}

                {/* Constellations: Lines, Stars, and Labels (faded by cloud cover) */}
                {projectedConstellations.map((constel) => {
                  const isSelected = constel.id === selectedConstellationId;

                  return (
                    <g
                      key={constel.id}
                      onClick={() => handleSelectConstellation(constel)}
                      className="cursor-pointer group"
                      opacity={starCloudOpacityFactor}
                    >
                      {/* Constellation Asterism Lines */}
                      {showConstellationLines &&
                        constel.lineSegments.map((seg) => (
                          <path
                            key={seg.id}
                            d={seg.d}
                            fill="none"
                            stroke={isSelected ? '#D4A84B' : '#64748B'}
                            strokeOpacity={isSelected ? 0.92 : 0.45}
                            strokeWidth={isSelected ? 1.9 : 1.1}
                          />
                        ))}

                      {/* Constellation Stars */}
                      {constel.projectedStars.map((star) => {
                        const isHoveredStar = hoveredStar?.id === star.id;
                        return (
                          <g
                            key={star.id}
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(null)}
                          >
                            {/* Outer halo for bright / active stars */}
                            {(isSelected || star.mag < 1.5) && (
                              <circle
                                cx={star.x}
                                cy={star.y}
                                r={star.r * 2.1}
                                fill={star.spectralColor}
                                fillOpacity={isSelected ? 0.25 : 0.14}
                              />
                            )}

                            {/* Star Core */}
                            <circle
                              cx={star.x}
                              cy={star.y}
                              r={isHoveredStar ? star.r * 1.45 : star.r}
                              fill={star.spectralColor}
                              stroke={isSelected ? '#D4A84B' : 'none'}
                              strokeWidth={isSelected ? 0.8 : 0}
                              filter="url(#starGlow)"
                            />

                            {/* Named Bright Star Micro-Label when Constellation Selected */}
                            {showLabels && isSelected && star.mag <= 2.3 && (
                              <text
                                x={star.x + star.r + 4}
                                y={star.y + 3}
                                fill="#F4EFE3"
                                fillOpacity="0.88"
                                fontSize="8.5"
                                fontFamily="Space Mono, monospace"
                              >
                                {star.name.split(' ')[0]}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Constellation Name & Kanji Label at Centroid */}
                      {showLabels && constel.centroid && (
                        <g transform={`translate(${constel.centroid.x}, ${constel.centroid.y - 12})`}>
                          <text
                            textAnchor="middle"
                            fill={isSelected ? '#D4A84B' : '#94A3B8'}
                            fontSize={isSelected ? '11' : '9.5'}
                            fontWeight={isSelected ? '700' : '600'}
                            fontFamily="Cinzel, serif"
                            letterSpacing="0.08em"
                          >
                            {constel.name.toUpperCase()}
                          </text>
                          <text
                            y="11"
                            textAnchor="middle"
                            fill={isSelected ? '#F4EFE3' : '#64748B'}
                            fontSize="8.5"
                            fontFamily="Noto Serif JP, serif"
                          >
                            {constel.japanese.split('·')[0].trim()}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Atmospheric Cloud Veil Overlay */}
                {cloudCoverPct > 5 && (
                  <circle
                    cx="320"
                    cy="320"
                    r="278"
                    fill="url(#cloudVeilDomeGrad)"
                    opacity={Number(Math.min(0.55, (cloudCoverPct / 100) * 0.55).toFixed(2))}
                    pointerEvents="none"
                  />
                )}

                {/* Warm Smog / Haze Overlay when AQI > 150 */}
                {isHazeActive && (
                  <circle
                    cx="320"
                    cy="320"
                    r="278"
                    fill="url(#warmHazeDomeGrad)"
                    opacity={hazeOverlayOpacity}
                    pointerEvents="none"
                  />
                )}

                {/* Zenith Crosshair Reticle */}
                <g transform="translate(320, 320)" pointerEvents="none">
                  <circle r="16" fill="none" stroke="#D4A84B" strokeOpacity="0.35" strokeWidth="0.8" />
                  <line x1="-22" y1="0" x2="-8" y2="0" stroke="#D4A84B" strokeOpacity="0.5" strokeWidth="0.8" />
                  <line x1="8" y1="0" x2="22" y2="0" stroke="#D4A84B" strokeOpacity="0.5" strokeWidth="0.8" />
                  <line x1="0" y1="-22" x2="0" y2="-8" stroke="#D4A84B" strokeOpacity="0.5" strokeWidth="0.8" />
                  <line x1="0" y1="8" x2="0" y2="22" stroke="#D4A84B" strokeOpacity="0.5" strokeWidth="0.8" />
                </g>
              </g>

              {/* Cardinal Compass Markers around Dome Perimeter */}
              <g fontFamily="Space Mono, monospace" fontSize="11" fontWeight="bold">
                <rect x="302" y="6" width="36" height="18" rx="4" fill="#0E1326" stroke="#D4A84B" strokeWidth="1" />
                <text x="320" y="19" textAnchor="middle" fill="#D4A84B">
                  N·北
                </text>

                <rect x="302" y="616" width="36" height="18" rx="4" fill="#0E1326" stroke="#D4A84B" strokeWidth="1" />
                <text x="320" y="629" textAnchor="middle" fill="#D4A84B">
                  S·南
                </text>

                <rect x="6" y="311" width="36" height="18" rx="4" fill="#0E1326" stroke="#D4A84B" strokeWidth="1" />
                <text x="24" y="324" textAnchor="middle" fill="#D4A84B">
                  E·東
                </text>

                <rect x="598" y="311" width="36" height="18" rx="4" fill="#0E1326" stroke="#D4A84B" strokeWidth="1" />
                <text x="616" y="324" textAnchor="middle" fill="#D4A84B">
                  W·西
                </text>
              </g>
            </svg>

            {/* Floating Star Hover Telemetry HUD */}
            {hoveredStar && (
              <div className="absolute bottom-3 left-3 bg-[#0E1326]/95 border border-[#D4A84B] rounded-lg px-3 py-2 text-xs font-mono shadow-lg pointer-events-none">
                <div className="flex items-center space-x-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: hoveredStar.spectralColor }}
                  />
                  <span className="text-[#F4EFE3] font-bold">{hoveredStar.name}</span>
                  <span className="text-[#D4A84B]">{hoveredStar.japaneseName}</span>
                </div>
                <div className="text-[10px] text-[#8E9BB5] tabular-nums mt-0.5">
                  RA: {hoveredStar.ra.toFixed(2)}° · DEC: {hoveredStar.dec >= 0 ? `+${hoveredStar.dec.toFixed(2)}°` : `${hoveredStar.dec.toFixed(2)}°`} · MAG: {hoveredStar.mag.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Sidereal Time Scrubber & Live Simulation Speed Bar */}
          <div className="w-full mt-3 bg-[#0E1326] border border-[#1E293B] rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsLiveRunning(!isLiveRunning)}
                  className="px-2.5 py-1 rounded bg-[#151B38] hover:bg-[#D4A84B] hover:text-[#0A0A0F] text-[#F4EFE3] font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {isLiveRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isLiveRunning ? 'Pause Orbit' : 'Resume Orbit'}</span>
                </button>
                <button
                  onClick={() => setSimSpeedMultiplier((s) => (s === 1 ? 60 : s === 60 ? 360 : 1))}
                  className="px-2 py-1 rounded bg-[#0A0A0F] border border-[#1E293B] text-[#D4A84B] hover:border-[#D4A84B] cursor-pointer tabular-nums"
                  title="Toggle Sidereal Drift Speed"
                >
                  Speed: {simSpeedMultiplier === 1 ? '1x Sidereal' : `${simSpeedMultiplier}x Timelapse`}
                </button>
              </div>

              <div className="text-[#F4EFE3] tabular-nums">
                <span className="text-[#8E9BB5] mr-1.5">OBSERVATION TIME (ASIA/KOLKATA):</span>
                <span className="text-[#D4A84B] font-bold">
                  {simulatedDate.toLocaleTimeString('en-GB', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}{' '}
                  IST
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Clock className="w-3.5 h-3.5 text-[#8E9BB5] shrink-0" />
              <input
                type="range"
                min="-720"
                max="720"
                step="5"
                value={Math.round(timeOffsetMinutes)}
                onChange={(e) => setTimeOffsetMinutes(Number(e.target.value))}
                className="w-full accent-[#D4A84B] cursor-pointer h-1.5 bg-[#151B38] rounded-lg"
                aria-label="Scrub Sidereal Observation Time"
              />
              <button
                onClick={() => setTimeOffsetMinutes(0)}
                className="text-[10px] font-mono text-[#8E9BB5] hover:text-[#D4A84B] whitespace-nowrap cursor-pointer"
              >
                Now (0h)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Constellation Telemetry & Star Catalog Inspector (5 cols) */}
        <div className="xl:col-span-5 p-5 flex flex-col justify-between space-y-5 bg-[#0B0E17]">
          {/* Active Constellation Dossier */}
          <div className="space-y-4">
            <div className="border-b border-[#1E293B] pb-3">
              <div className="flex items-center justify-between text-xs font-mono text-[#D4A84B]">
                <span>ACTIVE CONSTELLATION TELEMETRY</span>
                <span>{activeConstellation.season}</span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <h3 className="font-serif text-2xl font-bold text-[#F4EFE3]">
                  {activeConstellation.name}
                </h3>
                <span className="font-kanji text-sm text-[#D4A84B] font-bold">
                  {activeConstellation.japanese}
                </span>
              </div>
            </div>

            {/* Traditional Japanese Star Lore */}
            <div className="p-3.5 rounded-xl bg-[#0E1326] border border-[#1E293B] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#D4A84B]">
                <span>TRADITIONAL STAR LORE · 星宿伝承</span>
                <span>{activeConstellation.romaji}</span>
              </div>
              <p className="font-sans text-xs text-[#F4EFE3]/90 leading-relaxed">
                {activeConstellation.lore}
              </p>
            </div>

            {/* Primary Stars Table in Active Constellation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#8E9BB5]">
                <span>PRIMARY STELLAR CATALOG</span>
                <span>RA / DEC / MAG</span>
              </div>

              <div className="bg-[#0A0A0F] border border-[#1E293B] rounded-xl divide-y divide-[#151B38] max-h-52 overflow-y-auto">
                {activeConstellation.stars.map((star) => (
                  <div
                    key={star.id}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(null)}
                    onClick={() => playKotoNote(523.25 - star.mag * 40, 1.1)}
                    className="px-3 py-2 flex items-center justify-between text-xs hover:bg-[#151B38]/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: star.spectralColor }}
                      />
                      <div className="truncate">
                        <span className="font-sans font-semibold text-[#F4EFE3] block truncate">
                          {star.name}
                        </span>
                        <span className="font-kanji text-[10px] text-[#8E9BB5] block truncate">
                          {star.japaneseName}
                        </span>
                      </div>
                    </div>

                    <div className="font-mono text-[11px] text-right tabular-nums shrink-0 ml-2">
                      <span className="text-[#D4A84B] font-semibold block">
                        {star.mag.toFixed(2)} <span className="text-[9px] text-[#8E9BB5]">mag</span>
                      </span>
                      <span className="text-[10px] text-[#8E9BB5]">
                        {star.ra.toFixed(1)}° / {star.dec >= 0 ? `+${star.dec.toFixed(1)}°` : `${star.dec.toFixed(1)}°`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick-Select Constellation Grid (Centers Dome on Click) */}
          <div className="space-y-2 pt-3 border-t border-[#1E293B]">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#8E9BB5]">
              <span>LOCK TELESCOPE ON CONSTELLATION</span>
              <span>8 SECTORS</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {CONSTELLATIONS.map((c) => {
                const isSelected = c.id === selectedConstellationId;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleCenterOnConstellation(c)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#151B38] border-[#D4A84B] text-[#F4EFE3]'
                        : 'bg-[#0E1326] border-[#1E293B] text-[#8E9BB5] hover:text-[#F4EFE3] hover:border-[#D4A84B]/40'
                    }`}
                  >
                    <span className="text-xs font-serif font-bold truncate">{c.name}</span>
                    <span className="font-kanji text-[10px] text-[#D4A84B] shrink-0 ml-1">
                      {c.japanese.split('·')[0].trim()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
