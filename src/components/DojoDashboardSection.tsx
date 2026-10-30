import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Move,
  FileSpreadsheet,
  Image as ImageIcon,
  Crosshair,
  History,
  Clock,
  Trash2,
} from 'lucide-react';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import type { AstroRestorationResponse, DetectedAstroObject } from './SpiritLensSection';
import { ScrollPanel, ScrollPageControls } from './common/ScrollPanel';
import { useRestorationState } from '../utils/restorationContext';

interface DojoOverlayObject {
  id: string;
  type: 'star' | 'galaxy';
  x: number; // pixel X in [0..imageWidth]
  y: number; // pixel Y in [0..imageHeight]
  xPct: number; // 0..100
  yPct: number; // 0..100
  peakFlux: number;
  integratedFlux: number;
  instrumentalMag: number;
  fwhmPixels: number;
  radiusPixels: number;
  elongation: number;
  angleDeg: number;
}

const FALLBACK_OBJECTS: DojoOverlayObject[] = [
  {
    id: 'STAR-001',
    type: 'star',
    x: 268.8,
    y: 187.2,
    xPct: 48,
    yPct: 52,
    peakFlux: 942.4,
    integratedFlux: 8420.5,
    instrumentalMag: 6.24,
    fwhmPixels: 2.42,
    radiusPixels: 2.1,
    elongation: 1.05,
    angleDeg: 0,
  },
  {
    id: 'STAR-002',
    type: 'star',
    x: 156.8,
    y: 273.6,
    xPct: 28,
    yPct: 76,
    peakFlux: 810.2,
    integratedFlux: 5910.0,
    instrumentalMag: 7.85,
    fwhmPixels: 2.18,
    radiusPixels: 1.9,
    elongation: 1.08,
    angleDeg: 0,
  },
  {
    id: 'STAR-003',
    type: 'star',
    x: 414.4,
    y: 115.2,
    xPct: 74,
    yPct: 32,
    peakFlux: 765.0,
    integratedFlux: 4880.3,
    instrumentalMag: 8.4,
    fwhmPixels: 2.31,
    radiusPixels: 2.0,
    elongation: 1.04,
    angleDeg: 0,
  },
  {
    id: 'GAL-001',
    type: 'galaxy',
    x: 492.8,
    y: 79.2,
    xPct: 88,
    yPct: 22,
    peakFlux: 620.8,
    integratedFlux: 14250.6,
    instrumentalMag: 12.65,
    fwhmPixels: 5.84,
    radiusPixels: 4.6,
    elongation: 1.85,
    angleDeg: 32,
  },
  {
    id: 'GAL-002',
    type: 'galaxy',
    x: 67.2,
    y: 158.4,
    xPct: 12,
    yPct: 44,
    peakFlux: 540.1,
    integratedFlux: 11480.2,
    instrumentalMag: 13.2,
    fwhmPixels: 4.92,
    radiusPixels: 3.9,
    elongation: 1.65,
    angleDeg: -24,
  },
];

interface DojoDashboardSectionProps {
  restorationResult?: AstroRestorationResponse | null;
  captureTitle?: string;
}

