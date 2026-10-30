import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Database,
  Eye,
  AlertTriangle,
  CheckCircle2,
  History,
  Trash2,
  Clock,
} from 'lucide-react';
import { playSuzuChime, playKotoNote } from '../utils/soundEngine';
import { awardImageRestoredPoints } from '../utils/honorSystem';
import { ScrollPanel, ScrollPageControls } from './common/ScrollPanel';
import { useRestorationState } from '../utils/restorationContext';
import type { StoredRestoration } from '../utils/imageStore';

export interface DetectedAstroObject {
  id: string;
  type: 'star' | 'galaxy';
  x: number;
  y: number;
  xPct: number;
  yPct: number;
  brightness: {
    peakFlux: number;
    integratedFlux: number;
    instrumentalMag: number;
  };
  size: {
    fwhmPixels: number;
    radiusPixels: number;
    elongation: number;
  };
}

export interface FaithfulnessMetrics {
  totalFluxBefore: number;
  totalFluxAfter: number;
  fluxDiffPercent: number;
  fluxConserved: boolean;
  originalCounts: {
    stars: number;
    galaxies: number;
    total: number;
  };
  restoredCounts: {
    stars: number;
    galaxies: number;
    total: number;
  };
  objectCountDiffPercent: number;
  noObjectsAdded: boolean;
  noiseSigmaBefore: number;
  noiseSigmaAfter: number;
  estimatedPsfFwhmPixels: number;
  originalInputDimensions: {
    width: number;
    height: number;
  };
  downscaledDimensions: {
    width: number;
    height: number;
  };
  wasDownscaledTo2048: boolean;
  methodologyNote: string;
}

export interface AstroRestorationResponse {
  restoredImageDataUrl: string;
  rawImageDataUrl: string;
  width: number;
  height: number;
  parameters: {
    denoiseStrength: number;
    deblurStrength: number;
    denoiseMethod: string;
    deblurMethod: string;
    estimatedPsfSigma: number;
    estimatedPsfFwhmPixels: number;
    rlIterations: number;
    backgroundMedian: number;
    backgroundRms: number;
  };
  counts: {
    stars: number;
    galaxies: number;
    total: number;
  };
  faithfulness?: FaithfulnessMetrics;
  objects: DetectedAstroObject[];
}

interface SpiritLensSectionProps {
  onNavigateToDojo: () => void;
  onRestorationComplete?: (result: AstroRestorationResponse, captureTitle: string) => void;
  /** True once saved data has been looked up in IndexedDB */
  storageReady?: boolean;
  /** Previously saved result (if any) to show instead of re-running the default sample */
  initialRestoration?: AstroRestorationResponse | null;
  initialCaptureTitle?: string;
}

const SAMPLE_PRESETS = [
  {
    name: 'Pillars of Creation (Hubble/JWST)',
    assetUrl: '/assets/images/pillars_of_creation.jpg',
    credit: 'Image: NASA, ESA, STScI',
  },
  {
    name: 'Carina Nebula (JWST)',
    assetUrl: '/assets/images/carina_nebula.jpg',
    credit: 'Image: NASA, ESA, STScI',
  },
  {
    name: 'Andromeda Galaxy (M31)',
    assetUrl: '/assets/images/andromeda_m31.jpg',
    credit: 'Image: NASA, ESA, STScI',
  },
] as const;

