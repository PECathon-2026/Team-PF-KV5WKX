/**
 * Tsukuyomi Watch - Tsukuyomi Ambient Audio Engine
 * Procedurally synthesizes high-fidelity ambient Japanese soundscapes using Web Audio API:
 * 1. Temple Bells (梵鐘 · 鈴音 - Sacred Bonshō & Zen Chimes)
 * 2. Rain (雨の舗道 - Asphalt Downpour & Mountain Mist)
 * 3. Digital Wind (電脳の風 - Stratosphere Gusts & Shimmering Synth Drones)
 * 4. Moonlit Night (月明の夜 - Full Tsukuyomi Celestial Harmony)
 */

export type SoundscapeId = 'temple_bells' | 'rain_concrete' | 'digital_wind' | 'neo_tokyo_night';

export interface SoundscapeInfo {
  id: SoundscapeId;
  name: string;
  kanji: string;
  subtitle: string;
  description: string;
  atmosphere: string;
  accentColor: string;
  iconType: 'bell' | 'rain' | 'wind' | 'fusion';
}

export const SOUNDSCAPES: SoundscapeInfo[] = [
  {
    id: 'temple_bells',
    name: 'Temple Bells',
    kanji: '梵鐘 · 鈴音',
    subtitle: 'Sacred Bonshō & Zen Chimes',
    description: 'Deep resonant bronze bonshō bells, crystalline silver Suzu chimes, and a tranquil singing bowl harmonic floor.',
    atmosphere: 'Mount Fuji Temple Sanctuary',
    accentColor: '#D4A84B',
    iconType: 'bell',
  },
  {
    id: 'rain_concrete',
    name: 'Rain',
    kanji: '雨の舗道',
    subtitle: 'Mountain Downpour & Temple Mist',
    description: 'Continuous soothing rainfall pattering on stone courtyards, randomized puddle droplet splashes, and low night rumble.',
    atmosphere: 'Mountain Shrine Courtyard',
    accentColor: '#38BDF8',
    iconType: 'rain',
  },
  {
    id: 'digital_wind',
    name: 'Digital Wind',
    kanji: '電脳の風',
    subtitle: 'Stratosphere Summit Gusts',
    description: 'Swept resonant airflows across alpine ridges, celestial 432Hz harmonic drones, and crystalline starlight shimmer.',
    atmosphere: 'High-Altitude Observatory Spire',
    accentColor: '#A855F7',
    iconType: 'wind',
  },
  {
    id: 'neo_tokyo_night',
    name: 'Moonlit Night',
    kanji: '月明の夜',
    subtitle: 'Full Tsukuyomi Harmony',
    description: 'The complete atmospheric fusion of gentle rainfall, high-altitude mountain wind, and distant solemn temple bells.',
    atmosphere: 'Tsukuyomi Celestial Sanctuary',
    accentColor: '#B3202A',
    iconType: 'fusion',
  },
];

let audioCtx: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;

let soundEnabled = false;
let masterVolume = 0.65; // Default 65%
let activeSoundscapeId: SoundscapeId = 'temple_bells';

// Soundscape Active Nodes and Timers
interface ActiveSoundscapeHandle {
  soundscapeId: SoundscapeId;
  gainNode: GainNode;
  sources: (AudioNode | AudioBufferSourceNode | OscillatorNode)[];
  intervals: (ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>)[];
}

let currentHandle: ActiveSoundscapeHandle | null = null;

// Initialize Web Audio Context
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();

      // Analyser Node for Real-time Visualization
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 64;
      analyserNode.smoothingTimeConstant = 0.8;

      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.setValueAtTime(masterVolume, audioCtx.currentTime);

      analyserNode.connect(masterGainNode);
      masterGainNode.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isAudioEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('tsukuyomi_sound_enabled');
    if (saved !== null) {
      soundEnabled = saved === 'true';
    }
    const savedVol = localStorage.getItem('tsukuyomi_master_volume');
    if (savedVol !== null) {
      masterVolume = parseFloat(savedVol);
    }
    const savedScape = localStorage.getItem('tsukuyomi_active_soundscape') as SoundscapeId;
    if (savedScape && SOUNDSCAPES.some((s) => s.id === savedScape)) {
      activeSoundscapeId = savedScape;
    }
  }
  return soundEnabled;
}

export function getActiveSoundscape(): SoundscapeId {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('tsukuyomi_active_soundscape') as SoundscapeId;
    if (saved && SOUNDSCAPES.some((s) => s.id === saved)) {
      activeSoundscapeId = saved;
    }
  }
  return activeSoundscapeId;
}

export function getMasterVolume(): number {
  return masterVolume;
}

