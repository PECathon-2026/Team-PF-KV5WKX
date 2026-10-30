import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Volume2,
  VolumeX,
  Sliders,
  Bell,
  CloudRain,
  Wind,
  Radio,
  RotateCw,
  SkipForward,
  SkipBack,
  Sparkles,
  Menu,
  X,
  Play,
  Pause,
  Droplets,
  Layers,
  ChevronDown,
} from 'lucide-react';
import {
  SOUNDSCAPES,
  SoundscapeId,
  SoundscapeInfo,
  isAudioEnabled,
  setAudioEnabled,
  getActiveSoundscape,
  setActiveSoundscape,
  cycleSoundscape,
  cyclePreviousSoundscape,
  getMasterVolume,
  setMasterVolume,
  subscribeToSoundChanges,
  getAudioVisualizerData,
  playTempleBell,
  playSuzuChime,
  playRainDropletBurst,
  playCyberWindGust,
} from '../utils/soundEngine';
import { DynamicMoonPhase } from './common/DynamicMoonPhase';
import { CalmToggle } from './common/CalmToggle';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isAudioEnabled());
  const [volume, setVolumeState] = useState(getMasterVolume());
  const [activeScapeId, setActiveScapeId] = useState<SoundscapeId>(getActiveSoundscape());
  const [showControllerPopover, setShowControllerPopover] = useState(false);
  const [autoCycle, setAutoCycle] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to global sound state changes
  useEffect(() => {
    const unsubscribe = subscribeToSoundChanges((detail) => {
      setSoundOn(detail.enabled);
      setActiveScapeId(detail.soundscapeId);
      setVolumeState(detail.volume);
    });
    return unsubscribe;
  }, []);

  // Handle outside click to close the audio popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowControllerPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-cycle timer
  useEffect(() => {
    if (autoCycle && soundOn) {
      autoCycleTimerRef.current = setInterval(() => {
        cycleSoundscape();
      }, 90000); // Cycle every 90 seconds
    } else if (autoCycleTimerRef.current) {
      clearInterval(autoCycleTimerRef.current);
      autoCycleTimerRef.current = null;
    }
    return () => {
      if (autoCycleTimerRef.current) {
        clearInterval(autoCycleTimerRef.current);
      }
    };
  }, [autoCycle, soundOn]);

  // Audio Spectrum Visualizer Animation Loop
  useEffect(() => {
    if (!showControllerPopover || !soundOn) return;
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataBuffer = new Uint8Array(32);

    const render = () => {
      animId = requestAnimationFrame(render);
      const data = getAudioVisualizerData(dataBuffer);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = 24;
      const barWidth = (canvas.width - (barCount - 1) * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        let val = data ? data[i] : 0;
        // If sound enabled, add subtle organic floor bounce if quiet
        if (soundOn && val < 20) {
          val = 15 + Math.sin(Date.now() / 200 + i * 0.4) * 8;
        }
        const barHeight = Math.max(3, (val / 255) * canvas.height);
        const x = i * (barWidth + 2);
        const y = canvas.height - barHeight;

        // Dynamic gradient based on active soundscape
        const activeColor = getActiveInfo().accentColor;
        ctx.fillStyle = activeColor;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [showControllerPopover, soundOn, activeScapeId]);

  const activeInfo = SOUNDSCAPES.find((s) => s.id === activeScapeId) || SOUNDSCAPES[0];

  function getActiveInfo(): SoundscapeInfo {
    return SOUNDSCAPES.find((s) => s.id === activeScapeId) || SOUNDSCAPES[0];
  }

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setAudioEnabled(next);
  };

  const handleVolumeChange = (newVal: number) => {
    const normalized = newVal / 100;
    setVolumeState(normalized);
    setMasterVolume(normalized);
    if (!soundOn && normalized > 0) {
      setSoundOn(true);
      setAudioEnabled(true);
    }
  };

  const handleCycleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!soundOn) {
      setSoundOn(true);
      setAudioEnabled(true);
    }
    const nextScape = cycleSoundscape();
    setActiveScapeId(nextScape);
  };

  const handleCyclePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!soundOn) {
      setSoundOn(true);
      setAudioEnabled(true);
    }
    const prevScape = cyclePreviousSoundscape();
    setActiveScapeId(prevScape);
  };

  const handleSelectSoundscape = (id: SoundscapeId) => {
    setActiveScapeId(id);
    setActiveSoundscape(id);
    if (!soundOn) {
      setSoundOn(true);
      setAudioEnabled(true);
    }
  };

  const renderSoundscapeIcon = (type: SoundscapeInfo['iconType'], className = 'w-3.5 h-3.5') => {
    switch (type) {
      case 'bell':
        return <Bell className={className} />;
      case 'rain':
        return <CloudRain className={className} />;
      case 'wind':
        return <Wind className={className} />;
      case 'fusion':
        return <Radio className={className} />;
    }
  };

  const navLinks = [
    { label: 'Home', to: '/', kanji: '門', end: true },
    { label: 'Watchtower', to: '/watchtower', kanji: '見張', end: false },
    { label: 'Celestial Scroll', to: '/scroll', kanji: '巻物', end: false },
    { label: 'Star Gazer', to: '/stargazer', kanji: '星見', end: false },
    { label: 'Spirit Lens', to: '/lens', kanji: '霊鏡', end: false },
    { label: 'Dojo Dashboard', to: '/dojo', kanji: '道場', end: false },
    { label: 'Honor Points', to: '/honor', kanji: '武士', end: false },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-md border-b border-[#D4A84B]/20 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <Link
          to="/"
          className="flex items-center space-x-3 group text-left focus:outline-none shrink-0"
        >
          <div className="w-8 h-8 rounded-full border border-[#D4A84B] flex items-center justify-center bg-[#0E1326] shadow-[0_0_15px_rgba(212,168,75,0.3)] group-hover:border-[#F4EFE3] transition-colors relative">
            <span className="font-kanji text-sm text-[#D4A84B] font-bold">月</span>
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#B3202A]" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-serif text-sm sm:text-base font-bold tracking-wider text-[#F4EFE3] group-hover:text-[#D4A84B] transition-colors whitespace-nowrap">
              TSUKUYOMI WATCH
            </span>
            <span className="hidden xl:inline-block text-[9px] font-mono text-[#D4A84B] border border-[#D4A84B]/40 px-1 py-0.2 rounded whitespace-nowrap">
              天文
            </span>
          </div>
        </Link>

        {/* Zone 2: Navigation Links */}
        <div className="hidden lg:flex items-center space-x-4 xl:space-x-5">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `text-xs font-sans tracking-widest uppercase transition-colors whitespace-nowrap py-1 flex items-center space-x-1 border-b-2 ${
                  isActive
                    ? 'text-[#D4A84B] border-[#D4A84B]'
                    : 'text-[#F4EFE3]/80 border-transparent hover:text-[#D4A84B]'
                }`
              }
            >
              <span>{link.label}</span>
              <span className="font-kanji text-[10px] text-[#D4A84B]/60">{link.kanji}</span>
            </NavLink>
          ))}
        </div>

        {/* Zone 3: Right Actions (Moon Phase + Ambient Soundscape Controller) */}
        <div className="hidden sm:flex items-center space-x-3 shrink-0">
          {/* Dynamic Lunar Cycle Moon Indicator */}
          <DynamicMoonPhase size="sm" showDetailsPopover={true} />

          <CalmToggle />

          {/* Tsukuyomi Ambient Soundscape Controller Capsule */}
          <div className="relative" ref={popoverRef}>
            <div className="flex items-center rounded-full bg-[#0E1326] border border-[#D4A84B]/40 p-0.5 shadow-[0_0_15px_rgba(212,168,75,0.15)] hover:border-[#D4A84B] transition-colors">
              {/* Play/Mute Toggle Button */}
              <button
                onClick={handleToggleSound}
                aria-label={soundOn ? 'Mute ambient soundscape' : 'Unmute ambient soundscape'}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full hover:bg-[#151B38] text-[11px] font-mono transition-all cursor-pointer whitespace-nowrap"
                title={soundOn ? 'Click to Mute' : 'Click to Play Ambient Sound'}
              >
                {soundOn ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-[#D4A84B] animate-pulse" />
                    <span className="text-[#D4A84B] font-bold">
                      {Math.round(volume * 100)}%
                    </span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-[#8E9BB5]" />
                    <span className="text-[#8E9BB5]">MUTE</span>
                  </>
                )}
              </button>

              {/* Active Soundscape Badge with Popover Trigger */}
              <button
                onClick={() => setShowControllerPopover(!showControllerPopover)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-sans font-medium transition-all cursor-pointer border-l border-[#151B38] hover:bg-[#151B38] ${
                  soundOn ? 'text-[#F4EFE3]' : 'text-[#8E9BB5]'
                }`}
                title="Open Tsukuyomi Soundscape Studio"
                aria-expanded={showControllerPopover}
              >
                <span
                  className="transition-colors"
                  style={{ color: soundOn ? activeInfo.accentColor : '#8E9BB5' }}
                >
                  {renderSoundscapeIcon(activeInfo.iconType, 'w-3.5 h-3.5')}
                </span>
                <span className="hidden md:inline-block max-w-[120px] truncate">
                  {activeInfo.name}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-[#D4A84B] transition-transform duration-200 ${
                    showControllerPopover ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Direct Cycle Button (Instant Next Soundscape Switcher) */}
              <button
                onClick={handleCycleNext}
                className="p-1.5 rounded-full hover:bg-[#151B38] text-[#D4A84B] hover:text-[#F4EFE3] transition-colors cursor-pointer relative group"
                aria-label="Cycle to next Tsukuyomi ambient soundscape"
                title="Cycle to next soundscape (Temple Bells ➔ Rain ➔ Digital Wind ➔ Moonlit Night)"
              >
                <RotateCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-300" />
              </button>
            </div>

            {/* Comprehensive Soundscape Studio Popover */}
            {showControllerPopover && (
              <div className="absolute right-0 top-full mt-2 w-84 bg-[#0E1326] border border-[#D4A84B] rounded-2xl p-4 shadow-[0_0_35px_rgba(212,168,75,0.25)] animate-in fade-in z-50 space-y-4 text-left">
                {/* Header & Quick Cycle Navigation */}
                <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                  <div>
                    <div className="flex items-center space-x-1.5 text-xs font-mono text-[#D4A84B] font-bold">
                      <Radio className="w-3.5 h-3.5" />
                      <span>TSUKUYOMI SOUNDSCAPES</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#8E9BB5] block">
                      Ambient Procedural Synthesis · 音響空間
                    </span>
                  </div>

                  {/* Previous / Next Cycle Buttons */}
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={handleCyclePrev}
                      className="p-1 rounded-md bg-[#151B38] hover:bg-[#D4A84B] hover:text-[#0A0A0F] text-[#F4EFE3] text-xs transition-colors cursor-pointer"
                      title="Previous Soundscape"
                      aria-label="Previous Soundscape"
                    >
                      <SkipBack className="w-3 h-3" />
                    </button>
                    <button
                      onClick={handleCycleNext}
                      className="p-1 rounded-md bg-[#151B38] hover:bg-[#D4A84B] hover:text-[#0A0A0F] text-[#F4EFE3] text-xs transition-colors cursor-pointer"
                      title="Next Soundscape"
                      aria-label="Next Soundscape"
                    >
                      <SkipForward className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Real-time Frequency Spectrum Visualizer */}
                <div className="bg-[#0A0A0F] p-2.5 rounded-xl border border-[#151B38] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#8E9BB5] flex items-center">
                      <span
                        className="w-1.5 h-1.5 rounded-full mr-1.5"
                        style={{
                          backgroundColor: soundOn ? activeInfo.accentColor : '#64748B',
                        }}
                      />
                      Active Spectrum · {activeInfo.kanji}
                    </span>
                    <span
                      className="font-bold text-[10px]"
                      style={{ color: activeInfo.accentColor }}
                    >
                      {soundOn ? 'LIVE SYNTHESIS' : 'STANDBY'}
                    </span>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={280}
                    height={38}
                    className="w-full h-9 rounded bg-[#070913] block"
                  />
                </div>

                {/* Soundscapes Selector List (The Core Feature) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8E9BB5] uppercase tracking-wider">
                    <span>Select Ambient Atmosphere</span>
                    <span>4 Channels</span>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    {SOUNDSCAPES.map((scape) => {
                      const isSelected = activeScapeId === scape.id;
                      return (
                        <button
                          key={scape.id}
                          onClick={() => handleSelectSoundscape(scape.id)}
                          className={`w-full text-left p-2 rounded-xl transition-all border flex items-start space-x-2.5 cursor-pointer group ${
                            isSelected
                              ? 'bg-[#151B38] border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.2)]'
                              : 'bg-[#0A0A0F]/60 border-[#151B38] hover:bg-[#121626] hover:border-[#D4A84B]/40'
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                              isSelected ? 'bg-[#0E1326]' : 'bg-[#151B38]/50'
                            }`}
                            style={{ color: scape.accentColor }}
                          >
                            {renderSoundscapeIcon(scape.iconType, 'w-4 h-4')}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs font-serif font-bold tracking-wide truncate ${
                                  isSelected ? 'text-[#F4EFE3]' : 'text-[#F4EFE3]/80'
                                }`}
                              >
                                {scape.name}
                              </span>
                              <span className="font-kanji text-[10px] text-[#8E9BB5] shrink-0 ml-1">
                                {scape.kanji}
                              </span>
                            </div>

                            <p className="text-[10px] text-[#8E9BB5] truncate leading-tight mt-0.5">
                              {scape.subtitle}
                            </p>
                          </div>

                          {isSelected && soundOn && (
                            <span className="flex h-2 w-2 relative mt-1.5">
                              <span
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style={{ backgroundColor: scape.accentColor }}
                              />
                              <span
                                className="relative inline-flex rounded-full h-2 w-2"
                                style={{ backgroundColor: scape.accentColor }}
                              />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Volume Slider & Presets */}
                <div className="space-y-1.5 pt-2 border-t border-[#151B38]">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#8E9BB5]">
                    <span>Master Immersion Level</span>
                    <span className="text-[#D4A84B] font-semibold">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={soundOn ? Math.round(volume * 100) : 0}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full accent-[#D4A84B] cursor-pointer h-1.5 bg-[#151B38] rounded-lg"
                    aria-label="Master Volume Slider"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-[#8E9BB5]">
                    <button
                      onClick={() => handleVolumeChange(0)}
                      className="hover:text-[#F4EFE3] cursor-pointer"
                    >
                      MUTE
                    </button>
                    <button
                      onClick={() => handleVolumeChange(35)}
                      className="hover:text-[#F4EFE3] cursor-pointer"
                    >
                      35%
                    </button>
                    <button
                      onClick={() => handleVolumeChange(65)}
                      className="hover:text-[#D4A84B] cursor-pointer font-bold"
                    >
                      65%
                    </button>
                    <button
                      onClick={() => handleVolumeChange(100)}
                      className="hover:text-[#F4EFE3] cursor-pointer"
                    >
                      100%
                    </button>
                  </div>
                </div>

                {/* Instant Trigger Buttons & Auto-Cycle Toggle */}
                <div className="space-y-2 pt-2 border-t border-[#151B38]">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#8E9BB5]">Direct Sound Triggers</span>
                    <button
                      onClick={() => setAutoCycle(!autoCycle)}
                      className={`text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
                        autoCycle
                          ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold'
                          : 'bg-[#151B38] text-[#8E9BB5] hover:text-[#F4EFE3]'
                      }`}
                      title="Automatically cycle ambient soundscapes every 90 seconds"
                    >
                      {autoCycle ? 'Auto-Cycle: ON' : 'Auto-Cycle: OFF'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        if (!soundOn) handleToggleSound();
                        playTempleBell();
                      }}
                      className="px-2 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#B3202A] text-[#F4EFE3] text-[10px] font-mono font-medium transition-colors text-center cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Bell className="w-3 h-3 text-[#D4A84B]" />
                      <span>Strike Bonshō</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!soundOn) handleToggleSound();
                        playRainDropletBurst();
                      }}
                      className="px-2 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#1E293B] hover:text-[#38BDF8] text-[#F4EFE3] text-[10px] font-mono font-medium transition-colors text-center cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Droplets className="w-3 h-3 text-[#38BDF8]" />
                      <span>Rain Splash</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!soundOn) handleToggleSound();
                        playCyberWindGust();
                      }}
                      className="px-2 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#2E1065] hover:text-[#C084FC] text-[#F4EFE3] text-[10px] font-mono font-medium transition-colors text-center cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Wind className="w-3 h-3 text-[#A855F7]" />
                      <span>Wind Gust</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!soundOn) handleToggleSound();
                        playSuzuChime();
                      }}
                      className="px-2 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] hover:text-[#0A0A0F] text-[#F4EFE3] text-[10px] font-mono font-medium transition-colors text-center cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Sparkles className="w-3 h-3 text-[#D4A84B]" />
                      <span>Suzu Chime</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tablet hamburger (sm to lg): without this there was no navigation between 640px and 1023px */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="hidden sm:flex lg:hidden p-2 text-[#F4EFE3] hover:text-[#D4A84B]"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Mobile Header Icons: Live Moon Phase, Quick Soundscape Cycle & Mobile Menu Toggle */}
        <div className="flex sm:hidden items-center space-x-1.5">
          {/* Compact Real-Time Moon Phase on mobile header */}
          <DynamicMoonPhase size="sm" compactMobile={true} showDetailsPopover={true} />

          <CalmToggle compact />

          {/* Quick cycle button on mobile */}
          <button
            onClick={handleCycleNext}
            className="p-1.5 rounded-lg bg-[#0E1326] border border-[#D4A84B]/30 text-[#D4A84B]"
            aria-label="Cycle ambient soundscape"
            title={`Active: ${activeInfo.name} - Tap to cycle`}
          >
            {renderSoundscapeIcon(activeInfo.iconType, 'w-3.5 h-3.5')}
          </button>

          {/* Sound On/Off on mobile */}
          <button
            onClick={handleToggleSound}
            className="p-2 text-[#D4A84B]"
            aria-label="Toggle sound"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-[#D4A84B]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#8E9BB5]" />
            )}
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#F4EFE3] hover:text-[#D4A84B]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0A0A0F]/95 border-b border-[#D4A84B]/20 px-6 py-6 space-y-5 animate-in fade-in max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-[#151B38]">
            <DynamicMoonPhase size="sm" showDetailsPopover={true} />
            <span className="text-[10px] font-mono text-[#8E9BB5] uppercase tracking-wider">
              月読の星図 · TELEMETRY
            </span>
          </div>

          {/* Mobile Soundscape Controller */}
          <div className="p-3.5 rounded-xl bg-[#0E1326] border border-[#D4A84B]/30 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-[#D4A84B] font-bold block">
                  TSUKUYOMI SOUNDSCAPE
                </span>
                <span className="text-[10px] font-mono text-[#8E9BB5]">
                  {activeInfo.name} · {activeInfo.kanji}
                </span>
              </div>
              <button
                onClick={handleCycleNext}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-[#151B38] text-[#D4A84B] text-[11px] font-mono font-bold"
              >
                <RotateCw className="w-3 h-3" />
                <span>Cycle</span>
              </button>
            </div>

            {/* Soundscape Options for Mobile */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {SOUNDSCAPES.map((scape) => (
                <button
                  key={scape.id}
                  onClick={() => handleSelectSoundscape(scape.id)}
                  className={`p-2 rounded-lg text-left border text-[11px] font-sans flex items-center space-x-1.5 ${
                    activeScapeId === scape.id
                      ? 'bg-[#151B38] border-[#D4A84B] text-[#F4EFE3]'
                      : 'bg-[#0A0A0F] border-[#151B38] text-[#8E9BB5]'
                  }`}
                >
                  <span style={{ color: scape.accentColor }}>
                    {renderSoundscapeIcon(scape.iconType, 'w-3 h-3')}
                  </span>
                  <span className="truncate">{scape.name}</span>
                </button>
              ))}
            </div>

            {/* Mobile Volume Slider */}
            <div className="space-y-1.5 pt-2 border-t border-[#151B38]">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#8E9BB5]">Volume</span>
                <span className="text-[#D4A84B]">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundOn ? Math.round(volume * 100) : 0}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-full accent-[#D4A84B] h-1.5"
              />
            </div>
          </div>

          <div className="flex flex-col space-y-3 font-sans text-sm">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `text-left py-2 border-b border-[#121626] flex items-center justify-between ${
                    isActive ? 'text-[#D4A84B]' : 'text-[#F4EFE3] hover:text-[#D4A84B]'
                  }`
                }
              >
                <span>{link.label}</span>
                <span className="font-kanji text-xs text-[#D4A84B]">{link.kanji}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};
