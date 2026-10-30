export type HonorRankName = 'Ashigaru' | 'Samurai' | 'Daimyo' | 'Shogun';

export interface RankTier {
  name: HonorRankName;
  kanji: string;
  subtitle: string;
  minPoints: number;
  nextPoints: number | null;
}

export const HONOR_RANKS: RankTier[] = [
  {
    name: 'Ashigaru',
    kanji: '足軽',
    subtitle: 'Foot Soldier of the Night Watch',
    minPoints: 0,
    nextPoints: 500,
  },
  {
    name: 'Samurai',
    kanji: '侍',
    subtitle: 'Celestial Retainer of the Astral Court',
    minPoints: 500,
    nextPoints: 1500,
  },
  {
    name: 'Daimyo',
    kanji: '大名',
    subtitle: 'Sovereign Lord of the High Observatory',
    minPoints: 1500,
    nextPoints: 3000,
  },
  {
    name: 'Shogun',
    kanji: '将軍',
    subtitle: 'Supreme Commander of the Tsukuyomi Watch',
    minPoints: 3000,
    nextPoints: null,
  },
];

export type HonorActionType =
  | 'ALERT_SET'
  | 'EVENT_OBSERVED'
  | 'SPOT_VISITED'
  | 'IMAGE_RESTORED'
  | 'STAR_GAZER_OPENED';

export interface HonorActivityEntry {
  id: string;
  type: HonorActionType;
  label: string;
  points: number;
  timestamp: string;
}

export interface HonorState {
  points: number;
  alertsSetIds: string[];
  observedEventIds: string[];
  visitedSpotIds: string[];
  restoredCount: number;
  lastStarGazerDateKey?: string;
  starGazerDaysCount?: number;
  history: HonorActivityEntry[];
}

export interface ComputedBadge {
  id: string;
  name: string;
  kanji: string;
  tier: string;
  description: string;
  requirementText: string;
  unlocked: boolean;
  progressCurrent: number;
  progressTarget: number;
  svgType: 'moon' | 'meteor' | 'nebula' | 'eclipse' | 'watchtower' | 'shogun';
}

const STORAGE_KEY = 'tsukuyomi_honor_state_v1';
const EVENT_NAME = 'tsukuyomi-honor-change';

const DEFAULT_HONOR_STATE: HonorState = {
  points: 0,
  alertsSetIds: [],
  observedEventIds: [],
  visitedSpotIds: [],
  restoredCount: 0,
  history: [],
};

export function getHonorState(): HonorState {
  if (typeof window === 'undefined') return DEFAULT_HONOR_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed existing alerts from localStorage if user already set any
      let existingAlerts: string[] = [];
      try {
        const savedAlerts = localStorage.getItem('tsukuyomi_celestial_alerts_v1');
        if (savedAlerts) {
          const parsed = JSON.parse(savedAlerts);
          if (Array.isArray(parsed)) existingAlerts = parsed;
        }
      } catch {
        // ignore
      }
      const initialPoints = existingAlerts.length * 50;
      const seeded: HonorState = {
        ...DEFAULT_HONOR_STATE,
        points: initialPoints,
        alertsSetIds: existingAlerts,
        history: existingAlerts.map((id, idx) => ({
          id: `seed-alert-${idx}`,
          type: 'ALERT_SET',
          label: `Set Night Watch Alert (${id})`,
          points: 50,
          timestamp: new Date().toISOString(),
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<HonorState>;
    return {
      points: typeof parsed.points === 'number' ? parsed.points : 0,
      alertsSetIds: Array.isArray(parsed.alertsSetIds) ? parsed.alertsSetIds : [],
      observedEventIds: Array.isArray(parsed.observedEventIds) ? parsed.observedEventIds : [],
      visitedSpotIds: Array.isArray(parsed.visitedSpotIds) ? parsed.visitedSpotIds : [],
      restoredCount: typeof parsed.restoredCount === 'number' ? parsed.restoredCount : 0,
      lastStarGazerDateKey:
        typeof parsed.lastStarGazerDateKey === 'string' ? parsed.lastStarGazerDateKey : undefined,
      starGazerDaysCount:
        typeof parsed.starGazerDaysCount === 'number' ? parsed.starGazerDaysCount : 0,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return DEFAULT_HONOR_STATE;
  }
}

function saveHonorState(state: HonorState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
  } catch {
    // ignore storage errors
  }
}

export function subscribeToHonorChanges(callback: (state: HonorState) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<HonorState>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getHonorState());
    }
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      callback(getHonorState());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function getRankForPoints(points: number): {
  currentRank: RankTier;
  nextRank: RankTier | null;
  progressPercent: number;
  pointsIntoCurrentRank: number;
  pointsNeededForNextRank: number;
} {
  let currentIndex = 0;
  for (let i = HONOR_RANKS.length - 1; i >= 0; i--) {
    if (points >= HONOR_RANKS[i].minPoints) {
      currentIndex = i;
      break;
    }
  }
  const currentRank = HONOR_RANKS[currentIndex];
  const nextRank = currentIndex < HONOR_RANKS.length - 1 ? HONOR_RANKS[currentIndex + 1] : null;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      progressPercent: 100,
      pointsIntoCurrentRank: points - currentRank.minPoints,
      pointsNeededForNextRank: 0,
    };
  }

  const span = nextRank.minPoints - currentRank.minPoints;
  const into = Math.max(0, points - currentRank.minPoints);
  const progressPercent = Math.min(100, Math.round((into / span) * 100));

  return {
    currentRank,
    nextRank,
    progressPercent,
    pointsIntoCurrentRank: into,
    pointsNeededForNextRank: Math.max(0, nextRank.minPoints - points),
  };
}