export function setMasterVolume(vol: number) {
  masterVolume = Math.max(0, Math.min(1, vol));
  if (typeof window !== 'undefined') {
    localStorage.setItem('tsukuyomi_master_volume', String(masterVolume));
  }
  if (audioCtx && masterGainNode) {
    masterGainNode.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.05);
  }
  broadcastState();
}

export function setAudioEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem('tsukuyomi_sound_enabled', String(enabled));
  }

  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended' && enabled) {
    ctx.resume();
  }

  if (enabled) {
    startSoundscape(activeSoundscapeId);
  } else {
    stopCurrentSoundscape();
  }

  broadcastState();
}

/**
 * Switch to a specific soundscape by ID
 */
export function setActiveSoundscape(id: SoundscapeId) {
  if (!SOUNDSCAPES.some((s) => s.id === id)) return;
  activeSoundscapeId = id;
  if (typeof window !== 'undefined') {
    localStorage.setItem('tsukuyomi_active_soundscape', id);
  }

  if (soundEnabled) {
    startSoundscape(id);
  }

  broadcastState();
}

/**
 * Cycle to the next ambient soundscape in sequence
 */
export function cycleSoundscape(): SoundscapeId {
  const currentIndex = SOUNDSCAPES.findIndex((s) => s.id === activeSoundscapeId);
  const nextIndex = (currentIndex + 1) % SOUNDSCAPES.length;
  const nextScape = SOUNDSCAPES[nextIndex].id;
  setActiveSoundscape(nextScape);
  return nextScape;
}

/**
 * Cycle to the previous ambient soundscape
 */
export function cyclePreviousSoundscape(): SoundscapeId {
  const currentIndex = SOUNDSCAPES.findIndex((s) => s.id === activeSoundscapeId);
  const prevIndex = (currentIndex - 1 + SOUNDSCAPES.length) % SOUNDSCAPES.length;
  const prevScape = SOUNDSCAPES[prevIndex].id;
  setActiveSoundscape(prevScape);
  return prevScape;
}

/**
 * Broadcast soundscape state to all UI components
 */
function broadcastState() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tsukuyomi-sound-change', {
        detail: {
          enabled: soundEnabled,
          soundscapeId: activeSoundscapeId,
          volume: masterVolume,
        },
      })
    );
  }
}

/**
 * Hook or helper to subscribe to sound changes
 */
export function subscribeToSoundChanges(
  callback: (detail: { enabled: boolean; soundscapeId: SoundscapeId; volume: number }) => void
) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };
  window.addEventListener('tsukuyomi-sound-change', handler);
  return () => window.removeEventListener('tsukuyomi-sound-change', handler);
}

/**
 * Get real-time audio visualizer frequency data (0-255 values)
 */
export function getAudioVisualizerData(buffer?: Uint8Array): Uint8Array | null {
  if (!analyserNode || !soundEnabled) return null;
  const data = buffer || new Uint8Array(analyserNode.frequencyBinCount);
  // Cast buffer to any for compatibility with TS 5.7+ TypedArray definitions
  (analyserNode as unknown as { getByteFrequencyData: (arr: Uint8Array) => void }).getByteFrequencyData(data);
  return data;
}

/* =========================================================================
   PROCEDURAL NOISE HELPERS
   ========================================================================= */

function createPinkNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const bufferSize = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    data[i] *= 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

function createBrownNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const bufferSize = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + 0.02 * white) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5;
  }
  return buffer;
}

/* =========================================================================
   SOUNDSCAPE GENERATORS
   ========================================================================= */

/**
 * Stop active soundscape with smooth 0.35s fade out
 */
function stopCurrentSoundscape() {
  if (!currentHandle) return;
  const handle = currentHandle;
  currentHandle = null;

  const ctx = getAudioContext();
  if (ctx && handle.gainNode) {
    try {
      handle.gainNode.gain.cancelScheduledValues(ctx.currentTime);
      handle.gainNode.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
    } catch {}
  }

  // Clear timers
  handle.intervals.forEach((timer) => clearInterval(timer));

  setTimeout(() => {
    handle.sources.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as AudioBufferSourceNode).stop === 'function') {
          (node as AudioBufferSourceNode).stop();
        }
        node.disconnect();
      } catch {}
    });
    try {
      handle.gainNode.disconnect();
    } catch {}
  }, 400);
}

/**
 * Start or transition to a soundscape
 */
