import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Moon } from 'lucide-react';
import { playGateOpenSound, isAudioEnabled, setAudioEnabled } from '../utils/soundEngine';

interface LoadingScreenProps {
  onLoadingComplete: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadingComplete }) => {
  const [progress, setProgress] = useState(0);
  const [gatesOpening, setGatesOpening] = useState(false);
  const [soundOn, setSoundOn] = useState(isAudioEnabled());
  const [isDone, setIsDone] = useState(false);
  const openingStartedRef = useRef(false);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setAudioEnabled(next);
  };

  const handleSkip = () => {
    if (openingStartedRef.current) return;
    setProgress(100);
    triggerGateOpening();
  };

  const triggerGateOpening = () => {
    // Guard: the progress timer and the Skip button could both call this, playing the gate sound twice
    if (openingStartedRef.current) return;
    openingStartedRef.current = true;
    setGatesOpening(true);
    playGateOpenSound();
    setTimeout(() => {
      setIsDone(true);
      onLoadingComplete();
    }, 1300);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          triggerGateOpening();
          return 100;
        }
        const jump = Math.floor(Math.random() * 10) + 8;
        const next = Math.min(100, prev + jump);
        if (next === 100) {
          clearInterval(interval);
          setTimeout(() => triggerGateOpening(), 300);
        }
        return next;
      });
    }, 70);

    return () => clearInterval(interval);
  }, []);

  if (isDone) return null;

  // Moon Phase Name based on progress
  const getMoonPhaseLabel = (p: number) => {
    if (p < 20) return 'New Moon · 新月';
    if (p < 40) return 'Waxing Crescent · 三日月';
    if (p < 65) return 'First Quarter · 上弦の月';
    if (p < 88) return 'Waxing Gibbous · 十三夜';
    return 'Full Harvest Moon · 満月';
  };

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden select-none transition-opacity duration-700 ${
        gatesOpening ? 'pointer-events-none' : ''
      }`}
    >
      {/* Sound Toggle (in corner) */}
      <div className="absolute top-6 right-6 z-40">
        <button
          onClick={handleToggleSound}
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#0A0A0F]/80 backdrop-blur-md border border-[#D4A84B]/40 text-[#F4EFE3] hover:border-[#D4A84B] text-xs font-mono uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_15px_rgba(212,168,75,0.2)]"
        >
          {soundOn ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span className="text-[#D4A84B]">SOUND ON</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-[#8E9BB5]" />
              <span>SOUND OFF</span>
            </>
          )}
        </button>
      </div>

      {/* Centered Loading Content (z-30) */}
      <div
        className={`absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center transition-all duration-700 ${
          gatesOpening ? 'opacity-0 scale-95' : 'opacity-100'
        }`}
      >
        {/* Glowing Moon Phase Loader that fills as progress increases */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full border-2 border-[#D4A84B]/40 flex items-center justify-center relative overflow-hidden bg-[#0A0A0F] shadow-[0_0_40px_rgba(212,168,75,0.3)]">
            {/* Dark Moon Base */}
            <div className="absolute inset-0 bg-[#121626] rounded-full" />

            {/* Glowing Moon disk filling through its phases */}
            <div
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#D4A84B] via-[#F4EFE3] to-[#FFF9EE] transition-all duration-200"
              style={{
                clipPath: `inset(0 ${Math.max(0, 100 - progress)}% 0 0)`,
                filter: progress > 70 ? 'drop-shadow(0 0 16px rgba(244,239,227,0.8))' : 'none',
              }}
            />

            {/* Moon Craters Overlay */}
            <div className="absolute inset-0 rounded-full opacity-25 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-transparent via-[#0A0A0F]/60 to-[#0A0A0F]/80" />

            {/* Center Kanji Glyph */}
            <span className="relative z-10 font-kanji text-xl font-bold text-[#0A0A0F] drop-shadow-sm select-none">
              月
            </span>
          </div>

          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#B3202A] animate-ping" />
        </div>

        {/* Brand Name & Calligraphy Subtitle */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-center space-x-2 text-[10px] font-mono tracking-[0.3em] uppercase text-[#D4A84B]">
            <span>月読の星図</span>
            <span>·</span>
            <span>CELESTIAL SAMURAI GUIDE</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#F4EFE3] text-glow-moon">
            Tsukuyomi Watch
          </h1>

          <p className="font-sans text-xs sm:text-sm text-[#F4EFE3]/75 italic tracking-wide max-w-sm">
            "Read the heavens like a warrior · Find the clearest skies"
          </p>
        </div>

        {/* Loading Progress & Moon Phase status */}
        <div className="w-64 sm:w-80 space-y-3">
          <div className="flex items-center justify-between font-mono text-xs text-[#8E9BB5]">
            <span className="text-[#D4A84B] flex items-center font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B3202A] mr-2 animate-pulse" />
              Reading the heavens...
            </span>
            <span className="font-bold text-[#F4EFE3]">{progress}%</span>
          </div>

          {/* Glowing Gold Progress Line */}
          <div className="w-full h-[2px] bg-[#151B38] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#B3202A] via-[#D4A84B] to-[#F4EFE3] transition-all duration-150 glow-gold"
              style={{ width: `${progress}%` }}
            />
          </div>

          <span className="text-[11px] font-mono text-[#D4A84B]/80 block">
            {getMoonPhaseLabel(progress)}
          </span>
        </div>

        {/* Skip intro link */}
        <button
          onClick={handleSkip}
          className="mt-8 text-xs font-mono tracking-[0.2em] text-[#8E9BB5] hover:text-[#D4A84B] transition-colors cursor-pointer group flex items-center space-x-1"
        >
          <span>Skip intro</span>
          <span className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">↗</span>
        </button>
      </div>

      {/* Two Torii Gate Halves sliding apart */}
      <div className="absolute inset-0 flex z-20 pointer-events-none">
        {/* Left Gate Panel */}
        <div
          className="relative w-1/2 h-full bg-[#0A0A0F] border-r border-[#D4A84B]/40 transition-transform duration-1000 ease-[cubic-bezier(0.7,0,0.3,1)] overflow-hidden"
          style={{
            transform: gatesOpening ? 'translateX(-100%)' : 'translateX(0%)',
          }}
        >
          <div
            className="absolute inset-0 bg-cover bg-left opacity-35"
            style={{ backgroundImage: 'url(/assets/images/rainy_temple_gate.jpg)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0F] via-[#0E1326]/90 to-[#0A0A0F]/95" />

          {/* Torii Gate Architectural Beam Overlay */}
          <div className="absolute top-1/4 right-0 w-32 h-3 bg-[#B3202A]/80 shadow-[0_0_15px_rgba(179,32,42,0.5)]" />
          <div className="absolute top-1/3 right-0 w-24 h-1.5 bg-[#D4A84B]/60" />

          {/* Crest Handle */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-[#D4A84B]/60 flex items-center justify-center bg-[#0E1326]/90 shadow-[0_0_20px_rgba(212,168,75,0.3)]">
            <span className="font-kanji text-sm text-[#D4A84B]">月</span>
          </div>
        </div>

        {/* Right Gate Panel */}
        <div
          className="relative w-1/2 h-full bg-[#0A0A0F] border-l border-[#D4A84B]/40 transition-transform duration-1000 ease-[cubic-bezier(0.7,0,0.3,1)] overflow-hidden"
          style={{
            transform: gatesOpening ? 'translateX(100%)' : 'translateX(0%)',
          }}
        >
          <div
            className="absolute inset-0 bg-cover bg-right opacity-35"
            style={{ backgroundImage: 'url(/assets/images/rainy_temple_gate.jpg)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-[#0A0A0F] via-[#0E1326]/90 to-[#0A0A0F]/95" />

          {/* Torii Gate Architectural Beam Overlay */}
          <div className="absolute top-1/4 left-0 w-32 h-3 bg-[#B3202A]/80 shadow-[0_0_15px_rgba(179,32,42,0.5)]" />
          <div className="absolute top-1/3 left-0 w-24 h-1.5 bg-[#D4A84B]/60" />

          {/* Crest Handle */}
          <div className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-[#D4A84B]/60 flex items-center justify-center bg-[#0E1326]/90 shadow-[0_0_20px_rgba(212,168,75,0.3)]">
            <span className="font-kanji text-sm text-[#D4A84B]">読</span>
          </div>
        </div>
      </div>
    </div>
  );
};