export function computeBadges(state: HonorState): ComputedBadge[] {
  const alertsCount = state.alertsSetIds.length;
  const observedCount = state.observedEventIds.length;
  const spotsCount = state.visitedSpotIds.length;
  const restoredCount = state.restoredCount;

  return [
    {
      id: 'vigil-keeper',
      name: 'Vigil Keeper',
      kanji: '夜番の契り',
      tier: 'TIER I · ALERT',
      description: 'Set an ephemeris watch alert in The Celestial Scroll to stand ready before moonrise.',
      requirementText: `${Math.min(alertsCount, 1)} / 1 Alert Set (+75 PTS)`,
      unlocked: alertsCount >= 1,
      progressCurrent: Math.min(alertsCount, 1),
      progressTarget: 1,
      svgType: 'moon',
    },
    {
      id: 'meteor-ronin',
      name: 'Star Witness',
      kanji: '星見の証',
      tier: 'TIER II · OBSERVATION',
      description: 'Observe a celestial event and record your sighting in the Imperial Scroll.',
      requirementText: `${Math.min(observedCount, 1)} / 1 Event Observed (+150 PTS)`,
      unlocked: observedCount >= 1,
      progressCurrent: Math.min(observedCount, 1),
      progressTarget: 1,
      svgType: 'meteor',
    },
    {
      id: 'summit-pilgrim',
      name: 'Summit Pilgrim',
      kanji: '霊峰の巡礼者',
      tier: 'TIER II · WATCHTOWER',
      description: 'Visit or check in at a top-rated dark-sky sanctuary in The Watchtower.',
      requirementText: `${Math.min(spotsCount, 1)} / 1 Top Spot Visited (+125 PTS)`,
      unlocked: spotsCount >= 1,
      progressCurrent: Math.min(spotsCount, 1),
      progressTarget: 1,
      svgType: 'watchtower',
    },
    {
      id: 'nebula-shogun',
      name: 'Spirit Lens Adept',
      kanji: '星雲の匠',
      tier: 'TIER III · RESTORATION',
      description: 'Faithfully restore a deep-sky capture using Wavelet + Richardson-Lucy deconvolution.',
      requirementText: `${Math.min(restoredCount, 1)} / 1 Image Restored (+200 PTS)`,
      unlocked: restoredCount >= 1,
      progressCurrent: Math.min(restoredCount, 1),
      progressTarget: 1,
      svgType: 'nebula',
    },
    {
      id: 'eclipse-oracle',
      name: 'Chronicle Master',
      kanji: '天暦の賢者',
      tier: 'TIER III · DEVOTION',
      description: 'Record 3 celestial event observations across launches, ISS passes, or meteor showers.',
      requirementText: `${Math.min(observedCount, 3)} / 3 Events Observed`,
      unlocked: observedCount >= 3,
      progressCurrent: Math.min(observedCount, 3),
      progressTarget: 3,
      svgType: 'eclipse',
    },
    {
      id: 'shogun-ascendant',
      name: 'Shogun of the Heavens',
      kanji: '天上天下の将軍',
      tier: 'MYTHIC · SHOGUNATE',
      description: 'Ascend to the rank of Daimyo or Shogun by accumulating at least 1,500 Honor Points.',
      requirementText: `${Math.min(state.points, 1500).toLocaleString()} / 1,500 Honor Points`,
      unlocked: state.points >= 1500,
      progressCurrent: Math.min(state.points, 1500),
      progressTarget: 1500,
      svgType: 'shogun',
    },
  ];
}

