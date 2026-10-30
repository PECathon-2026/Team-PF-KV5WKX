import React, { useState, useEffect } from 'react';
import {
  Award,
  Sparkles,
  Shield,
  Flame,
  Bell,
  Eye,
  Compass,
  CheckCircle2,
  ScrollText,
} from 'lucide-react';
import {
  HONOR_RANKS,
  HonorState,
  ComputedBadge,
  getHonorState,
  subscribeToHonorChanges,
  getRankForPoints,
  computeBadges,
  awardAlertSetPoints,
  awardEventObservedPoints,
  awardVisitTopSpotPoints,
  awardImageRestoredPoints,
  awardStarGazerDailyPoints,
} from '../utils/honorSystem';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import { ScrollPanel, ScrollPageControls } from './common/ScrollPanel';

export const HonorPointsSection: React.FC = () => {
  const [honorState, setHonorState] = useState<HonorState>(() => getHonorState());
  const [selectedBadgeId, setSelectedBadgeId] = useState<string>('vigil-keeper');
  const [actionToast, setActionToast] = useState<string | null>(null);

  useEffect(() => {
    setHonorState(getHonorState());
    return subscribeToHonorChanges((nextState) => {
      setHonorState(nextState);
    });
  }, []);

  const {
    currentRank,
    nextRank,
    progressPercent,
    pointsNeededForNextRank,
  } = getRankForPoints(honorState.points);

  const badges = computeBadges(honorState);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  // Overall progress bar across the 4 ranks (0 -> 3000+)
  const overallScalePct = Math.min(100, Math.round((honorState.points / 3000) * 100));

  const triggerHonorFeedback = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 4000);
  };

  const handleQuickAwardAlert = () => {
    playSuzuChime();
    const id = `scroll-vigil-${honorState.alertsSetIds.length + 1}`;
    const res = awardAlertSetPoints(id, `Lunar Ephemeris Vigil #${honorState.alertsSetIds.length + 1}`);
    if (res.awarded) {
      triggerHonorFeedback(`+${res.pointsAdded} Honor Points · Night Watch Alert Armed`);
    }
  };

  const handleQuickAwardObserve = () => {
    playKotoNote(587.33, 1.1);
    const id = `observed-celestial-${honorState.observedEventIds.length + 1}`;
    const res = awardEventObservedPoints(
      id,
      `Celestial Observation Log #${honorState.observedEventIds.length + 1}`
    );
    if (res.awarded) {
      triggerHonorFeedback(`+${res.pointsAdded} Honor Points · Celestial Event Marked Observed`);
    }
  };

  const handleQuickAwardVisitSpot = () => {
    playKotoNote(523.25, 1.1);
    const id = `sanctuary-peak-${honorState.visitedSpotIds.length + 1}`;
    const res = awardVisitTopSpotPoints(
      id,
      `Dark-Sky Peak Sanctuary #${honorState.visitedSpotIds.length + 1}`,
      94
    );
    if (res.awarded) {
      triggerHonorFeedback(`+${res.pointsAdded} Honor Points · Top-Rated Sanctuary Visited`);
    }
  };

  const handleQuickAwardRestore = () => {
    playKotoNote(659.25, 1.3);
    const res = awardImageRestoredPoints(
      `Deep-Sky Plate #${honorState.restoredCount + 1} (RL Deconvolution)`
    );
    if (res.awarded) {
      triggerHonorFeedback(`+${res.pointsAdded} Honor Points · Faithful Astro-Restoration Logged`);
    }
  };

  const handleQuickAwardStarGazer = () => {
    playSuzuChime();
    const res = awardStarGazerDailyPoints('Observatory Dome');
    if (res.awarded) {
      triggerHonorFeedback(`+${res.pointsAdded} Honor Points · Daily Star Gazer Vigil Recorded (${res.dateKey})`);
    } else {
      triggerHonorFeedback(`Daily Star Gazer Vigil already claimed for ${res.dateKey} (1× per day)`);
    }
  };

  const renderCrestSvg = (type: ComputedBadge['svgType'], unlocked: boolean) => {
    const strokeColor = unlocked ? '#D4A84B' : '#8E9BB5';
    switch (type) {
      case 'moon':
        return (
          <svg className="w-12 h-12" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="26" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 3" />
            <path
              d="M36 16C26 18 20 28 24 38C27 45 35 48 42 45C33 49 21 45 17 35C13 25 18 14 28 11C31 10 34 13 36 16Z"
              fill={strokeColor}
              fillOpacity="0.85"
            />
          </svg>
        );
      case 'meteor':
        return (
          <svg className="w-12 h-12" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="26" stroke={strokeColor} strokeWidth="1.5" />
            <path d="M15 45L45 15M25 45L45 25M15 35L35 15" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
            <circle cx="20" cy="40" r="4" fill="#B3202A" />
          </svg>
        );
      case 'watchtower':
        return (
          <svg className="w-12 h-12" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="26" stroke={strokeColor} strokeWidth="1.5" />
            <path d="M12 44L30 16L48 44H12Z" stroke={strokeColor} strokeWidth="1.8" fill={strokeColor} fillOpacity="0.2" />
            <circle cx="30" cy="13" r="3" fill="#B3202A" />
          </svg>
        );
      case 'nebula':
        return (
          <svg className="w-12 h-12" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="26" stroke={strokeColor} strokeWidth="1.5" />
            <ellipse cx="30" cy="30" rx="18" ry="8" transform="rotate(30 30 30)" stroke={strokeColor} strokeWidth="1.5" />
            <ellipse cx="30" cy="30" rx="18" ry="8" transform="rotate(-30 30 30)" stroke={strokeColor} strokeWidth="1.5" />
            <circle cx="30" cy="30" r="4" fill={strokeColor} />
          </svg>
        );
      case 'eclipse':
        return (
          <svg className="w-12 h-12" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="24" stroke="#B3202A" strokeWidth="2" />
            <circle cx="30" cy="30" r="16" fill="#0A0A0F" stroke={strokeColor} strokeWidth="2" />
          </svg>
        );
      case 'shogun':
        return (
          <svg className="w-12 h-12" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="26" stroke={strokeColor} strokeWidth="2" />
            <polygon
              points="30,10 35,23 49,23 38,31 42,45 30,37 18,45 22,31 11,23 25,23"
              stroke={strokeColor}
              strokeWidth="1.5"
              fill={unlocked ? '#D4A84B' : 'none'}
              fillOpacity="0.35"
            />
          </svg>
        );
    }
  };

  return (
    <section
      id="honor"
      className="relative py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-[#D4A84B]/20"
    >
      {/* Chapter 05 Header */}
      <div className="border-b border-[#D4A84B]/25 pb-6 mb-10">
        <div className="flex items-center space-x-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
          <span>05. WAY OF THE ASTRONOMER · 天文武士道</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2">
          <div>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#F4EFE3] text-glow-moon">
              Honor Points & Warrior Crests
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl leading-relaxed">
              Ascend through the four Shogunate ranks (<span className="text-[#F4EFE3]">Ashigaru</span>,{' '}
              <span className="text-[#F4EFE3]">Samurai</span>,{' '}
              <span className="text-[#F4EFE3]">Daimyo</span>,{' '}
              <span className="text-[#D4A84B]">Shogun</span>) by setting alerts, observing celestial events, visiting top-rated sanctuaries, and restoring space captures. Persisted in localStorage.
            </p>
          </div>

          <div className="flex items-center space-x-3 font-mono text-xs tabular-nums">
            <span className="px-3.5 py-1.5 rounded-xl bg-[#0E1326] border border-[#D4A84B]/50 text-[#D4A84B] font-bold">
              UNLOCKED CRESTS: {unlockedCount} / {badges.length}
            </span>
          </div>
        </div>
      </div>

      {/* Live Toast Feedback Banner */}
      {actionToast && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#D4A84B]/15 border border-[#D4A84B] flex items-center justify-between text-xs font-mono text-[#F4EFE3] shadow-lg">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#D4A84B] shrink-0" />
            <span>{actionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast(null)}
            className="text-[#8E9BB5] hover:text-[#F4EFE3] ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <ScrollPageControls
        panelIds={['rank-progress', 'earn-honor', 'warrior-crests', 'honor-chronicle']}
        className="mb-8"
      />

      <div className="space-y-6">
        {/* 1. Rank & Progress ScrollPanel */}
        <ScrollPanel
          id="rank-progress"
          title="Rank & Progress"
          kanji={currentRank.kanji}
          subtitle={`${currentRank.name} · ${honorState.points.toLocaleString()} PTS`}
          icon={Flame}
          defaultOpen={true}
        >
          {/* Main Progression Banner & 4-Rank Stepper */}
          <div className="bg-gradient-to-br from-[#0E1326] via-[#151B38]/60 to-[#0A0A0F] border border-[#D4A84B]/50 rounded-3xl p-6 sm:p-10 shadow-[0_0_35px_rgba(212,168,75,0.18)] relative overflow-hidden">
            {/* Subtle Background Kanji Watermark */}
            <span className="absolute -right-6 -bottom-10 font-kanji text-[140px] text-[#F4EFE3]/[0.03] select-none pointer-events-none">
              {currentRank.kanji}
            </span>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          {/* Left: Current Rank Emblem & Points Readout (5 cols) */}
          <div className="lg:col-span-5 flex items-center space-x-5">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#B3202A]/20 border-2 border-[#D4A84B] flex flex-col items-center justify-center shrink-0 shadow-[0_0_25px_rgba(212,168,75,0.4)]">
              <span className="font-kanji text-2xl sm:text-3xl font-bold text-[#D4A84B]">
                {currentRank.kanji}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#F4EFE3] mt-0.5">
                {currentRank.name.toUpperCase()}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-[#D4A84B] block">
                CURRENT WARRIOR RANK
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#F4EFE3]">
                {currentRank.name} · {currentRank.kanji}
              </h3>
              <p className="font-sans text-xs text-[#8E9BB5]">{currentRank.subtitle}</p>
              <div className="flex items-center space-x-2 text-sm font-mono text-[#8E9BB5] pt-1 tabular-nums">
                <Flame className="w-4 h-4 text-[#B3202A]" />
                <span>Total Honor:</span>
                <span className="text-[#D4A84B] font-bold text-lg">
                  {honorState.points.toLocaleString()} PTS
                </span>
              </div>
            </div>
          </div>

          {/* Right: 4-Tier Rank Progression Bar (Ashigaru -> Samurai -> Daimyo -> Shogun) (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* 4-Step Rank Stepper Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
              {HONOR_RANKS.map((tier) => {
                const isReached = honorState.points >= tier.minPoints;
                const isCurrent = currentRank.name === tier.name;
                return (
                  <div
                    key={tier.name}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-[#151B38] border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.3)]'
                        : isReached
                        ? 'bg-[#0E1326]/90 border-[#D4A84B]/50'
                        : 'bg-[#0A0A0F]/60 border-[#151B38] opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-bold ${
                          isCurrent
                            ? 'text-[#D4A84B]'
                            : isReached
                            ? 'text-[#F4EFE3]'
                            : 'text-[#8E9BB5]'
                        }`}
                      >
                        {tier.name}
                      </span>
                      <span className="font-kanji text-[11px] text-[#D4A84B]">{tier.kanji}</span>
                    </div>
                    <span className="text-[10px] text-[#8E9BB5] block mt-0.5">
                      {tier.minPoints.toLocaleString()} PTS
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Next Rank Tier Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                <span className="text-[#D4A84B] font-bold uppercase tracking-wider">
                  {nextRank
                    ? `PROGRESS TO ${nextRank.name.toUpperCase()} (${nextRank.kanji}): ${progressPercent}%`
                    : 'SUPREME SHOGUNATE RANK ACHIEVED (100%)'}
                </span>
                <span className="text-[#F4EFE3]">
                  {nextRank
                    ? `${pointsNeededForNextRank.toLocaleString()} PTS TO ${nextRank.name.toUpperCase()}`
                    : `${honorState.points.toLocaleString()} / 3,000+ PTS`}
                </span>
              </div>

              <div className="w-full h-4 bg-[#0A0A0F] rounded-full overflow-hidden border border-[#151B38] p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#B3202A] via-[#D4A84B] to-[#F4EFE3] rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(212,168,75,0.6)]"
                  style={{ width: `${nextRank ? progressPercent : overallScalePct}%` }}
                />
              </div>
            </div>

            {/* Counter Pills for the 4 Honor Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] tabular-nums">
              <div className="px-3 py-2 rounded-xl bg-[#0A0A0F]/80 border border-[#151B38] flex items-center justify-between">
                <span className="text-[#8E9BB5]">Alerts Set</span>
                <span className="text-[#D4A84B] font-bold">{honorState.alertsSetIds.length}</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#0A0A0F]/80 border border-[#151B38] flex items-center justify-between">
                <span className="text-[#8E9BB5]">Observed</span>
                <span className="text-[#D4A84B] font-bold">{honorState.observedEventIds.length}</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#0A0A0F]/80 border border-[#151B38] flex items-center justify-between">
                <span className="text-[#8E9BB5]">Spots Visited</span>
                <span className="text-[#D4A84B] font-bold">{honorState.visitedSpotIds.length}</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-[#0A0A0F]/80 border border-[#151B38] flex items-center justify-between">
                <span className="text-[#8E9BB5]">Restorations</span>
                <span className="text-[#D4A84B] font-bold">{honorState.restoredCount}</span>
              </div>
            </div>
          </div>
        </div>
          </div>
        </ScrollPanel>

        {/* 2. Earn Honor Points ScrollPanel */}
        <ScrollPanel
          id="earn-honor"
          title="Earn Honor Points"
          kanji="武功"
          subtitle="Four paths of astronomical honor"
          icon={Sparkles}
          defaultOpen={false}
        >
          {/* Earn Honor Points Action Bar (Connected directly to localStorage Honor Engine) */}
          <div className="bg-[#0E1326] border border-[#D4A84B]/35 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#151B38] pb-3">
              <div>
                <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-widest font-bold block">
                  FOUR PATHS OF ASTRONOMICAL HONOR · 武功の四道
                </span>
                <p className="font-sans text-xs text-[#8E9BB5] mt-0.5">
                  Points are automatically awarded across the Watchtower, Celestial Scroll, and Spirit Lens—or log a field deed below:
                </p>
              </div>
          <span className="font-mono text-[11px] text-[#D4A84B] tabular-nums">
            LOCALSTORAGE SYNC ACTIVE
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={handleQuickAwardAlert}
            className="p-3.5 rounded-xl bg-[#0A0A0F] hover:bg-[#151B38] border border-[#151B38] hover:border-[#D4A84B] transition-all flex items-center justify-between group cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <Bell className="w-4 h-4 text-[#D4A84B] shrink-0" />
              <div>
                <span className="text-[#F4EFE3] font-bold block group-hover:text-[#D4A84B]">
                  Set Ephemeris Alert
                </span>
                <span className="text-[10px] text-[#8E9BB5]">Celestial Scroll</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#D4A84B]/20 text-[#D4A84B] font-bold tabular-nums">
              +75
            </span>
          </button>

          <button
            type="button"
            onClick={handleQuickAwardObserve}
            className="p-3.5 rounded-xl bg-[#0A0A0F] hover:bg-[#151B38] border border-[#151B38] hover:border-[#D4A84B] transition-all flex items-center justify-between group cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <Eye className="w-4 h-4 text-[#D4A84B] shrink-0" />
              <div>
                <span className="text-[#F4EFE3] font-bold block group-hover:text-[#D4A84B]">
                  Mark Event Observed
                </span>
                <span className="text-[10px] text-[#8E9BB5]">Imperial Sighting</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#D4A84B]/20 text-[#D4A84B] font-bold tabular-nums">
              +150
            </span>
          </button>

          <button
            type="button"
            onClick={handleQuickAwardVisitSpot}
            className="p-3.5 rounded-xl bg-[#0A0A0F] hover:bg-[#151B38] border border-[#151B38] hover:border-[#D4A84B] transition-all flex items-center justify-between group cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <Compass className="w-4 h-4 text-[#D4A84B] shrink-0" />
              <div>
                <span className="text-[#F4EFE3] font-bold block group-hover:text-[#D4A84B]">
                  Visit Top-Rated Spot
                </span>
                <span className="text-[10px] text-[#8E9BB5]">Watchtower Sanctuary</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#D4A84B]/20 text-[#D4A84B] font-bold tabular-nums">
              +125
            </span>
          </button>

          <button
            type="button"
            onClick={handleQuickAwardRestore}
            className="p-3.5 rounded-xl bg-[#0A0A0F] hover:bg-[#151B38] border border-[#151B38] hover:border-[#D4A84B] transition-all flex items-center justify-between group cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <Sparkles className="w-4 h-4 text-[#D4A84B] shrink-0" />
              <div>
                <span className="text-[#F4EFE3] font-bold block group-hover:text-[#D4A84B]">
                  Restore Space Capture
                </span>
                <span className="text-[10px] text-[#8E9BB5]">Spirit Lens Deconvolve</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#D4A84B]/20 text-[#D4A84B] font-bold tabular-nums">
              +200
            </span>
          </button>

          <button
            type="button"
            onClick={handleQuickAwardStarGazer}
            className="p-3.5 rounded-xl bg-[#0A0A0F] hover:bg-[#151B38] border border-[#151B38] hover:border-[#D4A84B] transition-all flex items-center justify-between group cursor-pointer text-left sm:col-span-2 lg:col-span-4"
          >
            <div className="flex items-center space-x-2.5">
              <Sparkles className="w-4 h-4 text-[#D4A84B] shrink-0" />
              <div>
                <span className="text-[#F4EFE3] font-bold block group-hover:text-[#D4A84B]">
                  Open The Star Gazer (Daily Sky Vigil)
                </span>
                <span className="text-[10px] text-[#8E9BB5]">
                  Awarded automatically once per day when opening The Star Gazer ({honorState.starGazerDaysCount || 0} days logged)
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#D4A84B]/20 text-[#D4A84B] font-bold tabular-nums">
              +100 / DAY
            </span>
          </button>
        </div>
          </div>
        </ScrollPanel>

        {/* 3. Warrior Crests ScrollPanel */}
        <ScrollPanel
          id="warrior-crests"
          title="Warrior Crests"
          kanji="家紋"
          subtitle={`${unlockedCount} / ${badges.length} crests unlocked`}
          icon={Award}
          defaultOpen={false}
        >
          {/* Warrior Crests / Badges Grid (6 Dynamic Badges) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {badges.map((badge) => {
          const isSelected = selectedBadgeId === badge.id;
          const pct = Math.min(
            100,
            Math.round((badge.progressCurrent / Math.max(1, badge.progressTarget)) * 100)
          );

          return (
            <div
              key={badge.id}
              onClick={() => {
                playSuzuChime();
                setSelectedBadgeId(badge.id);
              }}
              className={`p-6 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                badge.unlocked
                  ? isSelected
                    ? 'bg-[#0E1326] border-[#D4A84B] shadow-[0_0_25px_rgba(212,168,75,0.3)] scale-[1.01]'
                    : 'bg-[#0E1326]/80 border-[#151B38] hover:border-[#D4A84B]/60'
                  : 'bg-[#0A0A0F]/60 border-[#151B38]/60 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-start space-x-4">
                {/* Kamon SVG Crest */}
                <div className="p-3 rounded-2xl bg-[#0A0A0F] border border-[#151B38] shrink-0 flex items-center justify-center">
                  {renderCrestSvg(badge.svgType, badge.unlocked)}
                </div>

                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 rounded bg-[#151B38] text-[#D4A84B] font-bold">
                      {badge.tier}
                    </span>
                    {badge.unlocked ? (
                      <span className="text-[10px] font-mono text-[#34D399] flex items-center space-x-1 font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>UNLOCKED</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#8E9BB5]">LOCKED</span>
                    )}
                  </div>

                  <h4 className="font-serif text-lg font-bold text-[#F4EFE3] pt-1 truncate">
                    {badge.name}
                  </h4>
                  <span className="font-kanji text-xs text-[#D4A84B] block">{badge.kanji}</span>
                  <p className="font-sans text-xs text-[#8E9BB5] leading-relaxed pt-1">
                    {badge.description}
                  </p>
                </div>
              </div>

              {/* Badge Requirement & Progress Bar */}
              <div className="space-y-1.5 pt-2 border-t border-[#151B38] font-mono text-[10px] tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-[#8E9BB5]">Requirement</span>
                  <span className={badge.unlocked ? 'text-[#D4A84B] font-bold' : 'text-[#F4EFE3]'}>
                    {badge.requirementText}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#0A0A0F] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      badge.unlocked ? 'bg-[#D4A84B]' : 'bg-[#8E9BB5]/50'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
          </div>
        </ScrollPanel>

        {/* 4. Recent Honor Chronicle ScrollPanel */}
        <ScrollPanel
          id="honor-chronicle"
          title="Recent Honor Chronicle"
          kanji="記録"
          subtitle={`${honorState.history.length} recorded deeds`}
          icon={ScrollText}
          defaultOpen={true}
        >
          {honorState.history.length > 0 ? (
            <div className="bg-[#0E1326] border border-[#151B38] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#151B38] pb-2.5 text-xs font-mono">
                <div className="flex items-center space-x-2 text-[#D4A84B] font-bold">
                  <ScrollText className="w-4 h-4" />
                  <span>IMPERIAL HONOR LEDGER · 勲功記録</span>
                </div>
                <span className="text-[#8E9BB5] tabular-nums">
                  {honorState.history.length} RECORDED DEEDS
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1 font-mono text-xs tabular-nums">
                {honorState.history.slice(0, 20).map((entry) => (
                  <div
                    key={entry.id}
                    className="px-3.5 py-2.5 rounded-xl bg-[#0A0A0F] border border-[#151B38] flex items-center justify-between gap-2"
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
            </div>
          ) : (
            <div className="bg-[#0E1326] border border-[#151B38] rounded-2xl p-6 text-center font-mono text-xs text-[#8E9BB5]">
              No deeds recorded yet — set an ephemeris alert, observe an event, visit a sanctuary, or restore a capture to inscribe your ledger.
            </div>
          )}
        </ScrollPanel>
      </div>
    </section>
  );
};
