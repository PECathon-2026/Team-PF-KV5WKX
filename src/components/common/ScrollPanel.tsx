import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { motion } from 'motion/react';
import { ChevronDown, ScrollText } from 'lucide-react';
import { useCalmMode, isCalmMode } from '../../utils/calmMode';
import { playSuzuChime, isAudioEnabled } from '../../utils/soundEngine';

const STORAGE_PREFIX = 'scrollpanel:';

function readStoredOpenState(id: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    // Deep link hash overrides stored state on load
    if (window.location.hash && window.location.hash.slice(1) === id) {
      return true;
    }
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  } catch {
    /* ignore storage errors */
  }
  return fallback;
}

function writeStoredOpenState(id: string, open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, String(open));
  } catch {
    /* ignore storage errors */
  }
}

function prefersReducedMotionOS(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/* ============================================================================
   PAGE-LEVEL SCROLL GROUP CONTEXT & "UNROLL ALL / ROLL UP ALL" CONTROL
   ============================================================================ */

interface ScrollGroupContextValue {
  registerPanel: (id: string, isOpen: boolean, setOpen: (open: boolean) => void) => void;
  unregisterPanel: (id: string) => void;
  notifyPanelState: (id: string, isOpen: boolean) => void;
}

const ScrollGroupContext = createContext<ScrollGroupContextValue | null>(null);

interface PanelEntry {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

export const ScrollGroupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const panelsRef = useRef<Map<string, PanelEntry>>(new Map());
  const [, setTick] = useState(0);

  const registerPanel = useCallback(
    (id: string, isOpen: boolean, setOpen: (open: boolean) => void) => {
      panelsRef.current.set(id, { isOpen, setOpen });
      setTick((t) => t + 1);
    },
    []
  );

  const unregisterPanel = useCallback((id: string) => {
    panelsRef.current.delete(id);
    setTick((t) => t + 1);
  }, []);

  const notifyPanelState = useCallback((id: string, isOpen: boolean) => {
    const existing = panelsRef.current.get(id);
    if (existing && existing.isOpen !== isOpen) {
      panelsRef.current.set(id, { ...existing, isOpen });
      setTick((t) => t + 1);
    }
  }, []);

  return (
    <ScrollGroupContext.Provider value={{ registerPanel, unregisterPanel, notifyPanelState }}>
      {children}
    </ScrollGroupContext.Provider>
  );
};

export interface ScrollPageControlsProps {
  panelIds: string[];
  className?: string;
}

/**
 * Top-of-page "Unroll all / Roll up all" control bar that opens or closes every
 * makimono ScrollPanel on the current page.
 */
export const ScrollPageControls: React.FC<ScrollPageControlsProps> = ({
  panelIds,
  className = '',
}) => {
  const [calm] = useCalmMode();
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});

  // Sync initial & external state from localStorage + custom events
  const refreshStates = useCallback(() => {
    const next: Record<string, boolean> = {};
    panelIds.forEach((id) => {
      try {
        const val = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
        if (val === 'true' || val === '1') next[id] = true;
        else if (val === 'false' || val === '0') next[id] = false;
      } catch {
        /* ignore */
      }
    });
    setOpenStates(next);
  }, [panelIds]);

  useEffect(() => {
    refreshStates();
    const handler = () => refreshStates();
    window.addEventListener('scrollpanel:statechange', handler);
    return () => window.removeEventListener('scrollpanel:statechange', handler);
  }, [refreshStates]);

  const handleBulkSet = (targetOpen: boolean) => {
    if (targetOpen && !calm && isAudioEnabled()) {
      playSuzuChime();
    }
    panelIds.forEach((id) => {
      writeStoredOpenState(id, targetOpen);
    });
    window.dispatchEvent(
      new CustomEvent('scrollpanel:bulk', {
        detail: { panelIds, open: targetOpen },
      })
    );
    refreshStates();
  };

  const openCount = panelIds.filter((id) => openStates[id] === true).length;
  const allOpen = panelIds.length > 0 && openCount === panelIds.length;
  const allClosed = panelIds.length > 0 && openCount === 0;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#0E1326]/90 border border-[#D4A84B]/30 text-xs font-mono ${className}`}
    >
      <div className="flex items-center space-x-2 text-[#F4EFE3]/90">
        <ScrollText className="w-3.5 h-3.5 text-[#D4A84B] shrink-0" aria-hidden="true" />
        <span className="uppercase tracking-wider text-[11px] text-[#D4A84B] font-bold">
          Makimono Scrolls · 巻物
        </span>
        <span className="hidden sm:inline text-[#8E9BB5]">·</span>
        <span className="hidden sm:inline text-[11px] text-[#8E9BB5]">
          Tap any scroll below to unroll or roll up its instruments
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => handleBulkSet(true)}
          disabled={allOpen}
          className="min-h-[36px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#D4A84B] hover:text-[#0A0A0F] disabled:opacity-45 disabled:pointer-events-none border border-[#D4A84B]/40 font-mono text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
        >
          Unroll all
        </button>
        <button
          type="button"
          onClick={() => handleBulkSet(false)}
          disabled={allClosed}
          className="min-h-[36px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-[#0A0A0F] hover:bg-[#151B38] text-[#F4EFE3] hover:text-[#D4A84B] disabled:opacity-45 disabled:pointer-events-none border border-[#151B38] hover:border-[#D4A84B]/40 font-mono text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
        >
          Roll up all
        </button>
      </div>
    </div>
  );
};