export const DojoDashboardSection: React.FC<DojoDashboardSectionProps> = ({
  restorationResult,
  captureTitle = 'Pillars of Creation (Hubble/JWST)',
}) => {
  const { history, selectHistoryEntry, clearHistory } = useRestorationState();
  // Before/After divider position (0 to 100%)
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingDivider, setIsDraggingDivider] = useState<boolean>(false);

  // Zoom (1x to 4x) & Pan (in percentage of viewport [-50..50])
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number }>({
    clientX: 0,
    clientY: 0,
    startX: 0,
    startY: 0,
  });

  // Toggleable SVG overlays for stars (circles) and galaxies (ellipses)
  const [showStars, setShowStars] = useState<boolean>(true);
  const [showGalaxies, setShowGalaxies] = useState<boolean>(true);

  // Hovered and clicked/pinned object for tooltip display
  const [hoveredObject, setHoveredObject] = useState<DojoOverlayObject | null>(null);
  const [selectedObject, setSelectedObject] = useState<DojoOverlayObject | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);

  const imgWidth = restorationResult?.width || 560;
  const imgHeight = restorationResult?.height || 360;

  const restoredBgUrl =
    restorationResult?.restoredImageDataUrl || '/assets/images/pillars_of_creation.jpg';
  const rawBgUrl = restorationResult?.rawImageDataUrl || '/assets/images/pillars_of_creation.jpg';

  // Map Spirit Lens output objects into SVG overlay items
  const overlayObjects = useMemo<DojoOverlayObject[]>(() => {
    if (!restorationResult || !restorationResult.objects || restorationResult.objects.length === 0) {
      return FALLBACK_OBJECTS;
    }
    return restorationResult.objects.map((obj: DetectedAstroObject, idx: number) => ({
      id: obj.id,
      type: obj.type,
      x: obj.x,
      y: obj.y,
      xPct: obj.xPct,
      yPct: obj.yPct,
      peakFlux: obj.brightness.peakFlux,
      integratedFlux: obj.brightness.integratedFlux,
      instrumentalMag: obj.brightness.instrumentalMag,
      fwhmPixels: obj.size.fwhmPixels,
      radiusPixels: obj.size.radiusPixels,
      elongation: obj.size.elongation,
      // Deterministic orientation angle for elliptical galaxy contour rendering
      angleDeg: ((idx * 37) % 160) - 80,
    }));
  }, [restorationResult]);

  // Clamp pan offset whenever zoomLevel decreases
  const clampPan = useCallback((x: number, y: number, zoom: number) => {
    if (zoom <= 1) return { x: 0, y: 0 };
    const maxPanPct = ((zoom - 1) / (2 * zoom)) * 100;
    return {
      x: Math.max(-maxPanPct, Math.min(maxPanPct, x)),
      y: Math.max(-maxPanPct, Math.min(maxPanPct, y)),
    };
  }, []);

  useEffect(() => {
    setPanOffset((prev) => clampPan(prev.x, prev.y, zoomLevel));
  }, [zoomLevel, clampPan]);

  // Reset selected object when new Spirit Lens output arrives
  useEffect(() => {
    setSelectedObject(null);
    setHoveredObject(null);
  }, [restorationResult]);

  // Global mouse/touch listeners for smooth divider dragging and viewport panning
  useEffect(() => {
    if (!isDraggingDivider && !isPanning) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isDraggingDivider && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const relX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        setSliderPos((relX / rect.width) * 100);
      } else if (isPanning && viewportRef.current && zoomLevel > 1) {
        const rect = viewportRef.current.getBoundingClientRect();
        const dxPct = ((e.clientX - panStartRef.current.clientX) / rect.width) * (100 / zoomLevel);
        const dyPct = ((e.clientY - panStartRef.current.clientY) / rect.height) * (100 / zoomLevel);
        setPanOffset(
          clampPan(panStartRef.current.startX + dxPct, panStartRef.current.startY + dyPct, zoomLevel)
        );
      }
    };

    const handleWindowTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (isDraggingDivider && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const relX = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
        setSliderPos((relX / rect.width) * 100);
      } else if (isPanning && viewportRef.current && zoomLevel > 1) {
        const rect = viewportRef.current.getBoundingClientRect();
        const dxPct =
          ((touch.clientX - panStartRef.current.clientX) / rect.width) * (100 / zoomLevel);
        const dyPct =
          ((touch.clientY - panStartRef.current.clientY) / rect.height) * (100 / zoomLevel);
        setPanOffset(
          clampPan(panStartRef.current.startX + dxPct, panStartRef.current.startY + dyPct, zoomLevel)
        );
      }
    };

    const handleWindowUp = () => {
      setIsDraggingDivider(false);
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('touchmove', handleWindowTouchMove);
    window.addEventListener('mouseup', handleWindowUp);
    window.addEventListener('touchend', handleWindowUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('mouseup', handleWindowUp);
      window.removeEventListener('touchend', handleWindowUp);
    };
  }, [isDraggingDivider, isPanning, zoomLevel, clampPan]);

  // Handle mouse wheel zoom inside the viewport
  const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || zoomLevel > 1) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoomLevel((z) => Math.max(1, Math.min(4, +(z + delta).toFixed(2))));
    }
  };

  // Start panning when dragging on the viewport background
  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomLevel > 1) {
      setIsPanning(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startX: panOffset.x,
        startY: panOffset.y,
      };
    }
  };

  // Click on Minimap to jump pan position
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!minimapRef.current || zoomLevel <= 1) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const clickXPct = ((e.clientX - rect.left) / rect.width) * 100; // 0..100
    const clickYPct = ((e.clientY - rect.top) / rect.height) * 100; // 0..100
    // Center viewport on clicked point: panOffset is inverse of center offset from 50%
    const targetPanX = 50 - clickXPct;
    const targetPanY = 50 - clickYPct;
    setPanOffset(clampPan(targetPanX, targetPanY, zoomLevel));
  };

  const handleResetView = () => {
    playSuzuChime();
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setSliderPos(50);
  };

  /**
   * Download detected objects as CSV and restored image as PNG
   */
  const downloadObjectsCsv = () => {
    const headers = [
      'id',
      'type',
      'x_px',
      'y_px',
      'peak_flux_adu',
      'integrated_flux_adu',
      'instrumental_mag',
      'fwhm_px',
      'radius_px',
      'elongation',
    ];
    const rows = overlayObjects.map((obj) =>
      [
        obj.id,
        obj.type,
        obj.x.toFixed(2),
        obj.y.toFixed(2),
        obj.peakFlux.toFixed(1),
        obj.integratedFlux.toFixed(1),
        obj.instrumentalMag.toFixed(2),
        obj.fwhmPixels.toFixed(2),
        obj.radiusPixels.toFixed(2),
        obj.elongation.toFixed(2),
      ].join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const csvUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = `Tsukuyomi_Detected_Objects_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(csvUrl);
  };

  const downloadRestoredPng = async () => {
    try {
      if (restoredBgUrl.startsWith('data:image/png')) {
        const link = document.createElement('a');
        link.href = restoredBgUrl;
        link.download = `Tsukuyomi_Restored_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Convert image URL to PNG via offscreen canvas
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = restoredBgUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 400;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngDataUrl;
        link.download = `Tsukuyomi_Restored_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {
      // Fallback direct download link
      const link = document.createElement('a');
      link.href = restoredBgUrl;
      link.download = `Tsukuyomi_Restored_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportResultsBoth = async () => {
    playSuzuChime();
    downloadObjectsCsv();
    await downloadRestoredPng();
    setExportNotice('Exported Objects CSV & Restored PNG!');
    setTimeout(() => setExportNotice(null), 3500);
  };

  const activeTooltipObject = hoveredObject || selectedObject;

  // Compute screen-space percentage position for the tooltip taking zoom & pan into account
  const getTransformedPct = (xPct: number, yPct: number) => {
    const tx = 50 + (xPct - 50 + panOffset.x) * zoomLevel;
    const ty = 50 + (yPct - 50 + panOffset.y) * zoomLevel;
    return {
      x: Math.max(14, Math.min(86, tx)),
      y: Math.max(12, Math.min(88, ty)),
    };
  };

  const starCount = overlayObjects.filter((o) => o.type === 'star').length;
  const galaxyCount = overlayObjects.filter((o) => o.type === 'galaxy').length;

  // CSS transform shared by Restored Layer, Raw Layer, and SVG Overlay Layer
  const sharedTransformStyle: React.CSSProperties = {
    transform: `scale(${zoomLevel}) translate(${panOffset.x}%, ${panOffset.y}%)`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  return (
    <section
      id="dojo"
      className="relative min-h-screen py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-[#D4A84B]/20"
    >
      {/* Chapter 04 Header */}
      <div className="border-b border-[#D4A84B]/25 pb-6 mb-8">
        <div className="flex items-center space-x-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
          <span>04. THE DOJO DASHBOARD · 天文道場</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2">
          <div>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#F4EFE3] text-glow-moon">
              Celestial Dojo Visualization
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl leading-relaxed">
              Connected to Spirit Lens output ({captureTitle}). Drag the golden divider to compare original vs. faithfully restored images, zoom and pan with the minimap, and inspect SVG star circles and galaxy ellipses.
            </p>
          </div>

          {/* Toggleable SVG Overlay Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setShowStars(!showStars);
                playKotoNote(523, 0.8);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-colors flex items-center space-x-2 cursor-pointer border tabular-nums ${
                showStars
                  ? 'bg-[#151B38] text-[#D4A84B] border-[#D4A84B]'
                  : 'bg-[#0A0A0F] text-[#8E9BB5] border-[#151B38]'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#D4A84B] inline-block" />
              <span>STARS ({starCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowGalaxies(!showGalaxies);
                playKotoNote(587, 0.8);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-colors flex items-center space-x-2 cursor-pointer border tabular-nums ${
                showGalaxies
                  ? 'bg-[#151B38] text-[#F4EFE3] border-[#B3202A]'
                  : 'bg-[#0A0A0F] text-[#8E9BB5] border-[#151B38]'
              }`}
            >
              <span className="w-3.5 h-2 rounded-full border-2 border-[#B3202A] inline-block" />
              <span>GALAXIES ({galaxyCount})</span>
            </button>
          </div>
        </div>
      </div>

      <ScrollPageControls
        panelIds={['before-after-comparator', 'object-catalog-export', 'dojo-restoration-history']}
        className="mb-8"
      />

      {/* Main Dojo Visualizer & Side Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Before/After Image Comparator with Zoom, Pan & SVG Overlays (8 cols) */}
        <div className="lg:col-span-8">
          <ScrollPanel
            id="before-after-comparator"
            title="Before / After Comparator"
            kanji="比較"
            subtitle={`${captureTitle} · Split-frame, zoom & minimap`}
            icon={Crosshair}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <div
                ref={viewportRef}
                onMouseDown={handleViewportMouseDown}
                onWheel={handleViewportWheel}
            onClick={(e) => {
              // Clicking empty space clears pinned object tooltip
              if (e.target === e.currentTarget) {
                setSelectedObject(null);
              }
            }}
            className={`relative w-full aspect-[16/10] sm:aspect-[16/9] rounded-3xl overflow-hidden border-2 border-[#D4A84B]/60 select-none shadow-[0_0_40px_rgba(212,168,75,0.2)] bg-[#0A0A0F] ${
              zoomLevel > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
            }`}
          >
            {/* 1. Restored Image Layer (Left Side of Divider) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
              }}
            >
              <img
                src={restoredBgUrl}
                alt="Faithfully restored celestial image"
                referrerPolicy="no-referrer"
                draggable={false}
                className="w-full h-full object-cover"
                style={sharedTransformStyle}
              />
            </div>

            {/* 2. Original Raw Image Layer (Right Side of Divider) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                clipPath: `inset(0 0 0 ${sliderPos}%)`,
              }}
            >
              <img
                src={rawBgUrl}
                alt="Original raw telescope capture"
                referrerPolicy="no-referrer"
                draggable={false}
                className="w-full h-full object-cover"
                style={sharedTransformStyle}
              />
            </div>

            {/* 3. SVG Overlay Layer: Circles for Stars, Ellipses for Galaxies */}
            <svg
              viewBox={`0 0 ${imgWidth} ${imgHeight}`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none z-20"
              style={sharedTransformStyle}
            >
              {overlayObjects.map((obj) => {
                const isVisible =
                  (obj.type === 'star' && showStars) ||
                  (obj.type === 'galaxy' && showGalaxies);
                if (!isVisible) return null;

                const isHighlighted =
                  hoveredObject?.id === obj.id || selectedObject?.id === obj.id;

                if (obj.type === 'star') {
                  const r = Math.max(5, Math.min(16, obj.radiusPixels * 2.4));
                  return (
                    <g
                      key={obj.id}
                      transform={`translate(${obj.x}, ${obj.y})`}
                      className="pointer-events-auto cursor-pointer"
                      onMouseEnter={() => setHoveredObject(obj)}
                      onMouseLeave={() =>
                        setHoveredObject((prev) => (prev?.id === obj.id ? null : prev))
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        playKotoNote(523.25, 0.7);
                        setSelectedObject((prev) => (prev?.id === obj.id ? null : obj));
                      }}
                    >
                      {/* Outer pulse ring if highlighted */}
                      {isHighlighted && (
                        <circle
                          r={r + 4}
                          fill="none"
                          stroke="#F4EFE3"
                          strokeWidth={1.2 / zoomLevel}
                          strokeDasharray="2 2"
                        />
                      )}
                      {/* Star Circle Overlay */}
                      <circle
                        r={r}
                        fill={isHighlighted ? 'rgba(212, 168, 75, 0.22)' : 'rgba(212, 168, 75, 0.06)'}
                        stroke="#D4A84B"
                        strokeWidth={(isHighlighted ? 2.0 : 1.3) / Math.sqrt(zoomLevel)}
                      />
                      {/* Crosshair ticks */}
                      <line
                        x1={-r - 3}
                        y1={0}
                        x2={-r + 2}
                        y2={0}
                        stroke="#D4A84B"
                        strokeWidth={1 / Math.sqrt(zoomLevel)}
                      />
                      <line
                        x1={r - 2}
                        y1={0}
                        x2={r + 3}
                        y2={0}
                        stroke="#D4A84B"
                        strokeWidth={1 / Math.sqrt(zoomLevel)}
                      />
                      <line
                        x1={0}
                        y1={-r - 3}
                        x2={0}
                        y2={-r + 2}
                        stroke="#D4A84B"
                        strokeWidth={1 / Math.sqrt(zoomLevel)}
                      />
                      <line
                        x1={0}
                        y1={r - 2}
                        x2={0}
                        y2={r + 3}
                        stroke="#D4A84B"
                        strokeWidth={1 / Math.sqrt(zoomLevel)}
                      />
                    </g>
                  );
                } else {
                  // Galaxy: SVG Ellipse using detected radiusPixels and elongation (a/b)
                  const ry = Math.max(6, Math.min(22, obj.radiusPixels * 2.1));
                  const rx = Math.max(
                    ry * 1.35,
                    Math.min(34, ry * Math.max(1.35, Math.min(2.6, obj.elongation)))
                  );
                  return (
                    <g
                      key={obj.id}
                      transform={`translate(${obj.x}, ${obj.y}) rotate(${obj.angleDeg})`}
                      className="pointer-events-auto cursor-pointer"
                      onMouseEnter={() => setHoveredObject(obj)}
                      onMouseLeave={() =>
                        setHoveredObject((prev) => (prev?.id === obj.id ? null : prev))
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        playKotoNote(392.0, 0.9);
                        setSelectedObject((prev) => (prev?.id === obj.id ? null : obj));
                      }}
                    >
                      {isHighlighted && (
                        <ellipse
                          rx={rx + 4}
                          ry={ry + 4}
                          fill="none"
                          stroke="#F4EFE3"
                          strokeWidth={1.2 / zoomLevel}
                          strokeDasharray="3 2"
                        />
                      )}
                      {/* Galaxy Ellipse Overlay */}
                      <ellipse
                        rx={rx}
                        ry={ry}
                        fill={
                          isHighlighted
                            ? 'rgba(179, 32, 42, 0.25)'
                            : 'rgba(179, 32, 42, 0.08)'
                        }
                        stroke="#EF4444"
                        strokeWidth={(isHighlighted ? 2.2 : 1.5) / Math.sqrt(zoomLevel)}
                      />
                    </g>
                  );
                }
              })}
            </svg>

            {/* 4. Draggable Before/After Divider Line */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingDivider(true);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setIsDraggingDivider(true);
              }}
              className="absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center cursor-ew-resize z-30 group/divider"
              style={{ left: `${sliderPos}%` }}
              role="slider"
              aria-label="Before and after image comparison divider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPos)}
            >
              <div className="w-[3px] h-full bg-gradient-to-b from-[#D4A84B] via-[#F4EFE3] to-[#B3202A] shadow-[0_0_18px_rgba(212,168,75,0.85)]" />
              <div className="absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#0A0A0F] border-2 border-[#D4A84B] group-hover/divider:scale-110 transition-transform flex items-center justify-center text-xs font-mono font-bold text-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.6)]">
                ↔
              </div>
            </div>

            {/* Left & Right Watermark Labels */}
            <div className="absolute bottom-4 left-4 z-20 px-3 py-1 rounded-full bg-[#0A0A0F]/85 backdrop-blur-md border border-[#D4A84B]/40 text-[10px] font-mono text-[#D4A84B] font-bold pointer-events-none">
              RESTORED (WAVELET + RL PSF) · {Math.round(sliderPos)}%
            </div>

            <div className="absolute bottom-4 right-4 z-20 px-3 py-1 rounded-full bg-[#0A0A0F]/85 backdrop-blur-md border border-[#8E9BB5]/40 text-[10px] font-mono text-[#8E9BB5] font-bold pointer-events-none">
              ORIGINAL RAW CAPTURE · {Math.round(100 - sliderPos)}%
            </div>

            {/* 5. Hover / Click Object Tooltip with Brightness & Size */}
            {activeTooltipObject && (
              <div
                style={{
                  left: `${getTransformedPct(activeTooltipObject.xPct, activeTooltipObject.yPct).x}%`,
                  top: `${Math.max(
                    12,
                    getTransformedPct(activeTooltipObject.xPct, activeTooltipObject.yPct).y - 10
                  )}%`,
                }}
                className="absolute z-40 -translate-x-1/2 -translate-y-full p-3 rounded-xl bg-[#070913]/95 border border-[#D4A84B] text-xs font-mono shadow-[0_0_25px_rgba(212,168,75,0.4)] space-y-1 whitespace-nowrap animate-in fade-in tabular-nums"
              >
                <div className="flex items-center justify-between gap-4 border-b border-[#151B38] pb-1">
                  <span className="text-[#D4A84B] font-bold">
                    {activeTooltipObject.id} ·{' '}
                    {activeTooltipObject.type === 'star' ? 'STAR (CIRCLE)' : 'GALAXY (ELLIPSE)'}
                  </span>
                  <span className="text-[10px] text-[#8E9BB5]">
                    ({activeTooltipObject.x.toFixed(1)}, {activeTooltipObject.y.toFixed(1)} px)
                  </span>
                </div>
                <div className="text-[11px] text-[#F4EFE3]">
                  <span className="text-[#8E9BB5]">Brightness:</span> Peak{' '}
                  <strong className="text-[#D4A84B]">
                    {activeTooltipObject.peakFlux.toFixed(1)} ADU
                  </strong>{' '}
                  · Integrated{' '}
                  <strong className="text-[#F4EFE3]">
                    {activeTooltipObject.integratedFlux.toFixed(1)} ADU
                  </strong>{' '}
                  ({activeTooltipObject.instrumentalMag.toFixed(2)} mag)
                </div>
                <div className="text-[11px] text-[#F4EFE3]">
                  <span className="text-[#8E9BB5]">Size:</span> FWHM{' '}
                  <strong className="text-[#D4A84B]">
                    {activeTooltipObject.fwhmPixels.toFixed(2)} px
                  </strong>{' '}
                  · Radius{' '}
                  <strong className="text-[#F4EFE3]">
                    {activeTooltipObject.radiusPixels.toFixed(2)} px
                  </strong>{' '}
                  · Elongation {activeTooltipObject.elongation.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Zoom, Pan, Divider Scrubber & Interactive Minimap Bar */}
          <div className="flex flex-wrap items-center justify-between bg-[#0E1326] border border-[#151B38] p-4 rounded-2xl gap-4">
            {/* Zoom Controls */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-[#8E9BB5]">ZOOM & PAN:</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
                className="p-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] hover:text-[#0A0A0F] text-[#F4EFE3] transition-colors cursor-pointer"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-[#D4A84B] px-2 font-bold tabular-nums">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(4, +(z + 0.5).toFixed(2)))}
                className="p-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] hover:text-[#0A0A0F] text-[#F4EFE3] transition-colors cursor-pointer"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetView}
                className="px-2.5 py-1.5 rounded-lg bg-[#151B38] hover:text-[#D4A84B] text-[#8E9BB5] text-xs font-mono transition-colors cursor-pointer flex items-center space-x-1 ml-1"
                title="Reset Zoom, Pan & Divider"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* Pan status hint */}
            <div className="hidden sm:flex items-center space-x-1.5 text-[11px] font-mono text-[#8E9BB5]">
              <Move className="w-3.5 h-3.5 text-[#D4A84B]" />
              <span>
                {zoomLevel > 1
                  ? 'Drag canvas or click minimap to pan'
                  : 'Zoom in (>100%) to pan across frame'}
              </span>
            </div>

            {/* Interactive Minimap Thumbnail */}
            <div className="flex items-center space-x-3 text-xs font-mono text-[#8E9BB5]">
              <span>MINIMAP</span>
              <div
                ref={minimapRef}
                onClick={handleMinimapClick}
                title="Click minimap to pan viewport"
                className="relative w-24 h-14 rounded-lg border border-[#D4A84B]/50 bg-cover bg-center overflow-hidden cursor-crosshair shadow-inner"
                style={{ backgroundImage: `url(${restoredBgUrl})` }}
              >
                {/* Viewport Indicator Box inside Minimap */}
                <div
                  className="absolute border-2 border-[#D4A84B] bg-[#B3202A]/25 pointer-events-none transition-all duration-100"
                  style={{
                    width: `${100 / zoomLevel}%`,
                    height: `${100 / zoomLevel}%`,
                    left: `${50 - panOffset.x}%`,
                    top: `${50 - panOffset.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>
            </div>
          </div>
            </div>
          </ScrollPanel>
        </div>

        {/* Right: Object Catalog Side Panel & Export Results (CSV + PNG) (4 cols) */}
        <div className="lg:col-span-4">
          <ScrollPanel
            id="object-catalog-export"
            title="Object Catalog & Export"
            kanji="星録"
            subtitle={`${overlayObjects.length} resolved objects · CSV & PNG export`}
            icon={Download}
            defaultOpen={false}
          >
            <div className="bg-[#0E1326] border border-[#D4A84B]/40 p-6 rounded-2xl space-y-5 shadow-[0_0_25px_rgba(212,168,75,0.15)]">
              <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                <div>
                  <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-widest font-bold block">
                    Spirit Lens Catalog Output
                  </span>
                  <h3 className="font-serif text-xl font-bold text-[#F4EFE3]">
                    Resolved Objects ({overlayObjects.length})
                  </h3>
                </div>
            <span className="font-kanji text-lg text-[#D4A84B]/60">星録</span>
          </div>

          {/* List of Detected Objects (Click or Hover to Inspect on Canvas) */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1 tabular-nums">
            {overlayObjects.map((item) => {
              const isSelected =
                selectedObject?.id === item.id || hoveredObject?.id === item.id;

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredObject(item)}
                  onMouseLeave={() =>
                    setHoveredObject((prev) => (prev?.id === item.id ? null : prev))
                  }
                  onClick={() => {
                    playKotoNote(item.type === 'star' ? 523.25 : 392.0, 0.8);
                    setSelectedObject((prev) => (prev?.id === item.id ? null : item));
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#151B38] border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.2)]'
                      : 'bg-[#0A0A0F]/70 border-[#151B38] hover:border-[#D4A84B]/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-[#F4EFE3] flex items-center space-x-1.5">
                      <Crosshair className="w-3 h-3 text-[#D4A84B]" />
                      <span>{item.id}</span>
                      <span
                        className={`text-[10px] uppercase ${
                          item.type === 'star' ? 'text-[#D4A84B]' : 'text-[#F87171]'
                        }`}
                      >
                        ({item.type})
                      </span>
                    </span>
                    <span className="text-[#8E9BB5] text-[10.5px]">
                      X:{item.x.toFixed(1)}, Y:{item.y.toFixed(1)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] font-mono text-[#F4EFE3]/90 mt-1">
                    <span>Peak: {item.peakFlux.toFixed(0)} ADU</span>
                    <span>Int: {item.integratedFlux.toFixed(0)} ADU</span>
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] font-mono text-[#8E9BB5] mt-0.5">
                    <span>FWHM: {item.fwhmPixels.toFixed(2)} px</span>
                    <span>Radius: {item.radiusPixels.toFixed(2)} px</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Export Results Buttons: Downloads CSV + Restored PNG */}
          <div className="pt-3 border-t border-[#151B38] space-y-2.5">
            {exportNotice && (
              <div className="text-center text-xs font-mono text-[#D4A84B] font-bold animate-in fade-in">
                {exportNotice}
              </div>
            )}

            <button
              type="button"
              onClick={handleExportResultsBoth}
              className="w-full py-3 rounded-full bg-[#D4A84B] hover:bg-[#e4be68] text-[#0A0A0F] font-sans text-xs font-bold tracking-widest uppercase transition-all glow-gold flex items-center justify-center space-x-2 cursor-pointer shadow-[0_0_20px_rgba(212,168,75,0.3)]"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT RESULTS (CSV + PNG)</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  playSuzuChime();
                  downloadObjectsCsv();
                }}
                className="py-2 px-3 rounded-xl bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-[10px] font-bold uppercase transition-colors flex items-center justify-center space-x-1.5 cursor-pointer border border-[#D4A84B]/30"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Objects CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSuzuChime();
                  downloadRestoredPng();
                }}
                className="py-2 px-3 rounded-xl bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-[10px] font-bold uppercase transition-colors flex items-center justify-center space-x-1.5 cursor-pointer border border-[#D4A84B]/30"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Restored PNG</span>
              </button>
            </div>
          </div>
            </div>
          </ScrollPanel>

          <div className="mt-6">
            <ScrollPanel
              id="dojo-restoration-history"
              title="Restoration History"
              kanji="履歴"
              subtitle={`${history.length} saved captures`}
              icon={History}
              defaultOpen={true}
            >
              <div className="bg-[#0E1326] border border-[#D4A84B]/40 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                  <div>
                    <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-widest font-bold block">
                      PAST RESTORATIONS
                    </span>
                    <h4 className="font-serif text-base font-bold text-[#F4EFE3]">
                      Compare Saved Plates ({history.length})
                    </h4>
                  </div>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        playSuzuChime();
                        void clearHistory();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0A0A0F] border border-[#B3202A]/50 hover:border-[#B3202A] text-[10px] font-mono text-[#F87171] cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {history.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {history.map((item) => {
                      const isCurrent =
                        captureTitle === item.captureTitle &&
                        restorationResult?.restoredImageDataUrl === item.result.restoredImageDataUrl;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            playSuzuChime();
                            selectHistoryEntry(item);
                          }}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                            isCurrent
                              ? 'bg-[#151B38] border-[#D4A84B]'
                              : 'bg-[#0A0A0F]/80 border-[#151B38] hover:border-[#D4A84B]/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.result.restoredImageDataUrl}
                              alt={item.captureTitle}
                              className="w-12 h-9 rounded-lg object-cover border border-[#D4A84B]/40 shrink-0 bg-[#0A0A0F]"
                            />
                            <div className="min-w-0">
                              <p className="font-serif text-xs font-bold text-[#F4EFE3] truncate">
                                {item.captureTitle}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8E9BB5] tabular-nums">
                                <Clock className="w-2.5 h-2.5 text-[#D4A84B]" />
                                <span>
                                  {new Date(item.savedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                <span>·</span>
                                <span>{item.result.counts.total} objs</span>
                              </div>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-[#D4A84B] font-bold shrink-0">
                            {isCurrent ? 'ACTIVE' : 'COMPARE'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="font-mono text-xs text-[#8E9BB5] text-center py-4">
                    Restore an image in the Spirit Lens to build your comparison history.
                  </p>
                )}
              </div>
            </ScrollPanel>
          </div>
        </div>
      </div>
    </section>
  );
};
