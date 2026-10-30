import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Compass,
  Scroll,
  Telescope,
  LayoutDashboard,
  Award,
  Moon,
  ArrowRight,
  Sparkles,
  RotateCcw,
  History,
  BookOpen,
  Clock,
  Shuffle,
  Eye,
  Trash2,
} from 'lucide-react';
import { StarField } from '../components/StarField';
import { FallingLeaves } from '../components/FallingLeaves';
import { CelestialFactOfTheDay } from '../components/common/CelestialFactOfTheDay';
import { ScrollPanel, ScrollPageControls } from '../components/common/ScrollPanel';
import { getLunarPhase, fetchMoonPhaseApiData, MoonPhaseApiResponse } from '../utils/lunarCycle';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import { useCalmMode } from '../utils/calmMode';
import { useRestorationState } from '../utils/restorationContext';
import { getHonorState, subscribeToHonorChanges, HonorState } from '../utils/honorSystem';
import factsData from '../data/celestialFactsAndFolklore.json';

interface TarotArcanaCard {
  to: string;
  num: string;
  roman: string;
  arcanaName: string;
  kanji: string;
  verticalSeal: string;
  title: string;
  sub: string;
  desc: string;
  uprightOmen: string;
  astrologicalSignifier: string;
  historicalLore: string;
  artworkUrl: string;
  accentColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TAROT_ARCANA: TarotArcanaCard[] = [
  {
    to: '/watchtower',
    num: '01',
    roman: 'I',
    arcanaName: 'THE SENTINEL',
    kanji: '見張台',
    verticalSeal: '壱・見張之塔',
    title: 'The Watchtower',
    sub: 'Stargazing Location Finder',
    desc: 'Find dark, clear-sky sanctuaries near you ranked by cloud cover, air quality, and Bortle light pollution.',
    uprightOmen: 'Clarity of vision · Ascending above the valley mist to read the unclouded zenith.',
    astrologicalSignifier: 'Polaris (北極星) · Mountain Zenith',
    historicalLore:
      'In Sengoku-era mountain castles (yamajiro), night sentries tracked atmospheric transparency and wind shear by observing the scintillation of northern circumpolar stars.',
    artworkUrl: '/assets/images/rainy_temple_gate.jpg',
    accentColor: '#D4A84B',
    Icon: Compass,
  },
  {
    to: '/scroll',
    num: '02',
    roman: 'II',
    arcanaName: 'THE WHEEL OF HEAVEN',
    kanji: '天文絵巻',
    verticalSeal: '弐・天球絵巻',
    title: 'The Celestial Scroll',
    sub: 'Space Event Tracker',
    desc: 'Meteor showers, eclipses, planetary conjunctions, rocket launches, and visible ISS passes for your location.',
    uprightOmen: 'Cosmic timing · Aligning human action with the immutable cycles of eclipses and comets.',
    astrologicalSignifier: 'Ecliptic & Lunar Nodes (黄道・白道)',
    historicalLore:
      'Court astronomers of the Heian Onmyōryō inscribed every eclipse, comet, and "Guest Star" onto silk makimono scrolls to advise the Imperial throne.',
    artworkUrl: '/assets/images/lantern_pavilion.jpg',
    accentColor: '#B3202A',
    Icon: Scroll,
  },
  {
    to: '/lens',
    num: '03',
    roman: 'III',
    arcanaName: 'THE MIRROR OF TRUTH',
    kanji: '霊鏡',
    verticalSeal: '参・月読霊鏡',
    title: 'The Spirit Lens',
    sub: 'Astrophotography Restoration',
    desc: 'Upload a deep-sky capture and deconvolve atmospheric blur and thermal noise without inventing detail.',
    uprightOmen: 'Unveiling hidden light · Stripping away illusion while preserving every true photon.',
    astrologicalSignifier: 'Yata-no-Kagami (八咫鏡) · Wavefront PSF',
    historicalLore:
      'Inspired by the sacred bronze mirrors of Shinto shrines that reflect truth without distortion, the Spirit Lens conserves photometric flux with zero hallucination.',
    artworkUrl: '/assets/images/raw_deep_sky.jpg',
    accentColor: '#D4A84B',
    Icon: Telescope,
  },
  {
    to: '/dojo',
    num: '04',
    roman: 'IV',
    arcanaName: 'THE DUAL BLADE',
    kanji: '天文道場',
    verticalSeal: '肆・天文道場',
    title: 'The Dojo Dashboard',
    sub: 'Before / After Visualization',
    desc: 'Compare raw and restored plates with a katana-edge split divider, zoom minimap, and SVG star/galaxy overlays.',
    uprightOmen: 'Discernment & precision · Measuring the exact boundary between raw chaos and resolved form.',
    astrologicalSignifier: 'Mizar & Alcor (ミザールとアルコル)',
    historicalLore:
      'Just as samurai archers tested their eyesight by resolving the double star Mizar and Alcor in Ursa Major, the Dojo measures FWHM and elongation across every source.',
    artworkUrl: '/assets/images/restored_nebula.jpg',
    accentColor: '#B3202A',
    Icon: LayoutDashboard,
  },
  {
    to: '/honor',
    num: '05',
    roman: 'V',
    arcanaName: 'THE SHOGUN’S CREST',
    kanji: '武士道',
    verticalSeal: '伍・天文武士',
    title: 'Honor Points',
    sub: 'Warrior Ranks & Kamon Crests',
    desc: 'Ascend from Ashigaru to Shogun by observing celestial events, visiting dark-sky peaks, and restoring plates.',
    uprightOmen: 'Steadfast devotion · Every night vigil under the stars builds enduring mastery.',
    astrologicalSignifier: 'Mitsuboshi (三つ星 · Orion’s Belt)',
    historicalLore:
      'Medieval warrior clans emblazoned the three belt stars of Orion (Mitsuboshi) and the Seven Stars of the North (Kuyō) onto their battle standards and family kamon.',
    artworkUrl: '/assets/images/waterfall_bridge.jpg',
    accentColor: '#D4A84B',
    Icon: Award,
  },
  {
    to: '/stargazer',
    num: '06',
    roman: 'VI',
    arcanaName: 'THE CELESTIAL ORACLE',
    kanji: '星見処',
    verticalSeal: '陸・星見天球',
    title: 'The Star Gazer',
    sub: 'Interactive Stellarium Sky View',
    desc: 'Step inside the live 3D planetarium dome synced to your Watchtower coordinates, tonight at 10 PM, or any historical sky.',
    uprightOmen: 'Infinite horizon · Gazing directly into the living vault of constellations and deep space.',
    astrologicalSignifier: 'Amanogawa (天の川 · The Milky Way)',
    historicalLore:
      'In 1684 CE, first Shogunate Astronomer Shibukawa Harumi constructed armillary spheres and star planispheres in Edo to chart the 28 Lunar Mansions (Nijūhasshuku).',
    artworkUrl: '/assets/images/carina_nebula.jpg',
    accentColor: '#B3202A',
    Icon: Sparkles,
  },
];

interface HistoricalMilestone {
  id: string;
  year: string;
  eraTag: 'asuka-nara' | 'heian' | 'samurai' | 'edo';
  eraLabel: string;
  title: string;
  japanese: string;
  constellation: string;
  coordinates: string;
  targetDateIso: string;
  azDeg: number;
  altDeg: number;
  summary: string;
  folklore: string;
  sourceChronicle: string;
}

const HISTORICAL_MILESTONES: HistoricalMilestone[] = [
  {
    id: 'halley-684',
    year: '684 CE',
    eraTag: 'asuka-nara',
    eraLabel: 'Asuka Period · Emperor Tenmu',
    title: "The Broom Star of Nihon Shoki (Halley's Comet)",
    japanese: '日本書紀の箒星 · ハレー彗星と占星台',
    constellation: 'Virgo to Boötes · おとめ座',
    coordinates: 'Period 75.3 yrs · Inclination 162.3°',
    targetDateIso: '2026-10-21T22:00:00',
    azDeg: 110,
    altDeg: 40,
    summary:
      "In 675 CE Emperor Tenmu erected Japan's first Imperial Observatory (Senseidai). Nine years later, the Nihon Shoki recorded Japan's oldest verified perihelion of Halley's Comet—a 'Hōkiboshi' (Broom Star) stretching across the northwestern sky.",
    folklore:
      'Onmyōryō court astronomers mapped comet tails onto silk planispheres, noting that a comet’s tail always points away from the Sun centuries before solar radiation pressure was discovered.',
    sourceChronicle: 'Nihon Shoki (日本書紀), Book XXIX',
  },
  {
    id: 'kojiki-712',
    year: '712 CE',
    eraTag: 'asuka-nara',
    eraLabel: 'Nara Period · Kojiki & Man’yōshū',
    title: 'Tsukuyomi’s Silver Mirror & the Celestial River',
    japanese: '古事記の月読命と万葉集の天の川',
    constellation: 'Lyra & Aquila · こと座・わし座',
    coordinates: 'RA 18h 36m 56s · Dec +38° 47′ 01″',
    targetDateIso: '2026-08-20T22:00:00',
    azDeg: 180,
    altDeg: 68,
    summary:
      'Compiled in 712 CE, the Kojiki chronicles the birth of Tsukuyomi-no-Mikoto, guardian of the Moon and night calendar, while the Man’yōshū anthology preserves over 130 poems charting the seasonal drift of Amanogawa (the Milky Way), Vega, and Altair.',
    folklore:
      'Aristocrats and warriors practiced Tsukimi (moon-viewing) by reading the Moon’s reflection in still temple ponds and lacquer cups rather than staring directly at the lunar disk.',
    sourceChronicle: 'Kojiki (古事記) & Man’yōshū (万葉集)',
  },
  {
    id: 'subaru-1002',
    year: '1002 CE',
    eraTag: 'heian',
    eraLabel: 'Heian Court · Sei Shōnagon',
    title: 'Subaru: The Six-Star Cluster in The Pillow Book',
    japanese: '枕草子「星はすばる」 · プレアデス星団 (M45)',
    constellation: 'Taurus · 牡牛座',
    coordinates: 'RA 03h 47m 24s · Dec +24° 07′ 00″',
    targetDateIso: '2026-11-18T22:00:00',
    azDeg: 135,
    altDeg: 55,
    summary:
      'In Clause 254 of Makura no Sōshi (The Pillow Book), Heian court lady Sei Shōnagon famously wrote: "Among stars, Subaru (the Pleiades) is the most glorious, followed by Hiko-boshi (Altair) and the Morning Star (Venus)."',
    folklore:
      'The ancient Japanese name "Subaru" derives from "sumaru"—to gather or unite as one—celebrating the six to seven sapphire stars visible to the unaided eye on crisp autumn nights.',
    sourceChronicle: 'Makura no Sōshi (枕草子), Clause 254',
  },
  {
    id: 'sn1054-meigetsuki',
    year: '1054 CE',
    eraTag: 'heian',
    eraLabel: 'Heian Period · Fujiwara no Teika',
    title: 'The Guest Star of 1054 CE (Crab Supernova SN 1054)',
    japanese: '明月記の客星 · 超新星 SN 1054 (かに星雲 M1)',
    constellation: 'Taurus · 牡牛座',
    coordinates: 'RA 05h 34m 31s · Dec +22° 00′ 52″',
    targetDateIso: '2026-12-10T22:00:00',
    azDeg: 145,
    altDeg: 52,
    summary:
      'Poet and scholar Fujiwara no Teika preserved Imperial astronomer Abe no Yasuchika’s record of the May 1054 CE supernova in his diary Meigetsuki (The Record of the Clear Moon), describing a "Guest Star" (Kyakusei) near Zeta Tauri that rivaled Jupiter in brightness.',
    folklore:
      'Those medieval Kyoto & Chinese observations allowed 20th-century astrophysicists to prove that the expanding Crab Nebula (M1) and its central pulsar are the direct remnant of the 1054 explosion.',
    sourceChronicle: 'Meigetsuki (明月記) · Record of the Clear Moon',
  },
  {
    id: 'samurai-mizar-1333',
    year: '1192–1600 CE',
    eraTag: 'samurai',
    eraLabel: 'Kamakura & Sengoku Periods',
    title: 'The Samurai Archer’s Star Test & Clan Kamon',
    japanese: '北斗七星と輔星 (寿命星) · 武家家紋の星辰',
    constellation: 'Ursa Major & Orion · おおぐま座・オリオン座',
    coordinates: 'RA 13h 23m 55s · Dec +54° 55′ 31″',
    targetDateIso: '2026-05-15T22:00:00',
    azDeg: 15,
    altDeg: 58,
    summary:
      'Separated by 11.8 arcminutes, the visual double star Mizar and Alcor in the handle of the Big Dipper (Hokuto Shichisei) served as a night-watch visual acuity test for samurai archers. Meanwhile, clans like the Mōri and Watanabe adopted Orion’s three belt stars (Mitsuboshi) as their sacred family crest.',
    folklore:
      'Samurai lore revered Myōken Bosatsu—personification of the North Star Polaris—as the supreme guardian of battle destiny, while Alcor was known as Jumyō-boshi (the Star of Lifespan).',
    sourceChronicle: 'Azuma Kagami (吾妻鏡) & Buke Kamon Lore',
  },
  {
    id: 'shibukawa-1684',
    year: '1684 CE',
    eraTag: 'edo',
    eraLabel: 'Edo Shogunate · Shibukawa Harumi',
    title: 'The Jōkyō Calendar Reform & Edo Star Planispheres',
    japanese: '渋川春海と貞享暦 · 江戸幕府天文方と天球儀',
    constellation: 'Scorpius & 28 Lunar Mansions · 二十八宿',
    coordinates: 'RA 16h 29m 24s · Dec -26° 25′ 55″',
    targetDateIso: '2026-07-15T22:00:00',
    azDeg: 180,
    altDeg: 28,
    summary:
      'After predicting a solar eclipse that the imported 800-year-old Xuanming calendar missed, samurai astronomer Shibukawa Harumi measured Japan’s meridian offset and created the Jōkyō Calendar (1684)—the first indigenous Japanese calendar—earning appointment as the first Shogunate Astronomer (Tenmonkata).',
    folklore:
      'Shibukawa cataloged 308 traditional stars plus 61 newly resolved Japanese asterisms onto folding planispheres, bridging classical East Asian uranography with empirical telescope observation.',
    sourceChronicle: 'Tenmon Keitō (天文瓊統, 1698) · Edo Observatory',
  },
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [calm] = useCalmMode();
  const [apiLunar, setApiLunar] = useState<MoonPhaseApiResponse | null>(null);

  // Track which Tarot cards are flipped to their lore back-side
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  // Interactive 3-Card Tarot Omen Spread state
  const [drawnSpreadIndices, setDrawnSpreadIndices] = useState<[number, number, number] | null>(null);
  // Historical Era filter
  const [eraFilter, setEraFilter] = useState<'all' | 'asuka-nara' | 'heian' | 'samurai' | 'edo'>('all');

  // Personal Restoration & Honor History
  const { history: restorationHistory, selectHistoryEntry, clearHistory } = useRestorationState();
  const [honorState, setHonorState] = useState<HonorState>(() => getHonorState());

  useEffect(() => {
    fetchMoonPhaseApiData()
      .then((res) => setApiLunar(res))
      .catch(() => {
        /* falls back to local SunCalc ephemeris */
      });
  }, []);

  useEffect(() => {
    setHonorState(getHonorState());
    return subscribeToHonorChanges((next) => setHonorState(next));
  }, []);

  const lunar = getLunarPhase(new Date(), undefined, undefined, apiLunar);

  const toggleFlipCard = (to: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    playKotoNote(440, 0.8);
    setFlippedCards((prev) => ({ ...prev, [to]: !prev[to] }));
  };

  const handleDrawTarotSpread = () => {
    playKotoNote(523.25, 1.2);
    setTimeout(() => playSuzuChime(), 220);
    const indices = [0, 1, 2, 3, 4, 5];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setDrawnSpreadIndices([indices[0], indices[1], indices[2]]);
  };

  const filteredMilestones =
    eraFilter === 'all'
      ? HISTORICAL_MILESTONES
      : HISTORICAL_MILESTONES.filter((m) => m.eraTag === eraFilter);

  return (
    <div className="relative">
      {/* Decorative motion only on the home page, and never in calm mode */}
      {!calm && <FallingLeaves density={8} />}

      {/* HERO BANNER */}
      <section className="relative w-full pt-28 pb-14 px-4 sm:px-6 overflow-hidden border-b border-[#D4A84B]/20">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/assets/images/rainy_temple_gate.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/82 to-[#0A0A0F]/92" />
        {!calm && <StarField starCount={110} />}

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-5">
          <p className="text-[11px] font-mono tracking-[0.28em] uppercase text-[#D4A84B]">
            月読の門 · Tsukuyomi Watch · Celestial Tarot & Chronicles
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-[#F4EFE3] leading-[1.12]">
            Read the heavens <span className="text-[#D4A84B]">like a warrior.</span>
          </h1>
          <p className="font-sans text-sm sm:text-base text-[#F4EFE3]/80 max-w-2xl mx-auto leading-relaxed">
            Draw from the Six Celestial Arcana below to scout dark-sky sanctuaries, unroll ephemeris scrolls, deconvolve deep-space plates, or explore the history of Japanese astronomy.
          </p>

          {/* Tonight's Moon & Quick Tarot Reading Trigger */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0E1326]/90 border border-[#D4A84B]/40 text-xs font-mono text-[#F4EFE3]/90 shadow-[0_0_20px_rgba(212,168,75,0.15)]">
              <Moon className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>
                Tonight: {lunar.englishName} ({lunar.japaneseName}) · {lunar.illuminationExact}% lit · Moonrise{' '}
                {lunar.moonriseFormatted}
              </span>
            </div>

            <button
              type="button"
              onClick={handleDrawTarotSpread}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#B3202A] hover:bg-[#c92631] border border-[#D4A84B]/60 text-xs font-mono font-bold uppercase tracking-wider text-[#F4EFE3] transition-all cursor-pointer shadow-[0_0_20px_rgba(179,32,42,0.4)]"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>{drawnSpreadIndices ? 'Redraw 3-Card Tarot Omen' : "Draw Tonight's Tarot Omen"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* INTERACTIVE 3-CARD CELESTIAL TAROT OMEN SPREAD (Revealed when drawn) */}
      {drawnSpreadIndices && (
        <section
          aria-label="Tonight's 3-Card Celestial Tarot Omen"
          className="relative max-w-6xl mx-auto px-4 sm:px-8 pt-10 pb-2 animate-in fade-in"
        >
          <div className="rounded-3xl bg-gradient-to-b from-[#121833] via-[#0E1326] to-[#0A0A0F] border-2 border-[#D4A84B]/70 p-6 sm:p-8 shadow-[0_0_40px_rgba(212,168,75,0.22)] space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4A84B]/25 pb-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4A84B]">
                  星詠み三枚引き · THREE-ARCANA NIGHT WATCH SPREAD
                </p>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#F4EFE3] mt-0.5">
                  Tonight’s Celestial Divination under the {lunar.englishName}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDrawTarotSpread}
                  className="px-3 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle Deck</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawnSpreadIndices(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0A0A0F] border border-[#151B38] text-[#8E9BB5] hover:text-[#F4EFE3] font-mono text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {(['I · PAST CHRONICLE (過去)', 'II · TONIGHT’S SKY (現在)', 'III · WARRIOR’S OMEN (未来)'] as const).map(
                (positionLabel, idx) => {
                  const card = TAROT_ARCANA[drawnSpreadIndices[idx]];
                  const CardIcon = card.Icon;
                  return (
                    <div
                      key={positionLabel}
                      className="tarot-card-surface rounded-2xl border border-[#D4A84B]/60 p-4 flex flex-col justify-between space-y-3 relative overflow-hidden"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#D4A84B] border-b border-[#D4A84B]/20 pb-2">
                          <span>{positionLabel}</span>
                          <span className="font-bold">ARCANA {card.roman}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <div>
                            <p className="font-mono text-[10px] tracking-widest uppercase text-[#D4A84B]/90">
                              {card.arcanaName}
                            </p>
                            <h3 className="font-serif text-lg font-bold text-[#F4EFE3]">{card.title}</h3>
                          </div>
                          <div className="w-9 h-9 rounded-full bg-[#0A0A0F] border border-[#D4A84B]/50 flex items-center justify-center text-[#D4A84B]">
                            <CardIcon className="w-4 h-4" />
                          </div>
                        </div>
                        <p className="font-sans text-xs text-[#F4EFE3]/90 italic leading-relaxed bg-[#0A0A0F]/70 p-3 rounded-xl border border-[#D4A84B]/25">
                          “{card.uprightOmen}”
                        </p>
                        <p className="font-mono text-[10px] text-[#8E9BB5]">
                          Signifier: <span className="text-[#D4A84B]">{card.astrologicalSignifier}</span>
                        </p>
                      </div>

                      <Link
                        to={card.to}
                        onClick={() => playSuzuChime()}
                        className="inline-flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold uppercase transition-colors"
                      >
                        <span>Fulfill Omen in {card.title}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </section>
      )}

      {/* FRONT TAROT CARD DECK SECTION (THE SIX CELESTIAL ARCANA) */}
      <section aria-labelledby="tarot-deck-heading" className="relative max-w-7xl mx-auto px-4 sm:px-8 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 border-b border-[#D4A84B]/25 pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
              <Sparkles className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>月読六大アルカナ · THE SIX CELESTIAL TAROT ARCANA</span>
            </div>
            <h2 id="tarot-deck-heading" className="font-serif text-3xl sm:text-4xl font-bold text-[#F4EFE3]">
              Choose Your Celestial Arcana Card
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] max-w-2xl">
              Each realm of Tsukuyomi Watch is forged as a Samurai Celestial Tarot card. Click a card to enter its sanctuary, or tap <span className="text-[#D4A84B] font-mono">Flip Lore (裏絵)</span> to read its historical Japanese star lore and upright omen.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => {
                playSuzuChime();
                const anyFlipped = Object.values(flippedCards).some(Boolean);
                if (anyFlipped) {
                  setFlippedCards({});
                } else {
                  const all: Record<string, boolean> = {};
                  TAROT_ARCANA.forEach((c) => {
                    all[c.to] = true;
                  });
                  setFlippedCards(all);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0E1326] border border-[#D4A84B]/40 hover:border-[#D4A84B] text-xs font-mono text-[#D4A84B] hover:text-[#F4EFE3] transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {Object.values(flippedCards).some(Boolean)
                  ? 'Turn All Cards Face-Up'
                  : 'Flip All Cards to Lore Side'}
              </span>
            </button>
          </div>
        </div>

        {/* 6 Ornate Vertical Tarot Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {TAROT_ARCANA.map((card) => {
            const {
              to,
              num,
              roman,
              arcanaName,
              kanji,
              verticalSeal,
              title,
              sub,
              desc,
              uprightOmen,
              astrologicalSignifier,
              historicalLore,
              artworkUrl,
              Icon,
            } = card;
            const isFlipped = !!flippedCards[to];

            return (
              <div
                key={to}
                className={`group relative rounded-[26px] p-[3px] bg-gradient-to-b from-[#D4A84B]/80 via-[#D4A84B]/35 to-[#B3202A]/70 shadow-[0_0_32px_rgba(10,10,15,0.9)] hover:shadow-[0_0_38px_rgba(212,168,75,0.32)] transition-all duration-300 ${
                  !calm ? 'hover:-translate-y-1.5' : ''
                }`}
              >
                {/* Inner Tarot Card Container */}
                <div className="relative h-full min-h-[510px] rounded-[23px] tarot-card-surface p-4 flex flex-col justify-between overflow-hidden border border-[#0A0A0F]">
                  {/* Outer Inner Double Gold Filigree Line */}
                  <div className="pointer-events-none absolute inset-2.5 rounded-[17px] border border-[#D4A84B]/40 group-hover:border-[#D4A84B]/80 transition-colors" />

                  {/* 4 Tarot Corner Celestial Ornaments */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-4 left-4 text-[#D4A84B] text-xs font-mono select-none"
                  >
                    ✦
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-4 right-4 text-[#D4A84B] text-xs font-mono select-none"
                  >
                    ✦
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-4 left-4 text-[#D4A84B] text-xs font-mono select-none"
                  >
                    ✦
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-4 right-4 text-[#D4A84B] text-xs font-mono select-none"
                  >
                    ✦
                  </span>

                  {/* Top Roman Numeral & Arcana Header Plaque */}
                  <div className="relative z-10 flex items-center justify-between px-3 pt-1.5 pb-2.5 border-b border-[#D4A84B]/30">
                    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8E9BB5]">
                      NO. {num}
                    </span>
                    <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#0A0A0F]/90 border border-[#D4A84B]/50">
                      <span className="font-serif text-xs font-bold tracking-[0.22em] text-[#D4A84B]">
                        {roman} · {arcanaName}
                      </span>
                    </div>
                    <span className="font-kanji text-xs text-[#D4A84B] font-bold">{kanji}</span>
                  </div>

                  {!isFlipped ? (
                    /* ================= FRONT OF TAROT CARD ================= */
                    <div className="relative z-10 flex-1 flex flex-col justify-between pt-3 px-1.5">
                      {/* Arched Tarot Illustration Window */}
                      <Link
                        to={to}
                        onClick={() => playSuzuChime()}
                        className="relative block w-full h-52 rounded-t-[90px] rounded-b-xl overflow-hidden border-2 border-[#D4A84B]/60 group-hover:border-[#D4A84B] transition-all shadow-inner bg-[#0A0A0F] focus-visible:outline-none"
                      >
                        <img
                          src={artworkUrl}
                          alt={title}
                          className={`w-full h-full object-cover object-center transition-transform duration-700 ${
                            !calm ? 'group-hover:scale-110' : ''
                          }`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F1F] via-[#0B0F1F]/25 to-transparent" />

                        {/* Sacred Geometry Sun/Moon Halo inside the Tarot Arch */}
                        <svg
                          viewBox="0 0 200 200"
                          className="pointer-events-none absolute inset-0 w-full h-full opacity-35 group-hover:opacity-65 transition-opacity"
                        >
                          <circle
                            cx="100"
                            cy="88"
                            r="58"
                            fill="none"
                            stroke="#D4A84B"
                            strokeWidth="0.9"
                            strokeDasharray="3 3"
                          />
                          <circle
                            cx="100"
                            cy="88"
                            r="44"
                            fill="none"
                            stroke="#F4EFE3"
                            strokeWidth="0.6"
                          />
                          <polygon
                            points="100,26 105,40 120,40 108,48 112,62 100,53 88,62 92,48 80,40 95,40"
                            fill="none"
                            stroke="#D4A84B"
                            strokeWidth="0.8"
                          />
                        </svg>

                        {/* Vertical Kanji Calligraphy Seal Strip on Right Edge */}
                        <div className="absolute top-3 right-3 px-1.5 py-2 rounded bg-[#0A0A0F]/85 border border-[#D4A84B]/50 text-[10px] font-kanji text-[#D4A84B] leading-tight tracking-widest [writing-mode:vertical-rl]">
                          {verticalSeal}
                        </div>

                        {/* Center Floating Kamon Medallion at Base of Arch */}
                        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-[#0A0A0F]/95 border-2 border-[#D4A84B] flex items-center justify-center shadow-[0_0_18px_rgba(212,168,75,0.5)]">
                          <Icon className="w-5 h-5 text-[#D4A84B]" />
                        </div>
                      </Link>

                      {/* Tarot Title, Subtitle, Description & Upright Omen */}
                      <div className="text-center space-y-2 pt-3 px-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#D4A84B]">
                          {sub}
                        </p>
                        <h3 className="font-serif text-2xl font-bold text-[#F4EFE3] group-hover:text-[#D4A84B] transition-colors">
                          {title}
                        </h3>
                        <p className="font-sans text-xs text-[#8E9BB5] leading-relaxed line-clamp-3">
                          {desc}
                        </p>

                        {/* Upright Divination Meaning Banner */}
                        <div className="mt-2 pt-2 border-t border-[#D4A84B]/20">
                          <p className="font-serif text-[11px] italic text-[#F4EFE3]/85">
                            “{uprightOmen}”
                          </p>
                        </div>
                      </div>

                      {/* Bottom Tarot Card Actions: Flip to Lore Back vs Enter Realm */}
                      <div className="pt-3 mt-2 border-t border-[#D4A84B]/30 flex items-center justify-between gap-2 px-1">
                        <button
                          type="button"
                          onClick={(e) => toggleFlipCard(to, e)}
                          className="px-3 py-1.5 rounded-lg bg-[#0A0A0F]/90 hover:bg-[#151B38] border border-[#D4A84B]/35 hover:border-[#D4A84B] text-[11px] font-mono text-[#D4A84B] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                          title="Flip Tarot card to read historical Japanese star lore"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Flip Lore · 裏絵</span>
                        </button>

                        <Link
                          to={to}
                          onClick={() => playSuzuChime()}
                          className="px-3.5 py-1.5 rounded-lg bg-[#D4A84B] hover:bg-[#e5bc63] text-[#0A0A0F] font-mono text-[11px] font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                        >
                          <span>Enter</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    /* ================= BACK OF TAROT CARD (HISTORICAL LORE & DIVINATION) ================= */
                    <div className="relative z-10 flex-1 flex flex-col justify-between pt-3 px-2 tarot-card-back-surface rounded-xl my-2 p-4 border border-[#D4A84B]/40 animate-in fade-in">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between border-b border-[#D4A84B]/25 pb-2">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-[#D4A84B]">
                            ARCANA {roman} · BACK OF CARD
                          </span>
                          <span className="font-kanji text-sm text-[#D4A84B]">{kanji}</span>
                        </div>

                        <div className="text-center py-2">
                          <div className="w-12 h-12 rounded-full bg-[#0A0A0F] border-2 border-[#D4A84B] flex items-center justify-center mx-auto mb-2 shadow-[0_0_20px_rgba(212,168,75,0.35)]">
                            <Icon className="w-5 h-5 text-[#D4A84B]" />
                          </div>
                          <h3 className="font-serif text-xl font-bold text-[#F4EFE3]">{title}</h3>
                          <p className="font-mono text-[10px] text-[#D4A84B] uppercase tracking-widest mt-0.5">
                            {arcanaName} · {verticalSeal}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-[#0A0A0F]/85 border border-[#151B38] space-y-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#D4A84B] block font-bold">
                            Historical Samurai & Court Origin
                          </span>
                          <p className="font-sans text-xs text-[#F4EFE3]/90 leading-relaxed">
                            {historicalLore}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-[#0A0A0F]/85 border border-[#151B38] space-y-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#B3202A] block font-bold">
                            Upright Omen & Signifier
                          </span>
                          <p className="font-serif text-xs italic text-[#F4EFE3]/90">
                            “{uprightOmen}”
                          </p>
                          <p className="font-mono text-[10px] text-[#8E9BB5] pt-1">
                             ruling star: <span className="text-[#D4A84B]">{astrologicalSignifier}</span>
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#D4A84B]/30 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => toggleFlipCard(to, e)}
                          className="px-3 py-1.5 rounded-lg bg-[#0A0A0F] border border-[#D4A84B]/40 hover:border-[#D4A84B] text-[11px] font-mono text-[#F4EFE3] cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3 h-3 text-[#D4A84B]" />
                          <span>Front Face</span>
                        </button>

                        <Link
                          to={to}
                          onClick={() => playSuzuChime()}
                          className="px-3.5 py-1.5 rounded-lg bg-[#D4A84B] hover:bg-[#e5bc63] text-[#0A0A0F] font-mono text-[11px] font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                        >
                          <span>Open {title}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* HISTORY & CHRONICLES SECTION (Japanese Astronomical History + Personal Watch/Restoration History) */}
      <section
        id="history"
        aria-labelledby="history-heading"
        className="relative max-w-7xl mx-auto px-4 sm:px-8 pb-20 pt-4 border-t border-[#D4A84B]/20"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pt-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
              <History className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>日本天文史と観測記録 · CELESTIAL HISTORY & PERSONAL CHRONICLE</span>
            </div>
            <h2 id="history-heading" className="font-serif text-3xl sm:text-4xl font-bold text-[#F4EFE3] mt-1">
              History of Japanese Astronomy & Your Watch Ledger
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl">
              Explore 1,300 years of recorded Japanese astronomical observations—from 7th-century Imperial comet scrolls to Edo-period star planispheres—alongside your own saved restorations and stargazing history.
            </p>
          </div>

          <ScrollPageControls
            panelIds={[
              'japanese-astronomy-history',
              'personal-watch-history',
              'daily-folklore-scroll',
            ]}
          />
        </div>

        <div className="space-y-6">
          {/* 1. Historical Japanese Astronomy & Samurai Star Lore ScrollPanel */}
          <ScrollPanel
            id="japanese-astronomy-history"
            title="Chronicles of Japanese Astronomy (684–1800 CE)"
            kanji="歴史"
            subtitle="Imperial Onmyōryō records, Heian supernovae, samurai star tests & Edo calendars"
            icon={BookOpen}
            defaultOpen={true}
          >
            <div className="space-y-6">
              {/* Era Filter Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0A0A0F]/80 border border-[#151B38] p-3.5 rounded-2xl">
                <span className="font-mono text-xs text-[#D4A84B] uppercase tracking-wider font-bold">
                  Filter Historical Era:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'all', label: 'All Eras (684–1800 CE)' },
                      { id: 'asuka-nara', label: 'Asuka & Nara (684–712 CE)' },
                      { id: 'heian', label: 'Heian Court (1002–1054 CE)' },
                      { id: 'samurai', label: 'Kamakura & Sengoku Samurai' },
                      { id: 'edo', label: 'Edo Shogunate (1684 CE)' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        playSuzuChime();
                        setEraFilter(tab.id);
                      }}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors cursor-pointer ${
                        eraFilter === tab.id
                          ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold'
                          : 'bg-[#0E1326] text-[#8E9BB5] hover:text-[#F4EFE3] border border-[#151B38]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Historical Timeline Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredMilestones.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl bg-[#0A0A0F]/85 border border-[#D4A84B]/35 hover:border-[#D4A84B] p-5 flex flex-col justify-between space-y-4 transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#151B38] pb-2.5 text-[11px] font-mono">
                        <span className="text-[#D4A84B] font-bold">
                          {item.year} · {item.eraLabel}
                        </span>
                        <span className="text-[#8E9BB5]">{item.sourceChronicle}</span>
                      </div>

                      <div>
                        <h3 className="font-serif text-xl font-bold text-[#F4EFE3]">{item.title}</h3>
                        <p className="font-kanji text-xs text-[#D4A84B] mt-0.5">{item.japanese}</p>
                      </div>

                      <p className="font-sans text-xs sm:text-sm text-[#F4EFE3]/90 leading-relaxed">
                        {item.summary}
                      </p>

                      <div className="p-3 rounded-xl bg-[#0E1326]/90 border border-[#151B38] space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#D4A84B] block font-bold">
                          Samurai & Imperial Star Lore · 伝承
                        </span>
                        <p className="font-sans text-xs text-[#8E9BB5] leading-relaxed">
                          {item.folklore}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#151B38] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-[#8E9BB5] text-[11px]">
                        {item.constellation} · {item.coordinates}
                      </span>

                      <Link
                        to={`/stargazer?date=${encodeURIComponent(item.targetDateIso)}&az=${item.azDeg}&alt=${item.altDeg}&fov=65&label=${encodeURIComponent(item.title)}`}
                        onClick={() => playSuzuChime()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] text-[11px] font-bold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View in Star Gazer</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </ScrollPanel>

          {/* 2. Personal Watch & Restoration History ScrollPanel */}
          <ScrollPanel
            id="personal-watch-history"
            title="Your Watch & Restoration History"
            kanji="履歴"
            subtitle={`${restorationHistory.length} saved restorations · ${honorState.history.length} recorded deeds`}
            icon={History}
            defaultOpen={true}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Spirit Lens Restoration History (IndexedDB) */}
              <div className="rounded-2xl bg-[#0A0A0F]/85 border border-[#D4A84B]/35 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4A84B] block font-bold">
                      SPIRIT LENS ARCHIVE · 霊鏡復元履歴
                    </span>
                    <h3 className="font-serif text-lg font-bold text-[#F4EFE3]">
                      Saved Astrophotography Plates ({restorationHistory.length})
                    </h3>
                  </div>
                  {restorationHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        playSuzuChime();
                        void clearHistory();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0E1326] border border-[#B3202A]/50 hover:border-[#B3202A] text-[10px] font-mono text-[#F87171] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {restorationHistory.length > 0 ? (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {restorationHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#0E1326] border border-[#151B38] hover:border-[#D4A84B]/50 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={item.result.restoredImageDataUrl}
                            alt={item.captureTitle}
                            className="w-14 h-10 rounded-lg object-cover border border-[#D4A84B]/40 shrink-0 bg-[#0A0A0F]"
                          />
                          <div className="min-w-0">
                            <p className="font-serif text-xs font-bold text-[#F4EFE3] truncate">
                              {item.captureTitle}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-[#8E9BB5] mt-0.5 tabular-nums">
                              <span className="inline-flex items-center gap-1 text-[#D4A84B]">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(item.savedAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span>·</span>
                              <span>
                                {item.result.counts.stars} stars · {item.result.counts.galaxies} galaxies
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            playSuzuChime();
                            selectHistoryEntry(item);
                            navigate('/dojo');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer shrink-0"
                        >
                          Open in Dojo
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-2">
                    <p className="font-mono text-xs text-[#8E9BB5]">
                      No restored space captures recorded yet ({factsData.length} folklore scrolls available).
                    </p>
                    <Link
                      to="/lens"
                      onClick={() => playSuzuChime()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold transition-colors"
                    >
                      <Telescope className="w-3.5 h-3.5" />
                      <span>Restore a Capture in Spirit Lens</span>
                    </Link>
                  </div>
                )}
              </div>

              {/* Right Column: Imperial Honor & Observation Ledger (localStorage) */}
              <div className="rounded-2xl bg-[#0A0A0F]/85 border border-[#D4A84B]/35 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4A84B] block font-bold">
                      WARRIOR LEDGER · 勲功観測記録
                    </span>
                    <h3 className="font-serif text-lg font-bold text-[#F4EFE3]">
                      Recent Stargazing & Honor Deeds ({honorState.history.length})
                    </h3>
                  </div>
                  <Link
                    to="/honor"
                    onClick={() => playSuzuChime()}
                    className="font-mono text-[11px] text-[#D4A84B] hover:underline"
                  >
                    Full Ledger ({honorState.points.toLocaleString()} PTS) →
                  </Link>
                </div>

                {honorState.history.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1 font-mono text-xs tabular-nums">
                    {honorState.history.slice(0, 10).map((entry) => (
                      <div
                        key={entry.id}
                        className="px-3.5 py-2.5 rounded-xl bg-[#0E1326] border border-[#151B38] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="text-[#F4EFE3] truncate block">{entry.label}</span>
                          <span className="text-[10px] text-[#8E9BB5] block mt-0.5">
                            {entry.type.replace(/_/g, ' ')} ·{' '}
                            {new Date(entry.timestamp).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <span className="text-[#D4A84B] font-bold shrink-0">+{entry.points} PTS</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-2">
                    <p className="font-mono text-xs text-[#8E9BB5]">
                      Your observation ledger awaits its first entry tonight.
                    </p>
                    <Link
                      to="/watchtower"
                      onClick={() => playSuzuChime()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-xs font-bold transition-colors"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Scout Tonight’s Sky in the Watchtower</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </ScrollPanel>

          {/* 3. Daily Celestial Fact & Folklore ScrollPanel */}
          <ScrollPanel
            id="daily-folklore-scroll"
            title="Celestial Fact & Folklore of the Day"
            kanji="伝承"
            subtitle="Daily rotating Japanese star lore & astrophysical ephemeris"
            icon={Scroll}
            defaultOpen={true}
          >
            <CelestialFactOfTheDay />
          </ScrollPanel>
        </div>
      </section>
    </div>
  );
};