/* ============================================================================
   REUSABLE MAKIMONO <ScrollPanel> COMPONENT
   ============================================================================ */

export interface ScrollPanelProps {
  id: string;
  title: string;
  kanji?: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  defaultOpen?: boolean;
  keepMounted?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  accent?: 'gold' | 'crimson' | 'sky' | string;
  className?: string;
  children: React.ReactNode;
}

export const ScrollPanel: React.FC<ScrollPanelProps> = ({
  id,
  title,
  kanji,
  subtitle,
  icon,
  defaultOpen = false,
  keepMounted = true,
  onOpen,
  onClose,
  accent = 'gold',
  className = '',
  children,
}) => {
  const [calm] = useCalmMode();
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotionOS());
  const skipMotion = calm || reducedMotion;

  const [isOpen, setIsOpen] = useState<boolean>(() => readStoredOpenState(id, defaultOpen));
  // Lazy mount: only mount children once the scroll has been opened at least once
  const [hasBeenOpened, setHasBeenOpened] = useState<boolean>(() =>
    readStoredOpenState(id, defaultOpen)
  );
  // While closing animation runs, keep region visible until roll-up completes
  const [isAnimatingClose, setIsAnimatingClose] = useState<boolean>(false);
  // After open animation completes, unlock height to 'auto' so dynamic inner content never clips
  const [heightUnlocked, setHeightUnlocked] = useState<boolean>(() =>
    readStoredOpenState(id, defaultOpen)
  );
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerBtnRef = useRef<HTMLButtonElement | null>(null);
  const contentInnerRef = useRef<HTMLDivElement | null>(null);
  const groupCtx = useContext(ScrollGroupContext);

  const headerId = `scrollpanel-header-${id}`;
  const regionId = `scrollpanel-region-${id}`;

  // Listen to OS prefers-reduced-motion changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener?.('change', listener);
    return () => mql.removeEventListener?.('change', listener);
  }, []);

  // Persist initial state so ScrollPageControls knows about all panels on the page
  useEffect(() => {
    writeStoredOpenState(id, isOpen);
    window.dispatchEvent(new CustomEvent('scrollpanel:statechange', { detail: { id, isOpen } }));
    groupCtx?.notifyPanelState(id, isOpen);
  }, [id, isOpen, groupCtx]);

  // Measure inner content height with ResizeObserver so dynamic content never gets clipped
  useEffect(() => {
    const el = contentInnerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (contentInnerRef.current) {
        const h = contentInnerRef.current.scrollHeight;
        if (h > 0) {
          setMeasuredHeight(h);
        }
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        updateHeight();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [hasBeenOpened, isOpen, children]);

  // Helper to fire resize & widget invalidation events after opening
  const triggerWidgetRecalculation = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('scrollpanel:opened', { detail: { id } }));
  }, [id]);

  // Open/close handler
  const setPanelOpen = useCallback(
    (nextOpen: boolean, playSound = false) => {
      setIsOpen((prev) => {
        if (prev === nextOpen) return prev;
        writeStoredOpenState(id, nextOpen);

        if (nextOpen) {
          setHasBeenOpened(true);
          setIsAnimatingClose(false);
          setHeightUnlocked(skipMotion);
          if (playSound && !isCalmMode() && isAudioEnabled()) {
            playSuzuChime();
          }
          onOpen?.();
          requestAnimationFrame(() => {
            triggerWidgetRecalculation();
          });
        } else {
          setHeightUnlocked(false);
          if (contentInnerRef.current) {
            setMeasuredHeight(contentInnerRef.current.scrollHeight);
          }
          setIsAnimatingClose(!skipMotion);
          onClose?.();
        }
        return nextOpen;
      });
    },
    [id, skipMotion, onOpen, onClose, triggerWidgetRecalculation]
  );

  // Register with optional group context
  useEffect(() => {
    if (!groupCtx) return;
    groupCtx.registerPanel(id, isOpen, (open) => setPanelOpen(open, false));
    return () => groupCtx.unregisterPanel(id);
  }, [groupCtx, id, isOpen, setPanelOpen]);

  // Listen to page-level "Unroll all / Roll up all" bulk event
  useEffect(() => {
    const handleBulk = (e: Event) => {
      const custom = e as CustomEvent<{ panelIds?: string[]; open: boolean }>;
      if (!custom.detail) return;
      if (!custom.detail.panelIds || custom.detail.panelIds.includes(id)) {
        setPanelOpen(custom.detail.open, false);
      }
    };
    window.addEventListener('scrollpanel:bulk', handleBulk);
    return () => window.removeEventListener('scrollpanel:bulk', handleBulk);
  }, [id, setPanelOpen]);

  // Deep link support (#<id> on initial load and on hashchange)
  useEffect(() => {
    const checkHash = () => {
      if (typeof window === 'undefined') return;
      const hashId = window.location.hash.replace(/^#/, '');
      if (hashId === id) {
        setPanelOpen(true, false);
        setTimeout(() => {
          rootRef.current?.scrollIntoView({
            behavior: isCalmMode() || prefersReducedMotionOS() ? 'auto' : 'smooth',
            block: 'start',
          });
          triggerWidgetRecalculation();
        }, 120);
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [id, setPanelOpen, triggerWidgetRecalculation]);

  // When initially open on mount, trigger widget recalculation after mount
  useEffect(() => {
    if (isOpen) {
      const t1 = setTimeout(() => triggerWidgetRecalculation(), 80);
      const t2 = setTimeout(() => triggerWidgetRecalculation(), 450);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isOpen, triggerWidgetRecalculation]);

  // Close on Escape when focus is inside the panel
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && isOpen) {
      e.stopPropagation();
      setPanelOpen(false, false);
      headerBtnRef.current?.focus();
    }
  };

  const accentBorderColor =
    accent === 'crimson'
      ? 'border-[#B3202A]/60'
      : accent === 'sky'
      ? 'border-[#38BDF8]/60'
      : 'border-[#D4A84B]/55';

  // Render optional icon prop (supports both Lucide component and React element)
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    const IconComponent = icon as React.ComponentType<{ className?: string }>;
    return <IconComponent className="w-4 h-4 text-[#D4A84B] shrink-0" />;
  };

  const shouldRenderChildren = isOpen || isAnimatingClose || (keepMounted && hasBeenOpened);
  const isVisuallyVisible = isOpen || isAnimatingClose;

  return (
    <div
      id={id}
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={`w-full max-w-full scroll-mt-20 select-none sm:select-auto ${className}`}
    >
      {/* ====================================================================
          TOP WOODEN / LACQUERED MAKIMONO ROLLER (HEADER BUTTON)
          ==================================================================== */}
      <button
        ref={headerBtnRef}
        id={headerId}
        type="button"
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={() => setPanelOpen(!isOpen, !isOpen)}
        className="group relative w-full min-h-[56px] text-left flex items-stretch rounded-full focus-visible:outline-2 focus-visible:outline-[#D4A84B] focus-visible:outline-offset-2 transition-shadow duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.65)] hover:shadow-[0_8px_28px_rgba(212,168,75,0.22)] cursor-pointer overflow-visible"
      >
        {/* Left Ornate Gold End Cap (Jikubana 軸端) */}
        <span
          aria-hidden="true"
          className="w-3.5 sm:w-4 shrink-0 rounded-l-full border-y border-l border-[#D4A84B] flex flex-col justify-between py-1.5 px-0.5 shadow-inner"
          style={{
            background:
              'linear-gradient(180deg, #7A581B 0%, #EAC674 28%, #D4A84B 52%, #8A6421 82%, #4A330B 100%)',
          }}
        >
          <span className="w-full h-[1.5px] bg-[#23150E]/60 rounded-full" />
          <span className="w-full h-[1.5px] bg-[#23150E]/60 rounded-full" />
        </span>

        {/* Cylindrical Lacquered Dark-Wood Roller Body */}
        <span
          className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 border-y border-[#D4A84B]/45 relative overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, #160D08 0%, #382115 22%, #4A2C1D 42%, #2B180F 74%, #120A06 100%)',
          }}
        >
          {/* Subtle wood lacquer sheen */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1 h-[2px] bg-gradient-to-r from-transparent via-[#D4A84B]/25 to-transparent"
          />

          {/* Rolled Parchment Belly Band (Paper-toned wrapper around the scroll cylinder) */}
          <span
            className={`flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-md border ${accentBorderColor} transition-colors duration-200 group-hover:border-[#D4A84B]`}
            style={{
              background: isOpen
                ? 'linear-gradient(180deg, #1A213D 0%, #11162B 50%, #0E1326 100%)'
                : 'linear-gradient(180deg, #F4EFE3 0%, #E6DEC8 48%, #D5C8A8 100%)',
            }}
          >
            {/* Left: Icon + Kanji Seal + Title & Subtitle */}
            <span className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              {/* Crimson / Gold Stamp Badge */}
              <span
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center shrink-0 border ${
                  isOpen
                    ? 'bg-[#0A0A0F] border-[#D4A84B]/60 text-[#D4A84B]'
                    : 'bg-[#151B38] border-[#B3202A]/80 text-[#D4A84B]'
                }`}
              >
                {icon ? (
                  renderIcon()
                ) : (
                  <span className="font-kanji text-xs font-bold text-[#D4A84B]">
                    {kanji ? kanji.slice(0, 2) : '巻'}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`font-serif text-sm sm:text-base font-bold tracking-wide truncate ${
                      isOpen ? 'text-[#F4EFE3]' : 'text-[#0E1326]'
                    }`}
                  >
                    {title}
                  </span>
                  {kanji && (
                    <span
                      className={`font-kanji text-[11px] px-1.5 py-0.2 rounded shrink-0 ${
                        isOpen
                          ? 'text-[#D4A84B] bg-[#D4A84B]/15 border border-[#D4A84B]/30'
                          : 'text-[#B3202A] bg-[#B3202A]/10 border border-[#B3202A]/30 font-bold'
                      }`}
                    >
                      {kanji}
                    </span>
                  )}
                </span>

                {subtitle && (
                  <span
                    className={`block font-mono text-[10px] sm:text-[11px] truncate mt-0.5 ${
                      isOpen ? 'text-[#8E9BB5]' : 'text-[#2B180F]/85'
                    }`}
                  >
                    {subtitle}
                  </span>
                )}
              </span>
            </span>

            {/* Right: Unroll / Roll Up Badge & Chevron */}
            <span className="flex items-center gap-1.5 shrink-0">
              <span
                className={`hidden sm:inline-block font-mono text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                  isOpen
                    ? 'text-[#D4A84B] bg-[#0A0A0F]/70 border border-[#D4A84B]/30'
                    : 'text-[#0E1326] bg-[#0E1326]/10 border border-[#0E1326]/25'
                }`}
              >
                {isOpen ? 'Roll up · 閉' : 'Unroll · 開'}
              </span>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-300 ${
                  isOpen
                    ? 'rotate-180 bg-[#D4A84B] text-[#0A0A0F]'
                    : 'rotate-0 bg-[#0E1326] text-[#D4A84B]'
                }`}
              >
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </span>
          </span>
        </span>

        {/* Right Ornate Gold End Cap (Jikubana 軸端) */}
        <span
          aria-hidden="true"
          className="w-3.5 sm:w-4 shrink-0 rounded-r-full border-y border-r border-[#D4A84B] flex flex-col justify-between py-1.5 px-0.5 shadow-inner"
          style={{
            background:
              'linear-gradient(180deg, #7A581B 0%, #EAC674 28%, #D4A84B 52%, #8A6421 82%, #4A330B 100%)',
          }}
        >
          <span className="w-full h-[1.5px] bg-[#23150E]/60 rounded-full" />
          <span className="w-full h-[1.5px] bg-[#23150E]/60 rounded-full" />
        </span>

        {/* Decorative Crimson Braided Cord & Tassel (Kumihimo 組紐) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 28 42"
          className={`pointer-events-none absolute right-5 sm:right-7 -bottom-4 w-5 h-7 z-20 transition-transform duration-500 ${
            isOpen ? 'translate-y-0.5 rotate-6 opacity-80' : 'translate-y-0 rotate-0 opacity-100'
          }`}
        >
          {/* Cord knot on roller */}
          <circle cx="14" cy="6" r="4" fill="#B3202A" stroke="#D4A84B" strokeWidth="1" />
          {/* Hanging braided cord */}
          <path
            d="M14 10 C12 18, 16 24, 14 31"
            fill="none"
            stroke="#B3202A"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Gold collar */}
          <rect x="11" y="29" width="6" height="2.5" rx="1" fill="#D4A84B" />
          {/* Crimson tassel */}
          <path d="M11 31.5 L9 40 L19 40 L17 31.5 Z" fill="#B3202A" />
        </svg>
      </button>

      {/* ====================================================================
          UNROLLING NIGHT-PARCHMENT SHEET & TRAVELING BOTTOM ROLLER
          ==================================================================== */}
      <div
        id={regionId}
        role="region"
        aria-labelledby={headerId}
        aria-hidden={!isOpen}
        className={!isVisuallyVisible ? 'sr-only h-0 overflow-hidden pointer-events-none' : 'relative'}
      >
        <motion.div
          initial={false}
          animate={{
            height: isOpen ? (heightUnlocked ? 'auto' : Math.max(measuredHeight, 80)) : 0,
            opacity: isOpen ? 1 : skipMotion ? 0 : 0.96,
          }}
          transition={
            skipMotion
              ? { duration: 0.12 }
              : {
                  height: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.25 },
                }
          }
          onAnimationComplete={() => {
            if (isOpen) {
              setHeightUnlocked(true);
              triggerWidgetRecalculation();
            } else {
              setIsAnimatingClose(false);
            }
          }}
          style={{
            overflow: isOpen && heightUnlocked ? 'visible' : 'hidden',
          }}
          className="mx-1.5 sm:mx-2.5"
        >
          {/* Night-Parchment Sheet Container with Ink-Wash Shadow & Gold Stitched Borders */}
          <div className="relative makimono-parchment border-x border-[#D4A84B]/40 shadow-[inset_0_10px_24px_rgba(0,0,0,0.65),0_14px_32px_rgba(0,0,0,0.7)]">
            {/* Left & Right Gold Stitched Silk Margin Lines */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 left-1.5 w-[1px] border-l border-dashed border-[#D4A84B]/35"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 right-1.5 w-[1px] border-r border-dashed border-[#D4A84B]/35"
            />

            {/* Top Roller Cast Shadow onto Parchment */}
            <div
              aria-hidden="true"
              className="pointer-events-none h-3 w-full bg-gradient-to-b from-[#05060B]/90 to-transparent"
            />

            {/* Inner Content Wrapper: fades & slides in slightly AFTER paper is ~60% unrolled */}
            <div ref={contentInnerRef} className="px-3 sm:px-5 pt-2 pb-5">
              {shouldRenderChildren && (
                <motion.div
                  initial={false}
                  animate={{
                    opacity: isOpen ? 1 : 0,
                    y: isOpen ? 0 : -6,
                  }}
                  transition={
                    skipMotion
                      ? { duration: 0.1 }
                      : isOpen
                      ? { delay: 0.36, duration: 0.28, ease: 'easeOut' }
                      : { duration: 0.16, ease: 'easeIn' }
                  }
                >
                  {children}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Bottom Wooden / Lacquered Roller that travels down with the bottom edge of the parchment */}
        {isVisuallyVisible && (
          <div
            aria-hidden="true"
            className="mx-0.5 sm:mx-1 h-3.5 flex items-stretch rounded-full shadow-[0_8px_20px_rgba(0,0,0,0.85)]"
          >
            {/* Left Gold Cap */}
            <span
              className="w-3 shrink-0 rounded-l-full border-y border-l border-[#D4A84B]"
              style={{
                background:
                  'linear-gradient(180deg, #7A581B 0%, #EAC674 35%, #D4A84B 60%, #4A330B 100%)',
              }}
            />
            {/* Bottom Wood Cylinder */}
            <span
              className="flex-1 border-y border-[#D4A84B]/45"
              style={{
                background:
                  'linear-gradient(180deg, #1A0F0A 0%, #432719 42%, #24140C 80%, #100805 100%)',
              }}
            />
            {/* Right Gold Cap */}
            <span
              className="w-3 shrink-0 rounded-r-full border-y border-r border-[#D4A84B]"
              style={{
                background:
                  'linear-gradient(180deg, #7A581B 0%, #EAC674 35%, #D4A84B 60%, #4A330B 100%)',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ScrollPanel;
