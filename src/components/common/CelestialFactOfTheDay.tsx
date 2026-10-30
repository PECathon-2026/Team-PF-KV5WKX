import React, { useState, useMemo } from 'react';
import { Scroll, ChevronLeft, ChevronRight, Sparkles, Compass, Shuffle } from 'lucide-react';
import factsData from '../../data/celestialFactsAndFolklore.json';
import { playSuzuChime, playKotoNote } from '../../utils/soundEngine';

export interface CelestialFactEntry {
  id: string;
  title: string;
  japanese: string;
  category: string;
  era: string;
  constellation: string;
  coordinates: string;
  fact: string;
  folklore: string;
}

export const CelestialFactOfTheDay: React.FC = () => {
  const entries = factsData as CelestialFactEntry[];

  // Deterministically compute today's default index from day-of-year so it updates each calendar day
  const dailyDefaultIndex = useMemo(() => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dayOfYear % entries.length;
  }, [entries.length]);

  const [currentIndex, setCurrentIndex] = useState<number>(dailyDefaultIndex);
  const [activeTab, setActiveTab] = useState<'both' | 'astronomy' | 'folklore'>('both');

  const currentEntry = entries[currentIndex] || entries[0];
  const isTodaysFeatured = currentIndex === dailyDefaultIndex;

  const handlePrev = () => {
    playSuzuChime();
    setCurrentIndex((prev) => (prev - 1 + entries.length) % entries.length);
  };

  const handleNext = () => {
    playSuzuChime();
    setCurrentIndex((prev) => (prev + 1) % entries.length);
  };

  const handleRandomLore = () => {
    playKotoNote(440, 1.1);
    if (entries.length <= 1) return;
    let nextIdx = currentIndex;
    while (nextIdx === currentIndex) {
      nextIdx = Math.floor(Math.random() * entries.length);
    }
    setCurrentIndex(nextIdx);
  };

  return (
    <div className="w-full max-w-3xl mx-auto text-left bg-[#0E1326]/90 backdrop-blur-md border border-[#D4A84B]/45 rounded-2xl p-4 sm:p-5 shadow-[0_0_30px_rgba(212,168,75,0.18)] transition-all">
      {/* Top Bar: Header Tag, Category Badge & Chronicle Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#151B38]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 text-[10px] font-mono tracking-[0.2em] uppercase text-[#D4A84B] font-bold">
            <Scroll className="w-3.5 h-3.5 text-[#D4A84B]" />
            <span>CELESTIAL FACT OF THE DAY · 天文伝承</span>
          </div>

          <span className="px-2 py-0.5 rounded bg-[#151B38] border border-[#D4A84B]/30 text-[10px] font-mono text-[#F4EFE3]">
            {currentEntry.category}
          </span>

          {isTodaysFeatured && (
            <span className="px-2 py-0.5 rounded bg-[#B3202A]/30 border border-[#B3202A] text-[9px] font-mono text-[#F4EFE3] uppercase tracking-wider">
              Today's Scroll
            </span>
          )}
        </div>

        {/* Interactive Lore Cycle Controls */}
        <div className="flex items-center space-x-1.5 font-mono text-[10px] tabular-nums">
          <button
            type="button"
            onClick={() => {
              playSuzuChime();
              setActiveTab((prev) =>
                prev === 'both' ? 'astronomy' : prev === 'astronomy' ? 'folklore' : 'both'
              );
            }}
            className="px-2 py-1 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B]/50 text-[#8E9BB5] hover:text-[#F4EFE3] transition-colors cursor-pointer"
            title="Filter view between Astronomy, Folklore, or Both"
          >
            {activeTab === 'both'
              ? 'View: Full Lore'
              : activeTab === 'astronomy'
              ? 'View: Astrophysics'
              : 'View: Folklore'}
          </button>

          <button
            type="button"
            onClick={handleRandomLore}
            className="p-1.5 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B] text-[#D4A84B] transition-colors cursor-pointer"
            title="Draw Random Celestial Lore"
            aria-label="Draw Random Celestial Lore"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B] text-[#F4EFE3] transition-colors cursor-pointer"
            title="Previous Scroll Entry"
            aria-label="Previous Scroll Entry"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="px-1.5 text-[#8E9BB5]">
            {currentIndex + 1}/{entries.length}
          </span>

          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-lg bg-[#0A0A0F] border border-[#151B38] hover:border-[#D4A84B] text-[#F4EFE3] transition-colors cursor-pointer"
            title="Next Scroll Entry"
            aria-label="Next Scroll Entry"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Title & Japanese Subtitle */}
      <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
        <div>
          <h3 className="font-serif text-base sm:text-lg font-bold text-[#F4EFE3]">
            {currentEntry.title}
          </h3>
          <span className="font-kanji text-xs text-[#D4A84B] block">
            {currentEntry.japanese}
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] font-mono text-[#8E9BB5] tabular-nums shrink-0">
          <Compass className="w-3 h-3 text-[#D4A84B]" />
          <span>{currentEntry.constellation}</span>
          <span>·</span>
          <span className="text-[#F4EFE3]/80">{currentEntry.era}</span>
        </div>
      </div>

      {/* Fact & Folklore Columns */}
      <div
        className={`mt-3 grid grid-cols-1 ${
          activeTab === 'both' ? 'md:grid-cols-2' : ''
        } gap-3 text-xs leading-relaxed`}
      >
        {(activeTab === 'both' || activeTab === 'astronomy') && (
          <div className="p-3 rounded-xl bg-[#0A0A0F]/80 border border-[#151B38] space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#D4A84B] uppercase tracking-wider font-bold">
              <span>ASTRONOMICAL RECORD · 天文観測</span>
              <span className="text-[#8E9BB5] tabular-nums">{currentEntry.coordinates}</span>
            </div>
            <p className="font-sans text-[#F4EFE3]/90">{currentEntry.fact}</p>
          </div>
        )}

        {(activeTab === 'both' || activeTab === 'folklore') && (
          <div className="p-3 rounded-xl bg-[#0A0A0F]/80 border border-[#151B38] space-y-1">
            <div className="flex items-center space-x-1.5 text-[10px] font-mono text-[#D4A84B] uppercase tracking-wider font-bold">
              <Sparkles className="w-3 h-3 text-[#B3202A]" />
              <span>IMPERIAL FOLKLORE · 伝承物語</span>
            </div>
            <p className="font-sans text-[#8E9BB5]">{currentEntry.folklore}</p>
          </div>
        )}
      </div>
    </div>
  );
};