export const SpiritLensSection: React.FC<SpiritLensSectionProps> = ({
  onNavigateToDojo,
  onRestorationComplete,
  storageReady = true,
  initialRestoration = null,
  initialCaptureTitle,
}) => {
  const { history, selectHistoryEntry, clearHistory } = useRestorationState();
  const [denoise, setDenoise] = useState<number>(65);
  const [deblur, setDeblur] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedSample, setSelectedSample] = useState<string>('Pillars of Creation (Hubble/JWST)');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [showRawComparison, setShowRawComparison] = useState<boolean>(false);
  const [showOverlayMarkers, setShowOverlayMarkers] = useState<boolean>(true);
  const [restorationData, setRestorationData] = useState<AstroRestorationResponse | null>(null);

  const [honorAwardBanner, setHonorAwardBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLoadFromHistory = (entry: StoredRestoration) => {
    playSuzuChime();
    setRestorationData(entry.result);
    setSelectedSample(entry.captureTitle);
    setDenoise(entry.result.parameters.denoiseStrength);
    setDeblur(entry.result.parameters.deblurStrength);
    setShowRawComparison(false);
    selectHistoryEntry(entry);
  };

  /**
   * Execute POST /api/restore with either the user's uploaded file or the selected telescope sample
   */
  const executeRestoreRequest = useCallback(
    async (
      fileToProcess: File | null,
      sampleName: string,
      denoiseVal: number,
      deblurVal: number,
      shouldAwardHonor = false
    ) => {
      setIsProcessing(true);
      setErrorMessage(null);

      try {
        let response: Response;
        if (fileToProcess) {
          const formData = new FormData();
          formData.append('image', fileToProcess);
          formData.append('denoiseStrength', String(denoiseVal));
          formData.append('deblurStrength', String(deblurVal));

          response = await fetch('/api/restore', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(60000),
          });
        } else {
          response = await fetch('/api/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              samplePreset: sampleName,
              denoiseStrength: denoiseVal,
              deblurStrength: deblurVal,
            }),
            signal: AbortSignal.timeout(60000),
          });
        }

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `Restoration server returned HTTP ${response.status}`);
        }

        const data: AstroRestorationResponse = await response.json();
        setRestorationData(data);
        setShowRawComparison(false);
        const captureTitle = fileToProcess ? fileToProcess.name : sampleName;
        if (shouldAwardHonor) {
          const honorRes = awardImageRestoredPoints(captureTitle);
          if (honorRes.awarded) {
            setHonorAwardBanner(
              `+${honorRes.pointsAdded} Honor Points awarded for faithful restoration of "${captureTitle}"!`
            );
            setTimeout(() => setHonorAwardBanner(null), 5000);
          }
        }
        if (onRestorationComplete) {
          onRestorationComplete(data, captureTitle);
        }
      } catch (err) {
        if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          setErrorMessage(
            'Astrophotography restoration timed out after 60 seconds. Please try a smaller image or lower deconvolution settings.'
          );
        } else {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Unable to complete faithful image restoration.'
          );
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [onRestorationComplete]
  );

  // Run initial faithful restoration on mount so the table and counts are populated from real pixel analysis
  // (skipped when a saved result exists in IndexedDB - we show that instead)
  const hasInitialisedRef = useRef(false);
  useEffect(() => {
    if (!storageReady || hasInitialisedRef.current) return;
    hasInitialisedRef.current = true;
    if (initialRestoration) {
      setRestorationData(initialRestoration);
      if (initialCaptureTitle) setSelectedSample(initialCaptureTitle);
      return;
    }
    executeRestoreRequest(null, 'Pillars of Creation (Hubble/JWST)', 65, 50, false);
  }, [storageReady, initialRestoration, initialCaptureTitle, executeRestoreRequest]);

  const handleRestoreClick = () => {
    playKotoNote(311.13, 1.4);
    executeRestoreRequest(uploadedFile, selectedSample, denoise, deblur, true);
    setTimeout(() => playSuzuChime(), 600);
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    playSuzuChime();
    setUploadedFile(file);
    setSelectedSample(file.name);
    executeRestoreRequest(file, file.name, denoise, deblur, true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFileChange(file);
    } else if (file) {
      setErrorMessage('Please upload a supported image file (PNG, JPG, WebP, or TIFF).');
    }
  };

  const handleSelectSamplePreset = (name: string) => {
    playKotoNote(392, 1.0);
    setUploadedFile(null);
    setSelectedSample(name);
    executeRestoreRequest(null, name, denoise, deblur, true);
  };

  const matchedPreset =
    SAMPLE_PRESETS.find((p) => p.name === selectedSample) || SAMPLE_PRESETS[0];

  const displayedImageUrl = restorationData
    ? showRawComparison
      ? restorationData.rawImageDataUrl
      : restorationData.restoredImageDataUrl
    : matchedPreset.assetUrl;

  const faithfulness = restorationData?.faithfulness;
  const isFluxUnderOnePercent = faithfulness ? faithfulness.fluxDiffPercent < 1.0 : true;
  const isNoObjectsAdded = faithfulness
    ? faithfulness.restoredCounts.total <= faithfulness.originalCounts.total * 1.02
    : true;

  return (
    <section
      id="lens"
      className="relative min-h-screen py-24 px-4 sm:px-8 max-w-7xl mx-auto border-t border-[#D4A84B]/20"
    >
      {/* Chapter 03 Header */}
      <div className="border-b border-[#D4A84B]/25 pb-6 mb-8">
        <div className="flex items-center space-x-2 text-xs font-mono tracking-[0.25em] uppercase text-[#D4A84B]">
          <span>03. THE SPIRIT LENS · 霊鏡</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2">
          <div>
            <h2 className="font-serif text-3xl sm:text-5xl font-bold text-[#F4EFE3] text-glow-moon">
              Faithful Astrophotography Restoration
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#8E9BB5] mt-1 max-w-2xl leading-relaxed">
              Deconvolve atmospheric seeing blur and sensor thermal noise using physics-based Wavelet/Non-Local Means denoising and Richardson-Lucy Gaussian PSF deconvolution.
            </p>
          </div>

          <div className="text-right text-xs font-mono text-[#D4A84B] tabular-nums">
            <span className="px-3 py-1 rounded-full bg-[#151B38] border border-[#D4A84B]/40 block">
              {restorationData
                ? `PSF FWHM: ${restorationData.parameters.estimatedPsfFwhmPixels}px · RL ITERS: ${restorationData.parameters.rlIterations}`
                : 'POINT SPREAD FUNCTION · PSF KERNEL'}
            </span>
          </div>
        </div>
      </div>

      {honorAwardBanner && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#D4A84B]/15 border border-[#D4A84B] flex items-center justify-between text-xs font-mono text-[#F4EFE3] shadow-lg">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#D4A84B] shrink-0" />
            <span>{honorAwardBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setHonorAwardBanner(null)}
            className="text-[#8E9BB5] hover:text-[#F4EFE3] ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <ScrollPageControls
        panelIds={[
          'upload-viewport',
          'restoration-controls',
          'restoration-history',
          'faithfulness-report',
          'detected-objects',
        ]}
        className="mb-8"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Drag & Drop Upload Area & Restored Viewport (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <ScrollPanel
            id="upload-viewport"
            title="Upload & Viewport"
            kanji="撮影"
            subtitle={`Active capture: ${selectedSample}`}
            icon={Upload}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center bg-[#0E1326]/70 backdrop-blur-md shadow-[0_0_30px_rgba(212,168,75,0.12)] transition-all group overflow-hidden ${
              isDraggingOver
                ? 'border-[#D4A84B] bg-[#151B38]/80 scale-[1.01]'
                : 'border-[#D4A84B]/60 hover:border-[#D4A84B]'
            }`}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              className="hidden"
            />

            {/* Corner Calligraphy Seals */}
            <span className="absolute top-4 left-4 font-kanji text-xs text-[#D4A84B]/50">
              霊鏡
            </span>
            <span className="absolute bottom-4 right-4 font-kanji text-xs text-[#D4A84B]/50">
              忠実復元
            </span>

            {/* Active Restored / Raw Preview Frame */}
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 border border-[#151B38] bg-[#0A0A0F] shadow-inner">
              <img
                src={displayedImageUrl}
                alt={`Astrophotography capture: ${selectedSample}`}
                referrerPolicy="no-referrer"
                onError={() => {
                  setErrorMessage(
                    `Sample image file for "${selectedSample}" is missing or could not be loaded.`
                  );
                }}
                className={`w-full h-full object-cover transition-all duration-300 ${
                  isProcessing ? 'blur-sm opacity-60' : 'opacity-100'
                }`}
              />

              {/* Detected Star & Galaxy Source Markers Overlay */}
              {restorationData && showOverlayMarkers && !isProcessing && (
                <div className="absolute inset-0 pointer-events-none">
                  {restorationData.objects.slice(0, 45).map((obj) => (
                    <div
                      key={obj.id}
                      style={{
                        left: `${obj.xPct}%`,
                        top: `${obj.yPct}%`,
                        width: `${Math.max(10, Math.min(28, obj.size.radiusPixels * 3.5))}px`,
                        height: `${Math.max(10, Math.min(28, obj.size.radiusPixels * 3.5))}px`,
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                        obj.type === 'star'
                          ? 'border-[#D4A84B]/80'
                          : 'border-[#B3202A] border-2'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Processing Overlay with Ink-Wash Loader Animation */}
              {isProcessing && (
                <div className="absolute inset-0 bg-[#0A0A0F]/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4 z-20">
                  <div className="w-16 h-16 rounded-full border-2 border-[#D4A84B] border-t-transparent animate-spin flex items-center justify-center">
                    <span className="font-kanji text-lg text-[#D4A84B]">墨</span>
                  </div>
                  <div className="space-y-1">
                    <span className="font-mono text-xs text-[#D4A84B] uppercase tracking-widest font-bold block animate-pulse">
                      Restoring Cosmic Wavefront...
                    </span>
                    <span className="text-[10px] font-mono text-[#8E9BB5] block">
                      Wavelet/NLM Denoising ({denoise}%) · Richardson-Lucy PSF Deconvolution ({deblur}%)
                    </span>
                  </div>
                </div>
              )}

              {/* Top Right Quick Toggle: Restored vs Raw & Source Overlay */}
              {restorationData && !isProcessing && (
                <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
                  <button
                    type="button"
                    onClick={() => setShowOverlayMarkers(!showOverlayMarkers)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-mono border backdrop-blur-md cursor-pointer transition-colors ${
                      showOverlayMarkers
                        ? 'bg-[#0E1326]/90 text-[#D4A84B] border-[#D4A84B]'
                        : 'bg-[#0A0A0F]/80 text-[#8E9BB5] border-[#151B38]'
                    }`}
                  >
                    {showOverlayMarkers ? 'Markers: ON' : 'Markers: OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRawComparison(!showRawComparison)}
                    className="px-2.5 py-1 rounded-full bg-[#0E1326]/90 backdrop-blur-md text-[10px] font-mono text-[#F4EFE3] border border-[#D4A84B]/50 hover:border-[#D4A84B] cursor-pointer flex items-center space-x-1"
                  >
                    <Eye className="w-3 h-3 text-[#D4A84B]" />
                    <span>{showRawComparison ? 'Viewing: RAW INPUT' : 'Viewing: RESTORED'}</span>
                  </button>
                </div>
              )}

              {/* Bottom Left Status Badge */}
              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-[#0A0A0F]/85 backdrop-blur-md text-[10px] font-mono text-[#D4A84B] border border-[#D4A84B]/30">
                ACTIVE CAPTURE: {selectedSample}
                {restorationData ? ` (${restorationData.width}×${restorationData.height}px)` : ''}
              </div>
            </div>

            {/* Upload Trigger & Sample Selection */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-12 h-12 rounded-full bg-[#151B38] border border-[#D4A84B]/40 hover:border-[#D4A84B] flex items-center justify-center mx-auto text-[#D4A84B] group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(212,168,75,0.2)] cursor-pointer"
                aria-label="Upload telescope image"
              >
                <Upload className="w-5 h-5" />
              </button>

              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-serif text-lg font-bold text-[#F4EFE3] hover:text-[#D4A84B] transition-colors cursor-pointer"
                >
                  Drop your Hubble, JWST or telescope image (or click to browse)
                </button>
                <p className="font-sans text-xs text-[#8E9BB5] mt-0.5">
                  Uploads directly to <code className="font-mono text-[#D4A84B]">POST /api/restore</code> for Wavelet/NLM denoising, Richardson-Lucy PSF deconvolution & source catalog extraction.
                </p>
                <p className="font-mono text-[10px] text-[#D4A84B]/90 mt-1">
                  Note: Uploaded images are automatically downscaled so the longest side is at most 2048 px before processing (60s server timeout).
                  {faithfulness?.wasDownscaledTo2048 && (
                    <span className="text-[#4ADE80] ml-1">
                      · Input ({faithfulness.originalInputDimensions.width}×{faithfulness.originalInputDimensions.height}px) downscaled to {faithfulness.downscaledDimensions.width}×{faithfulness.downscaledDimensions.height}px.
                    </span>
                  )}
                </p>
              </div>

              {/* Sample Preset Buttons */}
              <div className="pt-2 space-y-2 text-[10px] font-mono text-[#8E9BB5]">
                <span className="block">Sample Captures:</span>
                <div className="flex flex-wrap items-start justify-center gap-3">
                  {SAMPLE_PRESETS.map((preset) => (
                    <div key={preset.name} className="flex flex-col items-center space-y-1">
                      <button
                        type="button"
                        onClick={() => handleSelectSamplePreset(preset.name)}
                        className={`px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                          selectedSample === preset.name && !uploadedFile
                            ? 'bg-[#D4A84B] text-[#0A0A0F] font-bold border-[#D4A84B]'
                            : 'bg-[#0A0A0F] border-[#151B38] hover:text-[#D4A84B]'
                        }`}
                      >
                        {preset.name}
                      </button>
                      <span className="text-[9px] text-[#8E9BB5]/80">
                        {preset.credit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-[#B3202A]/15 border border-[#B3202A] flex items-center space-x-2.5 text-xs font-mono text-[#F4EFE3]">
              <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
            </div>
          </ScrollPanel>
        </div>

        {/* Right: Restoration Controls, Faithfulness Report & Object Detection Table (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Restoration Controls ScrollPanel */}
          <ScrollPanel
            id="restoration-controls"
            title="Restoration Controls"
            kanji="復元"
            subtitle={`Denoise ${denoise}% · RL Deconvolution ${deblur}%`}
            icon={Sparkles}
            defaultOpen={true}
          >
            <div className="bg-[#0E1326] border border-[#D4A84B]/50 p-6 rounded-2xl space-y-5 shadow-[0_0_25px_rgba(212,168,75,0.15)]">
              <div className="border-b border-[#151B38] pb-3">
                <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-widest font-bold block">
                  Restoration Parameters
                </span>
              <h3 className="font-serif text-xl font-bold text-[#F4EFE3]">
                Wavefront Deconvolution
              </h3>
            </div>

            {/* Denoise Slider */}
            <div className="space-y-1.5 font-mono text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-[#8E9BB5]">Wavelet / Non-Local Means Denoise</span>
                <span className="text-[#D4A84B] font-bold">{denoise}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                className="w-full accent-[#D4A84B] cursor-pointer"
              />
            </div>

            {/* Deblur Slider */}
            <div className="space-y-1.5 font-mono text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-[#8E9BB5]">Richardson-Lucy PSF Deblur Strength</span>
                <span className="text-[#D4A84B] font-bold">{deblur}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={deblur}
                onChange={(e) => setDeblur(Number(e.target.value))}
                className="w-full accent-[#D4A84B] cursor-pointer"
              />
            </div>

            {/* Sacred Scientific Note */}
            <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38] flex items-start space-x-2 text-[11px] font-mono text-[#D4A84B]">
              <ShieldCheck className="w-4 h-4 text-[#B3202A] shrink-0 mt-0.5" />
              <span>
                Faithful restoration only: Non-Local Means / Starlet Wavelet denoising + flux-conserving Richardson-Lucy Gaussian PSF deconvolution. Zero generative AI or hallucinated details.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleRestoreClick}
                disabled={isProcessing}
                className="w-full py-3.5 rounded-full bg-[#B3202A] hover:bg-[#c72732] disabled:opacity-50 text-[#F4EFE3] font-sans text-xs font-bold tracking-widest uppercase transition-all glow-crimson flex items-center justify-center space-x-2 cursor-pointer shadow-[0_0_20px_rgba(179,32,42,0.4)]"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {isProcessing ? 'CALCULATING DECONVOLUTION...' : 'RESTORE CELESTIAL WAVEFRONT'}
                </span>
              </button>

              <button
                type="button"
                onClick={onNavigateToDojo}
                className="w-full py-2.5 rounded-full bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-sans text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center space-x-1.5 border border-[#D4A84B]/30 cursor-pointer"
              >
                <span>Compare in Dojo Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          </ScrollPanel>

          {/* 2. Faithfulness Report ScrollPanel */}
          <ScrollPanel
            id="faithfulness-report"
            title="Faithfulness Report"
            kanji="検証"
            subtitle="Photometric flux conservation & source verification"
            icon={ShieldCheck}
            defaultOpen={false}
          >
            <div className="bg-[#0E1326] border border-[#D4A84B]/40 p-5 rounded-2xl space-y-4 shadow-[0_0_20px_rgba(212,168,75,0.1)]">
              <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-[#D4A84B]" />
                  <h4 className="font-serif text-sm font-bold text-[#F4EFE3]">
                    Faithfulness Report
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-[#D4A84B] uppercase tracking-wider">
                  PHOTOMETRIC AUDIT
                </span>
              </div>

            {faithfulness ? (
              <div className="space-y-3 font-mono text-xs tabular-nums">
                {/* 1. Total Flux Before vs After & % Difference */}
                <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#8E9BB5]">
                      Total Flux (Before vs After)
                    </span>
                    <span
                      className={`inline-flex items-center space-x-1 text-[11px] font-bold ${
                        isFluxUnderOnePercent ? 'text-[#4ADE80]' : 'text-[#FBBF24]'
                      }`}
                    >
                      {isFluxUnderOnePercent ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
                      )}
                      <span>Δ {faithfulness.fluxDiffPercent.toFixed(3)}%</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#F4EFE3]">
                    <span>
                      Before: <strong className="text-[#D4A84B]">{faithfulness.totalFluxBefore.toLocaleString()}</strong> ADU
                    </span>
                    <span>
                      After: <strong className="text-[#D4A84B]">{faithfulness.totalFluxAfter.toLocaleString()}</strong> ADU
                    </span>
                  </div>
                </div>

                {/* 2. Star & Galaxy Counts (Original vs Restored) */}
                <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#8E9BB5]">
                      Detected Objects (Orig vs Restored)
                    </span>
                    {isNoObjectsAdded ? (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-[#4ADE80]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
                        <span>No objects added</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-[#FBBF24]">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
                        <span>+{faithfulness.objectCountDiffPercent.toFixed(1)}% objects</span>
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-[#F4EFE3] pt-0.5">
                    <div className="bg-[#151B38]/40 px-2.5 py-1.5 rounded-lg">
                      <span className="text-[9px] text-[#8E9BB5] block uppercase">Original</span>
                      <span>
                        {faithfulness.originalCounts.stars} stars · {faithfulness.originalCounts.galaxies} galaxies ({faithfulness.originalCounts.total})
                      </span>
                    </div>
                    <div className="bg-[#151B38]/40 px-2.5 py-1.5 rounded-lg">
                      <span className="text-[9px] text-[#8E9BB5] block uppercase">Restored</span>
                      <span>
                        {faithfulness.restoredCounts.stars} stars · {faithfulness.restoredCounts.galaxies} galaxies ({faithfulness.restoredCounts.total})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Noise Sigma Before vs After & Estimated PSF FWHM */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                    <span className="text-[10px] uppercase tracking-wider text-[#8E9BB5] block">
                      Estimated Noise σ
                    </span>
                    <span className="text-xs font-bold text-[#F4EFE3] mt-1 block">
                      {faithfulness.noiseSigmaBefore.toFixed(2)} →{' '}
                      <span className="text-[#4ADE80]">{faithfulness.noiseSigmaAfter.toFixed(2)}</span> ADU
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0A0A0F] border border-[#151B38]">
                    <span className="text-[10px] uppercase tracking-wider text-[#8E9BB5] block">
                      Estimated PSF FWHM
                    </span>
                    <span className="text-xs font-bold text-[#D4A84B] mt-1 block">
                      {faithfulness.estimatedPsfFwhmPixels.toFixed(2)} px
                    </span>
                  </div>
                </div>

                {/* 4. Required Methodology Note */}
                <p className="text-[11px] font-sans text-[#8E9BB5] pt-1 leading-relaxed border-t border-[#151B38]">
                  Restoration uses wavelet + non-local-means denoising and Richardson-Lucy deconvolution. No generative AI.
                </p>
              </div>
            ) : (
              <div className="py-4 text-center font-mono text-xs text-[#8E9BB5]">
                {isProcessing
                  ? 'Computing photometric faithfulness metrics...'
                  : 'Run restoration to view flux conservation & object verification metrics.'}
              </div>
            )}
          </div>
          </ScrollPanel>

          {/* 3. Detected Objects Table ScrollPanel */}
          <ScrollPanel
            id="detected-objects"
            title="Detected Objects Table"
            kanji="星表"
            subtitle={
              restorationData
                ? `${restorationData.counts.stars} stars · ${restorationData.counts.galaxies} galaxies`
                : 'Scanning stellar & galactic sources'
            }
            icon={Database}
            defaultOpen={false}
          >
            <div className="bg-[#0E1326] border border-[#151B38] p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-[#D4A84B]" />
                  <span className="font-serif text-sm font-bold text-[#F4EFE3]">
                    Object Detection Matrix
                  </span>
                </div>
              <span className="text-[10px] font-mono text-[#D4A84B] font-bold tabular-nums">
                {restorationData
                  ? `${restorationData.counts.stars} STARS · ${restorationData.counts.galaxies} GALAXIES`
                  : 'SCANNING SOURCES...'}
              </span>
            </div>

            {/* Object Table: type (star/galaxy), x, y, brightness (peak & integrated flux), size (FWHM / radius in px) */}
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left font-mono text-xs text-[#8E9BB5] tabular-nums">
                <thead className="text-[9px] text-[#D4A84B] border-b border-[#151B38] uppercase sticky top-0 bg-[#0E1326]">
                  <tr>
                    <th className="pb-2 pr-2">ID / Type</th>
                    <th className="pb-2 px-1">X, Y (px)</th>
                    <th className="pb-2 px-1 text-right">Peak / Int Flux</th>
                    <th className="pb-2 pl-1 text-right">FWHM / Rad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#151B38]/50 text-[10.5px]">
                  {restorationData && restorationData.objects.length > 0 ? (
                    restorationData.objects.map((obj) => (
                      <tr key={obj.id} className="hover:bg-[#121626] transition-colors">
                        <td className="py-2 pr-2">
                          <span className="text-[#F4EFE3] font-bold block">{obj.id}</span>
                          <span
                            className={`text-[9px] uppercase ${
                              obj.type === 'star' ? 'text-[#D4A84B]' : 'text-[#F87171]'
                            }`}
                          >
                            {obj.type}
                          </span>
                        </td>
                        <td className="py-2 px-1 text-[#F4EFE3]">
                          {obj.x.toFixed(1)}, {obj.y.toFixed(1)}
                        </td>
                        <td className="py-2 px-1 text-right">
                          <span className="text-[#D4A84B] font-semibold block">
                            {obj.brightness.peakFlux.toFixed(0)} ADU
                          </span>
                          <span className="text-[9.5px] text-[#8E9BB5] block">
                            Σ {obj.brightness.integratedFlux.toFixed(0)}
                          </span>
                        </td>
                        <td className="py-2 pl-1 text-right">
                          <span className="text-[#F4EFE3] block">
                            {obj.size.fwhmPixels.toFixed(2)} px
                          </span>
                          <span className="text-[9.5px] text-[#8E9BB5] block">
                            r={obj.size.radiusPixels.toFixed(1)}px
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-[#8E9BB5]">
                        {isProcessing
                          ? 'Extracting stellar & galactic sources...'
                          : 'Upload an image or click Restore to detect objects.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </ScrollPanel>

          {/* 4. Restoration History ScrollPanel */}
          <ScrollPanel
            id="restoration-history"
            title="Restoration History"
            kanji="履歴"
            subtitle={`${history.length} saved captures in IndexedDB`}
            icon={History}
            defaultOpen={true}
          >
            <div className="bg-[#0E1326] border border-[#D4A84B]/40 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#151B38] pb-3">
                <div className="flex items-center space-x-2">
                  <History className="w-4 h-4 text-[#D4A84B]" />
                  <div>
                    <span className="font-serif text-sm font-bold text-[#F4EFE3] block">
                      Chronicle of Restored Captures
                    </span>
                    <span className="text-[10px] font-mono text-[#8E9BB5]">
                      Persisted locally across sessions (up to 8 plates)
                    </span>
                  </div>
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
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {history.map((item) => {
                    const isActive =
                      selectedSample === item.captureTitle &&
                      restorationData?.restoredImageDataUrl === item.result.restoredImageDataUrl;
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-[#151B38] border-[#D4A84B] shadow-[0_0_15px_rgba(212,168,75,0.2)]'
                            : 'bg-[#0A0A0F]/80 border-[#151B38] hover:border-[#D4A84B]/50'
                        }`}
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
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#8E9BB5] mt-0.5 tabular-nums">
                              <span className="inline-flex items-center gap-1 text-[#D4A84B]">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(item.savedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span>·</span>
                              <span>
                                {item.result.counts.stars}★ {item.result.counts.galaxies}◎
                              </span>
                              <span>·</span>
                              <span>
                                NLM {item.result.parameters.denoiseStrength}% / RL{' '}
                                {item.result.parameters.deblurStrength}%
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadFromHistory(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#151B38] hover:bg-[#D4A84B] text-[#F4EFE3] hover:text-[#0A0A0F] font-mono text-[10px] font-bold uppercase transition-colors cursor-pointer border border-[#D4A84B]/30"
                          >
                            {isActive ? 'Loaded' : 'Load'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-5 text-center font-mono text-xs text-[#8E9BB5]">
                  No saved restorations yet. Run a restoration to record it in your local chronicle.
                </div>
              )}
            </div>
          </ScrollPanel>
        </div>
      </div>
    </section>
  );
};