function startSoundscape(id: SoundscapeId) {
  const ctx = getAudioContext();
  if (!ctx || !analyserNode) return;

  stopCurrentSoundscape();

  const scapeGain = ctx.createGain();
  scapeGain.gain.setValueAtTime(0.001, ctx.currentTime);
  scapeGain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 0.5);
  scapeGain.connect(analyserNode);

  const sources: (AudioNode | AudioBufferSourceNode | OscillatorNode)[] = [];
  const intervals: (ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>)[] = [];

  switch (id) {
    case 'temple_bells':
      buildTempleBellsSoundscape(ctx, scapeGain, sources, intervals);
      break;
    case 'rain_concrete':
      buildRainOnConcreteSoundscape(ctx, scapeGain, sources, intervals);
      break;
    case 'digital_wind':
      buildDigitalWindSoundscape(ctx, scapeGain, sources, intervals);
      break;
    case 'neo_tokyo_night':
      buildNeoTokyoNightSoundscape(ctx, scapeGain, sources, intervals);
      break;
  }

  currentHandle = {
    soundscapeId: id,
    gainNode: scapeGain,
    sources,
    intervals,
  };
}

/**
 * 1. TEMPLE BELLS SOUNDSCAPE (梵鐘 · 鈴音)
 * Deep resonant bronze Bonshō bell strikes, sacred Suzu handbells, and singing bowl drone
 */
function buildTempleBellsSoundscape(
  ctx: AudioContext,
  dest: GainNode,
  sources: AudioNode[],
  intervals: (ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>)[]
) {
  // Singing bowl meditation drone (144Hz and 216Hz fifth harmonic)
  const droneOsc1 = ctx.createOscillator();
  const droneOsc2 = ctx.createOscillator();
  const droneFilter = ctx.createBiquadFilter();
  const droneGain = ctx.createGain();

  droneOsc1.type = 'sine';
  droneOsc1.frequency.setValueAtTime(144.0, ctx.currentTime); // D3 fundamental
  droneOsc2.type = 'sine';
  droneOsc2.frequency.setValueAtTime(216.5, ctx.currentTime); // A3 harmonic

  droneFilter.type = 'lowpass';
  droneFilter.frequency.setValueAtTime(320, ctx.currentTime);

  droneGain.gain.setValueAtTime(0.04, ctx.currentTime);

  droneOsc1.connect(droneFilter);
  droneOsc2.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(dest);

  droneOsc1.start();
  droneOsc2.start();
  sources.push(droneOsc1, droneOsc2, droneFilter, droneGain);

  // Soft natural breeze floor
  const windBuf = createBrownNoiseBuffer(ctx, 4);
  const windSource = ctx.createBufferSource();
  windSource.buffer = windBuf;
  windSource.loop = true;

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.setValueAtTime(240, ctx.currentTime);

  const windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.08, ctx.currentTime);

  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(dest);
  windSource.start();
  sources.push(windSource, windFilter, windGain);

  // Strike bonshō immediately on start
  playTempleBell(dest);

  // Periodic Bronze Bonshō strikes (every 14s)
  const bellTimer = setInterval(() => {
    if (!soundEnabled) return;
    playTempleBell(dest);
  }, 14000);
  intervals.push(bellTimer);

  // Periodic Suzu Shinto chimes (staggered, every 8.5s)
  const suzuTimer = setInterval(() => {
    if (!soundEnabled) return;
    playSuzuChime(dest);
  }, 8500);
  intervals.push(suzuTimer);
}

/**
 * 2. RAIN ON CONCRETE SOUNDSCAPE (雨の舗道)
 * Soothing continuous rainfall on asphalt, dynamic puddle droplets, and low city rumble
 */
