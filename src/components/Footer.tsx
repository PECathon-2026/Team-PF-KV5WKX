import React from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sparkles, Compass, Shield, Telescope, Database } from 'lucide-react';
import { DynamicMoonPhase } from './common/DynamicMoonPhase';

export const Footer: React.FC = () => {
  return (
    <footer className="relative bg-[#0A0A0F] border-t border-[#D4A84B]/25 pt-16 pb-12 overflow-hidden">
      {/* Repeating Marquee: 月 TSUKUYOMI WATCH · THE SAMURAI'S CELESTIAL GUIDE 月 */}
      <div className="w-full overflow-hidden border-y border-[#D4A84B]/20 py-4 mb-16 bg-[#0E1326]/60 select-none">
        <div className="animate-marquee whitespace-nowrap flex items-center">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="font-serif text-2xl sm:text-4xl lg:text-5xl font-bold tracking-wider text-[#D4A84B]/30 hover:text-[#D4A84B]/60 transition-colors mr-10 flex items-center"
            >
              <span className="font-kanji text-3xl text-[#D4A84B]/50 mr-4">月</span>
              <span>TSUKUYOMI WATCH</span>
              <span className="mx-6 text-[#B3202A]/50">·</span>
              <span>THE SAMURAI'S CELESTIAL GUIDE</span>
              <span className="mx-6 text-[#B3202A]/50">·</span>
              <span className="font-kanji text-2xl text-[#F4EFE3]/30">星図</span>
              <span className="mx-6 text-[#B3202A]/50">·</span>
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-[#151B38]">
          {/* Brand & Mission (12 -> 5 cols) */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full border border-[#D4A84B] bg-[#0E1326] flex items-center justify-center shadow-[0_0_20px_rgba(212,168,75,0.3)]">
                <span className="font-kanji text-xl text-[#D4A84B] font-bold">月</span>
              </div>
              <div>
                <span className="font-serif text-2xl font-bold text-[#F4EFE3] tracking-wide block">
                  TSUKUYOMI WATCH
                </span>
                <span className="font-mono text-xs text-[#D4A84B] tracking-[0.2em] uppercase">
                  The Samurai's Celestial Guide
                </span>
              </div>
            </div>

            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] leading-relaxed max-w-sm">
              Dedicated to observing, tracking, and restoring the night sky. Built for astronomers, night-sky warriors, and deep-space contemplators across the globe.
            </p>

            {/* Dynamic Lunar Phase Badge */}
            <div className="pt-1">
              <DynamicMoonPhase size="sm" showDetailsPopover={true} />
            </div>
          </div>

          {/* Celestial Sections Navigation (12 -> 3 cols) */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="font-mono text-xs text-[#D4A84B] uppercase tracking-widest font-bold">
              Observatory Pages
            </h4>
            <ul className="space-y-2 text-xs font-sans text-[#8E9BB5]">
              <li>
                <Link to="/" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>00 / The Threshold</span>
                  <span className="font-kanji text-[#D4A84B]">門</span>
                </Link>
              </li>
              <li>
                <Link to="/watchtower" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>01 / The Watchtower</span>
                  <span className="font-kanji text-[#D4A84B]">見張</span>
                </Link>
              </li>
              <li>
                <Link to="/scroll" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>02 / Celestial Scroll</span>
                  <span className="font-kanji text-[#D4A84B]">巻物</span>
                </Link>
              </li>
              <li>
                <Link to="/lens" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>03 / The Spirit Lens</span>
                  <span className="font-kanji text-[#D4A84B]">霊鏡</span>
                </Link>
              </li>
              <li>
                <Link to="/dojo" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>04 / The Dojo Dashboard</span>
                  <span className="font-kanji text-[#D4A84B]">道場</span>
                </Link>
              </li>
              <li>
                <Link to="/honor" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>05 / Honor Points</span>
                  <span className="font-kanji text-[#D4A84B]">武士</span>
                </Link>
              </li>
              <li>
                <Link to="/stargazer" className="hover:text-[#F4EFE3] transition-colors flex items-center justify-between">
                  <span>06 / The Star Gazer</span>
                  <span className="font-kanji text-[#D4A84B]">星見</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Scientific Sources & Credits (12 -> 4 cols) */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="font-mono text-xs text-[#D4A84B] uppercase tracking-widest font-bold">
              Data & Astronomical Credits
            </h4>
            <div className="space-y-2 text-xs font-sans text-[#8E9BB5]">
              <p className="flex items-start">
                <Database className="w-3.5 h-3.5 mr-2 text-[#D4A84B] shrink-0 mt-0.5" />
                <span>Atmospheric seeing, cloud transparency and Bortle dark-sky metrics powered by Open-Meteo & NASA Earth Observatory.</span>
              </p>
              <p className="flex items-start">
                <Telescope className="w-3.5 h-3.5 mr-2 text-[#B3202A] shrink-0 mt-0.5" />
                <span>Deep space celestial imagery and FITS astrometry data via NASA SkyView & STScI Archive.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-[#8E9BB5] gap-3">
          <div>
            © Tsukuyomi Watch · The Samurai's Celestial Guide · All Cosmos Observed
          </div>
          <div className="flex items-center space-x-2">
            <span>TORII GATES · SAKURA · MOONLIGHT</span>
            <span className="text-[#D4A84B]">·</span>
            <span className="font-kanji text-[#D4A84B]">月 星 空 守</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