export function awardAlertSetPoints(eventId: string, eventTitle: string): {
  awarded: boolean;
  pointsAdded: number;
  state: HonorState;
} {
  const current = getHonorState();
  if (current.alertsSetIds.includes(eventId)) {
    return { awarded: false, pointsAdded: 0, state: current };
  }
  const pointsAdded = 75;
  const entry: HonorActivityEntry = {
    id: `alert-${eventId}-${Date.now()}`,
    type: 'ALERT_SET',
    label: `Set Watch Alert: ${eventTitle}`,
    points: pointsAdded,
    timestamp: new Date().toISOString(),
  };
  const next: HonorState = {
    ...current,
    points: current.points + pointsAdded,
    alertsSetIds: [...current.alertsSetIds, eventId],
    history: [entry, ...current.history].slice(0, 30),
  };
  saveHonorState(next);
  return { awarded: true, pointsAdded, state: next };
}

export function awardEventObservedPoints(eventId: string, eventTitle: string): {
  awarded: boolean;
  pointsAdded: number;
  state: HonorState;
} {
  const current = getHonorState();
  if (current.observedEventIds.includes(eventId)) {
    return { awarded: false, pointsAdded: 0, state: current };
  }
  const pointsAdded = 150;
  const entry: HonorActivityEntry = {
    id: `obs-${eventId}-${Date.now()}`,
    type: 'EVENT_OBSERVED',
    label: `Observed Event: ${eventTitle}`,
    points: pointsAdded,
    timestamp: new Date().toISOString(),
  };
  const next: HonorState = {
    ...current,
    points: current.points + pointsAdded,
    observedEventIds: [...current.observedEventIds, eventId],
    history: [entry, ...current.history].slice(0, 30),
  };
  saveHonorState(next);
  return { awarded: true, pointsAdded, state: next };
}

export function awardVisitTopSpotPoints(
  spotId: string,
  spotName: string,
  honorScore?: number
): {
  awarded: boolean;
  pointsAdded: number;
  state: HonorState;
} {
  const current = getHonorState();
  if (current.visitedSpotIds.includes(spotId)) {
    return { awarded: false, pointsAdded: 0, state: current };
  }
  const pointsAdded = 125;
  const scoreSuffix = typeof honorScore === 'number' ? ` (Score ${honorScore})` : '';
  const entry: HonorActivityEntry = {
    id: `spot-${spotId}-${Date.now()}`,
    type: 'SPOT_VISITED',
    label: `Visited Sanctuary: ${spotName}${scoreSuffix}`,
    points: pointsAdded,
    timestamp: new Date().toISOString(),
  };
  const next: HonorState = {
    ...current,
    points: current.points + pointsAdded,
    visitedSpotIds: [...current.visitedSpotIds, spotId],
    history: [entry, ...current.history].slice(0, 30),
  };
  saveHonorState(next);
  return { awarded: true, pointsAdded, state: next };
}

export function awardImageRestoredPoints(captureTitle: string): {
  awarded: boolean;
  pointsAdded: number;
  state: HonorState;
} {
  const current = getHonorState();
  const pointsAdded = 200;
  const entry: HonorActivityEntry = {
    id: `restore-${Date.now()}`,
    type: 'IMAGE_RESTORED',
    label: `Faithful Astro-Restoration: ${captureTitle}`,
    points: pointsAdded,
    timestamp: new Date().toISOString(),
  };
  const next: HonorState = {
    ...current,
    points: current.points + pointsAdded,
    restoredCount: current.restoredCount + 1,
    history: [entry, ...current.history].slice(0, 30),
  };
  saveHonorState(next);
  return { awarded: true, pointsAdded, state: next };
}

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function awardStarGazerDailyPoints(locationLabel?: string): {
  awarded: boolean;
  pointsAdded: number;
  dateKey: string;
  state: HonorState;
} {
  const current = getHonorState();
  const todayKey = getLocalDateKey(new Date());
  if (current.lastStarGazerDateKey === todayKey) {
    return { awarded: false, pointsAdded: 0, dateKey: todayKey, state: current };
  }
  const pointsAdded = 100;
  const suffix = locationLabel ? ` · ${locationLabel}` : '';
  const entry: HonorActivityEntry = {
    id: `stargazer-${todayKey}-${Date.now()}`,
    type: 'STAR_GAZER_OPENED',
    label: `Star Gazer Night Vigil (${todayKey}${suffix})`,
    points: pointsAdded,
    timestamp: new Date().toISOString(),
  };
  const next: HonorState = {
    ...current,
    points: current.points + pointsAdded,
    lastStarGazerDateKey: todayKey,
    starGazerDaysCount: (current.starGazerDaysCount || 0) + 1,
    history: [entry, ...current.history].slice(0, 30),
  };
  saveHonorState(next);
  return { awarded: true, pointsAdded, dateKey: todayKey, state: next };
}