function buildRainOnConcreteSoundscape(
  ctx: AudioContext,
  dest: GainNode,
  sources: AudioNode[],
  intervals: (ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>)[]
) {
  // Pink noise loop for rain texture
  const rainBuf = createPinkNoiseBuffer(ctx, 4);
  const rainSource = ctx.createBufferSource();
  rainSource.buffer = rainBuf;
  rainSource.loop = true;

  // Bandpass filter centered around 1400Hz for rainfall on pavement
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.setValueAtTime(1450, ctx.currentTime);
  rainFilter.Q.setValueAtTime(0.85, ctx.currentTime);

  // Gentle swell LFO for rain intensity variation
  const rainLfo = ctx.createOscillator();
  rainLfo.frequency.setValueAtTime(0.12, ctx.currentTime);
  const rainLfoGain = ctx.createGain();
  rainLfoGain.gain.setValueAtTime(0.05, ctx.currentTime);

  const rainGain = ctx.createGain();
  rainGain.gain.setValueAtTime(0.22, ctx.currentTime);

  rainLfo.connect(rainLfoGain);
  rainLfoGain.connect(rainGain.gain);
  rainSource.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(dest);

  rainSource.start();
  rainLfo.start();
  sources.push(rainSource, rainFilter, rainLfo, rainLfoGain, rainGain);

  // Lowpass brown noise for distant urban rumble & water pooling
  const cityBuf = createBrownNoiseBuffer(ctx, 4);
  const citySource = ctx.createBufferSource();
  citySource.buffer = cityBuf;
  citySource.loop = true;

  const cityFilter = ctx.createBiquadFilter();
  cityFilter.type = 'lowpass';
  cityFilter.frequency.setValueAtTime(110, ctx.currentTime);

  const cityGain = ctx.createGain();
  cityGain.gain.setValueAtTime(0.16, ctx.currentTime);

  citySource.connect(cityFilter);
  cityFilter.connect(cityGain);
  cityGain.connect(dest);
  citySource.start();
  sources.push(citySource, cityFilter, cityGain);

  // Dynamic raindrop impacts on concrete & puddle ripples (every 180-360ms)
  const dropTimer = setInterval(() => {
    if (!soundEnabled || !audioCtx) return;
    spawnSingleRaindrop(audioCtx, dest);
  }, 220);
  intervals.push(dropTimer);
}

/**
 * Raindrop impact simulation
 */
function spawnSingleRaindrop(ctx: AudioContext, target: GainNode) {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const startFreq = 1600 + Math.random() * 800;
    const endFreq = 650 + Math.random() * 400;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.035);

    const vol = 0.015 + Math.random() * 0.02;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    gain.connect(target);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch {}
}

/**
 * 3. DIGITAL WIND SOUNDSCAPE (電脳の風)
 * Swept cyber stratosphere gusts, 432Hz harmonic drone, and data shimmer
 */
function buildDigitalWindSoundscape(
  ctx: AudioContext,
  dest: GainNode,
  sources: AudioNode[],
  intervals: (ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>)[]
) {
  // Brown noise for wind body
  const windBuf = createBrownNoiseBuffer(ctx, 4);
  const windSource = ctx.createBufferSource();
  windSource.buffer = windBuf;
  windSource.loop = true;

  // Swept resonant bandpass filter for skyscraper wind whistle
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(480, ctx.currentTime);
  filter.Q.setValueAtTime(3.8, ctx.currentTime);

  // Slow LFO for sweeping gusts through antennas
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(260, ctx.currentTime);

  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  const windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.18, ctx.currentTime);

  windSource.connect(filter);
  filter.connect(windGain);
  windGain.connect(dest);

  windSource.start();
  lfo.start();
  sources.push(windSource, filter, lfo, lfoGain, windGain);

  // Celestial 432Hz & 648Hz harmonic drone
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const synthFilter = ctx.createBiquadFilter();
  const synthGain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(432.0, ctx.currentTime); // Solfeggio / celestial A4
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(648.0, ctx.currentTime); // Perfect fifth E5

  synthFilter.type = 'lowpass';
  synthFilter.frequency.setValueAtTime(750, ctx.currentTime);

  synthGain.gain.setValueAtTime(0.035, ctx.currentTime);

  osc1.connect(synthFilter);
  osc2.connect(synthFilter);
  synthFilter.connect(synthGain);
  synthGain.connect(dest);

  osc1.start();
  osc2.start();
  sources.push(osc1, osc2, synthFilter, synthGain);

  // High digital shimmer gusts every 7 seconds
  const shimmerTimer = setInterval(() => {
    if (!soundEnabled || !audioCtx) return;
    playCyberWindGust(dest);
  }, 7200);
  intervals.push(shimmerTimer);
}

/**
 * 4. NEO-TOKYO NIGHT (新東京の夜)
 * Full Cyber-Mystic Harmony: asphalt rain, swept digital wind, and distant temple bell strikes
 */
function buildNeoTokyoNightSoundscape(
  ctx: AudioContext,
  dest: GainNode,
  sources: AudioNode[],
  intervals: (ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>)[]
) {
  // Layer A: Rain on concrete (at ~40% gain)
  const rainSubGain = ctx.createGain();
  rainSubGain.gain.setValueAtTime(0.65, ctx.currentTime);
  rainSubGain.connect(dest);
  buildRainOnConcreteSoundscape(ctx, rainSubGain, sources, intervals);

  // Layer B: Digital wind (at ~45% gain)
  const windSubGain = ctx.createGain();
  windSubGain.gain.setValueAtTime(0.6, ctx.currentTime);
  windSubGain.connect(dest);
  buildDigitalWindSoundscape(ctx, windSubGain, sources, intervals);

  // Layer C: Distant Temple Bell resonance every 20 seconds
  const distantBellTimer = setInterval(() => {
    if (!soundEnabled || !audioCtx) return;
    playTempleBell(dest, 0.6); // Slightly softer distant bell
  }, 20000);
  intervals.push(distantBellTimer);
}

/* =========================================================================
   INDIVIDUAL SOUND TRIGGERS & SAMPLES
   ========================================================================= */

/**
 * Authentic Temple Bonshō (梵鐘 · Great Bronze Bell)
 */
export function playTempleBell(target?: GainNode, intensity = 1.0) {
  const ctx = getAudioContext();
  const dest = target || masterGainNode;
  if (!ctx || !dest) return;

  const now = ctx.currentTime;

  // Fundamental frequency and bronze overtones
  const harmonics = [
    { freq: 108, gain: 0.28 * intensity, decay: 5.2 },
    { freq: 218, gain: 0.18 * intensity, decay: 4.2 },
    { freq: 334, gain: 0.13 * intensity, decay: 3.5 },
    { freq: 512, gain: 0.08 * intensity, decay: 2.4 },
    { freq: 720, gain: 0.04 * intensity, decay: 1.8 },
    { freq: 1140, gain: 0.02 * intensity, decay: 1.0 },
  ];

  harmonics.forEach(({ freq, gain, decay }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq + (Math.random() * 2 - 1), now);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(g);
    g.connect(dest);

    osc.start(now);
    osc.stop(now + decay + 0.1);
  });
}

/**
 * Suzu Shinto Silver Handbell (crystalline chime)
 */
export function playSuzuChime(target?: GainNode) {
  const ctx = getAudioContext();
  const dest = target || masterGainNode;
  if (!ctx || !dest) return;

  const now = ctx.currentTime;
  const freqs = [1174.66, 1760.0, 2349.32, 3520.0];

  freqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(f + (Math.random() * 4 - 2), now);

    const initial = 0.05 / (idx + 1);
    g.gain.setValueAtTime(initial, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2 + idx * 0.2);

    osc.connect(g);
    g.connect(dest);

    osc.start(now);
    osc.stop(now + 1.4 + idx * 0.2);
  });
}

/**
 * Interactive Rain Droplet Burst (for instant feedback)
 */
export function playRainDropletBurst(target?: GainNode) {
  const ctx = getAudioContext();
  const dest = target || masterGainNode;
  if (!ctx || !dest) return;

  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      if (audioCtx) spawnSingleRaindrop(audioCtx, dest);
    }, i * 65);
  }
}

/**
 * Cyber Wind Shimmer Gust
 */
export function playCyberWindGust(target?: GainNode) {
  const ctx = getAudioContext();
  const dest = target || masterGainNode;
  if (!ctx || !dest) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1760, now + 1.2);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.frequency.exponentialRampToValueAtTime(3200, now + 1.2);
  filter.Q.setValueAtTime(4.0, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.035, now + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(now);
  osc.stop(now + 2.1);
}

/**
 * Traditional Koto Pentatonic Pluck
 */
export function playKotoNote(freq: number, duration = 1.2) {
  const ctx = getAudioContext();
  const targetNode = masterGainNode;
  if (!ctx || !targetNode) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();

  osc1.type = 'sawtooth';
  osc2.type = 'triangle';

  osc1.frequency.setValueAtTime(freq, now);
  osc2.frequency.setValueAtTime(freq * 2.01, now);

  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.1, now + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc1.connect(g);
  osc2.connect(g);
  g.connect(targetNode);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration + 0.1);
  osc2.stop(now + duration + 0.1);
}

/**
 * Sliding Heavy Torii / Temple Door Sound
 */
export function playGateOpenSound() {
  const ctx = getAudioContext();
  const targetNode = masterGainNode;
  if (!ctx || !targetNode) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 1.2);

  g.gain.setValueAtTime(0.2, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

  osc.connect(g);
  g.connect(targetNode);

  osc.start(now);
  osc.stop(now + 1.4);

  setTimeout(() => playTempleBell(), 250);
}

// Backward compatibility methods
export function startLayeredAmbientSoundscape() {
  startSoundscape(activeSoundscapeId);
}

export function stopLayeredAmbientSoundscape() {
  stopCurrentSoundscape();
}

export function playTaikoStrike() {
  playGateOpenSound();
}

export function playBiwaPluck() {
  playKotoNote(392.0, 1.0);
}

export function previewRiteFrequency(freq: number, _type?: string) {
  playKotoNote(freq || 440.0, 1.8);
}

export function playOmikujiDraw() {
  playSuzuChime();
}
